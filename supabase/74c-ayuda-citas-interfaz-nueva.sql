-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 74c — Centro de Ayuda: CITAS v2, texto de la INTERFAZ NUEVA (aplicada en STAGING el 7-nov-2026 como `ayuda_citas_74c_interfaz_nueva`)
-- Va DESPUÉS de 74 y ANTES de 74b y 77 (orden aplicado en staging: 74 → 74c → 75 → 76 → 74b → 77). Idempotente (inserta o actualiza). Reversa: 74c-ayuda-citas-interfaz-nueva.REVERTIR.sql
--
-- ESTADO: versionada el 10-nov-2026 a partir de la sentencia EXACTA guardada en `supabase_migrations.schema_migrations` de staging (md5 de la sentencia
-- a550f827c3fa5b2bc7d13cb964377ed0, 14 260 caracteres). Antes NO existía como archivo del repo: Producción no la habría recibido. En PRODUCCIÓN: NO aplicada.
--
-- Qué hace: reescribe 7 artículos de ayuda con el texto de la interfaz nueva (calendario/agenda/historial, tarjetas que filtran, Próximas citas, Acciones rápidas,
-- «Mis visitas», disponibilidad) y añade las fuentes (`/api/citas/ics`). NOTA: el texto de 'datos-que-se-comparten-en-una-cita' y 'quien-atiende-las-citas-de-mis-propiedades'
-- es el de ANTES de las decisiones del 9-nov-2026; la migración 77 (y la 78) lo corrigen DESPUÉS. No cambiar el orden.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ===INICIO-74c===
insert into public.knowledge_categories (slug, nombre, descripcion, icono, ambito, orden) values
  ('consultas-y-visitas', 'Consultas y citas', 'Enviar consultas, solicitar información y agendar citas para ver una propiedad.', 'calendar', 'publica', 5),
  ('publicadores',        'Publicadores',      'Cargar, editar y administrar propiedades.',                                         'file',     'publicador', 9),
  ('administracion',      'Administración',    'Procedimientos internos del equipo de VIVE BIEN.',                                  'lock',     'administrativa', 10)
on conflict (slug) do update set
  nombre = excluded.nombre, descripcion = excluded.descripcion,
  icono = excluded.icono, ambito = excluded.ambito, orden = excluded.orden;

create temporary table if not exists _art74 (
  cat text, slug text, titulo text, resumen text, cuerpo text,
  ambito text, estado text, ep text, aviso text, prioridad int
) on commit delete rows;

insert into _art74 values

('consultas-y-visitas','datos-que-se-comparten-en-una-cita','¿Qué datos se comparten cuando agendo una cita?',
 'Qué ve cada persona de tu solicitud.',
 $c$Para agendar usamos el nombre y el teléfono de tu cuenta (si te falta el teléfono, te lo pedimos al agendar), tu correo, las notas que escribas y el horario que elijas. Al enviar la solicitud marcas una casilla que nos autoriza a **compartir tu nombre y tu teléfono con quien atiende la visita**.

**Quién atiende la visita** puede ser el equipo de VIVE BIEN o, en propiedades de un asociado, el propio asociado.

**El equipo de VIVE BIEN** ve tus datos completos para atenderte.

**Un asociado que atiende la visita a su propiedad** ve lo necesario para coordinarla: **tu nombre, tu teléfono y las notas que escribiste para la visita**. **No ve tu correo**, salvo que VIVE BIEN le haya dado ese permiso aparte, ni las notas internas del equipo.

**Un publicador dueño de la propiedad** (cuando la visita la coordina VIVE BIEN) solo ve que hay una cita y su estado, **sin tu nombre, teléfono, correo ni notas**.

**Tú** ves siempre tus propios datos y solo tus solicitudes.

Tus datos se tratan como explica el [Aviso de Privacidad](/privacidad), y el uso del sitio se rige por los [Términos y condiciones](/terminos). Para ejercer tus derechos sobre tus datos (acceso, rectificación, cancelación u oposición) usa los datos de contacto que ahí aparecen.$c$,
 'publica','PUBLICADO','parcial','Agendar citas en línea todavía no está activo para todos.',2),

