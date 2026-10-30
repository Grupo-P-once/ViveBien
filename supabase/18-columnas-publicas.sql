-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 18 — El público sólo lee columnas públicas de `propiedades`
-- Hallazgo SEC-02 de la auditoría del PRD v2.0. Aplicada DESPUÉS de desplegar
-- V-1.1.77 (el código ya pide columnas explícitas; un `select('*')` anónimo
-- fallaría con esta migración).
--
-- La política de filas no cambia (sólo publicadas). Lo que cambia es qué
-- columnas ve el rol anónimo: fuera el dueño, el WhatsApp y el teléfono del
-- anuncio, la calle, el CP, las notas de moderación y los contadores internos.
-- La lista es la misma que COLUMNAS_PUBLICAS (src/lib/propiedad-publica.ts);
-- una prueba compara las dos.
-- ═══════════════════════════════════════════════════════════════

revoke select on table public.propiedades from anon, authenticated;
grant select (id, slug, folio, titulo, tipo, subtipo, operacion, precio, moneda, mantenimiento, ubicacion, colonia, ciudad, estado_dir, lat, lng, precision_ubicacion, metros, recamaras, banos, altura_libre, andenes, estatus, estado_pub, descripcion, fotos, videos, planos, amenidades, extras, created_at, publicada_en) on public.propiedades to anon, authenticated;
