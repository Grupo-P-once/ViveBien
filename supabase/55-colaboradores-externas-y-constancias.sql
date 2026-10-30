-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 55 — Directorio de colaboradores, comisiones EXTERNAS y constancias de pago (con comprobante opcional)
-- Reversa: 55-colaboradores-externas-y-constancias.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 43 (`comision_auditoria_valida`, `comision_operaciones`) y la 48/53 (`contab_movimientos`,
-- `contab_sin_vaciar`). Aplicar junto con el código. El bucket de archivos (storage) se crea aquí SOLO si el esquema `storage` existe.
--
-- POR QUÉ (decisiones del dueño, 26-oct-2026):
--  · La acreditación del agente es OPCIONAL: hace falta poder llevar un registro de los asesores e inmobiliarias con los que se colabora, con el folio como dato opcional.
--  · Hay comisiones que NO vienen de una propiedad del sitio: un cliente pide algo, VIVE BIEN lo consigue con un tercero y se lleva SOLO su parte. Se registran como
--    «comisión externa» en pocos segundos (qué fue, con quién se compartió, cuánto le tocó a VIVE BIEN, si ya se cobró y con qué comprobante opcional).
--  · Cada pago a un colaborador genera una CONSTANCIA con folio (hoja membretada en la aplicación): efectivo o transferencia, con el comprobante si lo hay.
--
-- QUÉ AGREGA: tres tablas (`colaboradores`, `comision_externas`, `contab_constancias`) solo del servidor (RLS sin políticas; sin DELETE ni TRUNCATE para el servidor),
-- funciones atómicas con bitácora para escribirlas y un bucket PRIVADO `contabilidad-adjuntos` para comprobantes (nadie lo lee sin que el servidor firme el acceso).
-- QUÉ NO CAMBIA: ninguna tabla ni función existente. Los datos de contacto de los colaboradores NO van a la bitácora. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Directorio de colaboradores ─────────────────────────────────────────────────────

