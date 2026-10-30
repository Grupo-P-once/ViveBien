-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 27b — Contenido inicial del Centro de Ayuda
-- V-1.1.94 · Va DESPUÉS de `27-centro-de-ayuda.sql`. Idempotente.
--
-- ─────────────────────────────────────────────────────────────
-- CADA ARTÍCULO DESCRIBE ALGO QUE SE COMPROBÓ EN EL CÓDIGO
--
-- No hay ni una frase inventada. `knowledge_article_sources` guarda de dónde
-- salió cada uno: la ruta, el componente, la API o el permiso. Esa tabla es
-- lo que permitirá, más adelante, saber qué artículos hay que revisar cuando
-- una funcionalidad cambie.
--
-- LOS QUE DESCRIBEN ALGO QUE NO EXISTE SE QUEDAN EN BORRADOR
--
-- Trece artículos hablan de fases 4 a 12 —publicador, leads, ofertas,
-- comisiones—. Se crean, porque la gente pregunta por ellas y porque así el
-- hueco queda registrado, pero **no se publican**: `estado='BORRADOR'`.
--
-- Y tres describen cosas que funcionan A MEDIAS. Esos son los peligrosos,
-- porque parecen disponibles: las alertas se ven en el portal pero no mandan
-- correo. Se publican CON aviso, que es lo que el CHECK exige.
-- ─────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════

-- ── EJECUTADO EN PRODUCCIÓN EL 30-sep-2026 ──────────────────────────────
-- Se aplicó por lotes desde el MCP de Supabase (27b categorías, 27c–27e
-- artículos, 27f fuentes) en vez de en una sola pasada: la tabla temporal de
-- abajo necesita que todo vaya en la misma transacción, y por lotes eso no
-- estaba garantizado. El RESULTADO es el mismo y está verificado: 9
-- categorías, 37 artículos (31 publicados, 6 borradores) y 38 fuentes.
-- ────────────────────────────────────────────────────────────────────────

begin;

-- ── Las nueve categorías ────────────────────────────────────────────────

insert into public.knowledge_categories (slug, nombre, descripcion, icono, ambito, orden) values
  ('buscar-propiedades',    'Buscar propiedades',    'Encontrar casas, departamentos, terrenos, locales y naves industriales.', 'home',       'publica', 1),
  ('mi-cuenta',             'Mi cuenta',             'Ingresar, crear cuenta, recuperar contraseña y seguridad.',               'user',       'publica', 2),
  ('propiedades-guardadas', 'Propiedades guardadas', 'Favoritos, búsquedas y alertas.',                                        'heart',      'publica', 3),
  ('busquedas-y-alertas',   'Búsquedas y alertas',   'Guardar una búsqueda y enterarte de lo nuevo.',                          'bell',       'publica', 4),
  ('consultas-y-visitas',   'Consultas y visitas',   'Enviar consultas, solicitar información y agendar visitas.',             'calendar',   'publica', 5),
  ('vender-o-rentar',       'Vender o rentar',       'Solicitar publicación y conocer el proceso.',                            'tag',        'publica', 6),
  ('valuador',              'Valuador',              'Entender la valuación y enviar datos.',                                  'chart',      'publica', 7),
  ('privacidad-y-seguridad','Privacidad y seguridad','Aviso de privacidad, datos y seguridad.',                                'lock',       'publica', 8),
  ('publicadores',          'Publicadores',          'Cargar, editar y administrar propiedades.',                              'file',       'publicador', 9)
on conflict (slug) do update set
  nombre = excluded.nombre, descripcion = excluded.descripcion,
  icono = excluded.icono, ambito = excluded.ambito, orden = excluded.orden;

-- ── Artículos ───────────────────────────────────────────────────────────

create temporary table _art (
  cat text, slug text, titulo text, resumen text, cuerpo text,
  ambito text, estado text, ep text, aviso text, prioridad int
) on commit drop;

insert into _art values

