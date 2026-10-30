-- QA-021 · BORRADO EJECUTADO EN PRODUCCIÓN el 2026-10-08 ~01:28 UTC (autorizado explícitamente por el usuario). Evidencia: este es el script EXACTO.
-- Alcance: SOLO borra las 25 filas `property_view` de `eventos` (ids 188-212). NO toca `propiedades.vistas`, `audit_logs` ni ninguna otra tabla.
-- Una sola sentencia atómica (DO): el precheck y el postcheck están DENTRO; si algo no coincide, la excepción revierte todo.
-- Huella de las filas (md5 de «id|sesion|creado_en» ordenado) = la de docs/QA/QA-021-filas.csv: c598d968665adfa4450770a43a300682.
do $$
declare
  n int; mn bigint; mx bigint; huella text; borradas int; restantes int; vb26 int; tot int; pv int;
begin
  -- PRECHECK dentro de la misma transacción: aborta sin tocar nada si algo no coincide
  select count(*), min(id), max(id), md5(string_agg(id::text || '|' || sesion || '|' || creado_en::text, ',' order by id))
    into n, mn, mx, huella
  from public.eventos
  where id between 188 and 212 and nombre = 'property_view' and propiedad_id = '5243dab0-e301-4ce1-a5de-f5f57037e613'
    and uid is null and datos is null and creado_en >= '2026-10-07 04:49:58+00' and creado_en <= '2026-10-07 07:28:21+00';
  if n <> 25 or mn <> 188 or mx <> 212 or huella <> 'c598d968665adfa4450770a43a300682' then
    raise exception 'QA-021 precheck NO coincide (n=%, min=%, max=%, huella=%) — sin cambios', n, mn, mx, huella;
  end if;
  select count(*) into tot from public.eventos;
  select count(*) into pv from public.eventos where nombre = 'property_view';
  if tot <> 122 or pv <> 74 then raise exception 'QA-021: totales inesperados (eventos=%, property_view=%) — sin cambios', tot, pv; end if;

  -- DELETE estrictamente condicionado (todas las condiciones + huella ya comprobada)
  delete from public.eventos
  where id between 188 and 212 and nombre = 'property_view' and propiedad_id = '5243dab0-e301-4ce1-a5de-f5f57037e613'
    and uid is null and datos is null and creado_en >= '2026-10-07 04:49:58+00' and creado_en <= '2026-10-07 07:28:21+00';
  get diagnostics borradas = row_count;

  -- POSTCHECK dentro de la transacción: si algo no cuadra, la excepción revierte TODO
  select count(*) into restantes from public.eventos where id between 188 and 212;
  select count(*) into vb26 from public.eventos where nombre = 'property_view' and propiedad_id = '5243dab0-e301-4ce1-a5de-f5f57037e613';
  select count(*) into tot from public.eventos;
  select count(*) into pv from public.eventos where nombre = 'property_view';
  if borradas <> 25 or restantes <> 0 or vb26 <> 2 or tot <> 97 or pv <> 49 then
    raise exception 'QA-021 postcheck NO coincide (borradas=%, restantes=%, vb26=%, eventos=%, property_view=%) — se revierte', borradas, restantes, vb26, tot, pv;
  end if;
end $$;
