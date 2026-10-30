-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 20 — REVERTIR
--
-- Estado anterior, capturado en producción el 19-sep-2026:
--   usuarios_rol_check: CHECK (rol = ANY (ARRAY['cliente','publicador','admin']))
--
-- Sólo funciona si ninguna fila tiene rol = 'super_admin'. Si alguna lo tiene,
-- primero pasarla a 'admin' (queda admin por su lista del entorno, si está).
-- ═══════════════════════════════════════════════════════════════

alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol = any (array['cliente', 'publicador', 'admin']));