-- ══ Mi cuenta ══ todo comprobado en /entrar (03.07) y 03.08 ═════════════
('mi-cuenta','como-crear-tu-cuenta','¿Cómo crear una cuenta?',
 'Paso a paso para registrarte en VIVE BIEN.',
 E'Entra a **vivebienn.com/entrar** y elige la pestaña **Crear cuenta**.\n\n'
 'Puedes hacerlo de dos formas:\n\n'
 '**Con tu correo.** Escribe tu correo y una contraseña de al menos 6 caracteres. '
 'Listo: ya estás dentro.\n\n'
 '**Con Google.** Pulsa «Continuar con Google» y elige tu cuenta. No tienes que recordar otra contraseña.\n\n'
 'Da igual cuál elijas: la cuenta es la misma y puedes cambiar de método cuando quieras.',
 'publica','PUBLICADO','disponible',null,1),

('mi-cuenta','como-iniciar-sesion','¿Cómo inicio sesión?',
 'Entrar con tu correo y contraseña.',
 E'En **vivebienn.com/entrar**, pestaña **Ingresar**: tu correo, tu contraseña y «Iniciar sesión».\n\n'
 'Si el correo o la contraseña no coinciden te lo decimos, pero no te decimos cuál de los dos falló. '
 'Es a propósito: así nadie puede averiguar qué correos tienen cuenta aquí probando uno por uno.',
 'publica','PUBLICADO','disponible',null,1),

('mi-cuenta','entrar-con-google','Entrar con Google',
 'Cuándo funciona y qué hacer si no.',
 E'Pulsa **«Continuar con Google»** y elige tu cuenta. Se abre una ventana de Google; nosotros nunca vemos tu contraseña.\n\n'
 '**Si no se abre la ventana**, es tu navegador bloqueando las ventanas emergentes. Permítelas para vivebienn.com, o entra con tu correo.\n\n'
 '**Si estás dentro de otra aplicación** —Instagram, Facebook, WhatsApp— Google no deja entrar desde ahí. '
 'Abre vivebienn.com en Chrome o Safari: toca el menú (⋯) y elige «Abrir en el navegador».',
 'publica','PUBLICADO','disponible',null,1),

('mi-cuenta','olvide-mi-contrasena','Olvidé mi contraseña',
 'Cómo volver a entrar.',
 E'En la pantalla de acceso, pulsa **«¿Olvidaste tu contraseña?»** con tu correo escrito.\n\n'
 'Te llega un correo con un enlace para poner una nueva. Revisa también la carpeta de correo no deseado.\n\n'
 'Si ese correo no tiene cuenta, el mensaje que verás es el mismo. No es un error: es para que nadie pueda '
 'averiguar qué correos están registrados.',
 'publica','PUBLICADO','disponible',null,1),

('mi-cuenta','cambiar-mi-contrasena','¿Cómo cambio mi contraseña?',
 'Desde la configuración de tu cuenta.',
 E'Entra a tu portal y ve a **Configuración**. En «Cómo entras» pulsa **«Cambiar mi contraseña»**: '
 'te llega un correo con un enlace.\n\n'
 'Si entras con Google no verás ese botón, porque no hay contraseña que cambiar — tu acceso lo administras '
 'desde tu cuenta de Google.',
 'publica','PUBLICADO','disponible',null,2),

('mi-cuenta','mis-datos-de-perfil','Mis datos de perfil',
 'Qué datos guardamos de ti y cómo cambiarlos.',
 E'En **Mi perfil** puedes cambiar tu nombre, tu teléfono, tu WhatsApp y tu foto.\n\n'
 'Son los datos con los que te contactamos cuando pides informes o una visita. Los ves tú y el equipo de VIVE BIEN.\n\n'
 'Tu correo no se cambia desde ahí: es con el que entras. Si necesitas cambiarlo, escríbenos.',
 'publica','PUBLICADO','disponible',null,1),

('mi-cuenta','cerrar-sesion','Cerrar sesión',
 'Salir en este dispositivo.',
 E'En **Configuración**, pulsa **«Cerrar sesión»**. Se cierra sólo en el dispositivo donde estás; tus datos se quedan como están.',
 'publica','PUBLICADO','disponible',null,3),

