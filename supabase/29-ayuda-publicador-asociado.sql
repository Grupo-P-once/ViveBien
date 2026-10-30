-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 29 — Centro de Ayuda: PUBLICADOR / ASOCIADO, citas recibidas y datos del interesado
-- ADR-0013 · Va DESPUÉS de `27-centro-de-ayuda.sql` y `27-centro-de-ayuda-contenido.sql`. Idempotente.
--
-- ─────────────────────────────────────────────────────────────
-- ESTADO: PREPARADA, NO APLICADA.
--
-- Describe comportamiento que está en el código de esta rama pero NO desplegado
-- ni con la migración 28 aplicada. Aplicarla ANTES de eso dejaría artículos
-- hablando de algo que todavía no existe. Orden correcto:
--     28-publicador-modalidad.sql  →  despliegue del código  →  ESTA migración.
--
-- Son artículos de ámbito `publicador`: el sitio público sólo sirve `publica`
-- (y la política RLS de lectura anónima también), así que no se ven afuera. OJO:
-- hoy NO existe una pantalla que los muestre a un publicador con sesión;
-- decidir dónde se leen es un pendiente (ver docs/DECISIONS.md D-47).
--
-- REGLA DEL CENTRO: cada artículo describe algo que se comprobó en el código.
-- `knowledge_article_sources` guarda de dónde salió; si esa funcionalidad
-- cambia, el artículo se revisa. Lo que sólo existe a medias se publica CON
-- aviso (`estado_producto = 'parcial'`), que es lo que el CHECK exige.
--
-- FORMATO: el visor del Centro parte el cuerpo en párrafos (línea en blanco) y
-- sólo entiende **negritas** y enlaces. Por eso no hay tablas ni listas: cada
-- punto es su propio párrafo. Los cuerpos van entre $c$ … $c$ para no escapar nada.
--
-- Reversa: 29-ayuda-publicador-asociado.REVERTIR.sql
-- ═══════════════════════════════════════════════════════════════

begin;

create temporary table _art (
  cat text, slug text, titulo text, resumen text, cuerpo text,
  ambito text, estado text, ep text, aviso text, prioridad int
) on commit drop;

insert into _art values

('publicadores','que-es-un-publicador','¿Qué es un publicador?',
 'La modalidad normal: tú aportas la propiedad, VIVE BIEN la revisa y la publica.',
 $c$Un **publicador** es una cuenta que puede dar de alta y administrar **sus propias propiedades**. Además conserva todo lo de un cliente: guardar propiedades, pedir visitas y ver su portal.

**Cómo funciona.** Creas la propiedad como **borrador**, la completas y la **envías a revisión**. Un administrador de VIVE BIEN la revisa y, si todo está bien, la publica. Tú **no puedes publicar por tu cuenta** ni aprobarte a ti mismo.

**Qué ves y qué no.** Ves y editas únicamente lo tuyo. No ves las propiedades de otros publicadores ni sus datos. No puedes cambiar tu rol ni tus permisos.

**El contacto es de VIVE BIEN.** Quien pregunta por una propiedad habla con VIVE BIEN, no contigo; por defecto no recibes sus datos personales (mira «Datos que puede ver un publicador»).

**Modalidad comercial.** La modalidad normal es **con comisión**. La plataforma todavía no calcula ni liquida comisiones: eso lo acuerdas con VIVE BIEN.

Existe también la modalidad **asociado**: mira «Diferencia entre publicador y asociado».$c$,
 'publicador','PUBLICADO','parcial','El cálculo y pago de comisiones todavía no existe en la plataforma.',2),

('publicadores','que-es-un-asociado','¿Qué es un asociado?',
 'La modalidad premium: publicas sin revisión previa y puedes atender tus citas.',
 $c$Un **asociado** es un publicador en modalidad **premium, sin comisión**. No es otro rol: sigue siendo un publicador, con otros permisos por defecto.

**Por defecto puede publicar sin revisión previa.** Pasa sus propiedades de borrador a publicada sin esperar a que las apruebe un administrador.

**Por defecto puede corregir lo ya publicado.** Edita sus propiedades publicadas sin devolverlas a borrador.

**Por defecto puede atender citas.** Recibe las visitas que piden a sus propiedades y puede aceptarlas, rechazarlas, reprogramarlas y cancelarlas.

**Por defecto su nombre aparece** como quien atiende la visita ante el cliente.

**Por defecto no puede** ver los datos personales del interesado ni mostrar su teléfono, WhatsApp o correo. Eso lo habilita VIVE BIEN, uno por uno.

**«Sin revisión» no es «sin controles».** El sistema sigue comprobando que la propiedad sea tuya, que esté completa (datos mínimos y al menos 5 fotos) y que tu perfil tenga nombre, teléfono y WhatsApp, y deja constancia de que se publicó sin revisión. Lo que está **en revisión** nadie con estos permisos lo edita.

VIVE BIEN puede encender o apagar cada permiso en tu cuenta: mira «Qué depende de VIVE BIEN».$c$,
 'publicador','PUBLICADO','disponible',null,2),

