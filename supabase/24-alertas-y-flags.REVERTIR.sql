-- ═══════════════════════════════════════════════════════════════
-- REVERTIR la migración 24 (V-1.1.85).
--
-- Quita la marca de alertas revisadas. El contador vuelve a contarse desde
-- `creado_en` de cada búsqueda (como antes de 3b-1): no se pierde nada más que
-- «hasta dónde había mirado» cada persona.
--
-- Las claves de flags NO se quitan a propósito: dejarlas en falso es
-- inofensivo, y borrarlas devolvería el estado a depender de una ausencia.
-- Si aun así hiciera falta, la línea comentada de abajo lo hace.
--
-- Antes de ejecutarlo, guarda lo que hay:
--   select id, uid, revisadas_en from public.busquedas_guardadas where revisadas_en is not null;
-- ═══════════════════════════════════════════════════════════════

alter table public.busquedas_guardadas drop column if exists revisadas_en;

-- update public.configuracion
--    set valor = valor - 'portalClienteInterno' - 'citasEnLinea'
--  where clave = 'flags';