('consultas-y-visitas','calendario-y-agenda-de-mis-citas','Cómo ver mis citas: calendario, agenda e historial',
 'Las tres vistas de la pantalla Citas.',
 $c$En [Citas](/portal/citas) arriba ves cuatro indicadores con su ícono: **citas programadas**, **confirmadas**, **pendientes por confirmar** y **cambios por responder**. Esos cuadros **también filtran**: tócalos y la lista muestra solo esas citas; tócalos otra vez para quitar el filtro. Debajo eliges cómo verlas:

**Agenda.** Lo que viene, por día. Es la vista más cómoda en el teléfono.

**Calendario.** Por mes, semana o día, en hora de León, con el día de hoy marcado. Cada cita es un recuadro de color según su **estado**: verde si está confirmada, ámbar si está pendiente o tiene un cambio por responder; el estado siempre se escribe también con texto.

**Historial.** Lo que ya pasó o se cerró.

El botón **Nueva cita** te lleva al catálogo de propiedades: la cita se pide desde la ficha de la propiedad, con la tarjeta **«Agenda una cita»**.

A un lado (o debajo, en el teléfono) ves **Próximas citas**, con la foto de la propiedad, y **Acciones rápidas**: **Agendar una visita**, **Descargar mi calendario** (un archivo .ics con tus citas confirmadas de los próximos 100 días, para Google Calendar, Outlook o Apple Calendar) y **Exportar a CSV** lo que estás viendo.

Puedes filtrar por estado y propiedad. Si eres cliente, todas las citas son **tus** visitas: no se distingue entre tipos ni aparece «horario ocupado». La pantalla se actualiza sola cada 45 segundos aproximadamente y cuando vuelves a ella, y también con el botón **Actualizar**. Tocar una cita abre su detalle, con el historial de cambios y las acciones que puedes hacer.$c$,
 'publica','PUBLICADO','parcial','Agendar citas en línea todavía no está activo para todos.',3),

('publicadores','citas-recibidas','Citas de tus propiedades',
 'Qué ves y qué puedes hacer según tu cuenta.',
 $c$En [Citas](/publicador/citas) las pestañas dependen de tu cuenta.

**Si eres publicador:**

**Visitas a mis propiedades.** Las visitas a tus propiedades que **coordina VIVE BIEN**. Aquí **solo las consultas**: ves propiedad, fecha, hora y estado, pero no puedes confirmar, rechazar ni cancelar, y **no ves nombre, teléfono, correo ni otros datos del cliente**.

**Mis citas.** Las visitas que **tú** solicitas para ir a ver otras propiedades; esas sí las administras tú: puedes pedir otro horario o cancelarlas.

**Si eres asociado** (tu cuenta atiende citas):

**Visitas a mis propiedades.** Las que **tú atiendes**: puedes confirmarlas, rechazarlas con motivo, proponer otro horario y cancelarlas, según los permisos de cada acción. De la persona interesada ves **su nombre, su teléfono y las notas que escribió para la visita**, que es lo necesario para atenderla; **no ves su correo** (salvo el permiso «ver datos del interesado»), ni las notas internas del equipo, ni el estado de Google.

**Coordinadas por VIVE BIEN.** Las visitas a tus propiedades que coordina el equipo: solo lectura y **sin datos del cliente**.

**Mis citas.** Las que tú solicitaste para visitar otras propiedades.

**Mi disponibilidad.** Tu horario para recibir citas (mira «Mi disponibilidad para citas»).

Solo ves lo tuyo: nunca las citas de las propiedades de otro publicador. Los correos y avisos de cada cita te llegan con el nombre y el teléfono de la persona interesada solo si tu cuenta atiende esa cita (asociado o equipo); si eres solo el dueño, sin datos personales.$c$,
 'publicador','PUBLICADO','parcial','Agendar citas en línea todavía no está activo: por ahora no entran citas nuevas.',2),