('publicadores','publicador-o-asociado','Diferencia entre publicador y asociado',
 'Qué cambia entre una modalidad y otra.',
 $c$**Modelo comercial.** Publicador: con comisión. Asociado: sin comisión.

**Publicar.** Publicador: con revisión de VIVE BIEN. Asociado: sin revisión previa.

**Corregir lo ya publicado.** Publicador: no, lo hace VIVE BIEN. Asociado: sí.

**Citas de sus propiedades.** Publicador: no, por defecto. Asociado: sí, por defecto.

**Nombre ante el cliente en sus visitas.** Publicador: no, por defecto. Asociado: sí, por defecto.

**Teléfono, WhatsApp y correo públicos.** Ninguno de los dos, hasta que VIVE BIEN lo habilite.

**Datos personales del interesado.** Ninguno de los dos, hasta que VIVE BIEN lo habilite.

Son **valores por defecto**, no una regla fija: VIVE BIEN puede encender o apagar cada permiso a una persona concreta. Un publicador puede tener un permiso premium, y un asociado puede no tener alguno.$c$,
 'publicador','PUBLICADO','disponible',null,2),

('publicadores','publicar-con-revision','Publicar con revisión',
 'Del borrador a publicada, paso a paso.',
 $c$**Paso 1. Crea el borrador** desde tu panel. Puedes guardarlo incompleto y seguir después.

**Paso 2. Complétalo.** Hacen falta título, descripción, ubicación, precio, tipo de inmueble, operación, superficie y **al menos 5 fotos**.

**Paso 3. Completa tu perfil.** Hacen falta tu nombre, tu teléfono y tu WhatsApp.

**Paso 4. Envíalo a revisión.** Mientras está en revisión no se puede editar; si quieres, puedes retirarla y volverla borrador.

**Paso 5. VIVE BIEN decide.** La **publica**, te **pide cambios** o la **rechaza**. En los dos últimos casos ves el motivo en tu panel.

**Paso 6.** Si pidió cambios o fue rechazada, la corriges y la envías otra vez.

**Después de publicada** ya no puedes editarla. Si necesitas cambiar algo (precio, dirección, fotos), escríbenos y un administrador la devuelve a borrador.

El **folio** (por ejemplo VB-2026-00125) lo asigna el sistema, no cambia nunca y no se puede editar.$c$,
 'publicador','PUBLICADO','disponible',null,1),

('publicadores','publicar-sin-revision','Publicar sin revisión',
 'Para quien tiene el permiso: de borrador a publicada en un paso.',
 $c$Si tu cuenta tiene el permiso **publicar sin revisión** (los asociados lo tienen por defecto), el botón final de tu propiedad dice **Publicar ahora** en lugar de «Enviar a revisión».

**Qué se sigue pidiendo.** La propiedad debe ser tuya, estar completa (datos mínimos y al menos 5 fotos) y tu perfil debe tener nombre, teléfono y WhatsApp.

**Qué no cambia.** El folio, la dirección pública y el estado los pone el sistema y no se pueden editar. Cada publicación queda en la bitácora anotada como «sin revisión».

**Qué no cubre este permiso.** Una propiedad que ya está **en revisión** no se aprueba sola. Y corregir lo ya publicado es **otro permiso** (editar publicadas), que se enciende o se apaga por separado.

VIVE BIEN puede apagarte este permiso en cualquier momento.$c$,
 'publicador','PUBLICADO','disponible',null,2),

