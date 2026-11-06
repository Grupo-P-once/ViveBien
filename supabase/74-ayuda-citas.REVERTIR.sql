-- Reversa de 74-ayuda-citas.sql. Hace SOLO esto:
--   1. borra los 7 artículos NUEVOS de la 74 (y, por cascada, sus fuentes);
--   2. devuelve el texto anterior (el de las migraciones 27, 29 y 30) a los 9 artículos que ya existían en producción;
--   3. quita las fuentes que añadió la 74 y restituye las 4 que retiró;
--   4. deshace las 3 sustituciones de frases.
-- NO borra categorías (la 74 pudo crear 3 en staging; en producción ya existían) ni toca ningún otro artículo.
-- En STAGING, donde esos 9 artículos solo existían porque la 74 los creó, la reversa los deja con el texto anterior de producción.

begin;

-- 1 · artículos nuevos
delete from public.knowledge_articles a
 using public.knowledge_categories c
 where c.id = a.categoria_id
   and ((c.slug = 'consultas-y-visitas' and a.slug in ('estados-de-una-cita','correos-de-tus-citas','datos-que-se-comparten-en-una-cita','calendario-y-agenda-de-mis-citas'))
     or (c.slug = 'publicadores' and a.slug in ('quien-atiende-las-citas-de-mis-propiedades','mi-disponibilidad-para-citas'))
     or (c.slug = 'administracion' and a.slug = 'gestionar-las-citas-del-equipo'));

-- 2 · texto anterior de los artículos que ya existían
create temporary table if not exists _ant74 (
  cat text, slug text, titulo text, resumen text, cuerpo text, estado text, ep text, aviso text, prioridad int
) on commit delete rows;

insert into _ant74 values
('consultas-y-visitas','como-solicitar-una-visita','¿Cómo solicito una visita?','Conoce cómo agendar una visita a una propiedad.',
 $c$Desde la ficha de la propiedad, pide una visita y elige el día y la hora que te vengan bien. Sólo se ofrecen horarios con disponibilidad real.

La solicitud queda **pendiente** hasta que la confirmamos.$c$,'PUBLICADO','disponible',null,1),
('consultas-y-visitas','como-se-confirma-una-visita','¿Cómo se confirma mi visita?','De pendiente a confirmada.',
 $c$Una visita nueva queda **pendiente**. El equipo de VIVE BIEN la revisa y la **confirma**, y lo ves en **Mis visitas**.

Si la hora que pediste no es posible, te proponemos otra en vez de cancelarla sin más.$c$,'PUBLICADO','disponible',null,1),
('consultas-y-visitas','cancelar-o-reprogramar','Cancelar o reprogramar una visita','Si te cambian los planes.',
 $c$Desde **Mis visitas** puedes **cancelarla** o pedir **reprogramarla**.

Avisa en cuanto lo sepas: del otro lado hay alguien que aparta ese hueco y se desplaza.$c$,'PUBLICADO','disponible',null,2),
('consultas-y-visitas','mi-historial-de-visitas','Mi historial de visitas','Lo que ya pasó.',
 $c$En **Mis visitas** quedan también las anteriores, marcadas como **completada** o, si no se pudo asistir, como **no asistió**. Sirve para recordar qué viste y cuándo.$c$,'PUBLICADO','disponible',null,2),
('consultas-y-visitas','recordatorios-de-visita','Recordatorios de tu visita','Avisos antes de la cita.',
 $c$La idea es recordarte tu visita con antelación para que no se te pase.$c$,'BORRADOR','futuro',
 'Todavía no enviamos recordatorios. Está previsto, pero aún no funciona: por ahora consulta **Mis visitas**.',4),
('consultas-y-visitas','google-calendar','Añadir la visita a Google Calendar','Sincronizar tus visitas con tu calendario.',
 $c$La idea es que tus visitas confirmadas aparezcan en tu propio calendario.$c$,'BORRADOR','futuro','Todavía no está disponible.',4),
('publicadores','citas-recibidas','Citas recibidas','Las visitas que piden a tus propiedades.',
 $c$Si tu cuenta tiene el permiso **recibir citas**, en tu panel aparece **Citas recibidas**: las visitas que clientes piden a **tus** propiedades publicadas. Ves la propiedad, la fecha y la hora, el estado y, si hay otro horario propuesto, cuál es.

Sólo ves lo tuyo: nunca las citas de otro publicador.

**Si tu cuenta no recibe citas,** no se pueden agendar visitas en línea a tus propiedades: VIVE BIEN no las reasigna a otra persona. Para atenderlas tú, escríbenos y lo revisamos.

**Qué botones ves** depende de tus permisos. Aceptar, rechazar, reprogramar y cancelar son permisos **independientes**: si no tienes uno, el botón no aparece y el servidor tampoco lo acepta.

**Quién te avisa.** Recibes un correo por cada solicitud, sin datos personales del interesado salvo que tengas ese permiso. VIVE BIEN también recibe un aviso interno de cada visita en la propiedad de un publicador.

**Horario.** Por ahora se usa el horario estándar de VIVE BIEN: lunes a viernes de 9:00 a 18:00 y sábado de 10:00 a 14:00, con visitas de 1 hora y confirmación manual. Todavía no puedes editar tu propio horario.

Las visitas que **tú** pides como cliente no están aquí: están en «Mis visitas».$c$,'PUBLICADO','parcial',
 'Pedir visitas en línea todavía no está activo: por ahora no llegan citas nuevas. El horario propio todavía no se puede editar.',2),
