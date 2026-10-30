-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 20 — `usuarios.rol` admite 'super_admin' (fase 2, D-13, ADR-0004)
-- V-1.1.79
--
-- SÓLO AMPLÍA: la lista de valores válidos pasa de 3 a 4. Ninguna fila cambia
-- y todas las actuales siguen siendo válidas.
--
-- Los tres Super Admin de D-13 lo son por `SUPER_ADMIN_EMAILS` (con correo
-- verificado), así que no dependen de esta columna. Esto permite que, más
-- adelante, un Super Admin pueda nombrar a otro desde el panel.
--
-- Las invitaciones NO admiten 'super_admin' (su CHECK no se toca): a nadie
-- se le hace Super Admin por correo.
-- ═══════════════════════════════════════════════════════════════

alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol = any (array['cliente', 'publicador', 'admin', 'super_admin']));
