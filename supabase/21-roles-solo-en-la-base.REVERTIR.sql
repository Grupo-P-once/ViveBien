-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 21 — REVERTIR
--
-- Estado anterior, capturado en producción el 19-sep-2026:
--   · invitaciones_rol_check: ['cliente','publicador','admin']
--   · usuarios: la cuenta jemilianoponceperez@gmail.com tenía rol 'admin'
--   · sin trigger usuarios_ultimo_super_admin; sin invitaciones pendientes
--
-- OJO: revertir esto sólo tiene sentido junto con volver a V-1.1.80 (que
-- vuelve a leer ADMIN_EMAILS / SUPER_ADMIN_EMAILS). Con V-1.1.81 desplegada,
-- quitar el super_admin de la tabla deja al sistema sin Super Admin.
-- ═══════════════════════════════════════════════════════════════

drop trigger if exists usuarios_ultimo_super_admin on public.usuarios;
drop function if exists public.proteger_ultimo_super_admin();

delete from public.invitaciones
 where invitado_por = 'D-13 · migración 21' and estado = 'pendiente';

update public.usuarios set rol = 'admin'
 where lower(email) = 'jemilianoponceperez@gmail.com' and rol = 'super_admin';

alter table public.invitaciones drop constraint if exists invitaciones_rol_check;
alter table public.invitaciones
  add constraint invitaciones_rol_check
  check (rol = any (array['cliente', 'publicador', 'admin']));