create table if not exists public.colaboradores (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null check (tipo in ('agente', 'inmobiliaria', 'broker', 'otro')),
  nombre              text not null check (char_length(btrim(nombre)) between 2 and 120),
  empresa             text check (empresa is null or char_length(btrim(empresa)) between 1 and 120),
  telefono            text check (telefono is null or char_length(btrim(telefono)) between 5 and 40),
  correo              text check (correo is null or (char_length(correo) <= 200 and correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  municipio           text check (municipio is null or char_length(btrim(municipio)) between 2 and 120),
  folio_acreditacion  text check (folio_acreditacion is null or char_length(btrim(folio_acreditacion)) between 3 and 40),
  notas               text check (notas is null or char_length(notas) <= 500),
  activo              boolean not null default true,
  creado_por          text not null check (char_length(creado_por) between 3 and 200),
  creado_en           timestamptz not null default now()
);
create unique index if not exists colaboradores_unico on public.colaboradores (lower(btrim(nombre)), coalesce(lower(btrim(empresa)), ''));

create or replace function public.colaboradores_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un colaborador no se borra: se desactiva.' using errcode = '23514';
  end if;
  if (new.id, new.creado_por, new.creado_en) is distinct from (old.id, old.creado_por, old.creado_en) then
    raise exception 'De un colaborador no cambian su identidad, quién lo creó ni cuándo.' using errcode = '23514';
  end if;
  return new;
end $f$;
create or replace trigger colaboradores_sin_cambios_de_fondo before update or delete on public.colaboradores
  for each row execute function public.colaboradores_guardia();
create or replace trigger colaboradores_sin_vaciar before truncate on public.colaboradores
  for each statement execute function public.contab_sin_vaciar();

create or replace function public.contab_colaborador_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
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
    if k not in ('tipo', 'nombre', 'empresa', 'telefono', 'correo', 'municipio', 'folio_acreditacion', 'notas', 'creado_por') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  if coalesce(p_datos->>'nombre', '') ~ '@|[0-9]{7,}' or coalesce(p_datos->>'empresa', '') ~ '@' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  begin
    insert into public.colaboradores (tipo, nombre, empresa, telefono, correo, municipio, folio_acreditacion, notas, creado_por)
    values (p_datos->>'tipo', btrim(p_datos->>'nombre'), nullif(btrim(coalesce(p_datos->>'empresa', '')), ''), nullif(btrim(coalesce(p_datos->>'telefono', '')), ''),
            nullif(btrim(coalesce(p_datos->>'correo', '')), ''), nullif(btrim(coalesce(p_datos->>'municipio', '')), ''),
            nullif(btrim(coalesce(p_datos->>'folio_acreditacion', '')), ''), nullif(btrim(coalesce(p_datos->>'notas', '')), ''), p_datos->>'creado_por')
    returning id into nuevo_id;
  exception
    when unique_violation then
      select id into existente from public.colaboradores
       where lower(btrim(nombre)) = lower(btrim(p_datos->>'nombre'))
         and coalesce(lower(btrim(empresa)), '') = coalesce(lower(nullif(btrim(coalesce(p_datos->>'empresa', '')), '')), '');
      return jsonb_build_object('resultado', 'ya_existe', 'id', existente);
    when check_violation or invalid_text_representation or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'colaboradores', nuevo_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id);
end;
$fn$;

create or replace function public.contab_colaborador_cambiar(p_id uuid, p_cambios jsonb, p_audit jsonb) returns jsonb
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
    if k not in ('tipo', 'nombre', 'empresa', 'telefono', 'correo', 'municipio', 'folio_acreditacion', 'notas', 'activo') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  if p_cambios ? 'activo' and jsonb_typeof(p_cambios->'activo') is distinct from 'boolean' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if coalesce(p_cambios->>'nombre', '') ~ '@|[0-9]{7,}' or coalesce(p_cambios->>'empresa', '') ~ '@' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  begin
    update public.colaboradores set
      tipo = case when p_cambios ? 'tipo' then p_cambios->>'tipo' else tipo end,
      nombre = case when p_cambios ? 'nombre' then btrim(p_cambios->>'nombre') else nombre end,
      empresa = case when p_cambios ? 'empresa' then nullif(btrim(coalesce(p_cambios->>'empresa', '')), '') else empresa end,
      telefono = case when p_cambios ? 'telefono' then nullif(btrim(coalesce(p_cambios->>'telefono', '')), '') else telefono end,
      correo = case when p_cambios ? 'correo' then nullif(btrim(coalesce(p_cambios->>'correo', '')), '') else correo end,
      municipio = case when p_cambios ? 'municipio' then nullif(btrim(coalesce(p_cambios->>'municipio', '')), '') else municipio end,
      folio_acreditacion = case when p_cambios ? 'folio_acreditacion' then nullif(btrim(coalesce(p_cambios->>'folio_acreditacion', '')), '') else folio_acreditacion end,
      notas = case when p_cambios ? 'notas' then nullif(btrim(coalesce(p_cambios->>'notas', '')), '') else notas end,
      activo = case when p_cambios ? 'activo' then (p_cambios->>'activo')::boolean else activo end
     where id = p_id;
    get diagnostics filas = row_count;
  exception
    when unique_violation then return jsonb_build_object('resultado', 'ya_existe');
    when check_violation then raise exception 'cambio_invalido' using errcode = '22023';
  end;
  if filas = 0 then return jsonb_build_object('resultado', 'no_existe'); end if;
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'colaboradores', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

-- ── 2 · Comisiones EXTERNAS (no vienen de una propiedad del sitio) ──────────────────────

create table if not exists public.comision_externas (
  id                  uuid primary key default gen_random_uuid(),
  fecha               date not null check (fecha >= date '2000-01-01'),
  descripcion         text not null check (char_length(btrim(descripcion)) between 3 and 200),
  tipo                text not null check (tipo in ('venta', 'renta', 'otro')),
  colaborador_id      uuid references public.colaboradores(id) on delete restrict,
  contraparte         text check (contraparte is null or char_length(btrim(contraparte)) between 2 and 120),
  parte_centavos      bigint not null check (parte_centavos > 0 and parte_centavos <= 400000000000),
  total_centavos      bigint check (total_centavos is null or (total_centavos >= parte_centavos and total_centavos <= 400000000000)),
  porcentaje_bp       integer check (porcentaje_bp is null or porcentaje_bp between 1 and 10000),
  estado              text not null default 'por_cobrar' check (estado in ('por_cobrar', 'cobrada', 'anulada')),
  cobrada_en          date check (cobrada_en is null or cobrada_en >= date '2000-01-01'),
  metodo_cobro        text check (metodo_cobro is null or metodo_cobro in ('efectivo', 'transferencia')),
  referencia          text check (referencia is null or char_length(btrim(referencia)) between 1 and 120),
  adjunto             text check (adjunto is null or char_length(adjunto) <= 300),
  estado_por          text,
  estado_en           timestamptz,
  estado_motivo       text check (estado_motivo is null or char_length(btrim(estado_motivo)) between 10 and 500),
  clave_idempotencia  text not null unique check (char_length(clave_idempotencia) between 8 and 100),
  creado_por          text not null check (char_length(creado_por) between 3 and 200),
  creado_en           timestamptz not null default now(),
  constraint comision_externas_estado_ck check (
    (estado = 'por_cobrar' and cobrada_en is null and metodo_cobro is null)
    or (estado = 'cobrada' and cobrada_en is not null and metodo_cobro is not null)
    or (estado = 'anulada' and estado_motivo is not null)
  )
);
create index if not exists comision_externas_fecha on public.comision_externas (fecha desc, creado_en desc);

create or replace function public.comision_externas_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una comisión externa no se borra: se anula.' using errcode = '23514';
  end if;
  if (new.id, new.fecha, new.descripcion, new.tipo, new.colaborador_id, new.contraparte, new.parte_centavos, new.total_centavos, new.porcentaje_bp, new.clave_idempotencia, new.creado_por, new.creado_en)
     is distinct from
     (old.id, old.fecha, old.descripcion, old.tipo, old.colaborador_id, old.contraparte, old.parte_centavos, old.total_centavos, old.porcentaje_bp, old.clave_idempotencia, old.creado_por, old.creado_en) then
    raise exception 'Una comisión externa no se edita: se anula y se registra otra.' using errcode = '23514';
  end if;
  if coalesce(current_setting('vivebien.externa', true), '') <> 'on'
     and (new.estado, new.cobrada_en, new.metodo_cobro, new.referencia, new.adjunto, new.estado_por, new.estado_en, new.estado_motivo)
         is distinct from (old.estado, old.cobrada_en, old.metodo_cobro, old.referencia, old.adjunto, old.estado_por, old.estado_en, old.estado_motivo) then
    raise exception 'El estado de una comisión externa solo cambia por sus funciones.' using errcode = '23514';
  end if;
  if old.estado = 'anulada' and new.estado <> 'anulada' then
    raise exception 'Una comisión externa anulada no vuelve.' using errcode = '23514';
  end if;
  return new;
end $f$;
create or replace trigger comision_externas_sin_cambios_de_fondo before update or delete on public.comision_externas
  for each row execute function public.comision_externas_guardia();
create or replace trigger comision_externas_sin_vaciar before truncate on public.comision_externas
  for each statement execute function public.contab_sin_vaciar();

create or replace function public.comision_externa_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; nuevo_id uuid; r public.comision_externas%rowtype; v_fecha date; v_cobrada boolean; v_cobro date; v_metodo text;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('fecha', 'descripcion', 'tipo', 'colaborador_id', 'contraparte', 'parte_centavos', 'total_centavos', 'porcentaje_bp', 'cobrada', 'cobrada_en',
                 'metodo_cobro', 'referencia', 'adjunto', 'clave_idempotencia', 'creado_por') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_datos->'parte_centavos') is distinct from 'number'
     or (p_datos ? 'total_centavos' and p_datos->'total_centavos' <> 'null'::jsonb and jsonb_typeof(p_datos->'total_centavos') is distinct from 'number') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if coalesce(p_datos->>'descripcion', '') ~ '@|[0-9]{7,}' or coalesce(p_datos->>'contraparte', '') ~ '@|[0-9]{7,}' or coalesce(p_datos->>'referencia', '') ~ '@' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  begin
    v_fecha := (p_datos->>'fecha')::date;
    v_cobrada := coalesce((p_datos->>'cobrada')::boolean, false);
    v_cobro := nullif(p_datos->>'cobrada_en', '')::date;
    v_metodo := nullif(p_datos->>'metodo_cobro', '');
  exception when others then
    raise exception 'cambio_invalido' using errcode = '22023';
  end;
  if v_fecha is null or v_fecha > current_date + 1 or (v_cobrada and (v_cobro is null or v_cobro > current_date + 1 or v_metodo is null)) then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    insert into public.comision_externas (fecha, descripcion, tipo, colaborador_id, contraparte, parte_centavos, total_centavos, porcentaje_bp, estado, cobrada_en, metodo_cobro,
                                          referencia, adjunto, clave_idempotencia, creado_por, estado_por, estado_en)
    values (v_fecha, btrim(p_datos->>'descripcion'), p_datos->>'tipo', nullif(p_datos->>'colaborador_id', '')::uuid, nullif(btrim(coalesce(p_datos->>'contraparte', '')), ''),
            (p_datos->>'parte_centavos')::bigint, nullif(p_datos->>'total_centavos', '')::bigint, nullif(p_datos->>'porcentaje_bp', '')::integer,
            case when v_cobrada then 'cobrada' else 'por_cobrar' end, case when v_cobrada then v_cobro end, case when v_cobrada then v_metodo end,
            nullif(btrim(coalesce(p_datos->>'referencia', '')), ''), nullif(btrim(coalesce(p_datos->>'adjunto', '')), ''), p_datos->>'clave_idempotencia', p_datos->>'creado_por',
            case when v_cobrada then p_datos->>'creado_por' end, case when v_cobrada then now() end)
    returning id into nuevo_id;
  exception
    when unique_violation then
      select * into r from public.comision_externas where clave_idempotencia = p_datos->>'clave_idempotencia';
      if r.fecha = v_fecha and r.parte_centavos = (p_datos->>'parte_centavos')::bigint and r.tipo = p_datos->>'tipo' then
        return jsonb_build_object('resultado', 'repetida', 'id', r.id);
      end if;
      return jsonb_build_object('resultado', 'clave_en_uso');
    when foreign_key_violation then
      return jsonb_build_object('resultado', 'no_existe');
    when check_violation or invalid_text_representation or numeric_value_out_of_range or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'comision_externas', nuevo_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id);
