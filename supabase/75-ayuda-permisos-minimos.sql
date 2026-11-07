-- 75 · Centro de Ayuda: permisos mínimos para anon/authenticated (auditoría de seguridad, 7-nov-2026; hallazgo Medio, defensa en profundidad).
--
-- ESTADO ENCONTRADO (staging, solo lectura de catálogos): las tablas `knowledge_*` conservaban de los privilegios por defecto de Supabase
-- ALL salvo INSERT en `knowledge_feedback` (lo quitó la 61): UPDATE, DELETE, TRUNCATE, REFERENCES y TRIGGER para anon y authenticated.
-- Hoy no es explotable por la API: las políticas RLS solo permiten SELECT en lo público (y no hay política de UPDATE/DELETE), y PostgREST no expone
-- TRUNCATE. Pero la protección dependía de UNA sola capa; un error futuro de política (las permisivas se combinan con OR) abriría la escritura.
--
-- QUÉ HACE: quita todo privilegio de las tablas de ayuda a anon y authenticated y devuelve SOLO el SELECT de lo que el sitio público lee con la
-- clave anónima (`src/lib/ayuda/consultas.ts`: categorías, artículos, relaciones, etiquetas). La retroalimentación se escribe con la clave de SERVICIO
-- (`/api/ayuda/feedback`), que no depende de estos privilegios.
-- NO TOCA datos ni políticas. Idempotente. Una transacción. Reversa: 75-ayuda-permisos-minimos.REVERTIR.sql.
begin;

revoke all on
  public.knowledge_article_relations, public.knowledge_article_sources, public.knowledge_article_tags, public.knowledge_article_versions,
  public.knowledge_articles, public.knowledge_categories, public.knowledge_change_events, public.knowledge_feedback,
  public.knowledge_searches
from anon, authenticated;

grant select on
  public.knowledge_articles, public.knowledge_categories, public.knowledge_article_tags, public.knowledge_article_relations
to anon, authenticated;

commit;
