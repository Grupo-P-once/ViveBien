-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 74 — Centro de Ayuda: CITAS v2 (6-nov-2026)
-- Va DESPUÉS de 70–73 (modelo v2 de citas) y del código de esta rama. Idempotente. Reversa: 74-ayuda-citas.REVERTIR.sql
--
-- ─────────────────────────────────────────────────────────────
-- ESTADO: PREPARADA. Aplicada SOLO en STAGING (vivebien-staging). En PRODUCCIÓN: NO aplicada; la aplica el dueño DESPUÉS de desplegar el código.
--
-- QUÉ HACE
--   · Corrige los artículos de «Consultas y visitas» que ya no son ciertos: «Mis visitas» ahora es «Citas» (/portal/citas); la
--     solicitud NO aparta el horario hasta que se confirma; los correos NO traen botones de acción (todo se completa dentro, con sesión);
--     vocabulario Pendiente · Confirmada · Reprogramación solicitada · Rechazada · Cancelada · Realizada · No asistió · Expirada;
--     el cliente cancela hasta 2 h antes; reprogramar = pedir otro horario y la cita vigente se conserva; recordatorios a 24 h y 1 h; .ics.
--   · Añade artículos nuevos (estados, correos, datos compartidos, calendario/agenda) y los de publicador/asociado/propietario y del equipo.
--   · Corrige dos frases viejas de artículos de 29 y 30 (el horario propio YA se edita; las citas de un publicador las atiende VIVE BIEN
--     y él las consulta; el permiso se comprueba al pulsar un botón, no al abrir un enlace de un correo).
--
-- POR QUÉ «parcial»: `citasEnLinea` está APAGADO en producción y en staging. Mientras lo esté, los artículos lo dicen con `estado_producto = 'parcial'`
-- y un `aviso` (el CHECK de la tabla lo exige). Al encender el flag se aplica `74b-ayuda-citas-activar.sql`.
--
-- FUNCIONA EN LOS DOS ENTORNOS: staging solo tiene 2 categorías y 5 artículos de ayuda (el contenido completo vive en producción); por eso las
-- categorías se crean si faltan y los artículos se insertan con «actualizar si existe». Mismo estado final en ambos.
--
-- FORMATO: el visor parte el cuerpo en párrafos (línea en blanco) y SOLO entiende **negritas** y enlaces [texto](/ruta). Sin tablas, listas ni
-- encabezados: cada punto es su propio párrafo. Los cuerpos van entre $c$ … $c$.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ── Categorías (se crean si faltan; no se tocan slugs) ──────────────────
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

-- ══ CLIENTE · categoría «consultas-y-visitas» (ámbito público) ═══════════

('consultas-y-visitas','como-solicitar-una-visita','¿Cómo agendo una cita para ver una propiedad?',
 'La tarjeta «Agenda una cita» de la ficha, paso a paso.',
 $c$Abre la ficha de la propiedad que te interesa. Arriba de la campana de «Avisarme cuando baje de precio» está la tarjeta **«Agenda una cita»**: tócala y se despliegan los días y las horas disponibles. Elige una, marca la casilla que nos autoriza a compartir tu nombre y tu teléfono con quien atiende la visita y pulsa **Enviar solicitud**.

**Hace falta una cuenta.** Si no tienes sesión, la tarjeta te lleva a entrar o a crear tu cuenta; hasta entonces no se guarda nada.

**Solo se ofrecen horarios reales.** Los días y las horas salen de la agenda de quien atiende la propiedad y ya descuentan las citas confirmadas y los bloqueos.

**Tu solicitud no aparta el horario todavía.** Queda **pendiente** y el horario solo se aparta cuando la cita queda **confirmada**. Si dos personas piden la misma hora, la primera confirmación válida se la queda, y a la otra se le avisa y se le ofrecen otros horarios.

**Pides un horario por solicitud.** Si quieres otro, haz otra solicitud.

Al enviar verás **«Solicitud enviada»**. La encuentras en [Citas](/portal/citas) y te llega un correo. Cuando respondan (confirmada, rechazada u otro horario) te avisamos en la app y por correo.$c$,
 'publica','PUBLICADO','parcial','Agendar citas en línea todavía no está activo para todos. Mientras tanto, escríbenos por WhatsApp y te ayudamos a agendar.',1),

