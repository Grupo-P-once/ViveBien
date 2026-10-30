-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 15 — Citas (visitas a propiedades)
-- Aplicada con MCP (apply_migration '15_citas'). Ver docs/appointments-architecture.md
--
-- La base es la ÚNICA fuente de verdad de una cita. Google Calendar y los
-- correos son salidas: si fallan, la cita existe igual y el fallo se ve.
--
-- Tres garantías que viven aquí y no en la pantalla:
--   1. Nunca dos citas activas empalmadas para el mismo asesor ni para el
--      mismo cliente (restricciones de exclusión con btree_gist).
--   2. Una cita sólo cambia de estado por `cita_transicionar`, que comprueba
--      estado, papel y versión, y deja historial, en UNA transacción.
--   3. Nadie fuera del servidor lee ni escribe: RLS activo, sin políticas,
--      y sin permisos para anon/authenticated.
--
-- Sólo agenda quien tiene cuenta (cliente_uid obligatorio). Quien sólo llenó
-- el formulario de registro no tiene fila en `usuarios` y no puede.
-- ═══════════════════════════════════════════════════════════════

-- En el esquema `extensions`, no en `public` (aviso del asesor de seguridad de
-- Supabase; en producción se movió con la migración 15b).
create extension if not exists btree_gist with schema extensions;

-- ── Horario y ajustes de cada asesor ────────────────────────────
-- Si un asesor no tiene filas, la app usa el horario por defecto
-- (src/lib/citas/ajustes.ts). Horas en hora local de León.

create table if not exists public.disponibilidad_asesores (
  id          bigint generated always as identity primary key,
  asesor_uid  text not null references public.usuarios(uid),
  dia_semana  smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  desde       time not null,
  hasta       time not null,
  check (hasta > desde),
  unique (asesor_uid, dia_semana, desde)
);

create table if not exists public.ajustes_citas (
  asesor_uid          text primary key references public.usuarios(uid),
  duracion_min        smallint not null default 60 check (duracion_min between 15 and 240),
  margen_min          smallint not null default 15 check (margen_min between 0 and 120),
  anticipacion_horas  smallint not null default 2  check (anticipacion_horas between 0 and 168),
  ventana_dias        smallint not null default 30 check (ventana_dias between 1 and 180),
  confirmacion        text not null default 'manual' check (confirmacion in ('manual', 'automatica')),
  actualizado_en      timestamptz not null default now()
);

create table if not exists public.bloqueos_asesores (
  id          bigint generated always as identity primary key,
  asesor_uid  text not null references public.usuarios(uid),
  desde       timestamptz not null,
  hasta       timestamptz not null,
  motivo      text check (char_length(motivo) <= 200),
  creado_en   timestamptz not null default now(),
  check (hasta > desde)
);
create index if not exists bloqueos_asesor_rango on public.bloqueos_asesores (asesor_uid, desde, hasta);

-- ── La cita ─────────────────────────────────────────────────────

