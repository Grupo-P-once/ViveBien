-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 33 — Property Core: cambio de estado de una propiedad + bitácora en UNA transacción
-- D-53 / D-54 · Mismo patrón que 28 (permisos), 31 (flags, rol y estado) y 32 (invitaciones).
--
-- POR QUÉ: `POST /api/propiedades/[id]/estado`, el alta heredada del panel y el asistente de Telegram hacían `update` y DESPUÉS
-- `registrar()` (otra llamada; sus errores se tragan). Si la segunda fallaba —o la función serverless moría entre las dos—, la
-- propiedad cambiaba de estado SIN huella en `audit_logs`. Dos llamadas HTTP no son una transacción: hace falta SQL.
--
-- QUÉ HACE: bloquea la fila, compara el estado que se leyó (`conflicto` → 409), valida la máquina de estados (unión de lo que
-- permite cada rol en lib/publicacion.ts; una prueba la compara con `puedeTransicionar`), cambia SÓLO columnas de la lista
-- blanca y con valores válidos, exige la huella completa (con nota ≥ 10 al rechazar / pedir cambios) y escribe `audit_logs` en la
-- misma transacción. Sólo `service_role`. QUIÉN puede pedir cada transición (rol, capacidad, dueño) lo decide el SERVIDOR
-- antes de llamarla.
--
-- ADITIVA: sólo crea una función. No toca datos ni esquema. Reversa: 33-propiedad-cambiar-estado.REVERTIR.sql
-- ORDEN: aplicarla ANTES de desplegar el código que la usa (el código viejo no la necesita; el nuevo responde 503 si falta,
-- sin cambiar nada).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.propiedad_cambiar_estado(
  p_id            text,
  p_antes_estado  text,
  p_estado        text,
  p_cambios       jsonb,   -- sólo: completitud, estatus, enviada_en, publicada_en, revisado_por, revisado_en, nota_moderacion
  p_audit         jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v public.propiedades%rowtype;
  k text;
begin
  if jsonb_typeof(p_audit) is distinct from 'object'
     or length(regexp_replace(coalesce(p_audit->>'actor_uid', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
     or length(regexp_replace(coalesce(p_audit->>'accion', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
     or jsonb_typeof(p_audit->'antes') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues') is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if p_estado is null or p_estado not in ('borrador', 'en_revision', 'cambios_solicitados', 'rechazada', 'publicada')
     or jsonb_typeof(coalesce(p_cambios, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  -- lista blanca: nada de owner_id, folio, slug, contadores…
  for k in select jsonb_object_keys(coalesce(p_cambios, '{}'::jsonb)) loop
    if k not in ('completitud', 'estatus', 'enviada_en', 'publicada_en', 'revisado_por', 'revisado_en', 'nota_moderacion') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  -- rechazar / pedir cambios sin decir por qué deja al publicador a ciegas
  if p_estado in ('rechazada', 'cambios_solicitados')
     and length(regexp_replace(coalesce(p_cambios->>'nota_moderacion', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) < 10 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;

  select * into v from public.propiedades where id = p_id for update;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  if v.estado_pub is distinct from p_antes_estado then
    return jsonb_build_object('resultado', 'conflicto');
  end if;

  -- La máquina de estados TAMBIÉN en la base (defensa en profundidad: un invocador con service_role no se la salta). Es la unión
  -- de lo que permite cada rol en lib/publicacion.ts; una prueba compara esta lista con `puedeTransicionar`. QUIÉN puede pedir
  -- cada transición (rol, capacidad, dueño) lo decide el SERVIDOR antes de llamar a esta función.
  if not ((v.estado_pub, p_estado) in (
       ('borrador', 'en_revision'), ('borrador', 'publicada'),
       ('en_revision', 'publicada'), ('en_revision', 'rechazada'), ('en_revision', 'cambios_solicitados'), ('en_revision', 'borrador'),
       ('cambios_solicitados', 'en_revision'), ('cambios_solicitados', 'borrador'), ('cambios_solicitados', 'publicada'),
       ('rechazada', 'borrador'), ('rechazada', 'publicada'),
       ('publicada', 'borrador'), ('publicada', 'cambios_solicitados'))) then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  -- Valores, no sólo nombres de columna.
  if p_cambios ? 'estatus' and (p_cambios->>'estatus') not in ('disponible', 'pausada', 'vendida', 'rentada', 'eliminada') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    update public.propiedades set
      estado_pub     = p_estado,
      completitud    = coalesce((p_cambios->>'completitud')::smallint, completitud),
      estatus        = coalesce(p_cambios->>'estatus', estatus),
      enviada_en     = case when p_cambios ? 'enviada_en'   then (p_cambios->>'enviada_en')::timestamptz   else enviada_en end,
      publicada_en   = case when p_cambios ? 'publicada_en' then (p_cambios->>'publicada_en')::timestamptz else publicada_en end,
      revisado_por   = case when p_cambios ? 'revisado_por' then p_cambios->>'revisado_por' else revisado_por end,
      revisado_en    = case when p_cambios ? 'revisado_en'  then (p_cambios->>'revisado_en')::timestamptz  else revisado_en end,
      nota_moderacion = case when p_cambios ? 'nota_moderacion' then p_cambios->>'nota_moderacion' else nota_moderacion end
    where id = p_id;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    -- un número o una fecha mal formados no son un error del servidor: son un cambio inválido y no se escribe nada
    raise exception 'cambio_invalido' using errcode = '22023';
  end;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'propiedades', p_id, p_audit->'antes', p_audit->'despues');

  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

comment on function public.propiedad_cambiar_estado(text, text, text, jsonb, jsonb) is
  'Cambia el estado de publicación de una propiedad y escribe la bitácora en la MISMA transacción, con control de concurrencia (p_antes_estado debe ser lo guardado) y lista blanca de columnas. Devuelve jsonb con `resultado`: ok | no_existe | conflicto. D-53.';

revoke all on function public.propiedad_cambiar_estado(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.propiedad_cambiar_estado(text, text, text, jsonb, jsonb) to service_role;
