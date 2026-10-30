-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 18 — REVERTIR (sólo si el sitio público falla tras aplicar la 18)
--
-- Estado anterior, capturado en producción el 19-sep-2026 antes de aplicarla
-- (information_schema.role_table_grants de public.propiedades):
--   anon          SELECT (tabla completa, sin GRANT OPTION)
--   authenticated SELECT (tabla completa, sin GRANT OPTION)
--   postgres / service_role — sin cambios (la 18 no los toca)
--
-- La 18 no modifica datos: sólo permisos. Esto deja los permisos como estaban.
-- ═══════════════════════════════════════════════════════════════

grant select on table public.propiedades to anon, authenticated;
