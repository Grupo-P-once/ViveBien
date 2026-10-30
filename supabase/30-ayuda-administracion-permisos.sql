-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 30 — Centro de Ayuda: administrar modalidad y permisos de un publicador
-- Fase ADMIN (ADR-0013) · Va DESPUÉS de las migraciones 27, 27b, 28 y 29. Idempotente.
--
-- ─────────────────────────────────────────────────────────────
-- ESTADO: PREPARADA, NO APLICADA.
--
-- Describe la pantalla `/admin/usuarios/[uid]` ("Modalidad y permisos") y la
-- API que usa, que están en el código de esta rama pero NO desplegadas. Orden:
--     28 (columnas) → 29 (ayuda del publicador) → despliegue → 30 (ESTA).
--
-- Ámbito `administrativa`: el sitio público sólo sirve `publica`, y la lectura
-- anónima (RLS) tampoco los ve. Hoy NO existe una pantalla que los muestre al
-- equipo con sesión; decidir dónde se leen es un pendiente (D-48).
--
-- REGLA DEL CENTRO: cada artículo describe algo que se comprobó en el código;
-- lo que existe a medias se publica CON aviso (`parcial`). FORMATO: sólo
-- párrafos, **negritas** y enlaces (es lo único que entiende el visor).
--
-- Reversa: 30-ayuda-administracion-permisos.REVERTIR.sql
-- ═══════════════════════════════════════════════════════════════

begin;

insert into public.knowledge_categories (slug, nombre, descripcion, icono, ambito, orden) values
  ('administracion', 'Administración', 'Procedimientos internos del equipo de VIVE BIEN.', 'lock', 'administrativa', 10)
on conflict (slug) do update set
  nombre = excluded.nombre, descripcion = excluded.descripcion,
  icono = excluded.icono, ambito = excluded.ambito, orden = excluded.orden;

create temporary table _art (
  cat text, slug text, titulo text, resumen text, cuerpo text,
  ambito text, estado text, ep text, aviso text, prioridad int
) on commit drop;

insert into _art values

('administracion','donde-se-administran-los-permisos','Dónde se administran la modalidad y los permisos',
 'Usuarios → una cuenta de publicador → Modalidad y permisos.',
 $c$En el panel, entra a **Usuarios**. En la fila de una cuenta con rol **publicador** abre el menú de acciones y elige **Modalidad y permisos**; también puedes pulsar el texto «ver permisos» que aparece bajo su rol. Se abre la ficha de esa cuenta.

La ficha tiene arriba los datos de la cuenta (nombre, correo, rol, estado, último acceso) y abajo la modalidad y los permisos.

**Sólo los publicadores tienen permisos que configurar.** Si abres la ficha de un cliente o de alguien del equipo, la pantalla lo dice y no muestra la matriz: primero habría que cambiarle el rol desde la lista de usuarios.

**Nadie puede cambiar sus propios permisos.** El sistema lo impide aunque se intente llamar a la API directamente: tiene que hacerlo otra persona del equipo.$c$,
 'administrativa','PUBLICADO','disponible',null,1),

('administracion','cambiar-la-modalidad','Cambiar la modalidad: publicador o asociado',
 'Qué cambia y qué no cambia al pasar de una a otra.',
 $c$La **modalidad** es una etiqueta comercial con valores por defecto. **Publicador** es la modalidad normal, con comisión; **asociado** es la premium, sin comisión.

Al cambiar de modalidad cambian los **valores por defecto** de los permisos (por ejemplo, el asociado publica sin revisión previa y el publicador no). La pantalla te enseña el resultado antes de guardar.

**La modalidad no concede nada por sí sola.** Lo que una persona puede hacer lo decide su permiso efectivo, nunca el nombre de su modalidad. Por eso un publicador puede tener un permiso premium y un asociado puede no tener alguno.

**Los ajustes individuales se conservan,** salvo los que, tras el cambio, coincidan con el valor por defecto de la nueva modalidad: esos se limpian solos, porque ya no dicen nada.

Si la modalidad nueva no cambia ningún permiso efectivo ni ningún ajuste, el sistema responde que no hay nada que cambiar y no registra nada.$c$,
 'administrativa','PUBLICADO','disponible',null,2),