('publicadores','mis-visitas-como-publicador','Mis visitas: las que tú pides como cliente','Tu agenda como cliente, separada de las citas recibidas.',
 $c$Un publicador conserva todo lo de un cliente. Si tú pides visitar una propiedad de otra persona, esa visita aparece en **Mis visitas**, en tu portal, igual que para cualquier cliente.

**No se mezcla** con «Citas recibidas»: «Mis visitas» son las que **tú** pediste; «Citas recibidas» son las que piden **a tus propiedades**.

No puedes pedir una visita a una propiedad tuya.$c$,'PUBLICADO','parcial',
 'Pedir visitas en línea todavía no está activo, así que por ahora «Mis visitas» puede estar vacío.',3),
('administracion','permisos-de-citas-y-citas-en-linea','Permisos de citas y estado de las citas en línea','Cinco permisos, y un interruptor global que hoy está apagado.',
 $c$Las citas de un publicador se administran con cinco permisos independientes: recibir, aceptar, rechazar, reprogramar y cancelar. «Recibir citas» es la puerta: sin ella, las otras cuatro quedan apagadas.

**Valores por defecto.** El publicador normal los tiene apagados; el asociado los tiene encendidos.

**Las citas en línea están desactivadas en todo el sitio.** Mientras esa función global siga apagada, no se crea ninguna cita para nadie. La pantalla de permisos lo avisa con el mensaje «Las citas en línea están desactivadas»: los permisos de citas se guardan, pero no tendrán efecto hasta que la función se active.

**Si el publicador no recibe citas,** las visitas a sus propiedades no se pueden agendar en línea, y no se reasignan a otra persona.

Cuando atiende una cita, el publicador no ve los datos del interesado salvo que tengas encendido ese permiso aparte.$c$,'PUBLICADO','parcial',
 'La función global de citas en línea está desactivada; mientras lo esté, estos permisos no producen citas.',2);

update public.knowledge_articles a
   set titulo = n.titulo, resumen = n.resumen, cuerpo = n.cuerpo, estado = n.estado,
       estado_producto = n.ep, aviso = n.aviso, prioridad = n.prioridad,
       publicado_por = case when n.estado = 'BORRADOR' then null else a.publicado_por end,
       publicado_en  = case when n.estado = 'BORRADOR' then null else a.publicado_en end,
       actualizado_en = now()
  from _ant74 n, public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = n.cat and a.slug = n.slug;

-- 3 · fuentes: fuera las que añadió la 74, de vuelta las que retiró
delete from public.knowledge_article_sources where version_fuente = 'citas-v2-6-nov-2026';

insert into public.knowledge_article_sources (articulo_id, tipo, clave, version_fuente)
select a.id, f.tipo, f.clave, f.ver
from public.knowledge_articles a
join public.knowledge_categories c on c.id = a.categoria_id
join (values
  ('consultas-y-visitas','como-se-confirma-una-visita','api','/api/citas/accion', 'V-1.1.94'::text),
  ('consultas-y-visitas','cancelar-o-reprogramar','api','/api/citas/accion', 'V-1.1.94'),
  ('consultas-y-visitas','mi-historial-de-visitas','route','/portal/visitas', 'V-1.1.94'),
  ('publicadores','mis-visitas-como-publicador','route','/portal/visitas', 'ADR-0013'),
  ('publicadores','citas-recibidas','product','citas.ajustes.HORARIO_POR_DEFECTO', 'ADR-0013')
) as f(cat, art, tipo, clave, ver) on f.art = a.slug and f.cat = c.slug
on conflict (articulo_id, tipo, clave) do nothing;

-- 4 · frases (inversas exactas de las sustituciones de la 74)
update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'cada vez que pulsas un botón: no basta', 'cada vez que pulsas un botón o abres un enlace de un correo: no basta'), actualizado_en = now()
  from public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'publicadores' and a.slug = 'permisos-de-citas'
   and a.cuerpo like '%cada vez que pulsas un botón: no basta%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'Lo que sí ves son las **citas** de tus propiedades: las atiende VIVE BIEN y, si eres asociado, también tú (mira «Quién atiende las citas de mis propiedades»).',
                        'Lo que sí recibes son las **citas** de tus propiedades, si tu cuenta tiene el permiso de recibir citas (mira «Citas recibidas»).'),
       actualizado_en = now()
  from public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'publicadores' and a.slug = 'solicitudes-de-tus-propiedades'
   and a.cuerpo like '%Lo que sí ves son las **citas** de tus propiedades%';

update public.knowledge_articles a
   set cuerpo = replace(replace(a.cuerpo, 'los avisos de tus citas', 'los avisos de tus visitas'), 'los avisos de citas', 'los avisos de visitas'),
       aviso = replace(a.aviso, 'los avisos de citas dependen', 'los avisos de visitas dependen'),
       actualizado_en = now()
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias'
   and (a.cuerpo like '%los avisos de tus citas%' or a.cuerpo like '%los avisos de citas%' or a.aviso like '%los avisos de citas dependen%');

-- categoría «Consultas y citas» → su nombre y descripción anteriores
update public.knowledge_categories
   set nombre = 'Consultas y visitas', descripcion = 'Enviar consultas, solicitar información y agendar visitas.'
 where slug = 'consultas-y-visitas' and nombre = 'Consultas y citas';

commit;