-- ══ Buscar propiedades ══════════════════════════════════════════════════
('buscar-propiedades','como-buscar-una-propiedad','¿Cómo busco una propiedad?',
 'Filtrar por tipo, precio y zona.',
 E'En **Propiedades** puedes filtrar por tipo de inmueble, por precio y por zona de León.\n\n'
 'No hace falta tener cuenta para buscar ni para ver una ficha. La cuenta te sirve para guardar lo que te gusta, '
 'recibir avisos y pedir una visita.',
 'publica','PUBLICADO','disponible',null,1),

('buscar-propiedades','que-significa-cada-tipo','¿Qué significa cada tipo de propiedad?',
 'Casa, departamento, terreno, nave industrial y los demás.',
 E'Manejamos ocho tipos: **casa**, **departamento**, **terreno**, **nave industrial**, **bodega**, '
 '**local comercial**, **oficina** y **quinta**.\n\n'
 'Son los mismos que puedes elegir en «Mi búsqueda», así que lo que marques ahí encaja exactamente con lo que verás.',
 'publica','PUBLICADO','disponible',null,2),

('buscar-propiedades','como-leer-una-ficha','¿Cómo leo la ficha de una propiedad?',
 'Qué encuentras en cada anuncio.',
 E'Cada ficha tiene las fotos, la superficie, la zona, el precio y cómo contactar.\n\n'
 'El precio indica si el IVA va incluido o se suma aparte. En rentas, el importe es mensual.',
 'publica','PUBLICADO','disponible',null,2),

('buscar-propiedades','comparar-propiedades','Comparar propiedades',
 'Ver varias una al lado de otra.',
 E'Marca las propiedades que te interesen y aparecerá una barra abajo para **compararlas**. '
 'Verás sus datos en paralelo, que es mucho más fácil que ir y volver entre fichas.',
 'publica','PUBLICADO','disponible',null,3),

-- ══ Propiedades guardadas ═══════════════════════════════════════════════
('propiedades-guardadas','como-guardar-una-propiedad','¿Cómo guardo una propiedad?',
 'Aprende a guardar propiedades en tus favoritos.',
 E'Pulsa el **corazón** en la ficha o en la tarjeta. La propiedad se añade a tus guardadas y la encuentras en tu portal.\n\n'
 'Hace falta tener sesión iniciada: es lo que nos permite recordarlo la próxima vez que entres.',
 'publica','PUBLICADO','disponible',null,1),

('propiedades-guardadas','que-significa-me-interesan','¿Qué significa «me interesan»?',
 'La diferencia con las guardadas.',
 E'**Guardadas** son las que marcaste con el corazón: tu lista personal.\n\n'
 '**Me interesan** son aquellas sobre las que ya diste un paso — pediste informes o una visita. '
 'Están separadas para que no se te pierdan entre las que sólo estabas mirando.',
 'publica','PUBLICADO','disponible',null,2),

-- ══ Búsquedas y alertas ══ el caso PARCIAL: se ven, pero no mandan correo
('busquedas-y-alertas','como-guardar-una-busqueda','¿Cómo guardo una búsqueda?',
 'Para no repetir los mismos filtros cada vez.',
 E'Cuando tengas los filtros como quieres, guárdalos con un nombre. Los encuentras en **Mis búsquedas**, '
 'y con un toque vuelves a ver los resultados.',
 'publica','PUBLICADO','disponible',null,1),

('busquedas-y-alertas','como-funcionan-las-alertas','¿Cómo funcionan las alertas?',
 'Enterarte cuando aparece algo que encaja con lo que buscas.',
 E'Cuando guardas una búsqueda, marcamos las propiedades nuevas que encajan con ella. '
 'Las ves en **Mis alertas** dentro de tu portal, con el aviso de cuántas son nuevas.',
 'publica','PUBLICADO','parcial',
 'Por ahora las alertas se ven **dentro de tu portal**. Todavía no te mandamos un correo cuando hay novedades: '
 'eso llegará más adelante.',1),

