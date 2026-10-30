-- Reversa de 39-comision-textos-y-aceptaciones.sql.
-- ⚠ BORRA las dos tablas y TODO lo guardado en ellas (textos de comisión y el registro de quién aceptó qué). Haz una copia antes:
-- las aceptaciones son evidencia. No toca ninguna otra tabla.

begin;
drop table if exists public.comision_aceptaciones;
drop table if exists public.comision_textos;
drop function if exists public.comision_aceptaciones_guardia();
drop function if exists public.comision_textos_sin_borrar();
drop function if exists public.comision_textos_guardia();
commit;