('consultas-y-visitas','como-se-confirma-una-visita','¿Cómo se confirma mi cita?',
 'De pendiente a confirmada, y qué más puede pasar.',
 $c$Una cita nueva queda **pendiente**. Quien atiende la propiedad la revisa y puede:

**Confirmarla.** Pasa a **confirmada**, el horario queda apartado y recibes un correo con el archivo para tu calendario.

**Rechazarla.** Pasa a **rechazada** y ves el motivo; puedes pedir otro horario.

**Proponerte otro horario.** La cita pasa a **reprogramación solicitada**: la propuesta no cambia nada hasta que tú la aceptes o la rechaces desde [Citas](/portal/citas).

**Si nadie responde a tiempo,** la solicitud pasa a **expirada** y te avisamos para que pidas otra.

**Si otra persona se queda con ese horario antes,** te avisamos que el horario ya no está disponible y te sugerimos otros.

**Todo se completa dentro de la app, con tu sesión.** Los correos no traen botones que cambien algo: solo un enlace para abrir tu cita.$c$,
 'publica','PUBLICADO','parcial','Agendar citas en línea todavía no está activo para todos. Mientras tanto, escríbenos por WhatsApp y te ayudamos a agendar.',1),

('consultas-y-visitas','cancelar-o-reprogramar','Cancelar o reprogramar una cita',
 'Hasta 2 horas antes, y qué hacer después.',
 $c$**Cancelar.** En [Citas](/portal/citas) abre la cita y pulsa **Cancelar cita**. Puedes hacerlo **hasta 2 horas antes** de la hora acordada. Si faltan menos de 2 horas ya no se puede desde la app: **contacta a VIVE BIEN** con los datos de la página de [Contacto](/contacto). Retirar una solicitud que todavía está pendiente no tiene ese límite.

**Reprogramar.** Reprogramar es **pedir otro horario**, no mover la cita: tu cita actual **sigue vigente** hasta que el nuevo horario quede confirmado. Si cambias de idea, puedes **retirar tu propuesta**.

**Si la propuesta la hace quien atiende,** tú decides: **aceptar el nuevo horario** o **rechazar el cambio** (y la cita sigue como estaba).

Avisa en cuanto lo sepas: del otro lado hay alguien que aparta ese hueco y se desplaza.$c$,
 'publica','PUBLICADO','parcial','Agendar citas en línea todavía no está activo para todos. Mientras tanto, escríbenos por WhatsApp y te ayudamos a agendar.',2),

('consultas-y-visitas','mi-historial-de-visitas','Mi historial de citas',
 'Lo que ya pasó.',
 $c$En [Citas](/portal/citas), la pestaña **Historial** reúne las citas que ya pasaron o se cerraron: **realizada**, **no asistió**, **cancelada**, **rechazada** y **expirada**. Sirve para recordar qué viste y cuándo.

La pestaña **Agenda** muestra lo que viene, ordenado por día. Puedes filtrar por estado y por propiedad.$c$,
 'publica','PUBLICADO','parcial','Agendar citas en línea todavía no está activo para todos. Mientras tanto, escríbenos por WhatsApp y te ayudamos a agendar.',2),

('consultas-y-visitas','recordatorios-de-visita','Recordatorios de tu cita',
 'Un correo 24 horas antes y otro 1 hora antes.',
 $c$Te mandamos un correo **24 horas antes** y otro **1 hora antes** de cada cita **confirmada**.

Si el horario cambia, los recordatorios se vuelven a programar para la hora nueva. Si la cita se cancela o ya no está vigente, los que faltaban no se mandan. Cada recordatorio se manda **una sola vez**, aunque el sistema tenga que reintentarlo.

Son correos de servicio, no promocionales, y no cambian nada por sí solos: sirven para abrir tu cita en [Citas](/portal/citas).$c$,
 'publica','PUBLICADO','parcial','Agendar citas en línea todavía no está activo para todos, así que por ahora no se envían recordatorios de citas.',3),

