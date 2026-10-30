-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 22 — REVERTIR
--
-- Estado anterior (producción, 19-sep-2026): `usuarios.busca_zona text` y
-- `usuarios.busca_tipo text`, nulas, sin valores en ninguna fila.
--
-- Vuelve a crear las columnas (nulas) y les pone el primer elemento de la
-- lista nueva. OJO: el código de V-1.1.82 ya no las lee ni las escribe; esto
-- sólo tiene sentido junto con volver a una versión anterior del sitio.
-- ═══════════════════════════════════════════════════════════════

alter table public.usuarios add column if not exists busca_zona text;
alter table public.usuarios add column if not exists busca_tipo text;

update public.usuarios set busca_zona = busca_zonas[1]
 where busca_zona is null and coalesce(cardinality(busca_zonas), 0) > 0;
update public.usuarios set busca_tipo = busca_tipos[1]
 where busca_tipo is null and coalesce(cardinality(busca_tipos), 0) > 0;
