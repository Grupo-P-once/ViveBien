-- ═══════════════════════════════════════════════════════════════
-- Esquema de las 17 tablas que toca la baja de cuenta.
--
-- Copiado del CATÁLOGO de producción (tipos, nulabilidad, valores por defecto,
-- claves, CHECK e índices), **sin un solo dato real**. Refleja el estado
-- POSTERIOR a la migración 25, que es el que hay hoy en producción.
--
-- El guion de pruebas lo usa así:
--   esquema.sql  →  REVERTIR 25  →  aplicar 25  →  aplicar 26  →  pruebas
-- de modo que se ejercitan la 25, su reverso y la 26 con el esquema de verdad.
--
-- Los roles de Supabase se crean porque las migraciones les revocan permisos.
-- ═══════════════════════════════════════════════════════════════

-- `pgcrypto` está instalada en producción, pero NO hace falta para esto:
-- `gen_random_uuid()` es del núcleo desde PostgreSQL 13. PGlite no la trae, así
-- que se intenta y se sigue si no está. (Diferencia Docker/PGlite documentada.)
do $$ begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'pgcrypto no disponible; gen_random_uuid() del núcleo basta';
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

-- ── usuarios ─────────────────────────────────────────────────────────────
create table public.usuarios (
  uid                      text primary key,
  email                    text,
  nombre                   text,
  telefono                 text,
  rol                      text not null default 'cliente'
                           constraint usuarios_rol_check check (rol in ('cliente','publicador','admin','super_admin')),
  estado                   text not null default 'activo'
                           constraint usuarios_estado_check check (estado in ('activo','suspendido','pendiente','eliminada')),
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  whatsapp                 text,
  foto_url                 text,
  inmobiliaria             text,
  zonas                    text[],
  biografia                text,
  busca_operacion          text constraint usuarios_busca_operacion_check
                           check (busca_operacion is null or busca_operacion in ('venta','renta','ambas')),
  presupuesto_max          numeric,
  bienvenida_vista         boolean not null default false,
  completitud              smallint not null default 0,
  ultimo_acceso            timestamptz,
  notificaciones_vistas_en timestamptz,
  busca_zonas              text[],
  busca_tipos              text[],
  constraint usuarios_email_solo_falta_si_eliminada check (email is not null or estado = 'eliminada')
);
create unique index usuarios_email_idx on public.usuarios (lower(email));
create index usuarios_rol_idx on public.usuarios (rol);

-- ── propiedades ──────────────────────────────────────────────────────────
create table public.propiedades (
  id text primary key, titulo text, tipo text, operacion text, precio numeric,
  moneda text default 'MXN', ubicacion text, metros numeric, recamaras integer,
  banos numeric, altura_libre numeric, andenes integer,
  estatus text default 'disponible', descripcion text, whatsapp text, telefono text,
  mantenimiento numeric, fotos text[], amenidades text[], created_at timestamptz default now(),
  owner_id text references public.usuarios(uid),
  estado_pub text not null default 'publicada'
    constraint propiedades_estado_pub_check
    check (estado_pub in ('borrador','en_revision','cambios_solicitados','rechazada','publicada')),
  completitud smallint not null default 0,
  revisado_por text, revisado_en timestamptz, nota_moderacion text,
  publicada_en timestamptz, enviada_en timestamptz,
  vistas integer not null default 0, favoritos_n integer not null default 0, contactos_n integer not null default 0,
  calle text, colonia text, ciudad text, estado_dir text, cp text, lat numeric, lng numeric,
  precision_ubicacion text not null default 'exacta'
    constraint propiedades_precision_ubicacion_check check (precision_ubicacion in ('exacta','aproximada')),
  subtipo text, videos text[] default '{}', planos text[] default '{}', extras jsonb default '{}',
  slug text, folio text not null, precio_incluye_iva boolean not null default false,
  gestion text constraint propiedades_gestion_check check (gestion is null or gestion = 'requiere_gestion')
);
create index propiedades_owner_idx on public.propiedades (owner_id);
create index propiedades_estado_pub_idx on public.propiedades (estado_pub);
create unique index propiedades_slug_unico on public.propiedades (slug) where slug is not null;
create unique index propiedades_folio_unico on public.propiedades (folio);
create index propiedades_gestion_idx on public.propiedades (gestion) where gestion is not null;

-- ── invitaciones ─────────────────────────────────────────────────────────
create table public.invitaciones (
  id bigint generated always as identity primary key,
  email text not null, nombre text,
  rol text not null constraint invitaciones_rol_check check (rol in ('cliente','publicador','admin','super_admin')),
  estado text not null default 'pendiente'
    constraint invitaciones_estado_check check (estado in ('pendiente','aceptada','cancelada','revocada_por_baja')),
  invitado_por text not null, creado_en timestamptz not null default now(),
  enviado_en timestamptz, aceptada_en timestamptz, aceptada_por text
);
create unique index invitaciones_email_pendiente on public.invitaciones (lower(email)) where estado = 'pendiente';