('administracion','permisos-individuales','Permisos individuales: defecto, ajuste y resultado',
 'Las tres capas que ves en cada permiso.',
 $c$Cada permiso se muestra en tres capas distintas.

**Según la modalidad.** Es el valor por defecto; aparece escrito en la primera opción del selector, por ejemplo «Según modalidad (No)».

**Ajuste individual.** Si eliges **Encendido** o **Apagado**, apartas a esa persona del valor por defecto. Es un ajuste sólo suyo.

**Efectivo.** Es el resultado final y lo que de verdad aplica el sistema. Se muestra a la derecha de cada fila.

**Volver al valor por defecto.** Elige de nuevo «Según modalidad». El ajuste se quita.

**No se guardan ajustes redundantes.** Si apagas un permiso que ya está apagado por defecto, no se guarda ningún ajuste; se guarda sólo lo que se aparta del valor por defecto.

**Un permiso puede estar apagado aunque lo hayas encendido.** Las acciones de citas (aceptar, rechazar, reprogramar, cancelar) dependen de «Recibir citas»: si ésta está apagada, las otras cuatro quedan apagadas y la pantalla te lo explica en esa fila.

Los cambios no se guardan hasta pulsar **Revisar y guardar**; **Descartar** los deshace.$c$,
 'administrativa','PUBLICADO','disponible',null,2),

('administracion','que-controla-cada-permiso','Qué controla cada permiso',
 'Los permisos que se pueden administrar, por grupo.',
 $c$Estos son todos los permisos que existen; la pantalla no ofrece ninguno más.

**Publicación.** Publicar sin revisión: pasa sus borradores a publicada sin aprobación previa. Corregir lo ya publicado: edita sus propiedades publicadas sin devolverlas a borrador. Son dos permisos separados, y lo que está en revisión nunca se edita.

**Solicitudes y datos del interesado.** Recibir aviso de solicitudes: un aviso sin datos personales. Ver los datos del interesado: nombre, teléfono, correo y notas de quien pide una visita; está apagado por defecto en las dos modalidades.

**Citas recibidas.** Recibir citas, aceptar citas, rechazar citas, reprogramar citas y cancelar citas.

**Identidad pública.** Mostrar perfil, mostrar nombre y mostrar foto.

**Datos de contacto públicos.** Mostrar teléfono, mostrar WhatsApp y mostrar correo.

Los permisos que entregan datos personales llevan la marca «Datos personales» en la pantalla.$c$,
 'administrativa','PUBLICADO','disponible',null,2),

('administracion','datos-del-interesado-y-contacto-publico','Datos del interesado e identidad pública',
 'Mostrar identidad y mostrar datos de contacto son cosas distintas.',
 $c$**Datos del interesado.** «Recibir citas» y «Ver los datos del interesado» son permisos independientes: atender una cita no da derecho a ver nombre, teléfono, correo ni notas de quien la pidió. Sin el segundo, el publicador ve «Interesado» y la fecha, la hora y el estado de la visita. Habilítalo sólo cuando haya una razón, porque queda registrado.

**Identidad pública y contacto público se administran por separado.** Mostrar el perfil, el nombre o la foto no muestra ningún dato de contacto, y mostrar el teléfono, el WhatsApp o el correo no muestra la identidad.

**Por defecto no se expone nada.** Un publicador normal no muestra identidad ni contacto; el asociado muestra perfil, nombre y foto, pero ningún dato de contacto. El contacto público sigue siendo el de VIVE BIEN.

**Hoy lo que tiene efecto es el nombre.** Con «Mostrar perfil» y «Mostrar nombre» encendidos, el cliente ve el nombre del publicador como quien atiende su visita; si no, ve «Vive Bien». El teléfono, el WhatsApp, el correo y la foto del publicador todavía no se muestran en ninguna pantalla pública: puedes dejar el permiso guardado y la pantalla lo avisa en cada fila.$c$,
 'administrativa','PUBLICADO','parcial','Mostrar teléfono, WhatsApp, correo y foto todavía no tiene efecto en ninguna pantalla pública; el permiso queda guardado.',2),

('administracion','permisos-de-citas-y-citas-en-linea','Permisos de citas y estado de las citas en línea',
 'Cinco permisos, y un interruptor global que hoy está apagado.',
 $c$Las citas de un publicador se administran con cinco permisos independientes: recibir, aceptar, rechazar, reprogramar y cancelar. «Recibir citas» es la puerta: sin ella, las otras cuatro quedan apagadas.

**Valores por defecto.** El publicador normal los tiene apagados; el asociado los tiene encendidos.

**Las citas en línea están desactivadas en todo el sitio.** Mientras esa función global siga apagada, no se crea ninguna cita para nadie. La pantalla de permisos lo avisa con el mensaje «Las citas en línea están desactivadas»: los permisos de citas se guardan, pero no tendrán efecto hasta que la función se active.

**Si el publicador no recibe citas,** las visitas a sus propiedades no se pueden agendar en línea, y no se reasignan a otra persona.

Cuando atiende una cita, el publicador no ve los datos del interesado salvo que tengas encendido ese permiso aparte.$c$,
 'administrativa','PUBLICADO','parcial','La función global de citas en línea está desactivada; mientras lo esté, estos permisos no producen citas.',2),