('publicadores','mis-visitas-como-publicador','Mis citas: las que tú pides como cliente',
 'Tu agenda como cliente, separada de las citas de tus propiedades.',
 $c$Un publicador conserva todo lo de un cliente. Si tú agendas para ir a ver una propiedad de otra persona, esa cita aparece en la pestaña **Mis citas** de [Citas](/publicador/citas) y también en [Citas](/portal/citas) de tu portal, igual que para cualquier cliente.

**No se mezcla** con las citas de tus propiedades: «Mis citas» son las que **tú** pediste y las administras tú; «Visitas a mis propiedades» (y, si eres asociado, «Coordinadas por VIVE BIEN») son las que piden **a tus propiedades**.

Si eres el **responsable** de la propiedad y te agendas a ti mismo en un horario disponible, la cita queda **confirmada** sin pedir permiso a nadie. Si la propiedad la atiende otra persona, queda **pendiente** hasta que ella responda.$c$,
 'publicador','PUBLICADO','parcial','Agendar citas en línea todavía no está activo, así que por ahora «Mis citas» puede estar vacío.',3),

('publicadores','quien-atiende-las-citas-de-mis-propiedades','Quién atiende las citas de mis propiedades',
 'El responsable de cada propiedad y qué ve el dueño.',
 $c$Cada propiedad tiene un **responsable de sus citas**. Se decide así: primero, la persona a la que un administrador haya **asignado** la propiedad; si no hay asignada, su **dueño**, cuando puede atender citas (el equipo de VIVE BIEN, o un asociado con el permiso «recibir citas»); y si el dueño es un **publicador**, las atiende **VIVE BIEN**, a través del responsable del equipo.

Si nadie puede atender una propiedad, **no se puede agendar en línea**: el sistema no se la asigna a otra persona al azar.

**Si eres publicador,** tus propiedades las atiende VIVE BIEN y tú las **consultas** en la pestaña «Visitas a mis propiedades» de [Citas](/publicador/citas), sin acciones. **Si eres asociado,** administras las de tus propiedades.

**Qué datos ves de la persona interesada.** Si **atiendes** la cita (eres asociado responsable), ves lo necesario para coordinarla: **nombre, teléfono y las notas que ella escribió**; **no ves su correo** (salvo el permiso «ver datos del interesado») ni las notas internas del equipo ni el estado de Google. Si eres **publicador** y la visita la coordina VIVE BIEN, no ves ningún dato del cliente.$c$,
 'publicador','PUBLICADO','parcial','Agendar citas en línea todavía no está activo: por ahora no entran citas nuevas.',2),

('administracion','permisos-de-citas-y-citas-en-linea','Permisos de citas y estado de las citas en línea',
 'Cinco permisos, y un interruptor global que hoy está apagado.',
 $c$Las citas de un publicador se administran con cinco permisos independientes: recibir, aceptar, rechazar, reprogramar y cancelar. «Recibir citas» es la puerta: sin ella, las otras cuatro quedan apagadas. Cada permiso se comprueba en el servidor cuando se pulsa el botón; no basta con que el botón se vea.

**Valores por defecto.** El publicador normal los tiene apagados; el asociado los tiene encendidos.

**Las citas en línea están desactivadas en todo el sitio.** Mientras esa función global («citas en línea») siga apagada, no se crea ninguna cita para nadie. La pantalla de permisos lo avisa con el mensaje «Las citas en línea están desactivadas»: los permisos se guardan, pero no tendrán efecto hasta que la función se active.

**Quién atiende las citas de un publicador.** Las de un **publicador** las atiende VIVE BIEN (el responsable del equipo configurado); él las consulta sin acciones. Solo cambia si un administrador **asigna** la propiedad a otra persona que pueda atender citas. Si no hay responsable del equipo configurado, esas propiedades no se pueden agendar.

**Datos de la persona interesada.** Quien atiende una cita (equipo o asociado) ve nombre, teléfono y las notas que ella escribió; el **correo** de la persona es un permiso aparte («ver datos del interesado»), apagado por defecto. Las notas internas y el estado de Google son solo del equipo. Un publicador cuyas propiedades coordina VIVE BIEN no ve ningún dato del cliente.$c$,
 'administrativa','PUBLICADO','parcial','La función global de citas en línea está desactivada; mientras lo esté, estos permisos no producen citas.',2),

