-- Reversa de 42-ayuda-quitar-permisos-de-mas.sql: devuelve los permisos que Supabase concede por defecto (todo a anon y authenticated).
-- Las políticas RLS no se tocan en ninguna dirección.

begin;

grant all on
  public.knowledge_article_relations, public.knowledge_article_sources, public.knowledge_article_tags,
  public.knowledge_article_versions, public.knowledge_articles, public.knowledge_categories,
  public.knowledge_change_events, public.knowledge_feedback, public.knowledge_searches
to anon, authenticated;

commit;
