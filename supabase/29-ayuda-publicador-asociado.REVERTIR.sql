-- Reversa de 29-ayuda-publicador-asociado.sql
--
-- Borra los 12 artículos NUEVOS. Los dos que ya existían antes de esta migración
-- (`tu-panel-de-publicador` y `estados-de-una-propiedad`) NO se borran: se
-- devuelven al texto de la migración 27b (V-1.1.94).
--
-- Las fuentes se borran solas (on delete cascade desde el artículo).

begin;

delete from public.knowledge_articles a
 using public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'publicadores'
   and a.slug in (
     'que-es-un-publicador', 'que-es-un-asociado', 'publicador-o-asociado',
     'publicar-con-revision', 'publicar-sin-revision', 'solicitudes-de-tus-propiedades',
     'citas-recibidas', 'mis-visitas-como-publicador', 'permisos-de-citas',
     'datos-que-puede-ver-un-publicador', 'perfil-y-contacto-publico', 'que-depende-de-vive-bien'
   );

update public.knowledge_articles a set
  titulo = 'Tu panel de publicador',
  resumen = 'Dónde ves y administras tus propiedades.',
  cuerpo = E'En tu panel ves tus propiedades con su porcentaje de avance y puedes crear una nueva.',
  estado_producto = 'disponible', aviso = null, actualizado_en = now()
from public.knowledge_categories c
where c.id = a.categoria_id and c.slug = 'publicadores' and a.slug = 'tu-panel-de-publicador';

update public.knowledge_articles a set
  resumen = 'Borrador, publicada y lo que viene.',
  cuerpo = E'Hoy una propiedad puede estar en **borrador** o **publicada**.',
  estado = 'BORRADOR', estado_producto = 'parcial',
  aviso = 'El ciclo completo —envío a revisión, aprobación, pausada, vendida— todavía no está construido.',
  publicado_por = null, publicado_en = null, actualizado_en = now()
from public.knowledge_categories c
where c.id = a.categoria_id and c.slug = 'publicadores' and a.slug = 'estados-de-una-propiedad';

commit;
