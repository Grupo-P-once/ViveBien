-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · Fase 5 — cuenta del cliente y métricas reales
-- Ejecutar en: Supabase → SQL Editor → Run
--
-- Los favoritos vivían en localStorage: se perdían al cambiar de
-- dispositivo o limpiar el navegador. Y el dashboard mostraba una
-- gráfica con datos inventados (45/25/20/10).
-- ═══════════════════════════════════════════════════════════════


-- ── Favoritos ──────────────────────────────────────────────────
create table if not exists public.favoritos (
  uid          text not null,
  propiedad_id text not null,
  creado_en    timestamptz not null default now(),
  primary key (uid, propiedad_id)
);

create index if not exists favoritos_uid_idx
  on public.favoritos (uid, creado_en desc);

alter table public.favoritos enable row level security;


-- ── Búsquedas guardadas e intereses ────────────────────────────
create table if not exists public.busquedas_guardadas (
  id         bigint generated always as identity primary key,
  uid        text not null,
  nombre     text,
  filtros    jsonb not null,
  alertas    boolean not null default false,
  creado_en  timestamptz not null default now()
);

create index if not exists busquedas_uid_idx
  on public.busquedas_guardadas (uid, creado_en desc);

alter table public.busquedas_guardadas enable row level security;


-- ── Eventos de producto ────────────────────────────────────────
-- Sustituye a la colección `busquedas` de Firestore. Un solo sitio para
-- todo lo que hay que medir, en vez de una tabla por métrica.
create table if not exists public.eventos (
  id           bigint generated always as identity primary key,
  nombre       text not null,
  uid          text,
  sesion       text,
  propiedad_id text,
  datos        jsonb,
  creado_en    timestamptz not null default now()
);

create index if not exists eventos_nombre_idx
  on public.eventos (nombre, creado_en desc);

create index if not exists eventos_propiedad_idx
  on public.eventos (propiedad_id, creado_en desc);

-- Deduplicar vistas: una por sesión y propiedad.
create unique index if not exists eventos_vista_unica_idx
  on public.eventos (nombre, sesion, propiedad_id)
  where nombre = 'property_view' and sesion is not null;

alter table public.eventos enable row level security;


-- ── Contadores en la propiedad ─────────────────────────────────
-- Se actualizan desde el servidor. Si el navegador pudiera incrementarlos,
-- cualquiera inflaría las vistas de su anuncio.
alter table public.propiedades
  add column if not exists vistas       integer not null default 0,
  add column if not exists favoritos_n  integer not null default 0,
  add column if not exists contactos_n  integer not null default 0;


-- ── Incremento atómico de vistas ───────────────────────────────
-- Como función para evitar la condición de carrera de leer-sumar-escribir
-- con varias peticiones a la vez.
create or replace function public.sumar_vista(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.propiedades set vistas = vistas + 1 where id = p_id;
$$;

revoke all on function public.sumar_vista(text) from public, anon, authenticated;


-- ── Comprobación ───────────────────────────────────────────────
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- Todas deben salir con rls_activo = true.
-- Sólo propiedades debe tener políticas (lectura pública de lo aprobado);
-- leads y contactos, la de inserción. El resto, cero.