('busquedas-y-alertas','que-es-mi-busqueda','¿Qué es «Mi búsqueda»?',
 'Lo que buscas, para ordenar tu inicio.',
 E'En **Mi búsqueda** dices qué buscas: si compras o rentas, qué tipos de propiedad te interesan, '
 'en qué zonas y tu presupuesto máximo.\n\n'
 'Con eso elegimos lo que te enseñamos en «Nuevas propiedades para ti». El presupuesto es opcional y sólo '
 'sirve para ordenar: no te escondemos nada.',
 'publica','PUBLICADO','disponible',null,1),

-- ══ Consultas y visitas ═════════════════════════════════════════════════
('consultas-y-visitas','que-pasa-tras-una-consulta','¿Qué pasa después de enviar una consulta?',
 'El recorrido de tu mensaje.',
 E'Tu consulta llega al equipo de VIVE BIEN y la ves en **Mis consultas**, con su estado.\n\n'
 'Te contactamos por el teléfono o el WhatsApp que tengas en tu perfil. Si están vacíos, no tenemos por dónde responderte: '
 'compruébalos en Mi perfil.',
 'publica','PUBLICADO','disponible',null,1),

('consultas-y-visitas','como-solicitar-una-visita','¿Cómo solicito una visita?',
 'Conoce cómo agendar una visita a una propiedad.',
 E'Desde la ficha de la propiedad, pide una visita y elige el día y la hora que te vengan bien. '
 'Sólo se ofrecen horarios con disponibilidad real.\n\n'
 'La solicitud queda **pendiente** hasta que la confirmamos.',
 'publica','PUBLICADO','disponible',null,1),

('consultas-y-visitas','como-se-confirma-una-visita','¿Cómo se confirma mi visita?',
 'De pendiente a confirmada.',
 E'Una visita nueva queda **pendiente**. El equipo de VIVE BIEN la revisa y la **confirma**, y lo ves en **Mis visitas**.\n\n'
 'Si la hora que pediste no es posible, te proponemos otra en vez de cancelarla sin más.',
 'publica','PUBLICADO','disponible',null,1),

('consultas-y-visitas','cancelar-o-reprogramar','Cancelar o reprogramar una visita',
 'Si te cambian los planes.',
 E'Desde **Mis visitas** puedes **cancelarla** o pedir **reprogramarla**.\n\n'
 'Avisa en cuanto lo sepas: del otro lado hay alguien que aparta ese hueco y se desplaza.',
 'publica','PUBLICADO','disponible',null,2),

('consultas-y-visitas','mi-historial-de-visitas','Mi historial de visitas',
 'Lo que ya pasó.',
 E'En **Mis visitas** quedan también las anteriores, marcadas como **completada** o, si no se pudo asistir, '
 'como **no asistió**. Sirve para recordar qué viste y cuándo.',
 'publica','PUBLICADO','disponible',null,2),

('consultas-y-visitas','recordatorios-de-visita','Recordatorios de tu visita',
 'Avisos antes de la cita.',
 E'La idea es recordarte tu visita con antelación para que no se te pase.',
 'publica','BORRADOR','futuro',
 'Todavía no enviamos recordatorios. Está previsto, pero aún no funciona: por ahora consulta **Mis visitas**.',4),

('consultas-y-visitas','google-calendar','Añadir la visita a Google Calendar',
 'Sincronizar tus visitas con tu calendario.',
 E'La idea es que tus visitas confirmadas aparezcan en tu propio calendario.',
 'publica','BORRADOR','futuro',
 'Todavía no está disponible.',4),

-- ══ Vender o rentar ══ aquí está el otro caso PARCIAL ═══════════════════
('vender-o-rentar','quiero-vender-o-rentar','Quiero vender o rentar mi propiedad',
 'Por dónde empezar.',
 E'Déjanos tus datos desde **«Quiero publicar»** y el equipo de VIVE BIEN te contacta para ver tu propiedad '
 'y explicarte el proceso.',
 'publica','PUBLICADO','parcial',
 'Por ahora esto nos deja tus datos para que te contactemos. El alta como publicador, con su panel para cargar '
 'propiedades tú mismo, todavía no está abierta.',1),