('publicadores','solicitudes-de-tus-propiedades','Solicitudes sobre tus propiedades',
 'Quién atiende las consultas y qué recibes tú.',
 $c$Las solicitudes de información que llegan por el sitio **las recibe y atiende VIVE BIEN**. El interesado habla con VIVE BIEN, no contigo, y **no recibes sus datos personales**.

Lo que sí recibes son las **citas** de tus propiedades, si tu cuenta tiene el permiso de recibir citas (mira «Citas recibidas»).

**Recibir una solicitud no es lo mismo que ver los datos de quien la hizo.** Los datos personales son un permiso aparte, apagado por defecto (mira «Datos que puede ver un publicador»).$c$,
 'publicador','PUBLICADO','parcial','El aviso automático «hay un nuevo interesado en tu propiedad» todavía no está construido.',3),

('publicadores','citas-recibidas','Citas recibidas',
 'Las visitas que piden a tus propiedades.',
 $c$Si tu cuenta tiene el permiso **recibir citas**, en tu panel aparece **Citas recibidas**: las visitas que clientes piden a **tus** propiedades publicadas. Ves la propiedad, la fecha y la hora, el estado y, si hay otro horario propuesto, cuál es.

Sólo ves lo tuyo: nunca las citas de otro publicador.

**Si tu cuenta no recibe citas,** no se pueden agendar visitas en línea a tus propiedades: VIVE BIEN no las reasigna a otra persona. Para atenderlas tú, escríbenos y lo revisamos.

**Qué botones ves** depende de tus permisos. Aceptar, rechazar, reprogramar y cancelar son permisos **independientes**: si no tienes uno, el botón no aparece y el servidor tampoco lo acepta.

**Quién te avisa.** Recibes un correo por cada solicitud, sin datos personales del interesado salvo que tengas ese permiso. VIVE BIEN también recibe un aviso interno de cada visita en la propiedad de un publicador.

**Horario.** Por ahora se usa el horario estándar de VIVE BIEN: lunes a viernes de 9:00 a 18:00 y sábado de 10:00 a 14:00, con visitas de 1 hora y confirmación manual. Todavía no puedes editar tu propio horario.

Las visitas que **tú** pides como cliente no están aquí: están en «Mis visitas».$c$,
 'publicador','PUBLICADO','parcial','Pedir visitas en línea todavía no está activo: por ahora no llegan citas nuevas. El horario propio todavía no se puede editar.',2),

('publicadores','mis-visitas-como-publicador','Mis visitas: las que tú pides como cliente',
 'Tu agenda como cliente, separada de las citas recibidas.',
 $c$Un publicador conserva todo lo de un cliente. Si tú pides visitar una propiedad de otra persona, esa visita aparece en **Mis visitas**, en tu portal, igual que para cualquier cliente.

**No se mezcla** con «Citas recibidas»: «Mis visitas» son las que **tú** pediste; «Citas recibidas» son las que piden **a tus propiedades**.

No puedes pedir una visita a una propiedad tuya.$c$,
 'publicador','PUBLICADO','parcial','Pedir visitas en línea todavía no está activo, así que por ahora «Mis visitas» puede estar vacío.',3),

('publicadores','permisos-de-citas','Permisos de citas',
 'Cinco permisos independientes.',
 $c$Las citas de tus propiedades se gobiernan con cinco permisos que se pueden encender o apagar **uno por uno**.

**Recibir citas.** Es la puerta de todo lo demás: sin ella no ves ninguna cita recibida y las otras cuatro quedan apagadas.

**Aceptar citas.** Confirmar una solicitud.

**Rechazar citas.** Rechazar una solicitud que todavía no está confirmada.

**Reprogramar citas.** Proponer otro horario.

**Cancelar citas.** Cancelar una visita ya confirmada.

**Valores por defecto.** El publicador normal los tiene **apagados**; el asociado los tiene **encendidos**. VIVE BIEN puede cambiarlos para tu cuenta.

El permiso se comprueba en el servidor cada vez que pulsas un botón o abres un enlace de un correo: no basta con que el botón se vea.$c$,
 'publicador','PUBLICADO','disponible',null,2),