end;
$fn$;

-- por_cobrar → cobrada | anulada, y cobrada → anulada. `p_antes` es el estado que vio quien decide (si cambió, `conflicto`).
create or replace function public.comision_externa_cambiar_estado(p_id uuid, p_antes text, p_nuevo text, p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  o public.comision_externas%rowtype; k text; v_cobro date; v_metodo text;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('cobrada_en', 'metodo_cobro', 'referencia', 'adjunto', 'motivo') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  if p_nuevo not in ('cobrada', 'anulada') then raise exception 'cambio_invalido' using errcode = '22023'; end if;
  if coalesce(p_datos->>'referencia', '') ~ '@' then raise exception 'cambio_invalido' using errcode = '22023'; end if;
  select * into o from public.comision_externas where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if o.estado is distinct from p_antes then return jsonb_build_object('resultado', 'conflicto'); end if;
  if not ((o.estado, p_nuevo) in (('por_cobrar', 'cobrada'), ('por_cobrar', 'anulada'), ('cobrada', 'anulada'))) then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  perform set_config('vivebien.externa', 'on', true);
  begin
    if p_nuevo = 'cobrada' then
      v_cobro := (p_datos->>'cobrada_en')::date; v_metodo := p_datos->>'metodo_cobro';
      if v_cobro is null or v_metodo is null or v_cobro > current_date + 1 or v_cobro < o.fecha then raise exception 'cambio_invalido' using errcode = '22023'; end if;
      update public.comision_externas set estado = 'cobrada', cobrada_en = v_cobro, metodo_cobro = v_metodo,
        referencia = coalesce(nullif(btrim(coalesce(p_datos->>'referencia', '')), ''), referencia), adjunto = coalesce(nullif(btrim(coalesce(p_datos->>'adjunto', '')), ''), adjunto),
        estado_por = coalesce(nullif(p_audit->>'actor_email', ''), p_audit->>'actor_uid'), estado_en = now() where id = p_id;
    else
      if char_length(btrim(coalesce(p_datos->>'motivo', ''))) not between 10 and 500 then raise exception 'cambio_invalido' using errcode = '22023'; end if;
      update public.comision_externas set estado = 'anulada', estado_motivo = btrim(p_datos->>'motivo'),
        estado_por = coalesce(nullif(p_audit->>'actor_email', ''), p_audit->>'actor_uid'), estado_en = now() where id = p_id;
    end if;
  exception when check_violation or invalid_text_representation then
    raise exception 'cambio_invalido' using errcode = '22023';
  end;
  perform set_config('vivebien.externa', 'off', true);
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'comision_externas', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

-- ── 3 · Constancias de pago a colaboradores ─────────────────────────────────────────────

create sequence if not exists public.contab_constancia_seq;

create table if not exists public.contab_constancias (
  id                  uuid primary key default gen_random_uuid(),
  folio               text not null unique check (folio ~ '^CP-[0-9]{4}-[0-9]{4,}$'),
  movimiento_id       uuid not null unique references public.contab_movimientos(id) on delete restrict,
  operacion_id        uuid references public.comision_operaciones(id) on delete restrict,
  colaborador_id      uuid references public.colaboradores(id) on delete restrict,
  colaborador_nombre  text not null check (char_length(btrim(colaborador_nombre)) between 2 and 120),
  metodo              text not null check (metodo in ('efectivo', 'transferencia')),
  referencia          text check (referencia is null or char_length(btrim(referencia)) between 1 and 120),
  comprobante         text check (comprobante is null or char_length(comprobante) <= 300),
  monto_centavos      bigint not null check (monto_centavos > 0),
  fecha_pago          date not null,
  descripcion         text not null check (char_length(btrim(descripcion)) between 3 and 300),
  creado_por          text not null check (char_length(creado_por) between 3 and 200),
  creado_en           timestamptz not null default now()
);

create or replace function public.contab_constancias_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una constancia no se borra.' using errcode = '23514';
  end if;
  if (new.id, new.folio, new.movimiento_id, new.operacion_id, new.colaborador_id, new.colaborador_nombre, new.metodo, new.referencia, new.monto_centavos, new.fecha_pago, new.descripcion, new.creado_por, new.creado_en)
     is distinct from
     (old.id, old.folio, old.movimiento_id, old.operacion_id, old.colaborador_id, old.colaborador_nombre, old.metodo, old.referencia, old.monto_centavos, old.fecha_pago, old.descripcion, old.creado_por, old.creado_en) then
    raise exception 'Una constancia no se edita.' using errcode = '23514';
  end if;
  if old.comprobante is not null and new.comprobante is distinct from old.comprobante then
    raise exception 'El comprobante de una constancia no se reemplaza.' using errcode = '23514';
  end if;
  return new;
end $f$;
create or replace trigger contab_constancias_sin_cambios_de_fondo before update or delete on public.contab_constancias
  for each row execute function public.contab_constancias_guardia();
create or replace trigger contab_constancias_sin_vaciar before truncate on public.contab_constancias
  for each statement execute function public.contab_sin_vaciar();

create or replace function public.contab_constancia_crear(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; m public.contab_movimientos%rowtype; existente public.contab_constancias%rowtype; nuevo_id uuid; v_folio text; v_nombre text; v_metodo text;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('movimiento_id', 'colaborador_id', 'colaborador_nombre', 'metodo', 'referencia', 'comprobante', 'descripcion', 'creado_por') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  v_nombre := btrim(coalesce(p_datos->>'colaborador_nombre', ''));
  v_metodo := p_datos->>'metodo';
  if v_nombre ~ '@|[0-9]{7,}' or coalesce(p_datos->>'referencia', '') ~ '@' or char_length(v_nombre) not between 2 and 120 or v_metodo not in ('efectivo', 'transferencia') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  select * into m from public.contab_movimientos where id = (p_datos->>'movimiento_id')::uuid;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if m.clase <> 'pago_colaborador'
     or exists (select 1 from public.contab_movimientos a where a.reverso_de = m.id and a.clase = 'anulacion') then
    return jsonb_build_object('resultado', 'no_aplica');
  end if;
  select * into existente from public.contab_constancias where movimiento_id = m.id;
  if found then return jsonb_build_object('resultado', 'repetida', 'id', existente.id, 'folio', existente.folio); end if;
  v_folio := 'CP-' || to_char(m.fecha, 'YYYY') || '-' || lpad(nextval('public.contab_constancia_seq')::text, 4, '0');
  begin
    insert into public.contab_constancias (folio, movimiento_id, operacion_id, colaborador_id, colaborador_nombre, metodo, referencia, comprobante, monto_centavos, fecha_pago, descripcion, creado_por)
    values (v_folio, m.id, m.operacion_id, nullif(p_datos->>'colaborador_id', '')::uuid, v_nombre, v_metodo, nullif(btrim(coalesce(p_datos->>'referencia', '')), ''),
            nullif(btrim(coalesce(p_datos->>'comprobante', '')), ''), m.monto_centavos, m.fecha, btrim(coalesce(p_datos->>'descripcion', m.concepto)), p_datos->>'creado_por')
    returning id into nuevo_id;
  exception
    when unique_violation then
      select * into existente from public.contab_constancias where movimiento_id = m.id;
      return jsonb_build_object('resultado', 'repetida', 'id', existente.id, 'folio', existente.folio);
    when foreign_key_violation then
      return jsonb_build_object('resultado', 'no_existe');
    when check_violation or invalid_text_representation or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_constancias', nuevo_id::text, p_audit->'antes',
          coalesce(p_audit->'despues', '{}'::jsonb) || jsonb_build_object('folio', v_folio));
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id, 'folio', v_folio);
end;
$fn$;

