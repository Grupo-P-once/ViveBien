-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 74b — Centro de Ayuda: citas YA ACTIVAS (se aplica SOLO cuando `citasEnLinea` se encienda en ese entorno)
-- Idempotente. Reversa: 74b-ayuda-citas-activar.REVERTIR.sql
--
-- ESTADO: PREPARADA, NO APLICADA (ni en producción ni en staging: en los dos `citasEnLinea` sigue APAGADO).
-- Orden: 70–73 → código → 74 → (el dueño enciende `citasEnLinea`) → ESTA.
--
-- Qué hace: los artículos de la 74 se publicaron como `parcial` con un aviso («todavía no está activo»), que es verdad mientras el flag esté apagado. Al
-- encenderlo, esos avisos pasan a ser falsos: esta migración los pasa a `disponible` y quita el aviso. El artículo del calendario SIGUE `parcial`
-- (no hay sincronización automática con Google/Outlook; solo el archivo .ics) y se le deja ese aviso, que es lo único que sigue siendo verdad.
-- ═══════════════════════════════════════════════════════════════

begin;

update public.knowledge_articles a
   set estado_producto = 'disponible', aviso = null, actualizado_en = now()
  from public.knowledge_categories c
 where c.id = a.categoria_id
   and ((c.slug = 'consultas-y-visitas' and a.slug in (
          'como-solicitar-una-visita','como-se-confirma-una-visita','cancelar-o-reprogramar','mi-historial-de-visitas','recordatorios-de-visita',
          'estados-de-una-cita','correos-de-tus-citas','datos-que-se-comparten-en-una-cita','calendario-y-agenda-de-mis-citas'))
     or (c.slug = 'publicadores' and a.slug in (
          'citas-recibidas','mis-visitas-como-publicador','quien-atiende-las-citas-de-mis-propiedades','mi-disponibilidad-para-citas'))
     or (c.slug = 'administracion' and a.slug in ('permisos-de-citas-y-citas-en-linea','gestionar-las-citas-del-equipo')));

update public.knowledge_articles a
   set estado_producto = 'parcial',
       aviso = 'La sincronización automática con Google o Outlook todavía no existe; hoy solo se descarga el archivo .ics.',
       actualizado_en = now()
  from public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'consultas-y-visitas' and a.slug = 'google-calendar';

-- El aviso del artículo de correos de VIVE BIEN («los avisos de citas dependen de que las citas en línea estén activas») ya no aplica.
update public.knowledge_articles a
   set aviso = replace(a.aviso, ', y los avisos de citas dependen de que las citas en línea estén activas', ''), actualizado_en = now()
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias' and a.aviso like '%los avisos de citas dependen de que las citas en línea estén activas%';

commit;
