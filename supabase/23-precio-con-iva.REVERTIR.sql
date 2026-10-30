-- ═══════════════════════════════════════════════════════════════
-- REVERTIR la migración 23 (V-1.1.84).
--
-- Devuelve la tabla a como estaba: sin `precio_incluye_iva`. Se pierde lo que
-- se haya marcado en esa casilla (antes tampoco se guardaba). El código lo
-- tolera: el servidor quita las columnas que no existen y avisa en pantalla.
--
-- Antes de ejecutarlo, guarda lo que hay:
--   select id, precio_incluye_iva from public.propiedades where precio_incluye_iva;
-- ═══════════════════════════════════════════════════════════════

alter table public.propiedades drop column if exists precio_incluye_iva;
