-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 43 — Origen con acreditación verificable y operaciones de comisión (Etapa C del motor de comisiones)
-- Reversa: 43-origen-acreditacion-y-operaciones.REVERTIR.sql
--
-- PREPARADA, NO APLICADA. Numeración provisional (adenda "por asignar"). Aplicar solo con autorización del propietario. No hace nada
-- visible por sí sola: el código solo la usa con el flag `commissionEngine` encendido.
--
-- 1) `propiedad_origen` gana la declaración de autorización (trato directo) y la acreditación del agente (folio OPCIONAL, municipio,
--    quién lo aportó) con el resultado de la verificación del equipo. La verificación SOLO la escribe la función
--    `origen_verificar_acreditacion` (un disparador lo impone: ni un UPDATE directo ni un INSERT pueden fijarla) y se borra sola si el
--    folio cambia. La función rechaza la autoaprobación (quien aportó el folio no lo verifica) y exige motivo y bitácora en la MISMA
--    transacción.
-- 2) `comision_operaciones`: una operación cerrada (venta o renta) con la regla y la base usadas, el total y el reparto en CENTAVOS
--    ENTEROS. Inmutable salvo estado y liberación del reparto, que pasan por funciones atómicas con bitácora. Nunca se borra.
--    La clave de idempotencia evita comisiones duplicadas por reintentos.
-- NO mueve dinero ni guarda datos personales del prospecto: la atribución es una referencia mínima (identificador) con acceso solo del servidor.
-- Tablas y funciones: solo `service_role` (RLS activada sin políticas; sin permisos para anon ni authenticated).
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Origen: autorización y acreditación ──────────────────────────────────────────────

alter table public.propiedad_origen
  add column if not exists declara_autorizacion          boolean,
  add column if not exists acreditacion_folio            text,
  add column if not exists acreditacion_municipio        text,
  add column if not exists acreditacion_aporto_por       text,
  add column if not exists acreditacion_resultado        text,
  add column if not exists acreditacion_vigente_hasta    date,
  add column if not exists acreditacion_verificado_por   text,
  add column if not exists acreditacion_verificado_en    timestamptz,
  add column if not exists acreditacion_motivo           text;

alter table public.propiedad_origen drop constraint if exists propiedad_origen_acreditacion_ck;
alter table public.propiedad_origen add constraint propiedad_origen_acreditacion_ck check (
  (acreditacion_folio is null or char_length(acreditacion_folio) between 3 and 40)
  and (acreditacion_municipio is null or char_length(acreditacion_municipio) between 2 and 120)
  and (acreditacion_resultado is null or acreditacion_resultado in ('coincide', 'no_coincide'))
  and (acreditacion_motivo is null or char_length(acreditacion_motivo) between 10 and 500)
  -- una verificación solo existe sobre un folio, con revisor, fecha y resultado; una coincidencia lleva vigencia
  and (acreditacion_verificado_por is null
       or (acreditacion_folio is not null and acreditacion_resultado is not null and acreditacion_verificado_en is not null))
  and (acreditacion_resultado is distinct from 'coincide' or acreditacion_vigente_hasta is not null)
);

