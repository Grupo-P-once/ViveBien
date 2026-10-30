-- Reversa de 49-contabilidad-notas-del-contador.sql: quita las funciones, los disparadores y la tabla.
-- OJO: se PIERDEN las notas del contador ya registradas (y con ellas el historial de qué se le dijo al asesor). Respáldalas antes. La bitácora (`audit_logs`) se conserva.

begin;

drop function if exists public.contab_nota_retirar(uuid, text, text, jsonb);
drop function if exists public.contab_nota_registrar(jsonb, jsonb);
drop table if exists public.contab_conocimiento;
drop function if exists public.contab_conocimiento_guardia();
drop function if exists public.contab_conocimiento_sin_vaciar();

commit;
