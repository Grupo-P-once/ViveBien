-- ═══════════════════════════════════════════════════════
-- Vive Bien · 61 — Centro de Ayuda: `anon` y `authenticated` ya no pueden INSERTAR en `knowledge_feedback`
-- Reversa: 61-feedback-sin-insert-anonimo.REVERTIR.sql
--
-- POR QUÉ (SEC-7, revisión de seguridad del 29-oct-2026): la 42 dejó INSERT para anon porque la ruta `/api/ayuda/feedback` escribía con la clave pública.
-- Esa clave viaja en el navegador: con ella cualquiera podía insertar directo en PostgREST SALTÁNDOSE los topes de la ruta (frecuencia, tamaño, forma del id).
-- En el plan gratuito, llenar la base la deja en solo lectura. La ruta ahora escribe con la clave de servicio y comprueba ella misma que el artículo
-- sea público y publicado, así que el permiso ya no se usa.
--
-- ORDEN DE APLICACIÓN: primero el CÓDIGO (la ruta con clave de servicio funciona con o sin esta migración) y DESPUÉS esta migración.
-- Idempotente. No toca filas. La política `knowledge_feedback_escribir` se queda (sin permiso de tabla no sirve de nada) para que la reversa sea solo un GRANT.
-- ══════════════════════════════════════════════════════

begin;

revoke insert on public.knowledge_feedback from anon, authenticated;

commit;
