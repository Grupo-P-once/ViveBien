-- Reversa de la 75: devuelve a anon y authenticated los privilegios por defecto de Supabase sobre las tablas de ayuda (salvo el INSERT de
-- `knowledge_feedback`, que ya había quitado la 61). Una transacción, sin pérdida de datos.
begin;
grant all on
  public.knowledge_article_relations, public.knowledge_article_sources, public.knowledge_article_tags, public.knowledge_article_versions,
  public.knowledge_articles, public.knowledge_categories, public.knowledge_change_events, public.knowledge_feedback,
  public.knowledge_searches
to anon, authenticated;
revoke insert on public.knowledge_feedback from anon, authenticated;
commit;
