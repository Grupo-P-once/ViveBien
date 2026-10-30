-- Reversa de 48-contabilidad-comisiones.sql: quita las funciones, los disparadores y las dos tablas.
-- OJO: se PIERDEN los movimientos y las cuentas de gasto ya capturados (es un libro contable). Respalda antes si ya hay datos. La bitácora (`audit_logs`) se conserva.

begin;

drop function if exists public.contab_movimiento_registrar(jsonb, jsonb);
drop function if exists public.contab_cuenta_cambiar(uuid, jsonb, jsonb);
drop function if exists public.contab_cuenta_registrar(jsonb, jsonb);

-- Los disparadores impiden el DROP de filas, no el de la tabla; se quitan antes de las funciones que usan.
drop table if exists public.contab_movimientos;
drop table if exists public.contab_cuentas;

drop function if exists public.contab_movimientos_guardia();
drop function if exists public.contab_cuentas_guardia();
drop function if exists public.contab_sin_vaciar();

commit;
