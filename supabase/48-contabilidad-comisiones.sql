-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 48 — Contabilidad de comisiones: cuentas de gasto y libro de movimientos «solo se agrega»
-- Reversa: 48-contabilidad-comisiones.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 43 (propiedades, operaciones y `comision_auditoria_valida`).
-- Aplicar solo con autorización del propietario.
--
-- Qué hay:
--  · `contab_cuentas`: los LUGARES de gasto («Meta Ads · cuenta publicitaria 33839», «Lonas El Juanito»). Se pueden desactivar y anotar; no se borran.
--  · `contab_movimientos`: el libro de los movimientos que NO vienen de una operación de comisión: gastos externos, ingresos extra, DEVOLUCIONES (un
--    proveedor regresa dinero) y ANULACIONES (se registró algo que no era). Solo se agrega: no se edita, no se borra, no se vacía. Un error se corrige con
--    un contra-asiento vinculado al original (`reverso_de`), nunca con una edición.
--  · Las operaciones de comisión (ingreso, parte del colaborador y gastos de cada operación) NO se copian aquí: el diario las une en la pantalla.
--
-- Reglas que aplica la función de registro:
--  · gasto → sale; ingreso extra → entra; devolución y anulación llevan el original y un motivo de 10 a 300 caracteres, y su sentido es el contrario.
--  · una devolución no puede exceder lo que queda del original (descontadas otras devoluciones vigentes); no se devuelve algo ya anulado.
--  · una anulación revierte exactamente lo que queda del original; no se anula dos veces ni se anula una anulación.
--  · el concepto no admite correos ni números de 7 o más dígitos (datos personales); el número de factura o de campaña va en `referencia`.
--  · todo cambio escribe `audit_logs` en la misma transacción. Idempotente por clave.
-- Solo `service_role` (el servidor, tras validar que es Super Admin) puede leer y escribir.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Cuentas de gasto ────────────────────────────────────────────────────────────────

create table if not exists public.contab_cuentas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (char_length(btrim(nombre)) between 2 and 120),
  categoria      text not null check (categoria in ('publicidad_digital', 'publicidad_impresa', 'fotografia_video', 'gestoria_legal',
                                                    'software_suscripciones', 'transporte', 'oficina', 'honorarios_externos', 'comision_externa',
                                                    'impuestos_derechos', 'otro')),
  identificador  text check (identificador is null or char_length(btrim(identificador)) between 1 and 120),
  notas          text check (notas is null or char_length(notas) <= 500),
  activa         boolean not null default true,
  creado_por     text not null check (char_length(creado_por) between 3 and 200),
  creado_en      timestamptz not null default now()
);

create unique index if not exists contab_cuentas_unica on public.contab_cuentas (lower(btrim(nombre)), coalesce(lower(btrim(identificador)), ''));

-- ── 2 · Movimientos (solo se agrega) ────────────────────────────────────────────────────

create table if not exists public.contab_movimientos (
  id                  uuid primary key default gen_random_uuid(),
  fecha               date not null check (fecha >= date '2000-01-01'),
  sentido             text not null check (sentido in ('entra', 'sale')),
  clase               text not null check (clase in ('gasto', 'ingreso_extra', 'devolucion', 'anulacion')),
  monto_centavos      bigint not null check (monto_centavos > 0 and monto_centavos <= 400000000000),
  categoria           text not null check (categoria in ('publicidad_digital', 'publicidad_impresa', 'fotografia_video', 'gestoria_legal',
                                                         'software_suscripciones', 'transporte', 'oficina', 'honorarios_externos', 'comision_externa',
                                                         'impuestos_derechos', 'otro', 'ingreso_extra')),
  cuenta_id           uuid references public.contab_cuentas(id) on delete restrict,
  propiedad_id        text references public.propiedades(id) on delete restrict,
  operacion_id        uuid references public.comision_operaciones(id) on delete restrict,
  concepto            text not null check (char_length(btrim(concepto)) between 2 and 200),
  referencia          text check (referencia is null or char_length(btrim(referencia)) between 1 and 120),
  reverso_de          uuid references public.contab_movimientos(id) on delete restrict,
  motivo              text check (motivo is null or char_length(btrim(motivo)) between 10 and 300),
  clave_idempotencia  text not null unique check (char_length(clave_idempotencia) between 8 and 100),
  creado_por          text not null check (char_length(creado_por) between 3 and 200),
  creado_en           timestamptz not null default now(),
  constraint contab_movimientos_clase_ck check (
    (clase = 'gasto' and sentido = 'sale' and reverso_de is null and categoria <> 'ingreso_extra')
    or (clase = 'ingreso_extra' and sentido = 'entra' and reverso_de is null and categoria = 'ingreso_extra')
    or (clase in ('devolucion', 'anulacion') and reverso_de is not null and motivo is not null)
  )
);

