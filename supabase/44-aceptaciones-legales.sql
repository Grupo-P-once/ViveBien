-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 44 — Aceptación de los Términos y Condiciones y del Aviso de Privacidad
-- Reversa: 44-aceptaciones-legales.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Aplicar solo con autorización del propietario.
-- No hace nada visible por sí sola: el código solo la usa con el módulo `legalAcceptance` encendido.
--
-- Una tabla NUEVA, solo del servidor (RLS activada, SIN políticas, sin permisos para anon ni authenticated):
--  · legal_aceptaciones — quién aceptó qué documento ('terminos' | 'privacidad'), en qué versión (la fecha de «Última actualización» de la
--                         página) y cuándo. Solo se AGREGA: no se edita ni se borra. Una persona acepta cada versión de cada documento una vez.
-- No guarda IP: solo el navegador (recortado), como la aceptación de comisión.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.legal_aceptaciones (
  id           uuid primary key default gen_random_uuid(),
  uid          text not null check (char_length(uid) between 3 and 200),
  documento    text not null check (documento in ('terminos', 'privacidad')),
  version      text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  aceptado_en  timestamptz not null default now(),
  agente       text check (agente is null or char_length(agente) <= 300),
  unique (uid, documento, version)
);

create index if not exists legal_aceptaciones_uid_idx on public.legal_aceptaciones (uid);

create or replace function public.legal_aceptaciones_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  raise exception 'Una aceptación legal no se edita ni se borra.' using errcode = '23514';
end $f$;

create or replace trigger legal_aceptaciones_guardia before update or delete on public.legal_aceptaciones
  for each row execute function public.legal_aceptaciones_guardia();

alter table public.legal_aceptaciones enable row level security;
revoke all on public.legal_aceptaciones from public, anon, authenticated;
grant select, insert on public.legal_aceptaciones to service_role;

commit;
