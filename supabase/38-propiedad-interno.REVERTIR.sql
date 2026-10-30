-- Reversa de 38-propiedad-interno.sql.
-- ⚠ BORRA las dos tablas y TODO lo guardado en ellas (origen, comisión pactada y notas internas). Haz una copia antes si te importa.
-- No toca ninguna otra tabla.

begin;
drop table if exists public.propiedad_notas;
drop table if exists public.propiedad_origen;
commit;
