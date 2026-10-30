-- Reversa de la 64: quita los dos artículos de correos del Centro de Ayuda (sus fuentes se borran en cascada).
begin;
delete from public.knowledge_articles a
 using public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'privacidad-y-seguridad' and a.slug = 'correos-de-vive-bien-y-tus-preferencias';
delete from public.knowledge_articles a
 using public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'busquedas-y-alertas' and a.slug = 'activar-o-desactivar-avisos-por-correo';
commit;