create index if not exists contab_movimientos_fecha on public.contab_movimientos (fecha desc, creado_en desc);
create index if not exists contab_movimientos_cuenta on public.contab_movimientos (cuenta_id) where cuenta_id is not null;
create index if not exists contab_movimientos_propiedad on public.contab_movimientos (propiedad_id) where propiedad_id is not null;
create index if not exists contab_movimientos_reverso on public.contab_movimientos (reverso_de) where reverso_de is not null;

-- ── 3 · Guardias: ni se edita, ni se borra, ni se vacía ─────────────────────────────────

create or replace function public.contab_movimientos_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  raise exception 'Un movimiento contable no se edita ni se borra: se corrige con una devolución o una anulación.' using errcode = '23514';
end $f$;

create or replace trigger contab_movimientos_sin_cambios before update or delete on public.contab_movimientos
  for each row execute function public.contab_movimientos_guardia();

create or replace function public.contab_sin_vaciar() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  raise exception 'Este registro solo se agrega: no se vacía.' using errcode = '23514';
end $f$;

create or replace trigger contab_movimientos_sin_vaciar before truncate on public.contab_movimientos
  for each statement execute function public.contab_sin_vaciar();
create or replace trigger contab_cuentas_sin_vaciar before truncate on public.contab_cuentas
  for each statement execute function public.contab_sin_vaciar();

-- De una cuenta solo cambian `activa` y `notas`; nunca se borra.
create or replace function public.contab_cuentas_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una cuenta de gasto no se borra: se desactiva.' using errcode = '23514';
  end if;
  if (new.id, new.nombre, new.categoria, new.identificador, new.creado_por, new.creado_en)
     is distinct from (old.id, old.nombre, old.categoria, old.identificador, old.creado_por, old.creado_en) then
    raise exception 'De una cuenta de gasto solo cambian las notas y si está activa.' using errcode = '23514';
  end if;
  return new;
end $f$;

create or replace trigger contab_cuentas_sin_cambios_de_fondo before update or delete on public.contab_cuentas
  for each row execute function public.contab_cuentas_guardia();

-- ── 4 · Funciones de escritura (atómicas, con bitácora) ─────────────────────────────────

create or replace function public.contab_cuenta_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; nuevo_id uuid; existente uuid;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('nombre', 'categoria', 'identificador', 'notas', 'creado_por') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  if coalesce(p_datos->>'nombre', '') ~ '@|[0-9]{12,}' or coalesce(p_datos->>'identificador', '') ~ '@' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    insert into public.contab_cuentas (nombre, categoria, identificador, notas, creado_por)
    values (btrim(p_datos->>'nombre'), p_datos->>'categoria', nullif(btrim(coalesce(p_datos->>'identificador', '')), ''),
            nullif(btrim(coalesce(p_datos->>'notas', '')), ''), p_datos->>'creado_por')
    returning id into nuevo_id;
  exception
    when unique_violation then
      select id into existente from public.contab_cuentas
       where lower(btrim(nombre)) = lower(btrim(p_datos->>'nombre'))
         and coalesce(lower(btrim(identificador)), '') = coalesce(lower(nullif(btrim(coalesce(p_datos->>'identificador', '')), '')), '');
      return jsonb_build_object('resultado', 'ya_existe', 'id', existente);
    when check_violation or invalid_text_representation or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_cuentas', nuevo_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id);