-- El comprobante puede llegar después (cuando el colaborador entrega la transferencia): solo se agrega si todavía no hay uno.
create or replace function public.contab_constancia_adjuntar(p_id uuid, p_comprobante text, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  c public.contab_constancias%rowtype;
begin
  if not public.comision_auditoria_valida(p_audit) or char_length(btrim(coalesce(p_comprobante, ''))) not between 3 and 300 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  select * into c from public.contab_constancias where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if c.comprobante is not null then return jsonb_build_object('resultado', 'ya_tiene'); end if;
  update public.contab_constancias set comprobante = btrim(p_comprobante) where id = p_id;
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_constancias', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

-- ── 4 · Permisos: solo el servidor ──────────────────────────────────────────────────────

alter table public.colaboradores enable row level security;
alter table public.comision_externas enable row level security;
alter table public.contab_constancias enable row level security;
revoke all on public.colaboradores, public.comision_externas, public.contab_constancias from public, anon, authenticated;
revoke all on public.colaboradores, public.comision_externas, public.contab_constancias from service_role;
grant select, insert, update on public.colaboradores, public.comision_externas, public.contab_constancias to service_role;
revoke all on sequence public.contab_constancia_seq from public, anon, authenticated;
grant usage, select on sequence public.contab_constancia_seq to service_role;

revoke execute on function public.contab_colaborador_registrar(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.contab_colaborador_cambiar(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.comision_externa_registrar(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.comision_externa_cambiar_estado(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.contab_constancia_crear(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.contab_constancia_adjuntar(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.contab_colaborador_registrar(jsonb, jsonb) to service_role;
grant execute on function public.contab_colaborador_cambiar(uuid, jsonb, jsonb) to service_role;
grant execute on function public.comision_externa_registrar(jsonb, jsonb) to service_role;
grant execute on function public.comision_externa_cambiar_estado(uuid, text, text, jsonb, jsonb) to service_role;
grant execute on function public.contab_constancia_crear(jsonb, jsonb) to service_role;
grant execute on function public.contab_constancia_adjuntar(uuid, text, jsonb) to service_role;

-- ── 5 · Bucket PRIVADO para comprobantes (solo si existe el esquema de archivos) ────────

do $bucket$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('contabilidad-adjuntos', 'contabilidad-adjuntos', false, 4194304, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end
$bucket$;

commit;
