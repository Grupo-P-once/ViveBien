-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 41 — Fijar el `search_path` de las tres funciones de guardia de la migración 39
-- Reversa: 41-comision-funciones-search-path.REVERTIR.sql
--
-- El asesor de seguridad de Supabase marcó `function_search_path_mutable` en las tres funciones de disparador de la 39. Una función sin
-- `search_path` fijo resuelve nombres según la sesión que la llama; fijarlo a `public, pg_temp` evita que alguien anteponga un esquema
-- propio. Las funciones solo usan objetos de `pg_catalog` (sha256, convert_to, encode) y `public.comision_textos` con su esquema.
-- Solo cambia un atributo de las funciones: no toca tablas ni datos. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

alter function public.comision_textos_guardia()        set search_path = public, pg_temp;
alter function public.comision_textos_sin_borrar()     set search_path = public, pg_temp;
alter function public.comision_aceptaciones_guardia()  set search_path = public, pg_temp;

commit;