-- ── citas ────────────────────────────────────────────────────────────────
create table public.citas (
  id uuid primary key default gen_random_uuid(),
  propiedad_id text references public.propiedades(id) on delete set null,
  cliente_uid text not null references public.usuarios(uid),
  asesor_uid  text not null references public.usuarios(uid),
  inicio timestamptz not null, fin timestamptz not null,
  margen_min smallint not null default 15 check (margen_min between 0 and 120),
  ocupa_desde timestamptz not null, ocupa_hasta timestamptz not null,
  zona_horaria text not null default 'America/Mexico_City',
  estado text not null check (estado in ('REQUESTED','PENDING_CONFIRMATION','CONFIRMED','RESCHEDULE_REQUESTED','RESCHEDULED','CANCELLED','COMPLETED','NO_SHOW')),
  estado_previo text check (estado_previo in ('REQUESTED','PENDING_CONFIRMATION','CONFIRMED','RESCHEDULED')),
  version integer not null default 1,
  propuesta_inicio timestamptz, propuesta_fin timestamptz,
  propuesta_por text check (propuesta_por in ('cliente','asesor','admin')),
  cliente_nombre text not null check (char_length(cliente_nombre) between 2 and 120),
  cliente_telefono text not null, cliente_email text,
  consentimiento_version text not null, consentimiento_en timestamptz not null default now(),
  propiedad_titulo text, lugar text,
  notas_cliente text check (char_length(notas_cliente) <= 500),
  notas_internas text check (char_length(notas_internas) <= 2000),
  motivo_cancelacion text check (char_length(motivo_cancelacion) <= 500),
  google_event_id text,
  google_sync text not null default 'no_aplica' check (google_sync in ('no_aplica','pendiente','ok','error','desincronizada')),
  google_error text, google_intentos smallint not null default 0,
  clave_idempotencia text check (char_length(clave_idempotencia) between 8 and 100),
  creada_por text, creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  bloqueado_en timestamptz,
  check (fin > inicio),
  check (ocupa_desde <= inicio and ocupa_hasta >= fin),
  check ((propuesta_inicio is null) = (propuesta_fin is null)),
  check (propuesta_fin is null or propuesta_fin > propuesta_inicio),
  unique (creada_por, clave_idempotencia)
);
create index citas_cliente_inicio on public.citas (cliente_uid, inicio);
create index citas_asesor_inicio on public.citas (asesor_uid, inicio);

-- ── solicitudes_contacto ─────────────────────────────────────────────────
create table public.solicitudes_contacto (
  id bigint generated always as identity primary key,
  cliente_uid text not null, propiedad_id text not null, owner_id text,
  nombre text not null, telefono text not null, email text not null, mensaje text,
  propiedad_titulo text,
  tipo text not null default 'informacion' check (tipo in ('informacion','visita')),
  visita_preferida timestamptz,
  consentimiento_en timestamptz not null default now(),
  consentimiento_version text not null,
  whatsapp_estado text not null default 'pendiente'
    check (whatsapp_estado in ('pendiente','enviado','entregado','fallido','sin_numero')),
  whatsapp_id text, whatsapp_error text,
  origen text not null default 'web', creado_en timestamptz not null default now(),
  bloqueado_en timestamptz
);
create index solicitudes_cliente_idx on public.solicitudes_contacto (cliente_uid, creado_en desc);

