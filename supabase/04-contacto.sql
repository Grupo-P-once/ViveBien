-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · Fase 3 — solicitudes de contacto trazables
-- Ejecutar en: Supabase → SQL Editor → Run
--
-- Compartir el teléfono de un cliente con un publicador es una
-- transferencia de datos personales. La LFPDPPP pide poder demostrar
-- que hubo consentimiento, cuándo y para qué. Por eso la solicitud
-- guarda a quién, sobre qué propiedad, a qué anunciante y con qué
-- versión del aviso.
--
-- La tabla `leads` se conserva: es el histórico previo a esta fase.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.solicitudes_contacto (
  id                bigint generated always as identity primary key,

  -- Las tres partes de la transferencia
  cliente_uid       text not null,
  propiedad_id      text not null,
  owner_id          text,

  -- Copia de los datos en el momento del contacto. Si el cliente cambia
  -- su perfil después, la solicitud sigue reflejando lo que se compartió.
  nombre            text not null,
  telefono          text not null,
  email             text not null,
  mensaje           text,
  propiedad_titulo  text,

  tipo              text not null default 'informacion'
                    check (tipo in ('informacion', 'visita')),
  visita_preferida  timestamptz,

  -- Prueba del consentimiento
  consentimiento_en      timestamptz not null default now(),
  consentimiento_version text not null,

  -- Estado de la notificación al publicador
  whatsapp_estado   text not null default 'pendiente'
                    check (whatsapp_estado in (
                      'pendiente', 'enviado', 'entregado', 'fallido', 'sin_numero'
                    )),
  whatsapp_id       text,
  whatsapp_error    text,

  origen            text not null default 'web',
  creado_en         timestamptz not null default now()
);

create index if not exists solicitudes_cliente_idx
  on public.solicitudes_contacto (cliente_uid, creado_en desc);

create index if not exists solicitudes_owner_idx
  on public.solicitudes_contacto (owner_id, creado_en desc);

create index if not exists solicitudes_propiedad_idx
  on public.solicitudes_contacto (propiedad_id, creado_en desc);

-- Para deduplicar: mismo cliente, misma propiedad, ventana corta.
create index if not exists solicitudes_dedupe_idx
  on public.solicitudes_contacto (cliente_uid, propiedad_id, creado_en desc);

-- Cerrada al rol público: RLS activo y sin políticas. Todo pasa por API
-- Routes con service role, que ya validan la sesión.
alter table public.solicitudes_contacto enable row level security;


-- ── Teléfono del publicador ────────────────────────────────────
-- Se guarda en `usuarios`, no en la propiedad: así no viaja al catálogo
-- público. La ficha lo pide explícitamente — el anunciante no tiene por
-- qué exponer su número.
-- (La columna `telefono` ya existe desde 02-usuarios.sql.)


-- ── Comprobación ───────────────────────────────────────────────
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- solicitudes_contacto debe salir con rls_activo = true y 0 políticas.