('vender-o-rentar','requisitos-para-publicar','¿Qué necesito para publicar?',
 'Los datos imprescindibles.',
 E'Para que una propiedad salga al público hacen falta, como mínimo, **tu nombre, tu teléfono y tu WhatsApp**.\n\n'
 'No es burocracia: un anuncio sin datos de contacto es un callejón sin salida para quien se interese. '
 'Si falta alguno, te lo decimos antes de publicar.',
 'publica','PUBLICADO','disponible',null,2),

('vender-o-rentar','como-solicitar-ser-publicador','¿Cómo solicito ser publicador?',
 'El alta para cargar tus propias propiedades.',
 E'La idea es que puedas solicitar el alta como publicador y, una vez aprobada, cargar y administrar tus propiedades.',
 'publica','BORRADOR','futuro',
 'Todavía no está abierto. Por ahora, déjanos tus datos desde «Quiero publicar» y te contactamos.',2),

('vender-o-rentar','cuanto-tarda-la-aprobacion','¿Cuánto tarda la aprobación?',
 'Tiempos del alta como publicador.',
 E'Los tiempos del proceso de alta.',
 'publica','BORRADOR','futuro','Depende del alta como publicador, que todavía no está abierta.',3),

-- ══ Valuador ════════════════════════════════════════════════════════════
('valuador','como-funciona-el-valuador','¿Cómo funciona el valuador?',
 'Una estimación con los datos de tu propiedad.',
 E'El valuador te da una **estimación** a partir de los datos que nos das: tipo de propiedad, superficie y zona.\n\n'
 'Es una orientación para hacerte una idea, no un avalúo formal. Para poner precio a una venta real, '
 'lo que vale es una valuación hecha en sitio.',
 'publica','PUBLICADO','disponible',null,2),

-- ══ Privacidad y seguridad ══════════════════════════════════════════════
('privacidad-y-seguridad','como-eliminar-mi-cuenta','¿Cómo elimino mi cuenta?',
 'Cerrar tu cuenta y qué pasa con tus datos.',
 E'En **Configuración**, al final, está **«Eliminar mi cuenta»**. Va separada del resto a propósito: '
 'es lo único de esa pantalla que no tiene vuelta atrás.\n\n'
 'Te pedimos confirmar tu identidad antes, para que nadie pueda cerrar tu cuenta si te dejas la sesión abierta.\n\n'
 '**El cierre es definitivo.** Esa cuenta no se recupera.',
 'publica','PUBLICADO','disponible',null,1),

('privacidad-y-seguridad','que-pasa-con-mis-datos','¿Qué pasa con mis datos al cerrar la cuenta?',
 'Qué se borra y qué se conserva.',
 E'Al cerrar tu cuenta dejas de poder entrar con ella y tu correo queda libre.\n\n'
 '**Puedes volver a registrarte con el mismo correo**, pero será una cuenta nueva: no hereda tus guardadas, '
 'ni tus búsquedas, ni tu historial. Es intencionado — si heredara algo, cerrar la cuenta no habría servido de nada.\n\n'
 'Conservamos lo que tenemos obligación de conservar, como el registro de operaciones cerradas.',
 'publica','PUBLICADO','disponible',null,1),

('privacidad-y-seguridad','que-datos-guardamos','¿Qué datos guardan de mí?',
 'Y para qué los usamos.',
 E'Guardamos lo que necesitamos para atenderte: tu correo, tu nombre, tu teléfono y WhatsApp si los das, '
 'y lo que haces en el portal — lo que guardas, lo que buscas, tus consultas y tus visitas.\n\n'
 'El detalle completo está en el [aviso de privacidad](/privacidad).',
 'publica','PUBLICADO','disponible',null,2),