('administracion','motivo-y-bitacora','El motivo y la bitácora de los cambios de permisos',
 'Qué se pide y qué queda registrado.',
 $c$**Motivo obligatorio.** Para guardar un cambio de modalidad o de permisos tienes que escribir un motivo de **al menos 10 caracteres**. Los espacios al principio y al final no cuentan. El botón de guardar no se habilita antes.

**Confirmación.** Antes de guardar, la pantalla te muestra la modalidad nueva y, permiso por permiso, el resultado efectivo («Sí → No»). Si habilitas datos personales, te lo advierte.

**Qué queda registrado:** quién hizo el cambio, a qué cuenta, el estado de la modalidad y de los ajustes antes y después, los permisos efectivos antes y después, el motivo y la fecha.

**Sin registro no hay cambio.** El cambio y su registro se guardan juntos, en una sola operación: si por una falla no se puede escribir en la bitácora, no se guarda nada y la pantalla te lo dice; vuelve a intentarlo.

**Si otra persona cambió la misma cuenta mientras la editabas,** la pantalla te avisa («Alguien cambió esta cuenta…») y no guarda nada. Pulsa «Recargar la cuenta» y vuelve a hacer tu cambio sobre lo que quedó.

**Un cambio que no cambia nada** no se guarda ni se registra.

**Rol y estado** (suspender, cambiar de cliente a publicador) se cambian desde la lista de usuarios, en una operación aparte de los permisos.$c$,
 'administrativa','PUBLICADO','disponible',null,2),

('administracion','quien-puede-cambiar-permisos','Quién puede cambiar permisos y a quién',
 'Reglas de acceso.',
 $c$**Quién.** Un administrador o un super administrador. Un cliente o un publicador no pueden entrar a estas pantallas ni a la API, aunque conozcan la dirección: el servidor lo comprueba en cada petición.

**A quién.** Sólo a cuentas con rol publicador, y nunca a la propia. Para dar permisos a un cliente hay que cambiarle antes el rol.

**Dar o quitar el rol de administrador** es cosa de un super administrador, con motivo.

**Si no puedes guardar.** Si la pantalla avisa de que falta aplicar la migración 28, los permisos se ven pero no se pueden modificar hasta que esa migración esté aplicada: mientras tanto se muestran los valores más restrictivos.$c$,
 'administrativa','PUBLICADO','disponible',null,2);

insert into public.knowledge_articles
  (categoria_id, slug, titulo, resumen, cuerpo, ambito, estado, estado_producto, aviso, prioridad,
   publicado_por, publicado_en, revisado_en)
select c.id, a.slug, a.titulo, a.resumen, a.cuerpo, a.ambito, a.estado, a.ep, a.aviso, a.prioridad,
       case when a.estado = 'PUBLICADO' then 'contenido-admin-permisos-adr-0013' end,
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

insert into public.knowledge_article_sources (articulo_id, tipo, clave, version_fuente)
select a.id, f.tipo, f.clave, 'ADR-0013'
from public.knowledge_articles a
join public.knowledge_categories c on c.id = a.categoria_id
join (values
  ('donde-se-administran-los-permisos','route','/admin/usuarios'),
  ('donde-se-administran-los-permisos','route','/admin/usuarios/[uid]'),
  ('donde-se-administran-los-permisos','api','/api/admin/usuarios/[uid]'),
  ('cambiar-la-modalidad','api','/api/admin/usuarios'),
  ('cambiar-la-modalidad','product','capacidades.compactarOverrides'),
  ('permisos-individuales','component','PermisosPublicador'),
  ('permisos-individuales','product','admin.permisos.filaDePermiso'),
  ('que-controla-cada-permiso','product','capacidades.CAPACIDADES'),
  ('que-controla-cada-permiso','product','admin.permisos.FICHAS'),
  ('datos-del-interesado-y-contacto-publico','product','capacidades.veDatosDelInteresado'),
  ('datos-del-interesado-y-contacto-publico','product','capacidades.nombreDelAsesorVisible'),
  ('permisos-de-citas-y-citas-en-linea','product','flags.citasEnLinea'),
  ('permisos-de-citas-y-citas-en-linea','product','capacidades.capacidadDeAccionDeCita'),
  ('motivo-y-bitacora','api','/api/admin/usuarios'),
  ('motivo-y-bitacora','product','auditoria.registrarObligatorio'),
  ('motivo-y-bitacora','test','tests/admin-permisos.test.ts'),
  ('quien-puede-cambiar-permisos','permission','panel.admin'),
  ('quien-puede-cambiar-permisos','product','capacidades.decidirCambioDePermisos')
) as f(art, tipo, clave) on f.art = a.slug and c.slug = 'administracion'
on conflict (articulo_id, tipo, clave) do nothing;

commit;

-- ── Comprobación posterior ──────────────────────────────────────────────
--   select slug, estado, estado_producto from public.knowledge_articles
--    where ambito = 'administrativa' order by prioridad, slug;
--   -- Nada del ámbito administrativo visible para anon (debe salir 0 con la clave anónima):
--   select count(*) from public.knowledge_articles where ambito = 'administrativa';
