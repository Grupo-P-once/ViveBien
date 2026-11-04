-- Reversa de la 68: quita los tres artículos de privacidad del Centro de Ayuda (sus fuentes se borran en cascada). NO borra categorías.
begin;
delete from public.knowledge_articles a
 using public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'privacidad-y-seguridad'
   and a.slug in ('medicion-del-sitio-y-google-analytics', 'mi-consulta-y-el-anunciante', 'derechos-arco-como-ejercerlos');
commit;