('privacidad-y-seguridad','como-protegemos-tu-sesion','¿Cómo protegen mi sesión?',
 'Qué hacemos para que nadie entre en tu cuenta.',
 E'Tu sesión usa un identificador temporal que caduca solo y **nunca viaja en la dirección de la página**, '
 'así que no se queda en el historial ni se comparte al copiar un enlace.\n\n'
 'Nosotros no vemos tu contraseña en ningún momento: ni al crearla, ni al cambiarla.',
 'publica','PUBLICADO','disponible',null,3),

('privacidad-y-seguridad','quien-puede-ver-mi-informacion','¿Quién puede ver mi información?',
 'Los datos de contacto no circulan.',
 E'Tus datos de contacto los ve el **equipo de VIVE BIEN**, que es quien te atiende.\n\n'
 'Quien publica una propiedad **no recibe tus datos personales**. El contacto pasa siempre por VIVE BIEN.',
 'publica','PUBLICADO','disponible',null,2),

-- ══ Publicadores ══ ámbito interno: NO sale al público ══════════════════
('publicadores','tu-panel-de-publicador','Tu panel de publicador',
 'Dónde ves y administras tus propiedades.',
 E'En tu panel ves tus propiedades con su porcentaje de avance y puedes crear una nueva.',
 'publicador','PUBLICADO','disponible',null,2),

('publicadores','por-que-no-puedo-publicar','¿Por qué no puedo publicar todavía?',
 'El candado del perfil.',
 E'Para sacar una propiedad al público hacen falta tu nombre, tu teléfono y tu WhatsApp. '
 'Si falta alguno, el botón de publicar te lo dice y te lleva a completarlo.',
 'publicador','PUBLICADO','disponible',null,2),

('publicadores','estados-de-una-propiedad','Estados de una propiedad',
 'Borrador, publicada y lo que viene.',
 E'Hoy una propiedad puede estar en **borrador** o **publicada**.',
 'publicador','BORRADOR','parcial',
 'El ciclo completo —envío a revisión, aprobación, pausada, vendida— todavía no está construido.',3),

('publicadores','tus-leads','Tus leads',
 'Quién se ha interesado por tus propiedades.',
 E'La idea es que veas el interés que genera cada propiedad, sin datos personales de quien pregunta.',
 'publicador','BORRADOR','futuro','Todavía no está construido.',4);

-- Insertar y enlazar la categoría por slug.
insert into public.knowledge_articles
  (categoria_id, slug, titulo, resumen, cuerpo, ambito, estado, estado_producto, aviso, prioridad,
   publicado_por, publicado_en, revisado_en)
select c.id, a.slug, a.titulo, a.resumen, a.cuerpo, a.ambito, a.estado, a.ep, a.aviso, a.prioridad,
       case when a.estado = 'PUBLICADO' then 'contenido-inicial-3c-3' end,
       case when a.estado = 'PUBLICADO' then now() end,
       current_date
from _art a
join public.knowledge_categories c on c.slug = a.cat
on conflict (categoria_id, slug) do update set
  titulo = excluded.titulo, resumen = excluded.resumen, cuerpo = excluded.cuerpo,
  estado_producto = excluded.estado_producto, aviso = excluded.aviso,
  prioridad = excluded.prioridad, actualizado_en = now();

-- ── Fuentes · de dónde salió cada artículo ──────────────────────────────
--
-- Sin esto no hay Knowledge Engine después. Se registran las principales;
-- el resto se irá completando al revisar cada artículo.

