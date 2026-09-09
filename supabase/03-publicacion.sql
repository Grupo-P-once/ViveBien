-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · Fase 2 — publicación moderada
-- Ejecutar en: Supabase → SQL Editor → Run
-- Requisitos previos: rls-fix.sql y 02-usuarios.sql
--
-- Se añade `estado_pub` en vez de reutilizar `estatus`. Son dos cosas
-- distintas y mezclarlas obliga a tocar medio panel:
--
--   estatus     → estado comercial: disponible, pausada, vendida, eliminada
--   estado_pub  → estado de moderación: ¿está aprobada para mostrarse?
--
-- Una propiedad es pública cuando estado_pub = 'publicada'
-- Y ADEMÁS estatus = 'disponible'.
-- ═══════════════════════════════════════════════════════════════


-- ── Estado de publicación ──────────────────────────────────────
-- Las filas que ya existen quedan en 'publicada': las creó la casa y
-- llevan tiempo visibles. Marcarlas como borrador las escondería.

alter table public.propiedades
  add column if not exists estado_pub text not null default 'publicada';

alter table public.propiedades
  drop constraint if exists propiedades_estado_pub_check;

alter table public.propiedades
  add constraint propiedades_estado_pub_check
  check (estado_pub in (
    'borrador',
    'en_revision',
    'cambios_solicitados',
    'rechazada',
    'publicada'
  ));

create index if not exists propiedades_estado_pub_idx
  on public.propiedades (estado_pub);

-- Campos de moderación y calidad del anuncio
alter table public.propiedades
  add column if not exists completitud     smallint not null default 0,
  add column if not exists revisado_por    text,
  add column if not exists revisado_en     timestamptz,
  add column if not exists nota_moderacion text,
  add column if not exists publicada_en    timestamptz,
  add column if not exists enviada_en      timestamptz;


-- ── Bitácora de auditoría ──────────────────────────────────────
-- Toda decisión administrativa sensible deja rastro.

create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_uid    text not null,
  actor_email  text,
  actor_rol    text,
  accion       text not null,
  entidad      text not null,
  entidad_id   text,
  antes        jsonb,
  despues      jsonb,
  creado_en    timestamptz not null default now()
);

create index if not exists audit_logs_entidad_idx
  on public.audit_logs (entidad, entidad_id, creado_en desc);

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_uid, creado_en desc);

-- Cerrada al rol público: RLS activo y sin políticas.
alter table public.audit_logs enable row level security;


-- ── Catálogo público: sólo lo aprobado ─────────────────────────
-- Sustituye la política provisional de rls-fix.sql, que dejaba leer
-- todo mientras el filtrado lo hacía el frontend.

drop policy if exists "propiedades_lectura_publica" on public.propiedades;
create policy "propiedades_lectura_publica"
  on public.propiedades for select
  to anon, authenticated
  using (estado_pub = 'publicada');

-- El panel sigue viendo todo: lee con service role, que ignora RLS.


-- ── Comprobación ───────────────────────────────────────────────
select estado_pub, estatus, count(*)
from public.propiedades
group by estado_pub, estatus
order by estado_pub, estatus;

-- Las propiedades que ya existían deben salir como
-- estado_pub = 'publicada'. Si alguna sale en otro estado,
-- dejaría de verse en el sitio.
