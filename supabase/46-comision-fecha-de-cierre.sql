-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 46 — Operaciones de comisión: fecha de cierre y copia de la propiedad
-- Reversa: 46-comision-fecha-de-cierre.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Aplicar solo con autorización del propietario.
--
-- Las operaciones guardaban cuándo SE REGISTRARON, no cuándo SE CERRÓ la venta o la renta. Las gráficas «por mes» y el seguimiento de lo
-- cobrado necesitan la fecha del cierre (la del contrato firmado, o la de la primera renta recibida). Se agrega `fecha_cierre` (opcional: las
-- operaciones anteriores quedan sin ella y las gráficas usan entonces la fecha de registro).
--
-- También se guarda una COPIA de la propiedad en el momento de cerrar (`propiedad_folio`, `propiedad_titulo`, `precio_lista_centavos`): el historial
-- de ganancias no debe cambiar si después se edita el título o el precio, y permite medir lo cerrado contra lo anunciado. La propiedad en sí
-- no se borra mientras tenga operaciones (clave foránea restrictiva desde la 43), así que la relación propiedad ↔ ganancias es permanente.
--
--  · La fecha es parte de lo que NO se edita de una operación (se anula y se registra otra): el disparador la incluye.
--  · `comision_operacion_registrar` la acepta, la valida (no del futuro y no anterior al año 2000) y la guarda.
--  · No cambia permisos: la tabla sigue siendo solo del servidor.
-- Idempotente (add column if not exists / create or replace).
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.comision_operaciones
  add column if not exists fecha_cierre date,
  add column if not exists propiedad_folio text check (propiedad_folio is null or char_length(propiedad_folio) <= 40),
  add column if not exists propiedad_titulo text check (propiedad_titulo is null or char_length(propiedad_titulo) <= 200),
  add column if not exists precio_lista_centavos bigint check (precio_lista_centavos is null or precio_lista_centavos > 0);

create or replace function public.comision_operaciones_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
declare
  via_funcion boolean := coalesce(current_setting('vivebien.operacion', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    raise exception 'Una operación de comisión no se borra: se anula.' using errcode = '23514';
  end if;
  if (new.id, new.propiedad_id, new.tipo, new.base_centavos, new.regla_version, new.total_centavos, new.atribuible, new.atribucion_ref,
      new.clave_idempotencia, new.creado_por, new.creado_en, new.fecha_cierre, new.propiedad_folio, new.propiedad_titulo, new.precio_lista_centavos)
     is distinct from
     (old.id, old.propiedad_id, old.tipo, old.base_centavos, old.regla_version, old.total_centavos, old.atribuible, old.atribucion_ref,
      old.clave_idempotencia, old.creado_por, old.creado_en, old.fecha_cierre, old.propiedad_folio, old.propiedad_titulo, old.precio_lista_centavos) then
    raise exception 'Una operación de comisión no se edita: se anula y se registra otra.' using errcode = '23514';
  end if;
  if not via_funcion and (new.estado, new.vivebien_centavos, new.colaborador_centavos, new.colaborador_retenido_centavos, new.retencion,
                          new.reparto_estado, new.estado_por, new.estado_en, new.estado_motivo)
     is distinct from
     (old.estado, old.vivebien_centavos, old.colaborador_centavos, old.colaborador_retenido_centavos, old.retencion,
      old.reparto_estado, old.estado_por, old.estado_en, old.estado_motivo) then
    raise exception 'El estado y el reparto solo cambian por las funciones de comisión.' using errcode = '23514';
  end if;
  if old.estado = 'anulada' and new.estado <> 'anulada' then
    raise exception 'Una operación anulada no vuelve.' using errcode = '23514';
  end if;
  return new;
end $f$;

create or replace function public.comision_operacion_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; r public.comision_operaciones%rowtype; nuevo_id uuid; cierre date;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('propiedad_id', 'tipo', 'base_centavos', 'regla_version', 'total_centavos', 'vivebien_centavos', 'colaborador_centavos',
                 'colaborador_retenido_centavos', 'retencion', 'reparto_estado', 'atribuible', 'atribucion_ref', 'clave_idempotencia', 'creado_por',
                 'fecha_cierre', 'propiedad_folio', 'propiedad_titulo', 'precio_lista_centavos') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;

  begin
    cierre := nullif(p_datos->>'fecha_cierre', '')::date;
  exception when others then
    raise exception 'cambio_invalido' using errcode = '22023';
  end;
  if cierre is not null and (cierre > current_date + 1 or cierre < date '2000-01-01') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    insert into public.comision_operaciones (propiedad_id, tipo, base_centavos, regla_version, total_centavos, vivebien_centavos,
      colaborador_centavos, colaborador_retenido_centavos, retencion, reparto_estado, atribuible, atribucion_ref, clave_idempotencia, creado_por, fecha_cierre,
      propiedad_folio, propiedad_titulo, precio_lista_centavos)
    values (p_datos->>'propiedad_id', p_datos->>'tipo', (p_datos->>'base_centavos')::bigint, p_datos->>'regla_version',
      (p_datos->>'total_centavos')::bigint, (p_datos->>'vivebien_centavos')::bigint, (p_datos->>'colaborador_centavos')::bigint,
      (p_datos->>'colaborador_retenido_centavos')::bigint, nullif(p_datos->>'retencion', ''), p_datos->>'reparto_estado',
      (p_datos->>'atribuible')::boolean, nullif(p_datos->>'atribucion_ref', ''), p_datos->>'clave_idempotencia', p_datos->>'creado_por', cierre,
      nullif(p_datos->>'propiedad_folio', ''), nullif(p_datos->>'propiedad_titulo', ''), (nullif(p_datos->>'precio_lista_centavos', ''))::bigint)
    returning id into nuevo_id;
  exception
    when unique_violation then
      select * into r from public.comision_operaciones where clave_idempotencia = p_datos->>'clave_idempotencia';
      if r.propiedad_id = p_datos->>'propiedad_id' and r.tipo = p_datos->>'tipo' and r.base_centavos = (p_datos->>'base_centavos')::bigint
         and r.regla_version = p_datos->>'regla_version' then
        return jsonb_build_object('resultado', 'repetida', 'id', r.id);
      end if;
      return jsonb_build_object('resultado', 'clave_en_uso');
    when foreign_key_violation then
      return jsonb_build_object('resultado', 'no_existe');
    when check_violation or invalid_text_representation or numeric_value_out_of_range or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'comision_operaciones', nuevo_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id);
end;
$fn$;

commit;