('consultas-y-visitas','google-calendar','Añadir la cita a tu calendario',
 'El archivo .ics y el enlace a Google Calendar.',
 $c$Cuando una cita está **confirmada** puedes añadirla a tu calendario de dos maneras: descargando el archivo **.ics** desde el detalle de la cita en [Citas](/portal/citas) (sirve para Google Calendar, Outlook, Apple Calendar y otros), o con el enlace a Google Calendar del correo de confirmación.

Es una copia que tú guardas: **no hay sincronización automática**. Si la cita cambia de hora o se cancela, el calendario no se actualiza solo; te llega el correo y puedes volver a descargar el archivo.$c$,
 'publica','PUBLICADO','parcial','La sincronización automática con Google o Outlook todavía no existe; hoy solo se descarga el archivo .ics.',4),

('consultas-y-visitas','estados-de-una-cita','Los estados de una cita',
 'Qué significa cada etiqueta.',
 $c$**Pendiente.** Pediste la cita y todavía no la confirman. No aparta el horario.

**Confirmada.** Acordada: el horario queda apartado y llegan los recordatorios.

**Reprogramación solicitada.** Alguien propuso otro horario. La cita actual sigue vigente hasta que la propuesta se acepte.

**Rechazada.** No se aceptó la solicitud; ves el motivo.

**Cancelada.** Se canceló antes de que ocurriera; si hubo motivo, lo ves.

**Realizada.** La visita ocurrió.

**No asistió.** La visita estaba confirmada y la persona no llegó.

**Expirada.** Nadie respondió a la solicitud a tiempo.

Todas se ven en [Citas](/portal/citas). El color ayuda, pero cada estado siempre se escribe con texto.$c$,
 'publica','PUBLICADO','parcial','Agendar citas en línea todavía no está activo para todos. Mientras tanto, escríbenos por WhatsApp y te ayudamos a agendar.',2),

('consultas-y-visitas','correos-de-tus-citas','Qué correos recibes de tus citas',
 'Qué te avisamos y por qué ningún correo cambia nada por sí solo.',
 $c$Por cada cita te escribimos cuando pasa algo que importa: **solicitud enviada**, **cita confirmada**, **solicitud rechazada**, **te propusieron otro horario**, **cita cancelada**, **la solicitud expiró**, **el horario ya no está disponible** (con otros horarios sugeridos) y los **recordatorios** de 24 horas y de 1 hora antes.

**Ningún correo trae botones para confirmar, aceptar o cancelar.** Cada uno trae un enlace para abrir tu cita en [Citas](/portal/citas); ahí entras con tu sesión y haces lo que necesites. Los correos lo dicen: no cambian nada por sí solos.

Son **correos de servicio**: los necesitas para seguir tu cita. No son promocionales. Más sobre los correos de VIVE BIEN y tus preferencias en el [Centro de Ayuda](/ayuda).$c$,
 'publica','PUBLICADO','parcial','Los correos de citas dependen de que las citas en línea estén activas; todavía no lo están.',2),

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

-- ══ PUBLICADOR / ASOCIADO / PROPIETARIO · categoría «publicadores» (ámbito publicador) ═══

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

('publicadores','mi-disponibilidad-para-citas','Mi disponibilidad para citas',
 'Tu horario, tus reglas y tus bloqueos.',
 $c$Si atiendes citas, en [Citas](/publicador/citas) tienes la pestaña **Mi disponibilidad**. Ahí defines, en hora de León:

**Horario semanal.** Los bloques de cada día en los que recibes visitas (puedes poner más de uno por día).

**Duración de la visita** (de 15 a 240 minutos) y **tiempo de traslado** entre visitas (de 0 a 120).

**Aviso mínimo** (hasta 168 horas) y **días hacia adelante** que se pueden agendar (de 1 a 180).

**Cómo se confirman:** tú confirmas cada solicitud, o se confirman al pedirlas.

**Bloqueos** (vacaciones, festivos, pausas), con un motivo opcional.

Los horarios que ven los clientes salen de aquí, menos tus citas confirmadas y tus bloqueos. Guardar reemplaza todo en un solo paso y queda registrado. Mientras no guardes la tuya se usa un horario por defecto, que debes revisar.$c$,
 'publicador','PUBLICADO','parcial','Agendar citas en línea todavía no está activo: tu disponibilidad se guarda pero aún no se ofrece a clientes.',3),