('publicadores','datos-que-puede-ver-un-publicador','Datos que puede ver un publicador',
 'Qué ves del interesado y qué no.',
 $c$**Por defecto, ningún publicador ve los datos personales del interesado:** ni el nombre, ni el teléfono, ni el correo, ni las notas que escribió. Esto vale igual para publicador y para asociado.

**Lo que sí ves de una cita:** la propiedad, la fecha y la hora, el estado y el horario propuesto, si lo hay. En lugar del nombre ves «Interesado».

**Lo que nunca ves:** las notas internas de VIVE BIEN, el estado de sincronización con el calendario del equipo ni datos de otros publicadores.

**Tampoco en los correos.** Los avisos que recibes no llevan los datos del interesado y sólo traen botones de lo que puedes hacer.

**Se puede habilitar.** Ver los datos del interesado es un permiso **independiente** de recibir citas. Sólo VIVE BIEN lo enciende, para una persona concreta y con un motivo registrado.$c$,
 'publicador','PUBLICADO','disponible',null,1),

('publicadores','perfil-y-contacto-publico','Perfil y contacto público',
 'Quién aparece ante el cliente.',
 $c$**Por defecto, el contacto es VIVE BIEN.** El teléfono y el WhatsApp que ve el público son los de VIVE BIEN, no los tuyos.

VIVE BIEN decide, persona por persona, si puedes mostrar perfil, nombre, foto, teléfono, WhatsApp o correo. **Tú no puedes concederte estos permisos.**

Hoy, lo que cambia cuando tienes perfil y nombre públicos es que, en la visita de un cliente a tu propiedad, el cliente ve **tu nombre** como quien atiende. Si no, ve «Vive Bien». Tu teléfono nunca se le muestra al cliente en la visita.$c$,
 'publicador','PUBLICADO','parcial','Mostrar al publicador en la ficha pública y en las tarjetas todavía no está construido: ahí siempre aparece VIVE BIEN.',3),

('publicadores','que-depende-de-vive-bien','Qué depende de VIVE BIEN',
 'Los permisos que un administrador enciende o apaga por persona.',
 $c$Estos permisos **no dependen de ti**: los fija VIVE BIEN y puede cambiarlos para tu cuenta cuando quiera.

**Publicación.** Publicar sin revisión y corregir lo ya publicado.

**Citas.** Recibir citas, aceptar, rechazar, reprogramar y cancelar.

**Datos.** Ver los datos personales del interesado.

**Contacto público.** Mostrar perfil, nombre, foto, teléfono, WhatsApp o correo.

**Quién los cambia.** Un administrador o super administrador, con un motivo que queda en la bitácora. Nadie puede cambiarse sus propios permisos, y mandar datos extra desde el navegador no concede nada.

**Si necesitas uno,** escríbenos y lo revisamos.$c$,
 'publicador','PUBLICADO','parcial','Todavía no hay una pantalla de administración para esto; los cambios se hacen por la API.',2),

-- ── Se corrigen dos artículos que ya existían ───────────────────────────

('publicadores','tu-panel-de-publicador','Tu panel de publicador',
 'Dónde ves y administras tus propiedades y tus citas.',
 $c$En tu panel ves **tus propiedades** con su estado y su porcentaje de avance, y puedes crear una nueva.

Si tu cuenta recibe citas, aparece también **Citas recibidas**. Ahí mismo tienes el acceso a tu perfil y a tu portal de cliente.

Sólo ves lo tuyo. Si algo no aparece, no es tuyo o todavía no tienes el permiso.$c$,
 'publicador','PUBLICADO','disponible',null,2),

('publicadores','estados-de-una-propiedad','Estados de una propiedad',
 'Borrador, en revisión, cambios solicitados, rechazada y publicada.',
 $c$**Borrador.** La estás armando. Puedes editarla.

**En revisión.** La enviaste y VIVE BIEN la revisa. No se puede editar; puedes retirarla y volverla borrador.

**Cambios solicitados.** VIVE BIEN te pidió ajustes. Ves el motivo, los corriges y la envías otra vez.

**Rechazada.** No se publicó. Ves el motivo; puedes volverla borrador y corregirla.

**Publicada.** Ya está en el sitio. Si tu cuenta no puede corregir lo publicado, para cambiarla pide a VIVE BIEN que la devuelva a borrador.

Pausar una propiedad, marcarla como vendida o rentada y archivarla **lo hace VIVE BIEN**. Quien tiene «publicar sin revisión» pasa de borrador a publicada sin esperar la revisión.$c$,
 'publicador','PUBLICADO','disponible',null,2);

insert into public.knowledge_articles
  (categoria_id, slug, titulo, resumen, cuerpo, ambito, estado, estado_producto, aviso, prioridad,
   publicado_por, publicado_en, revisado_en)
