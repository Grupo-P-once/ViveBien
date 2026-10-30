-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 45 — Registros «solo se agrega»: que tampoco se puedan vaciar (TRUNCATE) ni se les conserven permisos de más
-- Reversa: 45-registros-solo-agregar.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Aplicar solo con autorización del propietario.
--
-- Hallazgo del 25-oct-2026 al verificar la 44 en producción: Supabase concede por defecto a `service_role` todos los permisos de una tabla nueva
-- (UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) y un `grant select, insert` no los quita. Los disparadores de fila impiden editar y borrar,
-- pero `TRUNCATE` no pasa por un disparador de fila: se podían vaciar los registros de aceptación y de operaciones.
--
-- Esta migración:
--  · agrega un disparador de TRUNCATE (por sentencia) a las tablas que son evidencia: legal_aceptaciones, comision_aceptaciones,
--    comision_operaciones y comision_textos;
--  · quita a `service_role` los permisos que la aplicación nunca usa en ellas: en legal_aceptaciones y comision_aceptaciones solo quedan
--    SELECT e INSERT; en comision_operaciones y comision_textos se quita DELETE/TRUNCATE (el estado y la vigencia sí se actualizan, por las
--    funciones de comisión).
-- No toca datos ni columnas. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.registro_sin_vaciar() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  raise exception 'Este registro solo se agrega: no se vacía.' using errcode = '23514';
end $f$;

create or replace trigger legal_aceptaciones_sin_vaciar before truncate on public.legal_aceptaciones
  for each statement execute function public.registro_sin_vaciar();
create or replace trigger comision_aceptaciones_sin_vaciar before truncate on public.comision_aceptaciones
  for each statement execute function public.registro_sin_vaciar();
create or replace trigger comision_operaciones_sin_vaciar before truncate on public.comision_operaciones
  for each statement execute function public.registro_sin_vaciar();
create or replace trigger comision_textos_sin_vaciar before truncate on public.comision_textos
  for each statement execute function public.registro_sin_vaciar();

revoke update, delete, truncate, references, trigger on public.legal_aceptaciones from service_role;
revoke update, delete, truncate, references, trigger on public.comision_aceptaciones from service_role;
revoke delete, truncate, references, trigger on public.comision_operaciones from service_role;
revoke truncate, references, trigger on public.comision_textos from service_role;

commit;
