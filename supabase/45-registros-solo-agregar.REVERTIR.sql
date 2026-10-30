-- Reversa de 45-registros-solo-agregar.sql: quita los disparadores de TRUNCATE y devuelve a service_role los permisos que Supabase concede por defecto.

begin;

drop trigger if exists legal_aceptaciones_sin_vaciar on public.legal_aceptaciones;
drop trigger if exists comision_aceptaciones_sin_vaciar on public.comision_aceptaciones;
drop trigger if exists comision_operaciones_sin_vaciar on public.comision_operaciones;
drop trigger if exists comision_textos_sin_vaciar on public.comision_textos;
drop function if exists public.registro_sin_vaciar();

grant all on public.legal_aceptaciones, public.comision_aceptaciones, public.comision_operaciones, public.comision_textos to service_role;

commit;