end;
$fn$;

create or replace function public.contab_cuenta_cambiar(p_id uuid, p_cambios jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; filas integer;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_cambios) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if k not in ('activa', 'notas') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  if p_cambios ? 'activa' and jsonb_typeof(p_cambios->'activa') is distinct from 'boolean' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if p_cambios ? 'notas' and jsonb_typeof(p_cambios->'notas') not in ('string', 'null') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    update public.contab_cuentas
       set activa = case when p_cambios ? 'activa' then (p_cambios->>'activa')::boolean else activa end,
           notas = case when p_cambios ? 'notas' then nullif(btrim(coalesce(p_cambios->>'notas', '')), '') else notas end
     where id = p_id;
    get diagnostics filas = row_count;
  exception
    when check_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;
  if filas = 0 then
    return jsonb_build_object('resultado', 'no_existe');
  end if;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_cuentas', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

create or replace function public.contab_movimiento_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; v_clase text; v_sentido text; v_monto bigint; v_fecha date; v_categoria text; v_concepto text;
  v_cuenta uuid; v_propiedad text; v_operacion uuid; v_reverso uuid;
  orig public.contab_movimientos%rowtype; ya public.contab_movimientos%rowtype; cta public.contab_cuentas%rowtype;
  devuelto bigint; esperado bigint; nuevo_id uuid;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('fecha', 'clase', 'monto_centavos', 'categoria', 'cuenta_id', 'propiedad_id', 'operacion_id', 'concepto', 'referencia',
                 'reverso_de', 'motivo', 'clave_idempotencia', 'creado_por') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(p_datos->'monto_centavos') is distinct from 'number' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    v_clase := p_datos->>'clase';
    v_monto := (p_datos->>'monto_centavos')::bigint;
    v_fecha := (p_datos->>'fecha')::date;
    v_cuenta := nullif(p_datos->>'cuenta_id', '')::uuid;
    v_operacion := nullif(p_datos->>'operacion_id', '')::uuid;
    v_reverso := nullif(p_datos->>'reverso_de', '')::uuid;
  exception when others then
    raise exception 'cambio_invalido' using errcode = '22023';
  end;
  v_propiedad := nullif(btrim(coalesce(p_datos->>'propiedad_id', '')), '');
  v_categoria := p_datos->>'categoria';
  v_concepto := btrim(coalesce(p_datos->>'concepto', ''));

  if v_clase is null or v_clase not in ('gasto', 'ingreso_extra', 'devolucion', 'anulacion')
     or v_monto is null or v_monto < 1 or v_fecha is null or v_fecha < date '2000-01-01' or v_fecha > current_date + 1
     or char_length(v_concepto) not between 2 and 200 or v_concepto ~ '@|[0-9]{7,}'
     or coalesce(p_datos->>'referencia', '') ~ '@' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  if v_clase in ('gasto', 'ingreso_extra') then
    if v_reverso is not null or nullif(btrim(coalesce(p_datos->>'motivo', '')), '') is not null then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
    v_sentido := case when v_clase = 'gasto' then 'sale' else 'entra' end;
    if v_clase = 'gasto' and (v_categoria is null or v_categoria = 'ingreso_extra') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
    if v_clase = 'ingreso_extra' then v_categoria := 'ingreso_extra'; end if;
    if v_cuenta is not null then
      select * into cta from public.contab_cuentas where id = v_cuenta;
      if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
      if not cta.activa then return jsonb_build_object('resultado', 'cuenta_inactiva'); end if;
    end if;
  else
    -- Devolución o anulación: nace del original y hereda su categoría, cuenta, propiedad y operación.
    if v_reverso is null or nullif(btrim(coalesce(p_datos->>'motivo', '')), '') is null then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
    -- Dos devoluciones al mismo tiempo sobre el mismo original se atienden una tras otra (el libro no concede UPDATE, así que no se usa FOR UPDATE).
    perform pg_advisory_xact_lock(hashtextextended('contab:' || v_reverso::text, 0));
    select * into orig from public.contab_movimientos where id = v_reverso;
    if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
    if v_fecha < orig.fecha then raise exception 'cambio_invalido' using errcode = '22023'; end if;
    if exists (select 1 from public.contab_movimientos a where a.reverso_de = orig.id and a.clase = 'anulacion') then
      return jsonb_build_object('resultado', 'ya_anulado');
    end if;
    select coalesce(sum(d.monto_centavos), 0) into devuelto from public.contab_movimientos d
     where d.reverso_de = orig.id and d.clase = 'devolucion'
       and not exists (select 1 from public.contab_movimientos a where a.reverso_de = d.id and a.clase = 'anulacion');
    if v_clase = 'devolucion' then
      if orig.clase not in ('gasto', 'ingreso_extra') then return jsonb_build_object('resultado', 'no_aplica'); end if;
      if v_monto > orig.monto_centavos - devuelto then
        return jsonb_build_object('resultado', 'excede', 'disponible', orig.monto_centavos - devuelto);
      end if;
    else
      if orig.clase = 'anulacion' then return jsonb_build_object('resultado', 'no_aplica'); end if;
      esperado := orig.monto_centavos - case when orig.clase in ('gasto', 'ingreso_extra') then devuelto else 0 end;
      if esperado <= 0 then return jsonb_build_object('resultado', 'sin_remanente'); end if;
      if v_monto <> esperado then return jsonb_build_object('resultado', 'monto_distinto', 'esperado', esperado); end if;
    end if;
    v_sentido := case when orig.sentido = 'sale' then 'entra' else 'sale' end;
    v_categoria := orig.categoria; v_cuenta := orig.cuenta_id; v_propiedad := orig.propiedad_id; v_operacion := orig.operacion_id;
  end if;

  begin
    insert into public.contab_movimientos (fecha, sentido, clase, monto_centavos, categoria, cuenta_id, propiedad_id, operacion_id, concepto, referencia,
                                           reverso_de, motivo, clave_idempotencia, creado_por)
    values (v_fecha, v_sentido, v_clase, v_monto, v_categoria, v_cuenta, v_propiedad, v_operacion, v_concepto, nullif(btrim(coalesce(p_datos->>'referencia', '')), ''),
            v_reverso, nullif(btrim(coalesce(p_datos->>'motivo', '')), ''), p_datos->>'clave_idempotencia', p_datos->>'creado_por')
    returning id into nuevo_id;
  exception
    when unique_violation then
      select * into ya from public.contab_movimientos where clave_idempotencia = p_datos->>'clave_idempotencia';
      if ya.clase = v_clase and ya.monto_centavos = v_monto and ya.fecha = v_fecha and ya.reverso_de is not distinct from v_reverso then
        return jsonb_build_object('resultado', 'repetida', 'id', ya.id);
      end if;
      return jsonb_build_object('resultado', 'clave_en_uso');
    when foreign_key_violation then
      return jsonb_build_object('resultado', 'no_existe');
    when check_violation or invalid_text_representation or numeric_value_out_of_range or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_movimientos', nuevo_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id);
end;
$fn$;

-- ── 5 · Permisos: solo el servidor ──────────────────────────────────────────────────────

alter table public.contab_cuentas enable row level security;
alter table public.contab_movimientos enable row level security;
revoke all on public.contab_cuentas, public.contab_movimientos from public, anon, authenticated;
-- Supabase concede por defecto a service_role todo (incluido TRUNCATE): se le quita lo que la aplicación nunca usa.
revoke all on public.contab_cuentas, public.contab_movimientos from service_role;
grant select, insert, update on public.contab_cuentas to service_role;
grant select, insert on public.contab_movimientos to service_role;

revoke execute on function public.contab_cuenta_registrar(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.contab_cuenta_cambiar(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.contab_movimiento_registrar(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.contab_cuenta_registrar(jsonb, jsonb) to service_role;
grant execute on function public.contab_cuenta_cambiar(uuid, jsonb, jsonb) to service_role;
grant execute on function public.contab_movimiento_registrar(jsonb, jsonb) to service_role;

commit;
