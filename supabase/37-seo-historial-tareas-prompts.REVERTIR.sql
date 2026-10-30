-- Reversa de 37-seo-historial-tareas-prompts.sql.
-- ⚠ BORRA las tres tablas y TODO lo guardado en ellas (historial de cifras, tareas y registro de prompts). Haz una copia antes si te importa.
-- No toca ninguna otra tabla.

begin;
drop table if exists public.seo_prompts_ia;
drop table if exists public.seo_tareas;
drop table if exists public.seo_historial;
commit;