create table if not exists public.citas (
  id                  uuid primary key default gen_random_uuid(),
  propiedad_id        text references public.propiedades(id) on delete set null,
  cliente_uid         text not null references public.usuarios(uid),
  asesor_uid          text not null references public.usuarios(uid),

  inicio              timestamptz not null,
  fin                 timestamptz not null,
  margen_min          smallint not null default 15 check (margen_min between 0 and 120),
  -- Lo que la cita aparta en la agenda del asesor: de su inicio a su fin más
  -- el margen. Columnas guardadas porque `timestamptz + interval` no es
  -- inmutable y una restricción de exclusión no lo acepta.
  ocupa_desde         timestamptz not null,
  ocupa_hasta         timestamptz not null,
  zona_horaria        text not null default 'America/Mexico_City',

  estado              text not null check (estado in (
                        'REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED',
                        'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
  estado_previo       text check (estado_previo in (
                        'REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED')),
  version             integer not null default 1,

  -- Propuesta de cambio de horario pendiente (RESCHEDULE_REQUESTED)
  propuesta_inicio    timestamptz,
  propuesta_fin       timestamptz,
  propuesta_por       text check (propuesta_por in ('cliente', 'asesor', 'admin')),

  -- Copia de lo que se compartió al agendar (como solicitudes_contacto): si el
  -- cliente cambia su perfil, la cita sigue diciendo lo que aceptó compartir.
  cliente_nombre      text not null check (char_length(cliente_nombre) between 2 and 120),
  cliente_telefono    text not null,
  cliente_email       text,
  consentimiento_version text not null,
  consentimiento_en   timestamptz not null default now(),
  propiedad_titulo    text,
  lugar               text,

  notas_cliente       text check (char_length(notas_cliente) <= 500),
  notas_internas      text check (char_length(notas_internas) <= 2000),
  motivo_cancelacion  text check (char_length(motivo_cancelacion) <= 500),

  -- Google Calendar: salida, nunca fuente
  google_event_id     text,
  google_sync         text not null default 'no_aplica'
                      check (google_sync in ('no_aplica', 'pendiente', 'ok', 'error', 'desincronizada')),
  google_error        text,
  google_intentos     smallint not null default 0,

  clave_idempotencia  text check (char_length(clave_idempotencia) between 8 and 100),
  creada_por          text not null,
  creada_en           timestamptz not null default now(),
  actualizada_en      timestamptz not null default now(),

  check (fin > inicio),
  check (ocupa_desde <= inicio and ocupa_hasta >= fin),
  check ((propuesta_inicio is null) = (propuesta_fin is null)),
  check (propuesta_fin is null or propuesta_fin > propuesta_inicio),
  unique (creada_por, clave_idempotencia)
);

-- Nunca dos citas activas empalmadas para el mismo asesor…
alter table public.citas drop constraint if exists citas_asesor_sin_empalme;
alter table public.citas add constraint citas_asesor_sin_empalme exclude using gist (
  asesor_uid with =,
  tstzrange(ocupa_desde, ocupa_hasta, '[)') with &&
) where (estado in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED'));

-- …ni para el mismo cliente.
alter table public.citas drop constraint if exists citas_cliente_sin_empalme;
alter table public.citas add constraint citas_cliente_sin_empalme exclude using gist (
  cliente_uid with =,
  tstzrange(inicio, fin, '[)') with &&
) where (estado in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED'));

create index if not exists citas_asesor_inicio  on public.citas (asesor_uid, inicio);
create index if not exists citas_cliente_inicio on public.citas (cliente_uid, inicio);
create index if not exists citas_inicio         on public.citas (inicio);
create index if not exists citas_propiedad      on public.citas (propiedad_id);

-- ── Historial y auditoría ───────────────────────────────────────
-- Una cita no se borra (se cancela) y su historial tampoco.

create table if not exists public.citas_eventos (
  id             bigint generated always as identity primary key,
  cita_id        uuid not null references public.citas(id),
  tipo           text not null,
  estado_antes   text,
  estado_despues text,
  actor_uid      text,
  actor_rol      text not null check (actor_rol in ('cliente', 'asesor', 'admin', 'sistema')),
  via            text not null check (via in ('panel', 'correo', 'sistema', 'google')),
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now()
);
create index if not exists citas_eventos_cita on public.citas_eventos (cita_id, creado_en);
create index if not exists citas_eventos_fecha on public.citas_eventos (creado_en desc);

-- ── Enlaces de acción de los correos ────────────────────────────
-- Sólo el hash: el token en claro nunca se guarda.

create table if not exists public.citas_tokens (
  id           uuid primary key default gen_random_uuid(),
  cita_id      uuid not null references public.citas(id),
  accion       text not null check (accion in ('confirmar', 'cancelar', 'aceptar_cambio', 'rechazar_cambio')),
  para_rol     text not null check (para_rol in ('cliente', 'asesor')),
  hash         text not null unique,
  version_cita integer not null,
  expira_en    timestamptz not null,
  usado_en     timestamptz,
  revocado_en  timestamptz,
  creado_en    timestamptz not null default now()
);
create index if not exists citas_tokens_cita on public.citas_tokens (cita_id) where usado_en is null and revocado_en is null;

-- ── Registro de correos (y llave de no-duplicado) ───────────────

create table if not exists public.citas_correos (
  id                  bigint generated always as identity primary key,
  cita_id             uuid not null references public.citas(id),
  tipo                text not null,
  destinatario_rol    text not null check (destinatario_rol in ('cliente', 'asesor', 'admin')),
  destinatario_email  text not null,
  clave_idempotencia  text not null unique check (char_length(clave_idempotencia) <= 256),
  resend_id           text,
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  error               text,
  intentos            smallint not null default 0,
  creado_en           timestamptz not null default now(),
  enviado_en          timestamptz
);
create index if not exists citas_correos_pendientes on public.citas_correos (creado_en) where estado <> 'enviado';

-- ── Google Calendar por asesor ──────────────────────────────────
-- Tokens cifrados en la app (AES-256-GCM, llave fuera de la base).

create table if not exists public.calendarios_google (
  asesor_uid            text primary key references public.usuarios(uid),
  google_email          text not null,
  calendar_id           text not null default 'primary',
  refresh_token_cifrado text not null,
  alcances              text[] not null,
  estado                text not null default 'activo' check (estado in ('activo', 'revocado', 'error')),
  canal_id              text,
  canal_recurso_id      text,
  canal_token_hash      text,
  canal_expira_en       timestamptz,
  sync_token            text,
  conectado_en          timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

create table if not exists public.google_oauth_estados (
  hash                text primary key,
  uid                 text not null,
  verificador_cifrado text not null,
  expira_en           timestamptz not null,
  usado_en            timestamptz
);

-- ── Crear una cita ──────────────────────────────────────────────
-- Inserta la cita y su evento CREATED juntos. La restricción de exclusión
-- decide si el horario cabe (error 23P01 si no). Con la misma clave de
-- idempotencia devuelve la cita que ya existe en vez de crear otra.

create or replace function public.cita_crear(p jsonb)
returns public.citas
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.citas;
  v_margen smallint := coalesce((p->>'margen_min')::smallint, 15);
  v_inicio timestamptz := (p->>'inicio')::timestamptz;
  v_fin timestamptz := (p->>'fin')::timestamptz;
begin
  if p->>'clave_idempotencia' is not null then
    select * into v from public.citas
      where creada_por = p->>'creada_por' and clave_idempotencia = p->>'clave_idempotencia';
    if found then return v; end if;
  end if;

  if v_inicio <= now() then
    raise exception 'fuera_de_tiempo' using errcode = 'P0001';
  end if;

  insert into public.citas (
    propiedad_id, cliente_uid, asesor_uid, inicio, fin, margen_min, ocupa_desde, ocupa_hasta,
    estado, cliente_nombre, cliente_telefono, cliente_email, consentimiento_version,
    propiedad_titulo, lugar, notas_cliente, notas_internas, google_sync,
    clave_idempotencia, creada_por
  ) values (
    p->>'propiedad_id', p->>'cliente_uid', p->>'asesor_uid', v_inicio, v_fin, v_margen,
    v_inicio, v_fin + make_interval(mins => v_margen),
    p->>'estado', p->>'cliente_nombre', p->>'cliente_telefono', p->>'cliente_email',
    p->>'consentimiento_version', p->>'propiedad_titulo', p->>'lugar',
    p->>'notas_cliente', p->>'notas_internas', coalesce(p->>'google_sync', 'no_aplica'),
    p->>'clave_idempotencia', p->>'creada_por'
  ) returning * into v;

  insert into public.citas_eventos (cita_id, tipo, estado_antes, estado_despues, actor_uid, actor_rol, via, datos)
  values (v.id, 'CREATED', null, v.estado, p->>'creada_por', p->>'actor_rol', coalesce(p->>'via', 'panel'),
          jsonb_build_object('inicio', v.inicio, 'fin', v.fin));

  return v;
end;
$$;

-- ── Cambiar de estado ───────────────────────────────────────────
-- Espejo de src/lib/citas/estados.ts (una prueba compara las dos tablas).
--
-- Errores (mensaje de la excepción; la API los traduce):
--   no_encontrada · version · transicion_invalida · no_permitido ·
--   fuera_de_tiempo · motivo_requerido · horario_ocupado
-- Y 23P01 si el horario nuevo choca con otra cita.

create or replace function public.cita_transicionar(
  p_id        uuid,
  p_version   integer,
  p_accion    text,
  p_actor_uid text,
  p_actor_rol text,
  p_via       text,
  p_datos     jsonb default '{}'::jsonb
)
returns public.citas
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.citas;
  v_destino text;
  v_tipo text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_motivo text := nullif(trim(coalesce(p_datos->>'motivo', '')), '');
  v_ahora timestamptz := now();
  v_datos jsonb := '{}'::jsonb;
  v_antes text;
begin
  select * into c from public.citas where id = p_id for update;
  if not found then raise exception 'no_encontrada' using errcode = 'P0001'; end if;
  v_antes := c.estado;

  if c.version <> p_version then raise exception 'version' using errcode = 'P0001'; end if;

  -- El papel tiene que corresponder a la cita (el admin lo comprueba el servidor).
  if (p_actor_rol = 'cliente' and p_actor_uid is distinct from c.cliente_uid)
     or (p_actor_rol = 'asesor' and p_actor_uid is distinct from c.asesor_uid) then
    raise exception 'no_permitido' using errcode = 'P0001';
  end if;

  case p_accion

  when 'confirmar' then
    if c.estado = 'REQUESTED' and p_actor_rol in ('asesor', 'admin') then null;
    elsif c.estado = 'PENDING_CONFIRMATION' and p_actor_rol in ('cliente', 'admin') then null;
    elsif c.estado in ('REQUESTED', 'PENDING_CONFIRMATION') then raise exception 'no_permitido' using errcode = 'P0001';
    else raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if c.inicio <= v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    v_destino := 'CONFIRMED'; v_tipo := 'CONFIRMED';

  when 'proponer' then
    if c.estado not in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED') then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if p_actor_rol not in ('cliente', 'asesor', 'admin') then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    v_inicio := (p_datos->>'inicio')::timestamptz;
    v_fin := (p_datos->>'fin')::timestamptz;
    if v_inicio is null or v_fin is null or v_fin <= v_inicio then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if c.inicio <= v_ahora or v_inicio <= v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    -- El horario propuesto no se aparta todavía, pero tiene que estar libre al proponerlo.
    if exists (
      select 1 from public.citas o
      where o.id <> c.id
        and o.estado in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED')
        and (
          (o.asesor_uid = c.asesor_uid
            and tstzrange(o.ocupa_desde, o.ocupa_hasta, '[)') && tstzrange(v_inicio, v_fin + make_interval(mins => c.margen_min), '[)'))
          or (o.cliente_uid = c.cliente_uid
            and tstzrange(o.inicio, o.fin, '[)') && tstzrange(v_inicio, v_fin, '[)'))
        )
    ) then
      raise exception 'horario_ocupado' using errcode = 'P0001';
    end if;
    update public.citas set
      estado_previo = c.estado, propuesta_inicio = v_inicio, propuesta_fin = v_fin, propuesta_por = p_actor_rol
      where id = c.id;
    v_destino := 'RESCHEDULE_REQUESTED'; v_tipo := 'RESCHEDULE_PROPOSED';
    v_datos := jsonb_build_object('de_inicio', c.inicio, 'de_fin', c.fin, 'a_inicio', v_inicio, 'a_fin', v_fin);

  when 'aceptar_cambio' then
    if c.estado <> 'RESCHEDULE_REQUESTED' then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    -- Acepta la otra parte; el admin puede siempre.
    if not (p_actor_rol = 'admin'
            or (c.propuesta_por = 'cliente' and p_actor_rol = 'asesor')
            or (c.propuesta_por in ('asesor', 'admin') and p_actor_rol = 'cliente')) then
      raise exception 'no_permitido' using errcode = 'P0001';
    end if;
    if c.propuesta_inicio <= v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    v_datos := jsonb_build_object('de_inicio', c.inicio, 'de_fin', c.fin, 'a_inicio', c.propuesta_inicio, 'a_fin', c.propuesta_fin);
    -- Aquí sí se aparta: si otra cita ocupó ese horario, la exclusión lo impide (23P01).
    update public.citas set
      inicio = c.propuesta_inicio, fin = c.propuesta_fin,
      ocupa_desde = c.propuesta_inicio, ocupa_hasta = c.propuesta_fin + make_interval(mins => c.margen_min),
      propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
      where id = c.id;
    v_destino := 'RESCHEDULED'; v_tipo := 'RESCHEDULE_ACCEPTED';

  when 'rechazar_cambio', 'retirar_cambio' then
    if c.estado <> 'RESCHEDULE_REQUESTED' then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    if p_accion = 'rechazar_cambio' and not (p_actor_rol = 'admin'
            or (c.propuesta_por = 'cliente' and p_actor_rol = 'asesor')
            or (c.propuesta_por in ('asesor', 'admin') and p_actor_rol = 'cliente')) then
      raise exception 'no_permitido' using errcode = 'P0001';
    end if;
    if p_accion = 'retirar_cambio' and not (p_actor_rol = 'admin' or c.propuesta_por = p_actor_rol) then
      raise exception 'no_permitido' using errcode = 'P0001';
    end if;
    v_datos := jsonb_build_object('propuesta_inicio', c.propuesta_inicio, 'propuesta_fin', c.propuesta_fin);
    v_destino := c.estado_previo;
    update public.citas set propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
      where id = c.id;
    v_tipo := case p_accion when 'rechazar_cambio' then 'RESCHEDULE_REJECTED' else 'RESCHEDULE_WITHDRAWN' end;

  when 'cancelar' then
    if c.estado not in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED') then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if p_actor_rol not in ('cliente', 'asesor', 'admin') then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    if p_actor_rol in ('asesor', 'admin') and v_motivo is null then
      raise exception 'motivo_requerido' using errcode = 'P0001';
    end if;
    update public.citas set motivo_cancelacion = left(v_motivo, 500),
      propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
      where id = c.id;
    v_destino := 'CANCELLED'; v_tipo := 'CANCELLED';
    v_datos := jsonb_build_object('motivo', v_motivo);

  when 'vencer' then
    if p_actor_rol <> 'sistema' then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    if c.estado in ('REQUESTED', 'PENDING_CONFIRMATION') and c.inicio <= v_ahora then
      update public.citas set motivo_cancelacion = 'Vencida: nadie la confirmó antes de la hora.' where id = c.id;
      v_destino := 'CANCELLED'; v_tipo := 'EXPIRED';
    elsif c.estado = 'RESCHEDULE_REQUESTED' and (c.propuesta_inicio <= v_ahora or c.inicio <= v_ahora) then
      v_datos := jsonb_build_object('propuesta_inicio', c.propuesta_inicio, 'propuesta_fin', c.propuesta_fin);
      if c.estado_previo in ('REQUESTED', 'PENDING_CONFIRMATION') and c.inicio <= v_ahora then
        update public.citas set motivo_cancelacion = 'Vencida: nadie la confirmó antes de la hora.',
          propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
          where id = c.id;
        v_destino := 'CANCELLED';
      else
        -- La propuesta caducó; la cita sigue en el horario que ya tenía.
        v_destino := c.estado_previo;
        update public.citas set propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
          where id = c.id;
      end if;
      v_tipo := 'EXPIRED';
    else
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;

  when 'completar', 'no_asistio' then
    if c.estado not in ('CONFIRMED', 'RESCHEDULED') then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    if p_actor_rol not in ('asesor', 'admin') then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    if c.inicio > v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    v_destino := case p_accion when 'completar' then 'COMPLETED' else 'NO_SHOW' end;
    v_tipo := v_destino;

  when 'corregir' then
    if c.estado not in ('COMPLETED', 'NO_SHOW') then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    if p_actor_rol <> 'admin' then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    v_destino := case c.estado when 'COMPLETED' then 'NO_SHOW' else 'COMPLETED' end;
    v_tipo := 'CORRECTED';

  else
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end case;

  update public.citas set estado = v_destino, version = c.version + 1, actualizada_en = v_ahora
    where id = c.id
    returning * into c;

  insert into public.citas_eventos (cita_id, tipo, estado_antes, estado_despues, actor_uid, actor_rol, via, datos)
  values (c.id, v_tipo, v_antes, c.estado,
          p_actor_uid, p_actor_rol, p_via, v_datos);

  -- Los enlaces de correo de la versión anterior dejan de valer.
  update public.citas_tokens set revocado_en = v_ahora
    where cita_id = c.id and usado_en is null and revocado_en is null;

  return c;
end;
$$;

-- ── Nadie fuera del servidor ────────────────────────────────────

alter table public.disponibilidad_asesores enable row level security;
alter table public.ajustes_citas           enable row level security;
alter table public.bloqueos_asesores       enable row level security;
alter table public.citas                   enable row level security;
alter table public.citas_eventos           enable row level security;
alter table public.citas_tokens            enable row level security;
alter table public.citas_correos           enable row level security;
alter table public.calendarios_google      enable row level security;
alter table public.google_oauth_estados    enable row level security;

revoke all on table
  public.disponibilidad_asesores, public.ajustes_citas, public.bloqueos_asesores,
  public.citas, public.citas_eventos, public.citas_tokens, public.citas_correos,
  public.calendarios_google, public.google_oauth_estados
  from anon, authenticated;

revoke all on function public.cita_crear(jsonb) from public, anon, authenticated;
revoke all on function public.cita_transicionar(uuid, integer, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cita_crear(jsonb) to service_role;
grant execute on function public.cita_transicionar(uuid, integer, text, text, text, text, jsonb) to service_role;