-- ══ EQUIPO · categoría «administracion» (ámbito administrativo) ═══════════

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

-- ── Artículos (inserta o actualiza; conserva la firma original si ya existía) ──
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

-- ── Frases viejas en artículos de OTRAS migraciones (solo si existen) ───────
-- Cada UPDATE reemplaza una frase exacta; repetirlo no cambia nada (ya no la encuentra).
update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'cada vez que pulsas un botón o abres un enlace de un correo', 'cada vez que pulsas un botón'),
       actualizado_en = now()
  from public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'publicadores' and a.slug = 'permisos-de-citas'
   and a.cuerpo like '%o abres un enlace de un correo%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'Lo que sí recibes son las **citas** de tus propiedades, si tu cuenta tiene el permiso de recibir citas (mira «Citas recibidas»).',
                        'Lo que sí ves son las **citas** de tus propiedades: las atiende VIVE BIEN y, si eres asociado, también tú (mira «Quién atiende las citas de mis propiedades»).'),
       actualizado_en = now()
  from public.knowledge_categories c
 where c.id = a.categoria_id and c.slug = 'publicadores' and a.slug = 'solicitudes-de-tus-propiedades'
   and a.cuerpo like '%Lo que sí recibes son las **citas** de tus propiedades%';

update public.knowledge_articles a
   set cuerpo = replace(replace(a.cuerpo, 'los avisos de tus visitas', 'los avisos de tus citas'), 'los avisos de visitas', 'los avisos de citas'),
       aviso = replace(a.aviso, 'los avisos de visitas dependen', 'los avisos de citas dependen'),
       actualizado_en = now()
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias'
   and (a.cuerpo like '%los avisos de tus visitas%' or a.cuerpo like '%los avisos de visitas%' or a.aviso like '%los avisos de visitas dependen%');

-- ── Fuentes · de dónde salió cada artículo ──────────────────────────────
-- Se retiran las fuentes que ya no son ciertas (la ruta vieja /portal/visitas ahora solo redirige; /api/citas/accion ya no existe como acción por correo).
delete from public.knowledge_article_sources s
 using public.knowledge_articles a, public.knowledge_categories c
 where s.articulo_id = a.id and c.id = a.categoria_id
   and ((c.slug = 'consultas-y-visitas' and a.slug in ('como-se-confirma-una-visita','cancelar-o-reprogramar') and s.tipo = 'api' and s.clave = '/api/citas/accion')
     or (c.slug = 'consultas-y-visitas' and a.slug = 'mi-historial-de-visitas' and s.tipo = 'route' and s.clave = '/portal/visitas')
     or (c.slug = 'publicadores' and a.slug = 'mis-visitas-como-publicador' and s.tipo = 'route' and s.clave = '/portal/visitas')
     or (c.slug = 'publicadores' and a.slug = 'citas-recibidas' and s.tipo = 'product' and s.clave = 'citas.ajustes.HORARIO_POR_DEFECTO'));

