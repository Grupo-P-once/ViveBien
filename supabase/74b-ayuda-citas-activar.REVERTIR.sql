-- Reversa de 74b-ayuda-citas-activar.sql: vuelve a poner los avisos de «todavía no está activo» (los de la migración 74) y el del artículo de correos.
-- Úsala si se APAGA otra vez `citasEnLinea`. No toca texto de ningún cuerpo.

begin;

update public.knowledge_articles a
   set estado_producto = 'parcial', actualizado_en = now(),
       aviso = case
         when a.slug in ('como-solicitar-una-visita','como-se-confirma-una-visita','cancelar-o-reprogramar','mi-historial-de-visitas','estados-de-una-cita')
           then 'Agendar citas en línea todavía no está activo para todos. Mientras tanto, escríbenos por WhatsApp y te ayudamos a agendar.'
         when a.slug = 'recordatorios-de-visita'
           then 'Agendar citas en línea todavía no está activo para todos, así que por ahora no se envían recordatorios de citas.'
         when a.slug = 'correos-de-tus-citas'
           then 'Los correos de citas dependen de que las citas en línea estén activas; todavía no lo están.'
         when a.slug in ('datos-que-se-comparten-en-una-cita','calendario-y-agenda-de-mis-citas')
           then 'Agendar citas en línea todavía no está activo para todos.'
         when a.slug = 'mis-visitas-como-publicador'
           then 'Agendar citas en línea todavía no está activo, así que por ahora «Mis citas» puede estar vacío.'
         when a.slug = 'mi-disponibilidad-para-citas'
           then 'Agendar citas en línea todavía no está activo: tu disponibilidad se guarda pero aún no se ofrece a clientes.'
         when a.slug in ('citas-recibidas','quien-atiende-las-citas-de-mis-propiedades')
           then 'Agendar citas en línea todavía no está activo: por ahora no entran citas nuevas.'
         when a.slug = 'permisos-de-citas-y-citas-en-linea'
           then 'La función global de citas en línea está desactivada; mientras lo esté, estos permisos no producen citas.'
         when a.slug = 'gestionar-las-citas-del-equipo'
           then 'La función global de citas en línea está desactivada; mientras lo esté, no entran citas nuevas.'
       end
  from public.knowledge_categories c
 where c.id = a.categoria_id
   and ((c.slug = 'consultas-y-visitas' and a.slug in (
          'como-solicitar-una-visita','como-se-confirma-una-visita','cancelar-o-reprogramar','mi-historial-de-visitas','recordatorios-de-visita',
          'estados-de-una-cita','correos-de-tus-citas','datos-que-se-comparten-en-una-cita','calendario-y-agenda-de-mis-citas'))
     or (c.slug = 'publicadores' and a.slug in (
          'citas-recibidas','mis-visitas-como-publicador','quien-atiende-las-citas-de-mis-propiedades','mi-disponibilidad-para-citas'))
     or (c.slug = 'administracion' and a.slug in ('permisos-de-citas-y-citas-en-linea','gestionar-las-citas-del-equipo')));

update public.knowledge_articles a
   set aviso = replace(a.aviso, 'todavía no se envían.', 'todavía no se envían, y los avisos de citas dependen de que las citas en línea estén activas.'), actualizado_en = now()
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias' and a.aviso like '%todavía no se envían.'
   and a.aviso not like '%los avisos de citas dependen de que las citas en línea estén activas%';

commit;
