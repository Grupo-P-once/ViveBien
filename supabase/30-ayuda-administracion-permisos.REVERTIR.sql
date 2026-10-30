-- Reversa de 30-ayuda-administracion-permisos.sql
--
-- Borra los 8 artículos y la categoría «administracion». Las fuentes se borran
-- solas (on delete cascade desde el artículo). No toca nada de las migraciones
-- 27 ni 29.

begin;

delete from public.knowledge_articles a
 using public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'administracion';

delete from public.knowledge_categories where slug = 'administracion';

commit;