('administracion','gestionar-las-citas-del-equipo','Gestionar las citas desde el panel',
 'Confirmar, rechazar, proponer horario, disponibilidad y resultados.',
 $c$En **Citas** del panel de administración ves las citas de todos los responsables: arriba cuatro indicadores (**citas programadas**, **confirmadas**, **pendientes por confirmar** y **cambios por responder**; los cuadros **filtran** al tocarlos) y un aviso cuando hay solicitudes con **horario ocupado**; debajo las pestañas **Calendario**, **Agenda** e **Historial**, con filtros por estado, tipo, propiedad y responsable, y el filtro **«Mis visitas»**, que deja solo las citas que tú mismo agendaste (admin y super admin tienen sus citas personales además de las de todas las propiedades). En el calendario cada cita lleva el color de su **estado**. A un lado están **Próximas citas** (con foto) y **Acciones rápidas**: **Agendar una visita** (lleva al catálogo: la cita se pide desde la ficha), **Descargar mi calendario** (.ics de los próximos 100 días), **Exportar a CSV** lo que estás viendo y **Mi disponibilidad**.

**Confirmar.** La cita queda confirmada y aparta el horario. Si otra cita confirmada ya lo ocupa, la solicitud muestra **«Horario ocupado»** y ya no se puede confirmar: propón otro horario o recházala. Quien pierde esa carrera recibe un correo con alternativas.

**Rechazar** exige un **motivo**, que lee la persona. **Proponer otro horario** muestra solo los horarios realmente libres. **Cancelar** también pide motivo cuando lo hace el equipo.

**Después de la hora,** marca la cita como **realizada** o como **no asistió**; el resultado se puede corregir.

**Disponibilidad.** En **Disponibilidad**, desde Citas, eliges el responsable y editas su horario semanal, sus reglas y sus bloqueos.

**Lo que corre solo.** Cada minuto, la base hace expirar las solicitudes sin respuesta y manda los recordatorios de 24 horas y de 1 hora. Los fallos de envío se reintentan y quedan visibles.

**Lo que agenda el equipo para sí.** Si el responsable se agenda a sí mismo en un horario disponible, la cita queda confirmada sin autorización de otra persona; lo que se registra para un cliente espera su confirmación.$c$,
 'administrativa','PUBLICADO','parcial','La función global de citas en línea está desactivada; mientras lo esté, no entran citas nuevas.',2);

insert into public.knowledge_articles
  (categoria_id, slug, titulo, resumen, cuerpo, ambito, estado, estado_producto, aviso, prioridad,
   publicado_por, publicado_en, revisado_en)
select c.id, a.slug, a.titulo, a.resumen, a.cuerpo, a.ambito, a.estado, a.ep, a.aviso, a.prioridad,
       case when a.estado = 'PUBLICADO' then 'contenido-citas-v2-6-nov-2026' end,
       case when a.estado = 'PUBLICADO' then now() end,
       current_date
from _art74 a
join public.knowledge_categories c on c.slug = a.cat
on conflict (categoria_id, slug) do update set
  titulo = excluded.titulo, resumen = excluded.resumen, cuerpo = excluded.cuerpo,
  estado = excluded.estado, estado_producto = excluded.estado_producto, aviso = excluded.aviso,
  prioridad = excluded.prioridad, ambito = excluded.ambito,
  publicado_por = coalesce(public.knowledge_articles.publicado_por, excluded.publicado_por),
  publicado_en = coalesce(public.knowledge_articles.publicado_en, excluded.publicado_en),
  revisado_en = excluded.revisado_en, actualizado_en = now();

insert into public.knowledge_article_sources (articulo_id, tipo, clave, version_fuente)
select a.id, f.tipo, f.clave, 'citas-v2-6-nov-2026'
from public.knowledge_articles a
join public.knowledge_categories c on c.id = a.categoria_id
join (values
  ('consultas-y-visitas','calendario-y-agenda-de-mis-citas','api','/api/citas/ics'),
  ('administracion','gestionar-las-citas-del-equipo','api','/api/citas/ics')
) as f(cat, art, tipo, clave) on f.art = a.slug and f.cat = c.slug
on conflict (articulo_id, tipo, clave) do nothing;
-- ===FIN-74c===

commit;
