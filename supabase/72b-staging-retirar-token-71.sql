-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 72b — SOLO STAGING: deja inofensiva la función de la 71 (5-nov-2026)
--
-- Staging recibió la 71 (token reutilizable) antes de que se descubriera que pg_net lo deja legible en su cola. La 72 la reemplaza.
-- No se hace `drop function` porque la herramienta de migraciones exige una confirmación humana para cualquier DROP: se deja la
-- función siempre en «falso» y sin permiso para nadie. En un entorno nuevo NO se aplica la 71 ni esta 72b: solo la 72.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.citas_tarea_token_valido(p_token text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select false $$;
revoke all on function public.citas_tarea_token_valido(text) from public, anon, authenticated, service_role;
