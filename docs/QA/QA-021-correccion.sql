-- *** SUPERADO (8-oct-2026): NO USAR. Lo que se ejecutó fue docs/QA/QA-021-borrado-ejecutado.sql (solo eventos) y docs/QA/QA-021-contador-ejecutado.sql (solo el contador). Este script combinaba ambas cosas más una fila de auditoría y se conserva únicamente como historia y para sus pruebas. ***
-- QA-021 · corrección EXACTA de la telemetría generada por las pruebas de navegador sobre producción (D-62 / R-15)
-- ESTADO: PREPARADO, **NO EJECUTADO**. Espera autorización explícita ("QA-021 listo para corrección exacta; 25 filas identificadas").
--
-- EVIDENCIA (lectura, 7-oct-2026):
--   · propiedad VB-2026-00026 = '5243dab0-e301-4ce1-a5de-f5f57037e613'; `vistas` = 27.
--   · eventos `property_view` de esa propiedad: 27 filas → ids 179, 180 (5 y 6-oct, ANTERIORES a la campaña: NO se tocan) y ids 188…212 (25 filas
--     CONSECUTIVAS, 25 sesiones distintas, 2026-10-07 04:49:58 → 07:28:20 UTC, uid NULL, datos NULL) = las ventanas de mis pruebas Playwright en producción.
--   · 27 = 2 + 25: el contador `vistas` solo subió por esas visitas (sumar_vista suma 1 por evento).
--   · Sin PII: sin uid, sin datos; la sesión es un identificador aleatorio del navegador.
--
-- QUÉ HACE (una transacción; aborta si algo no coincide):
--   1. comprueba que existen EXACTAMENTE 25 filas con esas condiciones y que `vistas` sigue en 27;
--   2. borra SOLO esas 25 filas;
--   3. ajusta SOLO `vistas` de esa propiedad (27 → 2);
--   4. deja huella en `audit_logs` (actor del sistema de QA, antes/después, motivo).
-- NO toca: ningún otro evento, ninguna otra propiedad, ningún dato de personas.

begin;

do $$
declare
  n int;
  v int;
begin
  select count(*) into n from public.eventos
   where id between 188 and 212 and nombre = 'property_view'
     and propiedad_id = '5243dab0-e301-4ce1-a5de-f5f57037e613' and uid is null and datos is null
     and creado_en >= '2026-10-07 04:45:00+00' and creado_en < '2026-10-07 07:30:00+00';
  if n <> 25 then raise exception 'QA-021: se esperaban 25 filas y hay % — se aborta sin cambios', n; end if;

  select vistas into v from public.propiedades where id = '5243dab0-e301-4ce1-a5de-f5f57037e613' for update;
  if v <> 27 then raise exception 'QA-021: vistas = % (se esperaba 27) — alguien más cambió el contador; se aborta sin cambios', v; end if;
end $$;

delete from public.eventos
 where id between 188 and 212 and nombre = 'property_view'
   and propiedad_id = '5243dab0-e301-4ce1-a5de-f5f57037e613' and uid is null and datos is null
   and creado_en >= '2026-10-07 04:45:00+00' and creado_en < '2026-10-07 07:30:00+00';

update public.propiedades set vistas = vistas - 25
 where id = '5243dab0-e301-4ce1-a5de-f5f57037e613' and vistas = 27;

insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
values ('qa-d62-claude', null, 'sistema', 'qa.telemetria_corregida', 'propiedades', '5243dab0-e301-4ce1-a5de-f5f57037e613',
        jsonb_build_object('vistas', 27, 'eventos_property_view_qa', 25),
        jsonb_build_object('vistas', 2, 'eventos_property_view_qa', 0, 'motivo', 'QA-021: 25 vistas generadas por pruebas de navegador de la campaña D-62 en producción; ids 188-212; autorizado por el usuario'));

commit;

-- VERIFICACIÓN posterior (solo lectura):
--   select count(*) from public.eventos where propiedad_id='5243dab0-e301-4ce1-a5de-f5f57037e613' and nombre='property_view';  -- 2
--   select vistas from public.propiedades where id='5243dab0-e301-4ce1-a5de-f5f57037e613';                                      -- 2