insert into public.knowledge_article_sources (articulo_id, tipo, clave, version_fuente)
select a.id, f.tipo, f.clave, 'citas-v2-6-nov-2026'
from public.knowledge_articles a
join public.knowledge_categories c on c.id = a.categoria_id
join (values
  ('consultas-y-visitas','como-solicitar-una-visita','component','AgendarCita'),
  ('consultas-y-visitas','como-solicitar-una-visita','api','/api/citas'),
  ('consultas-y-visitas','como-solicitar-una-visita','api','/api/citas/disponibilidad'),
  ('consultas-y-visitas','como-solicitar-una-visita','product','flags.citasEnLinea'),
  ('consultas-y-visitas','como-se-confirma-una-visita','route','/portal/citas'),
  ('consultas-y-visitas','como-se-confirma-una-visita','api','/api/citas/[id]/transicion'),
  ('consultas-y-visitas','como-se-confirma-una-visita','product','citas.estados.accionesDisponibles'),
  ('consultas-y-visitas','cancelar-o-reprogramar','api','/api/citas/[id]/transicion'),
  ('consultas-y-visitas','cancelar-o-reprogramar','product','citas.estados.HORAS_MINIMAS_CLIENTE'),
  ('consultas-y-visitas','mi-historial-de-visitas','route','/portal/citas'),
  ('consultas-y-visitas','recordatorios-de-visita','migration','70-citas-v2'),
  ('consultas-y-visitas','recordatorios-de-visita','api','/api/citas/tareas'),
  ('consultas-y-visitas','recordatorios-de-visita','test','tests/citas-tareas.test.ts'),
  ('consultas-y-visitas','google-calendar','api','/api/citas/[id]/ics'),
  ('consultas-y-visitas','estados-de-una-cita','product','citas.estados.ETIQUETA_ESTADO'),
  ('consultas-y-visitas','estados-de-una-cita','component','AppointmentStatus'),
  ('consultas-y-visitas','correos-de-tus-citas','product','citas.correos.plantilla'),
  ('consultas-y-visitas','correos-de-tus-citas','test','tests/citas-correos.test.ts'),
  ('consultas-y-visitas','datos-que-se-comparten-en-una-cita','component','citas.vista.recortar'),
  ('consultas-y-visitas','datos-que-se-comparten-en-una-cita','legal','/privacidad'),
  ('consultas-y-visitas','datos-que-se-comparten-en-una-cita','legal','/terminos'),
  ('consultas-y-visitas','calendario-y-agenda-de-mis-citas','component','PanelCitas'),
  ('consultas-y-visitas','calendario-y-agenda-de-mis-citas','route','/portal/citas'),
  ('consultas-y-visitas','calendario-y-agenda-de-mis-citas','api','/api/citas/ics'),
  ('publicadores','citas-recibidas','route','/publicador/citas'),
  ('publicadores','citas-recibidas','api','/api/citas'),
  ('publicadores','citas-recibidas','api','/api/citas/[id]/transicion'),
  ('publicadores','citas-recibidas','test','tests/publicador-citas.test.ts'),
  ('publicadores','mis-visitas-como-publicador','route','/publicador/citas'),
  ('publicadores','mis-visitas-como-publicador','product','citas.estados.estadoInicialDeCita'),
  ('publicadores','quien-atiende-las-citas-de-mis-propiedades','product','citas.servicio.responsableDeCitas'),
  ('publicadores','quien-atiende-las-citas-de-mis-propiedades','test','tests/citas-v2.test.ts'),
  ('publicadores','mi-disponibilidad-para-citas','api','/api/citas/ajustes'),
  ('publicadores','mi-disponibilidad-para-citas','component','ConfigDisponibilidad'),
  ('publicadores','mi-disponibilidad-para-citas','migration','73-citas-guardar-agenda'),
  ('administracion','permisos-de-citas-y-citas-en-linea','product','flags.citasEnLinea'),
  ('administracion','permisos-de-citas-y-citas-en-linea','product','citas.servicio.responsableDeCitas'),
  ('administracion','gestionar-las-citas-del-equipo','route','/admin/citas'),
  ('administracion','gestionar-las-citas-del-equipo','route','/admin/citas/disponibilidad'),
  ('administracion','gestionar-las-citas-del-equipo','api','/api/citas/ics'),
  ('administracion','gestionar-las-citas-del-equipo','api','/api/citas/tareas'),
  ('administracion','gestionar-las-citas-del-equipo','migration','72-citas-tareas-firma')
) as f(cat, art, tipo, clave) on f.art = a.slug and f.cat = c.slug
on conflict (articulo_id, tipo, clave) do nothing;

commit;
