-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 21 — El rol vive SÓLO en la base (cierre de la fase 2)
-- V-1.1.81
--
-- Hasta V-1.1.80 las variables ADMIN_EMAILS y SUPER_ADMIN_EMAILS daban el rol
-- de administrador por encima de la tabla. El código de V-1.1.81 ya no las
-- lee: el rol es `usuarios.rol` y nada más. Esta migración deja la base lista
-- para eso ANTES del despliegue (el código actual ya entiende todo esto, así
-- que el orden no deja a nadie sin acceso):
--
--  1. Invitaciones que admiten 'super_admin' (sólo lo invita un Super Admin;
--     la regla está en el servidor).
--  2. La base impide quedarse sin Super Admin activo: degradar, suspender o
--     borrar al último falla, aunque dos cambios lleguen a la vez (candado).
--  3. Datos de D-13:
--     · la cuenta que ya existe pasa a 'super_admin' en la tabla;
--     · las otras dos, que aún no tienen cuenta, reciben una invitación de
--       Super Admin. Se aplica cuando entren con ese correo VERIFICADO.
-- ═══════════════════════════════════════════════════════════════

-- 1 · Invitaciones de Super Admin
alter table public.invitaciones drop constraint if exists invitaciones_rol_check;
alter table public.invitaciones
  add constraint invitaciones_rol_check
  check (rol = any (array['cliente', 'publicador', 'admin', 'super_admin']));

-- 3a · La cuenta de D-13 que ya existe (antes era admin por la lista del entorno)
update public.usuarios
   set rol = 'super_admin'
 where lower(email) = 'jemilianoponceperez@gmail.com'
   and rol in ('cliente', 'publicador', 'admin');

-- 2 · Nunca sin Super Admin activo
create or replace function public.proteger_ultimo_super_admin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.rol = 'super_admin' and old.estado = 'activo'
     and (tg_op = 'DELETE' or new.rol is distinct from 'super_admin' or new.estado is distinct from 'activo') then
    -- Dos cambios simultáneos sobre Super Admins distintos se ordenan aquí:
    -- el segundo ve lo que hizo el primero.
    perform pg_advisory_xact_lock(hashtext('vivebien.ultimo_super_admin'));
    if not exists (
      select 1 from public.usuarios u
       where u.rol = 'super_admin' and u.estado = 'activo' and u.uid <> old.uid
    ) then
      raise exception 'ultimo_super_admin: no se puede dejar el sistema sin Super Admin activo'
        using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke execute on function public.proteger_ultimo_super_admin() from public, anon, authenticated;

drop trigger if exists usuarios_ultimo_super_admin on public.usuarios;
create trigger usuarios_ultimo_super_admin
  before update of rol, estado or delete on public.usuarios
  for each row execute function public.proteger_ultimo_super_admin();

-- 3b · Invitaciones de Super Admin para quien aún no tiene cuenta (D-13)
insert into public.invitaciones (email, rol, estado, invitado_por)
select e, 'super_admin', 'pendiente', 'D-13 · migración 21'
  from unnest(array['joseponcep@gp-once.com', 'joseponcer@vivebienn.com']) as e
 where not exists (select 1 from public.usuarios u where lower(u.email) = e)
   and not exists (select 1 from public.invitaciones i where lower(i.email) = e and i.estado = 'pendiente');
