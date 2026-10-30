-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 42 — Centro de Ayuda: quitar a anon y authenticated los permisos de escritura que nunca se usan
-- Reversa: 42-ayuda-quitar-permisos-de-mas.REVERTIR.sql
--
-- Auditoría de seguridad del 24-oct-2026. Las tablas `knowledge_*` heredaron los permisos por defecto de Supabase: INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES y TRIGGER para anon y authenticated. Lo que realmente las protege son las políticas RLS (solo lectura de lo público
-- y publicado; el feedback solo se inserta sobre un artículo público), pero TRUNCATE no pasa por RLS y un permiso que no se usa es superficie
-- de ataque. La app solo LEE knowledge_articles / knowledge_categories (con la clave anónima) y solo INSERTA en knowledge_feedback.
--
-- Después de esto:
--  · anon / authenticated: SELECT en articles, categories, relations y tags (las políticas siguen decidiendo qué filas); INSERT en feedback.
--  · sources, versions, change_events y searches: sin NINGÚN permiso (ya estaban bloqueadas por RLS sin políticas; las escribe el servidor).
--  · service_role no cambia.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

revoke all on
  public.knowledge_article_relations, public.knowledge_article_sources, public.knowledge_article_tags,
  public.knowledge_article_versions, public.knowledge_articles, public.knowledge_categories,
  public.knowledge_change_events, public.knowledge_feedback, public.knowledge_searches
from anon, authenticated;

grant select on public.knowledge_articles, public.knowledge_categories, public.knowledge_article_relations, public.knowledge_article_tags
  to anon, authenticated;
grant insert on public.knowledge_feedback to anon, authenticated;

commit;