insert into public.knowledge_article_sources (articulo_id, tipo, clave, version_fuente)
select a.id, f.tipo, f.clave, 'V-1.1.94'
from public.knowledge_articles a
join public.knowledge_categories c on c.id = a.categoria_id
join (values
  ('mi-cuenta','como-crear-tu-cuenta','route','/entrar'),
  ('mi-cuenta','como-crear-tu-cuenta','component','Entrar'),
  ('mi-cuenta','como-iniciar-sesion','route','/entrar'),
  ('mi-cuenta','como-iniciar-sesion','product','acceso.contrasena'),
  ('mi-cuenta','entrar-con-google','product','acceso.google'),
  ('mi-cuenta','olvide-mi-contrasena','product','acceso.recuperacion'),
  ('mi-cuenta','cambiar-mi-contrasena','component','CuentaYSeguridad'),
  ('mi-cuenta','mis-datos-de-perfil','route','/portal/perfil'),
  ('mi-cuenta','mis-datos-de-perfil','api','/api/usuarios/me'),
  ('mi-cuenta','mis-datos-de-perfil','permission','cuenta.propia'),
  ('mi-cuenta','cerrar-sesion','component','CuentaYSeguridad'),
  ('buscar-propiedades','como-buscar-una-propiedad','route','/propiedades'),
  ('buscar-propiedades','que-significa-cada-tipo','product','cliente.busqueda.OPCIONES_TIPO'),
  ('buscar-propiedades','comparar-propiedades','component','BarraComparar'),
  ('propiedades-guardadas','como-guardar-una-propiedad','api','/api/favoritos'),
  ('propiedades-guardadas','como-guardar-una-propiedad','route','/portal/propiedades'),
  ('propiedades-guardadas','que-significa-me-interesan','route','/portal/propiedades'),
  ('busquedas-y-alertas','como-guardar-una-busqueda','api','/api/busquedas'),
  ('busquedas-y-alertas','como-funcionan-las-alertas','api','/api/alertas'),
  ('busquedas-y-alertas','como-funcionan-las-alertas','route','/portal/alertas'),
  ('busquedas-y-alertas','que-es-mi-busqueda','route','/portal/mi-busqueda'),
  ('consultas-y-visitas','que-pasa-tras-una-consulta','api','/api/portal/consultas'),
  ('consultas-y-visitas','como-solicitar-una-visita','api','/api/citas'),
  ('consultas-y-visitas','como-se-confirma-una-visita','api','/api/citas/accion'),
  ('consultas-y-visitas','cancelar-o-reprogramar','api','/api/citas/accion'),
  ('consultas-y-visitas','mi-historial-de-visitas','route','/portal/visitas'),
  ('vender-o-rentar','quiero-vender-o-rentar','component','QuieroPublicar'),
  ('vender-o-rentar','quiero-vender-o-rentar','api','/api/registro-lead'),
  ('vender-o-rentar','requisitos-para-publicar','product','perfil.puedePublicar'),
  ('valuador','como-funciona-el-valuador','route','/valuador'),
  ('privacidad-y-seguridad','como-eliminar-mi-cuenta','component','EliminarCuenta'),
  ('privacidad-y-seguridad','como-eliminar-mi-cuenta','documentation','D-35'),
  ('privacidad-y-seguridad','que-pasa-con-mis-datos','documentation','D-35'),
  ('privacidad-y-seguridad','que-datos-guardamos','legal','privacidad'),
  ('privacidad-y-seguridad','quien-puede-ver-mi-informacion','documentation','ADR-0006'),
  ('privacidad-y-seguridad','quien-puede-ver-mi-informacion','permission','leads.ver_todos'),
  ('publicadores','tu-panel-de-publicador','route','/publicador'),
  ('publicadores','por-que-no-puedo-publicar','product','perfil.puedePublicar')
) as f(cat, art, tipo, clave) on f.cat = c.slug and f.art = a.slug
on conflict (articulo_id, tipo, clave) do nothing;

commit;

-- ── Comprobación posterior ──────────────────────────────────────────────
--   select c.nombre, count(*) filter (where a.estado='PUBLICADO') as publicados,
--          count(*) filter (where a.estado='BORRADOR') as borradores
--     from public.knowledge_categories c
--     left join public.knowledge_articles a on a.categoria_id = c.id
--     group by c.nombre, c.orden order by c.orden;
--
--   -- Ninguno publicado sin aviso si la función no está disponible:
--   select slug, estado_producto from public.knowledge_articles
--     where estado='PUBLICADO' and estado_producto <> 'disponible' and aviso is null;
--   -- debe salir vacío (el CHECK ya lo impide)
--
--   -- Nada interno visible para anon:
--   select ambito, estado, count(*) from public.knowledge_articles group by 1,2 order by 1,2;
