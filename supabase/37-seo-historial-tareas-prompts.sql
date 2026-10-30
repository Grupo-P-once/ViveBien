-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 37 — Apartado SEO del superadmin, Fase C: historial, tareas y registro de prompts de IA
-- Reversa: 37-seo-historial-tareas-prompts.REVERTIR.sql
--
-- Tres tablas NUEVAS, sin tocar ninguna existente. Solo las usa el servidor (service_role) detrás de `exigir(req, 'seo.ver')`
-- (solo Super Admin). RLS activada y SIN políticas, y sin permisos para anon ni authenticated: el navegador nunca las lee ni las escribe.
-- Idempotente (create … if not exists): se puede volver a correr.
--
--  · seo_historial   — una «foto» de las cifras de Search Console por fecha (la calcula el SERVIDOR, no el navegador).
--  · seo_tareas      — la lista «Qué hacer»: tareas con evidencia, prioridad y estado.
--  · seo_prompts_ia  — registro manual de preguntas de compradores hechas a un asistente de IA y si VIVE BIEN aparece citada.
--                      No hay scraping ni «puntajes de visibilidad»: solo lo que una persona observó, con fecha.
-- ═══════════════════════════════════════════════════════════

begin;

create table if not exists public.seo_historial (
  id           uuid primary key default gen_random_uuid(),
  tomado_en    timestamptz not null default now(),
  periodo_dias integer     not null check (periodo_dias in (7, 28, 90)),
  rango_desde  date        not null,
  rango_hasta  date        not null,
  clics        integer     not null check (clics >= 0),
  impresiones  integer     not null check (impresiones >= 0),
  ctr          numeric(7,3) not null check (ctr >= 0),
  posicion     numeric(7,2) not null check (posicion >= 0),
  top_consultas jsonb      not null default '[]'::jsonb,
  top_paginas   jsonb      not null default '[]'::jsonb,
  creado_por   text        not null check (char_length(creado_por) between 3 and 200),
  check (rango_hasta >= rango_desde)
);
create index if not exists seo_historial_tomado_en_idx on public.seo_historial (tomado_en desc);

create table if not exists public.seo_tareas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text        not null check (char_length(titulo) between 3 and 200),
  detalle      text        check (detalle is null or char_length(detalle) <= 1000),
  area         text        not null default 'tecnico' check (area in ('tecnico','contenido','local','indexacion','ia','otro')),
  prioridad    text        not null default 'media'   check (prioridad in ('alta','media','baja')),
  estado       text        not null default 'pendiente' check (estado in ('pendiente','en_curso','hecha','descartada')),
  evidencia    text        check (evidencia is null or char_length(evidencia) <= 500),
  creada_por   text        not null check (char_length(creada_por) between 3 and 200),
  creada_en    timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  resuelta_en  timestamptz
);
create index if not exists seo_tareas_estado_idx on public.seo_tareas (estado, prioridad);

create table if not exists public.seo_prompts_ia (
  id           uuid primary key default gen_random_uuid(),
  prompt       text        not null check (char_length(prompt) between 5 and 300),
  motor        text        not null check (motor in ('chatgpt','gemini','perplexity','copilot','claude','otro')),
  aparece      boolean     not null,
  cita_url     text        check (cita_url is null or (char_length(cita_url) <= 300 and cita_url ~ '^https://')),
  nota         text        check (nota is null or char_length(nota) <= 500),
  observado_en date        not null default current_date,
  creado_por   text        not null check (char_length(creado_por) between 3 and 200),
  creado_en    timestamptz not null default now()
);
create index if not exists seo_prompts_ia_observado_idx on public.seo_prompts_ia (observado_en desc);

-- Solo el servidor las toca. Sin políticas = ni anon ni authenticated ven nada aunque alguien les diera permisos por error.
alter table public.seo_historial  enable row level security;
alter table public.seo_tareas     enable row level security;
alter table public.seo_prompts_ia enable row level security;

revoke all on public.seo_historial, public.seo_tareas, public.seo_prompts_ia from anon, authenticated;
grant select, insert, update, delete on public.seo_historial, public.seo_tareas, public.seo_prompts_ia to service_role;

commit;
