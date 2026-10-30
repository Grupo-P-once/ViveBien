-- ═══════════════════════════════════════════════════════════════
-- REVERTIR la migración 27 (V-1.1.94) — Centro de Ayuda.
--
-- La 27 es ENTERAMENTE ADITIVA: no tocó ninguna tabla que ya existiera. Por
-- eso revertirla es sencillo — y por eso mismo es DESTRUCTIVA: borra las
-- nueve tablas y todo lo que haya dentro. Los artículos escritos se pierden.
--
-- ANTES DE EJECUTARLO, mira qué te vas a llevar por delante:
--
--   select count(*) as articulos from public.knowledge_articles;
--   select estado, count(*) from public.knowledge_articles group by 1;
--   select count(*) as versiones from public.knowledge_article_versions;
--   select count(*) as opiniones from public.knowledge_feedback;
--   select count(*) as busquedas from public.knowledge_searches;
--
-- Si hay artículos que valga la pena conservar, expórtalos primero:
--
--   copy (
--     select a.id, c.slug as categoria, a.slug, a.titulo, a.estado,
--            a.estado_producto, a.aviso, a.resumen, a.cuerpo
--     from public.knowledge_articles a
--     join public.knowledge_categories c on c.id = a.categoria_id
--     order by c.orden, a.prioridad
--   ) to stdout with csv header;
--
-- El orden de abajo va de las dependientes a las principales: las claves
-- ajenas llevan `on delete cascade`, pero borrar en orden deja constancia
-- clara de qué se está tirando.
-- ═══════════════════════════════════════════════════════════════

begin;

drop table if exists public.knowledge_change_events;
drop table if exists public.knowledge_searches;
drop table if exists public.knowledge_feedback;
drop table if exists public.knowledge_article_tags;
drop table if exists public.knowledge_article_relations;
drop table if exists public.knowledge_article_sources;
drop table if exists public.knowledge_article_versions;
drop table if exists public.knowledge_articles;
drop table if exists public.knowledge_categories;

commit;

-- ── Comprobación posterior ──────────────────────────────────────────────
--   select tablename from pg_tables
--     where schemaname='public' and tablename like 'knowledge_%';
--   -- debe salir vacío