-- ── preferencias y agenda ────────────────────────────────────────────────
create table public.favoritos (
  uid text not null, propiedad_id text not null, creado_en timestamptz not null default now(),
  primary key (uid, propiedad_id)
);
create table public.busquedas_guardadas (
  id bigint generated always as identity primary key,
  uid text not null, nombre text, filtros jsonb not null,
  alertas boolean not null default false, creado_en timestamptz not null default now(),
  revisadas_en timestamptz
);
create table public.google_oauth_estados (
  hash text primary key, uid text not null, verificador_cifrado text not null,
  expira_en timestamptz not null, usado_en timestamptz
);
create table public.calendarios_google (
  asesor_uid text primary key references public.usuarios(uid),
  google_email text not null, calendar_id text not null default 'primary',
  refresh_token_cifrado text not null, alcances text[] not null,
  estado text not null default 'activo' check (estado in ('activo','revocado','error')),
  canal_id text, canal_recurso_id text, canal_token_hash text, canal_expira_en timestamptz,
  sync_token text, conectado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create table public.disponibilidad_asesores (
  id bigint generated always as identity primary key,
  asesor_uid text not null references public.usuarios(uid),
  dia_semana smallint not null check (dia_semana between 0 and 6),
  desde time not null, hasta time not null,
  check (hasta > desde), unique (asesor_uid, dia_semana, desde)
);
create table public.bloqueos_asesores (
  id bigint generated always as identity primary key,
  asesor_uid text not null references public.usuarios(uid),
  desde timestamptz not null, hasta timestamptz not null,
  motivo text check (char_length(motivo) <= 200),
  creado_en timestamptz not null default now(), check (hasta > desde)
);
create table public.ajustes_citas (
  asesor_uid text primary key references public.usuarios(uid),
  duracion_min smallint not null default 60 check (duracion_min between 15 and 240),
  margen_min smallint not null default 15 check (margen_min between 0 and 120),
  anticipacion_horas smallint not null default 2 check (anticipacion_horas between 0 and 168),
  ventana_dias smallint not null default 30 check (ventana_dias between 1 and 180),
  confirmacion text not null default 'manual' check (confirmacion in ('manual','automatica')),
  actualizado_en timestamptz not null default now()
);

-- ── bitácoras y analítica ────────────────────────────────────────────────
create table public.eventos (
  id bigint generated always as identity primary key,
  nombre text not null, uid text, sesion text, propiedad_id text, datos jsonb,
  creado_en timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_uid text not null, actor_email text, actor_rol text,
  accion text not null, entidad text not null, entidad_id text,
  antes jsonb, despues jsonb, creado_en timestamptz not null default now()
);
create table public.citas_eventos (
  id bigint generated always as identity primary key,
  cita_id uuid not null references public.citas(id),
  tipo text not null, estado_antes text, estado_despues text,
  actor_uid text,
  actor_rol text not null check (actor_rol in ('cliente','asesor','admin','sistema')),
  via text not null check (via in ('panel','correo','sistema','google')),
  datos jsonb not null default '{}', creado_en timestamptz not null default now()
);
create table public.configuracion (
  clave text primary key check (clave ~ '^[a-z][a-z_]*$'),
  valor jsonb not null check (jsonb_typeof(valor) = 'object'),
  version integer not null default 1,
  actualizado_por text, actualizado_en timestamptz not null default now()
);

-- ── el registro del proceso (migración 25) ───────────────────────────────
create table public.bajas_de_cuenta (
  uid text primary key references public.usuarios(uid),
  estado text not null default 'solicitada'
    constraint bajas_de_cuenta_estado_check
    check (estado in ('solicitada','bloqueada','firebase_eliminada','datos_procesados','completada','error')),
  solicitada_por text not null
    constraint bajas_de_cuenta_solicitada_por_check check (solicitada_por in ('titular','admin')),
  auth_time timestamptz not null, motivo text,
  solicitada_en timestamptz not null default now(),
  bloqueada_en timestamptz, firebase_eliminada_en timestamptz,
  procesada_en timestamptz, completada_en timestamptz,
  bloqueo_revisar_en date,
  intentos smallint not null default 0, ultimo_intento_en timestamptz, ultimo_error text
);
create index bajas_de_cuenta_pendientes_idx on public.bajas_de_cuenta (estado) where estado <> 'completada';

-- ── las vistas de la migración 25 ────────────────────────────────────────
create or replace view public.citas_operativas with (security_invoker = true) as
select c.id, c.propiedad_id, c.cliente_uid, c.asesor_uid, c.inicio, c.fin, c.margen_min,
  c.ocupa_desde, c.ocupa_hasta, c.zona_horaria, c.estado, c.estado_previo, c.version,
  c.propuesta_inicio, c.propuesta_fin, c.propuesta_por,
  case when c.bloqueado_en is null then c.cliente_nombre   end as cliente_nombre,
  case when c.bloqueado_en is null then c.cliente_telefono end as cliente_telefono,
  case when c.bloqueado_en is null then c.cliente_email    end as cliente_email,
  case when c.bloqueado_en is null then c.notas_cliente    end as notas_cliente,
  c.consentimiento_version, c.consentimiento_en, c.propiedad_titulo, c.lugar, c.notas_internas,
  c.motivo_cancelacion, c.google_event_id, c.google_sync, c.google_error, c.google_intentos,
  c.clave_idempotencia, c.creada_por, c.creada_en, c.actualizada_en, c.bloqueado_en
from public.citas c;

create or replace view public.solicitudes_contacto_operativas with (security_invoker = true) as
select s.id, s.cliente_uid, s.propiedad_id, s.owner_id,
  case when s.bloqueado_en is null then s.nombre   end as nombre,
  case when s.bloqueado_en is null then s.telefono end as telefono,
  case when s.bloqueado_en is null then s.email    end as email,
  case when s.bloqueado_en is null then s.mensaje  end as mensaje,
  s.propiedad_titulo, s.tipo, s.visita_preferida, s.consentimiento_en, s.consentimiento_version,
  s.whatsapp_estado, s.whatsapp_id, s.whatsapp_error, s.origen, s.creado_en, s.bloqueado_en
from public.solicitudes_contacto s;
