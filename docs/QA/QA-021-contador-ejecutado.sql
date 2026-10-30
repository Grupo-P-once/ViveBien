-- E-35.2 · CONTADOR QA-021 · EJECUTADO EN PRODUCCIÓN el 2026-10-08 ~01:49 UTC (autorización explícita del usuario). Este es el script EXACTO.
-- Alcance: SOLO `public.propiedades.vistas` de VB-2026-00026 (27 → 2), 1 fila. NO toca `eventos`, `audit_logs` ni ninguna otra tabla/propiedad.
-- Una sola sentencia atómica (DO): precheck y postcheck DENTRO; si algo no coincide, la excepción revierte todo.
-- Huellas de la línea base (medidas justo antes): vistas de las otras 8 propiedades md5 = 648001c253f9dec5d770d69aad3f72ba; eventos 97; audit_logs 382.
do $$
declare
  filas int; v int; pv int; ids text; ausentes int; ev int; au int; otras text; afectadas int; v2 int; otras2 text; ev2 int; au2 int;
begin
  -- PRECHECK (misma transacción): aborta sin tocar nada si algo no coincide
  select count(*), max(vistas) into filas, v from public.propiedades where id = '5243dab0-e301-4ce1-a5de-f5f57037e613';
  select count(*), string_agg(id::text, ',' order by id) into pv, ids from public.eventos where propiedad_id = '5243dab0-e301-4ce1-a5de-f5f57037e613' and nombre = 'property_view';
  select count(*) into ausentes from public.eventos where id between 188 and 212;
  select count(*) into ev from public.eventos;
  select count(*) into au from public.audit_logs;
  select md5(string_agg(id || ':' || coalesce(vistas::text, 'null'), ',' order by id)) into otras from public.propiedades where id <> '5243dab0-e301-4ce1-a5de-f5f57037e613';
  if filas <> 1 or v <> 27 or pv <> 2 or ids <> '179,180' or ausentes <> 0 or ev <> 97 or au <> 382 or otras <> '648001c253f9dec5d770d69aad3f72ba' then
    raise exception 'E-35.2 precheck NO coincide (filas=%, vistas=%, pv=%, ids=%, ids188_212=%, eventos=%, audit=%, otras=%) — sin cambios', filas, v, pv, ids, ausentes, ev, au, otras;
  end if;

  -- UPDATE: una sola fila, condición id + vistas = 27
  update public.propiedades set vistas = 2
   where id = '5243dab0-e301-4ce1-a5de-f5f57037e613' and vistas = 27;
  get diagnostics afectadas = row_count;

  -- POSTCHECK (misma transacción): si algo no cuadra, la excepción revierte TODO
  select vistas into v2 from public.propiedades where id = '5243dab0-e301-4ce1-a5de-f5f57037e613';
  select md5(string_agg(id || ':' || coalesce(vistas::text, 'null'), ',' order by id)) into otras2 from public.propiedades where id <> '5243dab0-e301-4ce1-a5de-f5f57037e613';
  select count(*) into ev2 from public.eventos;
  select count(*) into au2 from public.audit_logs;
  if afectadas <> 1 or v2 <> 2 or otras2 <> otras or ev2 <> 97 or au2 <> 382 then
    raise exception 'E-35.2 postcheck NO coincide (afectadas=%, vistas=%, otras_igual=%, eventos=%, audit=%) — se revierte', afectadas, v2, (otras2 = otras), ev2, au2;
  end if;
end $$;