create or replace function public.propiedad_origen_acreditacion_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
declare
  verificando boolean := coalesce(current_setting('vivebien.verificando', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.acreditacion_resultado is not null or new.acreditacion_vigente_hasta is not null or new.acreditacion_verificado_por is not null
       or new.acreditacion_verificado_en is not null or new.acreditacion_motivo is not null then
      raise exception 'Una verificación de acreditación no se crea por inserción.' using errcode = '23514';
    end if;
    return new;
  end if;
  -- Si cambia el folio, cualquier verificación anterior deja de valer.
  if new.acreditacion_folio is distinct from old.acreditacion_folio then
    new.acreditacion_resultado := null; new.acreditacion_vigente_hasta := null; new.acreditacion_verificado_por := null;
    new.acreditacion_verificado_en := null; new.acreditacion_motivo := null;
    return new;
  end if;
  if not verificando and (
       new.acreditacion_resultado is distinct from old.acreditacion_resultado
    or new.acreditacion_vigente_hasta is distinct from old.acreditacion_vigente_hasta
    or new.acreditacion_verificado_por is distinct from old.acreditacion_verificado_por
    or new.acreditacion_verificado_en is distinct from old.acreditacion_verificado_en
    or new.acreditacion_motivo is distinct from old.acreditacion_motivo) then
    raise exception 'La verificación de acreditación solo la registra origen_verificar_acreditacion.' using errcode = '23514';
  end if;
  return new;
end $f$;

drop trigger if exists propiedad_origen_acreditacion_guardia on public.propiedad_origen;
create trigger propiedad_origen_acreditacion_guardia before insert or update on public.propiedad_origen
  for each row execute function public.propiedad_origen_acreditacion_guardia();

-- Verificación atómica: cambio + bitácora en una transacción, comparación con el folio que se vio, sin autoaprobación.
create or replace function public.origen_verificar_acreditacion(
  p_propiedad_id  text,
  p_antes_folio   text,
  p_resultado     text,
  p_vigente_hasta date,
  p_audit         jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  o public.propiedad_origen%rowtype;
  motivo text;
begin
  if jsonb_typeof(p_audit) is distinct from 'object'
     or length(btrim(coalesce(p_audit->>'actor_uid', ''))) = 0
     or length(btrim(coalesce(p_audit->>'accion', ''))) = 0
     or jsonb_typeof(p_audit->'antes') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues') is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  motivo := btrim(coalesce(p_audit->'despues'->>'motivo', ''));
  if char_length(motivo) < 10 or char_length(motivo) > 500 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if p_resultado is null or p_resultado not in ('coincide', 'no_coincide')
     or (p_resultado = 'coincide' and p_vigente_hasta is null) then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  select * into o from public.propiedad_origen where propiedad_id = p_propiedad_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if o.acreditacion_folio is null then return jsonb_build_object('resultado', 'sin_folio'); end if;
  if o.acreditacion_folio is distinct from p_antes_folio then return jsonb_build_object('resultado', 'conflicto'); end if;
  -- quien aportó el folio no lo verifica
  if o.acreditacion_aporto_por is not null
     and (lower(o.acreditacion_aporto_por) = lower(coalesce(p_audit->>'actor_email', ''))
          or o.acreditacion_aporto_por = p_audit->>'actor_uid') then
    return jsonb_build_object('resultado', 'autoaprobacion');
  end if;

  perform set_config('vivebien.verificando', 'on', true);
  update public.propiedad_origen set
    acreditacion_resultado = p_resultado,
    acreditacion_vigente_hasta = case when p_resultado = 'coincide' then p_vigente_hasta else null end,
    acreditacion_verificado_por = coalesce(nullif(p_audit->>'actor_email', ''), p_audit->>'actor_uid'),
    acreditacion_verificado_en = now(),
    acreditacion_motivo = motivo
  where propiedad_id = p_propiedad_id;
  perform set_config('vivebien.verificando', 'off', true);

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'propiedad_origen', p_propiedad_id, p_audit->'antes', p_audit->'despues');

  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

-- ── 2 · Operaciones de comisión ──────────────────────────────────────────────────────────

create table if not exists public.comision_operaciones (
  id                              uuid primary key default gen_random_uuid(),
  propiedad_id                    text not null references public.propiedades(id) on delete restrict,
  tipo                            text not null check (tipo in ('venta', 'renta')),
  base_centavos                   bigint not null check (base_centavos > 0),
  regla_version                   text not null check (char_length(regla_version) between 1 and 60),
  total_centavos                  bigint not null check (total_centavos > 0),
  vivebien_centavos               bigint not null check (vivebien_centavos >= 0),
  colaborador_centavos            bigint not null check (colaborador_centavos >= 0),
  colaborador_retenido_centavos   bigint not null check (colaborador_retenido_centavos >= 0),
  retencion                       text check (retencion is null or retencion in ('sin_colaborador', 'acreditacion_no_verificada', 'operacion_no_atribuible')),
  reparto_estado                  text not null check (reparto_estado in ('no_aplica', 'retenido', 'liberable')),
  atribuible                      boolean not null,
  atribucion_ref                  text check (atribucion_ref is null or atribucion_ref ~ '^[A-Za-z0-9_:.\-]{1,200}$'),
  estado                          text not null default 'registrada' check (estado in ('registrada', 'confirmada', 'anulada')),
  clave_idempotencia              text not null unique check (char_length(clave_idempotencia) between 8 and 100),
  creado_por                      text not null check (char_length(creado_por) between 3 and 200),
  creado_en                       timestamptz not null default now(),
  estado_por                      text,
  estado_en                       timestamptz,
  estado_motivo                   text,
  constraint comision_operaciones_suma_ck check (vivebien_centavos + colaborador_centavos + colaborador_retenido_centavos = total_centavos),
  constraint comision_operaciones_reparto_ck check (
    (reparto_estado = 'no_aplica' and colaborador_centavos = 0 and colaborador_retenido_centavos = 0)
    or (reparto_estado = 'retenido' and colaborador_retenido_centavos > 0 and colaborador_centavos = 0)
    or (reparto_estado = 'liberable' and colaborador_centavos > 0 and colaborador_retenido_centavos = 0)
  )
);

create index if not exists comision_operaciones_propiedad on public.comision_operaciones (propiedad_id, creado_en desc);

create or replace function public.comision_operaciones_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
declare
  via_funcion boolean := coalesce(current_setting('vivebien.operacion', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    raise exception 'Una operación de comisión no se borra: se anula.' using errcode = '23514';
  end if;
  if (new.id, new.propiedad_id, new.tipo, new.base_centavos, new.regla_version, new.total_centavos, new.atribuible, new.atribucion_ref,
      new.clave_idempotencia, new.creado_por, new.creado_en)
     is distinct from
     (old.id, old.propiedad_id, old.tipo, old.base_centavos, old.regla_version, old.total_centavos, old.atribuible, old.atribucion_ref,
      old.clave_idempotencia, old.creado_por, old.creado_en) then
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

drop trigger if exists comision_operaciones_guardia on public.comision_operaciones;
create trigger comision_operaciones_guardia before update or delete on public.comision_operaciones
  for each row execute function public.comision_operaciones_guardia();

create or replace function public.comision_auditoria_valida(p_audit jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_audit) = 'object'
     and length(btrim(coalesce(p_audit->>'actor_uid', ''))) > 0
     and length(btrim(coalesce(p_audit->>'accion', ''))) > 0
     and jsonb_typeof(p_audit->'antes') = 'object'
     and jsonb_typeof(p_audit->'despues') = 'object'
$$;

-- Registrar una operación: idempotente por clave (un reintento con los mismos datos devuelve la misma; con otros datos, `clave_en_uso`).
create or replace function public.comision_operacion_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; r public.comision_operaciones%rowtype; nuevo_id uuid;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('propiedad_id', 'tipo', 'base_centavos', 'regla_version', 'total_centavos', 'vivebien_centavos', 'colaborador_centavos',
                 'colaborador_retenido_centavos', 'retencion', 'reparto_estado', 'atribuible', 'atribucion_ref', 'clave_idempotencia', 'creado_por') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;

  begin
    insert into public.comision_operaciones (propiedad_id, tipo, base_centavos, regla_version, total_centavos, vivebien_centavos,
      colaborador_centavos, colaborador_retenido_centavos, retencion, reparto_estado, atribuible, atribucion_ref, clave_idempotencia, creado_por)
    values (p_datos->>'propiedad_id', p_datos->>'tipo', (p_datos->>'base_centavos')::bigint, p_datos->>'regla_version',
      (p_datos->>'total_centavos')::bigint, (p_datos->>'vivebien_centavos')::bigint, (p_datos->>'colaborador_centavos')::bigint,
      (p_datos->>'colaborador_retenido_centavos')::bigint, nullif(p_datos->>'retencion', ''), p_datos->>'reparto_estado',
      (p_datos->>'atribuible')::boolean, nullif(p_datos->>'atribucion_ref', ''), p_datos->>'clave_idempotencia', p_datos->>'creado_por')
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

-- Cambiar el estado: registrada → confirmada | anulada, confirmada → anulada. Con motivo y bitácora; quien registró no confirma.
create or replace function public.comision_operacion_cambiar_estado(p_id uuid, p_antes text, p_nuevo text, p_motivo text, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  o public.comision_operaciones%rowtype;
begin
  if not public.comision_auditoria_valida(p_audit) or char_length(btrim(coalesce(p_motivo, ''))) < 10 or char_length(p_motivo) > 500 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if p_nuevo not in ('confirmada', 'anulada') then raise exception 'cambio_invalido' using errcode = '22023'; end if;
  select * into o from public.comision_operaciones where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if o.estado is distinct from p_antes then return jsonb_build_object('resultado', 'conflicto'); end if;
  if not ((o.estado, p_nuevo) in (('registrada', 'confirmada'), ('registrada', 'anulada'), ('confirmada', 'anulada'))) then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if p_nuevo = 'confirmada'
     and (lower(o.creado_por) = lower(coalesce(p_audit->>'actor_email', '')) or o.creado_por = p_audit->>'actor_uid') then
    return jsonb_build_object('resultado', 'autoaprobacion');
  end if;
  perform set_config('vivebien.operacion', 'on', true);
  update public.comision_operaciones set estado = p_nuevo, estado_por = coalesce(nullif(p_audit->>'actor_email', ''), p_audit->>'actor_uid'),
    estado_en = now(), estado_motivo = btrim(p_motivo) where id = p_id;
  perform set_config('vivebien.operacion', 'off', true);
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'comision_operaciones', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

-- Liberar el reparto retenido: solo si la operación es atribuible Y la acreditación del origen está verificada y vigente HOY.
-- «Liberable» no es «pagado»: este módulo no mueve dinero.
create or replace function public.comision_reparto_liberar(p_id uuid, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  o public.comision_operaciones%rowtype;
  g public.propiedad_origen%rowtype;
begin
  if not public.comision_auditoria_valida(p_audit) then raise exception 'auditoria_incompleta' using errcode = '22023'; end if;
  select * into o from public.comision_operaciones where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if o.estado = 'anulada' or o.reparto_estado <> 'retenido' then return jsonb_build_object('resultado', 'conflicto'); end if;
  select * into g from public.propiedad_origen where propiedad_id = o.propiedad_id;
  if not o.atribuible or not found or g.acreditacion_resultado is distinct from 'coincide' or g.acreditacion_verificado_por is null
     or g.acreditacion_vigente_hasta is null or g.acreditacion_vigente_hasta < current_date then
    return jsonb_build_object('resultado', 'no_elegible');
  end if;
  perform set_config('vivebien.operacion', 'on', true);
  update public.comision_operaciones set colaborador_centavos = colaborador_retenido_centavos, colaborador_retenido_centavos = 0,
    reparto_estado = 'liberable', retencion = null where id = p_id;
  perform set_config('vivebien.operacion', 'off', true);
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'comision_operaciones', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

-- ── 3 · Permisos: solo el servidor ───────────────────────────────────────────────────────
alter table public.comision_operaciones enable row level security;
revoke all on public.comision_operaciones from public, anon, authenticated;
revoke execute on function public.origen_verificar_acreditacion(text, text, text, date, jsonb) from public, anon, authenticated;
revoke execute on function public.comision_auditoria_valida(jsonb) from public, anon, authenticated;
revoke execute on function public.comision_operacion_registrar(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.comision_operacion_cambiar_estado(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.comision_reparto_liberar(uuid, jsonb) from public, anon, authenticated;
grant all on public.comision_operaciones to service_role;
grant execute on function public.origen_verificar_acreditacion(text, text, text, date, jsonb) to service_role;
grant execute on function public.comision_auditoria_valida(jsonb) to service_role;
grant execute on function public.comision_operacion_registrar(jsonb, jsonb) to service_role;
grant execute on function public.comision_operacion_cambiar_estado(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.comision_reparto_liberar(uuid, jsonb) to service_role;

commit;
