-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 19 — Configuración central y feature flags (ADR-0012)
-- Fase 1 del PRD v2.0 · V-1.1.77
--
-- ADITIVA: crea una tabla nueva y una fila. No toca ninguna tabla existente.
--
-- `configuracion` guarda por clave un JSON (validado en el servidor):
--   · `flags` — módulos grandes que se encienden y apagan sin desplegar.
--     Nacen TODOS apagados: encender uno es una decisión, no un efecto
--     secundario de un despliegue.
--   · `negocio` / `analitica` — llegarán cuando el Super Admin pueda
--     editarlos (fase 13). Mientras, los valores viven en
--     `src/lib/config/negocio.ts`, que además es el respaldo si la base no
--     responde.
--
-- Sólo el servidor la lee y la escribe (clave de servicio). Para el navegador:
-- RLS sin políticas y sin privilegios.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.configuracion (
  clave           text primary key check (clave ~ '^[a-z][a-z_]*$'),
  valor           jsonb not null check (jsonb_typeof(valor) = 'object'),
  version         integer not null default 1,
  actualizado_por text,
  actualizado_en  timestamptz not null default now()
);

alter table public.configuracion enable row level security;
revoke all on table public.configuracion from anon, authenticated;

insert into public.configuracion (clave, valor, actualizado_por)
values (
  'flags',
  '{"portalCliente": false, "publisherPortal": false, "commissionEngine": false, "legalAcceptance": false, "superAdmin": false, "marketingHub": false, "metaPublishing": false, "aiContent": false}'::jsonb,
  'migracion-19'
)
on conflict (clave) do nothing;
