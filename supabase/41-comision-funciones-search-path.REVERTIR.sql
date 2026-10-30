-- Reversa de 41-comision-funciones-search-path.sql: quita el `search_path` fijo de las tres funciones (vuelve a como las dejó la 39).

begin;

alter function public.comision_textos_guardia()        reset search_path;
alter function public.comision_textos_sin_borrar()     reset search_path;
alter function public.comision_aceptaciones_guardia()  reset search_path;

commit;
