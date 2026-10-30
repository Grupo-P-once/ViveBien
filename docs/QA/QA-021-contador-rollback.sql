-- E-35.2 · ROLLBACK del contador (vistas 2 → 27). ESTADO: PREPARADO, **NO EJECUTADO**.
-- Independiente del rollback de los 25 eventos (QA-021-rollback-solo-eventos.sql): solo deshace la corrección del contador.
-- Condición id + vistas = 2: si alguien movió el contador entretanto (una visita real lo sube), no hace nada y devuelve 0 filas.
update public.propiedades
   set vistas = 27
 where id = '5243dab0-e301-4ce1-a5de-f5f57037e613'
   and vistas = 2;
-- Verificación posterior (solo lectura): select vistas from public.propiedades where id = '5243dab0-e301-4ce1-a5de-f5f57037e613';  -- 27