select c.id, a.slug, a.titulo, a.resumen, a.cuerpo, a.ambito, a.estado, a.ep, a.aviso, a.prioridad,
       case when a.estado = 'PUBLICADO' then 'contenido-publicador-asociado-adr-0013' end,
       case when a.estado = 'PUBLICADO' then now() end,
       current_date
from _art a
join public.knowledge_categories c on c.slug = a.cat
on conflict (categoria_id, slug) do update set
  titulo = excluded.titulo, resumen = excluded.resumen, cuerpo = excluded.cuerpo,
  estado = excluded.estado, estado_producto = excluded.estado_producto, aviso = excluded.aviso,
  prioridad = excluded.prioridad, ambito = excluded.ambito,
  publicado_por = coalesce(public.knowledge_articles.publicado_por, excluded.publicado_por),
  publicado_en = coalesce(public.knowledge_articles.publicado_en, excluded.publicado_en),
  revisado_en = excluded.revisado_en, actualizado_en = now();

-- ── Fuentes · de dónde salió cada artículo ──────────────────────────────

insert into public.knowledge_article_sources (articulo_id, tipo, clave, version_fuente)
select a.id, f.tipo, f.clave, 'ADR-0013'
from public.knowledge_articles a
join public.knowledge_categories c on c.id = a.categoria_id
join (values
  ('que-es-un-publicador','documentation','ADR-0013'),
  ('que-es-un-publicador','permission','propiedad.gestionar_propias'),
  ('que-es-un-asociado','documentation','ADR-0013'),
  ('que-es-un-asociado','product','capacidades.DEFAULTS_POR_TIPO'),
  ('publicador-o-asociado','product','capacidades.DEFAULTS_POR_TIPO'),
  ('publicar-con-revision','route','/publicador'),
  ('publicar-con-revision','api','/api/propiedades/[id]/estado'),
  ('publicar-con-revision','product','publicacion.puedeTransicionar'),
  ('publicar-con-revision','product','perfil.puedePublicar'),
  ('publicar-sin-revision','product','capacidades.publicar_sin_revision'),
  ('publicar-sin-revision','api','/api/propiedades/[id]/estado'),
  ('publicar-sin-revision','test','tests/publicador-modalidad.test.ts'),
  ('solicitudes-de-tus-propiedades','documentation','ADR-0006'),
  ('solicitudes-de-tus-propiedades','api','/api/contacto'),
  ('citas-recibidas','route','/publicador/citas'),
  ('citas-recibidas','api','/api/citas'),
  ('citas-recibidas','api','/api/citas/[id]/transicion'),
  ('citas-recibidas','product','citas.ajustes.HORARIO_POR_DEFECTO'),
  ('citas-recibidas','test','tests/publicador-citas.test.ts'),
  ('mis-visitas-como-publicador','route','/portal/visitas'),
  ('permisos-de-citas','product','capacidades.capacidadDeAccionDeCita'),
  ('permisos-de-citas','test','tests/publicador-citas.test.ts'),
  ('datos-que-puede-ver-un-publicador','product','capacidades.veDatosDelInteresado'),
  ('datos-que-puede-ver-un-publicador','component','citas.vista.recortar'),
  ('datos-que-puede-ver-un-publicador','test','tests/publicador-citas.test.ts'),
  ('perfil-y-contacto-publico','product','capacidades.nombreDelAsesorVisible'),
  ('perfil-y-contacto-publico','documentation','ADR-0006'),
  ('que-depende-de-vive-bien','api','/api/admin/usuarios'),
  ('que-depende-de-vive-bien','migration','28-publicador-modalidad'),
  ('tu-panel-de-publicador','route','/publicador'),
  ('tu-panel-de-publicador','route','/publicador/citas'),
  ('estados-de-una-propiedad','product','publicacion.TRANSICIONES')
) as f(art, tipo, clave) on f.art = a.slug and c.slug = 'publicadores'
on conflict (articulo_id, tipo, clave) do nothing;

commit;

-- ── Comprobación posterior ──────────────────────────────────────────────
--   select slug, estado, estado_producto from public.knowledge_articles
--    where ambito = 'publicador' order by prioridad, slug;
--   -- Nada del ámbito publicador visible para anon (debe salir 0 con la clave anónima):
--   select count(*) from public.knowledge_articles where ambito = 'publicador';
