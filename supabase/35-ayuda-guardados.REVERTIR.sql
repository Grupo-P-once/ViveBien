-- Reversa de 35-ayuda-guardados.sql: devuelve el texto anterior del artículo
-- «¿Cómo guardo una propiedad?». No toca nada más.

begin;

update public.knowledge_articles a
   set cuerpo = $c$Pulsa el **corazón** en la ficha o en la tarjeta. La propiedad se añade a tus guardadas y la encuentras en tu portal.

Hace falta tener sesión iniciada: es lo que nos permite recordarlo la próxima vez que entres.$c$,
       actualizado_en = now()
  from public.knowledge_categories c
 where c.id = a.categoria_id
   and c.slug = 'propiedades-guardadas'
   and a.slug = 'como-guardar-una-propiedad';

commit;
