# Fase 3b-3 · Eliminación, «Mi propiedad» y arquitectura del Centro de Ayuda — AUDIT

- **Fecha:** 23-sep-2026 · **Producción:** V-1.1.86 (commit `8294afc`) · **Flags:** los tres **apagados**.
- **Alcance:** sólo lectura (base de producción, código, textos legales publicados). **No se escribió código, ni migraciones, ni se desplegó nada.**
- **Decisiones que ya mandan:** **D-35 (política de eliminación, 23-sep — manda sobre D-27.4 y D-28.5)** · **D-28.6 = C (tabla propia, sin reutilizar `leads`)** · D-19 (textos legales en DRAFT) · D-32 (No Silent Data Loss) · D-34 (Centro de Ayuda: la IA propone, el sistema es la fuente de verdad, publica una persona).
- **Revisión del 23-sep (misma fecha, tras el rediseño de la eliminación):** la sección 1 se reescribió entera. Se añaden **K-18 a K-28**, se corrige **K-05** y se amplían **K-01** (siete FK, no seis) y **K-02** (once columnas sin FK, no cinco). Todo verificado contra la base de producción, en lectura.

## 0 · Lo que hay hoy, comprobado

**Tablas (22).** Ninguna de eliminación y **ninguna de solicitudes de publicador**: la comprobación que pediste antes de crear tabla propia está hecha — no existe entidad equivalente. Lo más cercano es `solicitudes_contacto` (consultas sobre **una propiedad concreta**, con `CHECK (tipo in ('informacion','visita'))`) y `leads` (formularios anónimos, **sin `uid`**).

**Datos personales, y dónde viven:** `usuarios` (3) · `leads` (1) · `solicitudes_contacto` (0) · `citas` (0, pero guarda `cliente_nombre/telefono/email`) · `contactos` (0) · `envios` (0) · `invitaciones` (2) · `favoritos` (0) · `busquedas_guardadas` (1) · `eventos` (75, **ninguno con `uid`**) · `audit_logs` (260, con `actor_email`) · `propiedades.owner_id` (5).

**Extensiones de Postgres:** `pgcrypto` y `uuid-ossp` instaladas; **`unaccent`, `pg_trgm` y `vector` disponibles pero NO instaladas** (importa para la búsqueda del Centro de Ayuda).

## 1 · Eliminación de cuenta — **rediseñada el 23-sep-2026** (D-35)

> **Política funcional:** *eliminar cuenta = cierre **irreversible** de esa cuenta + posibilidad de crear después una cuenta **nueva** con el mismo correo.*
>
> La **identidad es el UID de Firebase**. El correo es **credencial y medio de contacto**, nunca identidad histórica. Una baja no reserva el correo para siempre, y una re-alta no recupera nada.
>
> **Esto corrige el diseño anterior.** K-01…K-05 se auditaron dando por hecho que la baja era «anonimizar y marcar», con Firebase fuera del alcance. Ahora la baja **sí** borra la identidad de Firebase, y la fila histórica se queda como **lápida** — deja de representar una cuenta activa, pero sostiene el historial que no se puede perder.

### Vocabulario (se usa con precisión; «anonimización» a secas queda prohibida)
| Término | Qué significa aquí | Ejemplo en este sistema |
|---|---|---|
| **Supresión** | El dato **desaparece**: la fila o el valor dejan de existir | `favoritos`, `busquedas_guardadas`, `google_oauth_estados` |
| **Disociación** | La fila se queda, pero **ya no permite llegar a la persona**: se va el identificador directo y queda el hecho | `usuarios.email/nombre/telefono/whatsapp/foto_url` de la lápida; `citas.cliente_nombre/telefono/email` |
| **Bloqueo** | El dato **se conserva sin usarse**, sólo disponible para cumplir una obligación (legal, fiscal, probatoria) | `audit_logs` (incluida la baja misma), consentimiento y su versión |

**Cuenta activa** = fila de `usuarios` con `estado` ≠ `eliminada`. **Lápida** = fila de `usuarios` con `estado = 'eliminada'`: existe sólo para que las claves foráneas y el historial sigan en pie.

### K-01 · Borrar la fila de `usuarios` es **imposible**, y por eso la lápida no es una comodidad: es la única salida · **P0**
- **Evidencia (verificada de nuevo el 23-sep):** **siete** claves foráneas apuntan a `usuarios.uid`, **todas sin `ON DELETE`** (o sea `NO ACTION`): `ajustes_citas.asesor_uid`, `bloqueos_asesores.asesor_uid`, `calendarios_google.asesor_uid`, `citas.asesor_uid`, `citas.cliente_uid`, `disponibilidad_asesores.asesor_uid`, `propiedades.owner_id`.
- **Hoy:** un `delete from usuarios` falla en cuanto la persona tenga una cita o una propiedad.
- **Esperado:** `DELETE` de `usuarios` **nunca**. La baja es **lápida + supresión/disociación selectiva**, tabla por tabla. Coincide con la prohibición expresa de «borrado masivo de todas las FK».
- **Propuesta:** procedimiento escrito y probado, con la lista completa de K-23 recorrida entera.

### K-02 · Once columnas guardan el `uid` **sin** clave foránea: nadie las protege ni las limpia · **P0**
- **Evidencia:** `audit_logs.actor_uid` (NOT NULL), `busquedas_guardadas.uid`, `citas_eventos.actor_uid`, `configuracion.actualizado_por`, `eventos.uid`, `favoritos.uid`, `google_oauth_estados.uid`, `invitaciones.aceptada_por`, `solicitudes_contacto.cliente_uid` (NOT NULL), `solicitudes_contacto.owner_id`.
- **Hoy:** si la cuenta desapareciera, quedarían filas apuntando a un `uid` inexistente **sin que la base se queje**.
- **Esperado:** cada una decidida por escrito —suprimir, disociar o bloquear— y ninguna «por descarte». Ver K-23.

### K-18 · El índice único de correo **impide la re-alta**: es el bloqueo real de toda la política · **P0 · bloqueante**
- **Evidencia:** `usuarios_email_idx = CREATE UNIQUE INDEX ON public.usuarios USING btree (lower(email))`, y **`usuarios.email` es `NOT NULL`**.
- **Consecuencia exacta:** si la lápida conserva el correo, el alta nueva revienta. `GET /api/usuarios/me` hace `upsert({uid, email, rol, estado}, {onConflict:'uid'})`: el conflicto sería por **correo**, no por `uid`, así que Postgres devuelve `23505` y la persona **no puede crear su cuenta nueva** — exactamente lo que la política prohíbe.
- **Y no basta con poner `email = null`:** la columna es `NOT NULL`.
- **Esperado:** la lápida **disocia** el correo, y el original queda libre para el alta nueva.
- **RESUELTO el 23-sep — `email = NULL`.** Mi primera propuesta fue un correo artificial (`baja+<uid>@…`);
  quedó descartada por dos razones. La de fondo: propagaría el `uid` dentro de un campo de correo por paneles,
  exportaciones, buscador y Telegram, diciendo algo falso. La de forma: el dominio que propuse no era una forma
  reservada — las reservadas son el TLD **`.invalid`** y `example.com` (RFC 2606).
- **Y el índice no hay que tocarlo:** comprobado en producción que `usuarios_email_idx` tiene
  `indnullsnotdistinct = false`, es decir **NULLS DISTINCT**, así que admite tantas lápidas con `email IS NULL`
  como haga falta y sigue impidiendo correos repetidos entre cuentas vivas. La columna pasa a nullable con un
  `CHECK` que impide que a una cuenta viva le falte el correo.

### K-19 · Un estado nuevo `eliminada` **falla ABIERTO** si no se toca `resolverPerfil` · **P0 · trampa**
- **Evidencia:** `usuarios_estado_check` sólo admite `activo | suspendido | pendiente`; y `auth-server.ts:114` normaliza así: `estado === 'suspendido' || estado === 'pendiente' ? estado : 'activo'`.
- **Consecuencia:** si se añade `'eliminada'` a la base sin cambiar esa línea, **la lápida se trataría como cuenta activa de rol cliente**: seguiría entrando al portal con un token vivo.
- **Esperado:** ampliar el `CHECK` **y** la normalización en el mismo commit, y que `crearAutorizador` corte `eliminada` **antes** que `suspendido` (una baja no es una suspensión: no se puede «reactivar» pidiéndolo).
- **Prueba obligatoria:** las pruebas **A** y **G** del §9 del diseño.

### K-20 · El token sobrevive a la baja: el orden de los pasos **no es opcional** · **P0**
- **Evidencia:** `verifyIdToken` valida el JWT **localmente** contra las claves públicas de Google (`jose`/JWKS), con emisor y audiencia. **No hay `checkRevoked` ni Admin SDK.**
- **Consecuencia:** borrar la identidad en Firebase **no invalida** el token ya emitido; sigue sirviendo hasta que caduca (hasta 1 h).
- **Esperado:** el **servidor** es quien cierra la cuenta. Orden obligatorio: (1) lápida en la base → el servidor rechaza en la petición siguiente; (2) borrar la identidad de Firebase; (3) cerrar sesión en el navegador. Si el paso 2 falla, la cuenta ya está cerrada igual.

### K-21 · Borrar la cuenta de Firebase **sí se puede** desde el navegador — K-05 estaba incompleto · **P1 · corrección**
- **Evidencia:** el SDK del navegador (`firebase/auth`, ya instalado) trae `deleteUser(user)` y la reautenticación reciente que exige: `reauthenticateWithPopup` (Google) y `reauthenticateWithCredential` (contraseña). **No hace falta cuenta de servicio.**
- **Corrección a K-05:** aquel hallazgo daba la baja de Firebase por «paso manual del administrador». Con la política nueva **la ejecuta la propia persona**, en su sesión, tras reautenticarse; es además lo único que permite el alta nueva con el mismo correo.
- **Límite honesto:** si el navegador se cierra entre el paso 1 y el 2, la identidad de Firebase puede quedar viva con la cuenta ya cerrada. Al volver a entrar, el servidor responde con la cuenta eliminada y la pantalla debe ofrecer **terminar la baja** (reautenticar y borrar), no resucitar nada.

### K-22 · Las invitaciones se aplican **por correo**: una cuenta nueva podría heredar un rol · **P0 · choca con la política**
- **Evidencia:** `aplicarInvitacion` busca `invitaciones` con `estado='pendiente'` e `ilike('email', usuario.email)` y escribe ese rol; se llama desde `GET /api/usuarios/me`, en el mismo alta silenciosa. Índice `invitaciones_email_pendiente` único sobre `lower(email)` sólo para pendientes. **Hoy hay 2 invitaciones pendientes en producción.**
- **Consecuencia:** si alguien con invitación pendiente (o invitado de nuevo) se da de baja y vuelve a registrarse, **la cuenta nueva nacería con rol de publicador o admin**, no como cliente.
- **Esperado:** la baja **cancela** las invitaciones pendientes de ese correo (quedan con estado propio, no se borran: son historial de quién invitó a quién). Una invitación **posterior** a la baja sí vale: es un acto nuevo y deliberado de un administrador, no herencia.
- **Nota:** el rol **no** viene de ninguna lista de correos en variables de entorno. `resolverPerfil` lo lee de la fila (`superAdmin = rol === 'super_admin'`), así que por esa vía no se hereda nada. La invitación es el **único** camino por el que un correo podría recuperar privilegios.

### K-03 · El aviso de privacidad ya promete **20 días hábiles**, y no dice nada de conservación · **P0 legal**
- **Evidencia:** `src/app/privacidad/page.tsx` — «Responderemos en un plazo máximo de 20 días hábiles» para los derechos ARCO; los canales publicados son correo y WhatsApp. **Cero menciones** a plazos de conservación, y los términos tampoco hablan de conservación fiscal.
- **Hoy:** el compromiso existe y está publicado; el portal añadiría un **tercer canal** que hoy no se menciona.
- **Corrección del 23-sep:** ese plazo es para **responder** una solicitud ARCO, **no** para borrar. Mi
  redacción anterior lo mezclaba, y de ahí salía la idea equivocada de una cola con «días restantes» para
  ejecutar la baja. El **cierre de la cuenta es inmediato**; lo que sigue un ciclo con plazos es la
  **cancelación de los datos** (bloqueo → supresión), que es otra cosa. Ver §0.1 y §10 de
  `DISENO_BAJA_DE_CUENTA.md`.
- **Riesgo:** prometer en el portal algo distinto de lo publicado; y decir «se borrará todo en 20 días», que
  no es cierto ni es lo que hace el sistema.
- **Propuesta:** el texto se actualiza **en DRAFT** con el canal del portal, el ciclo bloqueo → supresión, los
  casos de conservación y que el cierre es inmediato e irreversible (D-19, decide el abogado).

### K-04 · Qué debe conservarse, y por qué · **P1 · [LEGAL DECISION REQUIRED]**
- **Evidencia:** hoy no hay facturación, contratos ni operaciones cerradas en el sistema (0 citas, 0 solicitudes). Lo que sí hay y tiene valor probatorio: `audit_logs` (260 filas, con `actor_uid` **not null**), `leads` con `consentimiento_version` y `privacy_accepted`, y `solicitudes_contacto` con `consentimiento_en/version`.
- **Propuesta (a confirmar por el abogado):** se **conserva** la bitácora (es el registro de quién hizo qué, incluida la propia baja) y el **consentimiento** con su versión y fecha —borrarlo dejaría a la casa sin poder demostrar que existió—; se **anonimiza** el resto de datos de contacto; se **borran** las preferencias (guardadas, búsquedas). Las propiedades publicadas por un publicador **no se borran**: son del catálogo, y su dueño pasa a «cuenta dada de baja».
- **Nota de bitácora:** `audit_logs.actor_uid` es `not null` y **no tiene FK**: la bitácora se **bloquea** (se conserva íntegra, incluido el `uid` de la lápida). Lo que se disocia ahí es `actor_email`, no la fila.

### K-05 · El servidor debe rechazar la cuenta cerrada por **estado**, no por Firebase · **P1 · completado por K-21**
- **Evidencia:** el servidor sólo **valida** tokens con claves públicas (`jose`/JWKS); no hay cuenta de servicio de Firebase en el proyecto.
- **Esperado:** el cierre lo manda `estado = 'eliminada'` en la base, igual que `suspendido` ya devuelve 403 en todo. Esa es la fuente de verdad, y es la que funciona aunque Firebase falle.
- **Lo que este hallazgo daba por imposible y sí se puede:** borrar la identidad de Firebase — lo hace la propia persona desde su sesión (K-21). Sin ese borrado, el alta nueva con el mismo correo reutilizaría el **UID anterior**, que es justo lo prohibido.

### K-23 · Mapa completo: **18 columnas** apuntan a una persona, y cada una tiene su trato · **P0**
Verificado el 23-sep contra `information_schema` (filas reales en producción entre paréntesis).

| Tabla · columna | FK | Qué es | Trato en la baja |
|---|---|---|---|
| `usuarios.uid` (4 cuentas) | PK | **La identidad** | Se conserva: es la lápida. `estado='eliminada'` |
| `usuarios.email` ·`nombre`·`telefono`·`whatsapp`·`foto_url` | — | PII de la identidad activa | **Disociación** (K-18); la foto, **supresión** también en Cloudinary |
| `usuarios.rol` | — | Privilegios | A `cliente`: una lápida no conserva poderes |
| `usuarios.busca_*`, `presupuesto_max`, `completitud`, `bienvenida_vista` | — | Preferencias | **Supresión** (a `null`/0) |
| `propiedades.owner_id` (6 con dueño) | ✅ | Catálogo, historial comercial | **Se conserva**. La propiedad no se borra ni se despublica por una baja |
| `citas.cliente_uid` · `asesor_uid` (0) | ✅ | Historial de visitas | Fila **se conserva**; `cliente_nombre/telefono/email` **disociados** |
| `ajustes_citas`·`bloqueos_asesores`·`calendarios_google`·`disponibilidad_asesores`.`asesor_uid` (0) | ✅ | Configuración operativa de un asesor | **Supresión**: sin cuenta activa no hay agenda que publicar. `calendarios_google` además guarda credenciales → supresión obligada |
| `solicitudes_contacto.cliente_uid` (0, NOT NULL) | — | Lead entregado a VIVE BIEN | **Se conserva**; datos de contacto **disociados** |
| `solicitudes_contacto.owner_id` (0) | — | A qué publicador tocaba | **Se conserva** |
| `favoritos.uid` (0) · `busquedas_guardadas.uid` (1) | — | Preferencias | **Supresión** |
| `eventos.uid` (76 filas, **ninguna con uid**) | — | Analítica | Ya es anónima; `uid` a `null` si lo hubiera |
| `google_oauth_estados.uid` (0) | — | Estado efímero de OAuth | **Supresión** |
| `audit_logs.actor_uid` (262, NOT NULL) | — | Bitácora | **Bloqueo**: íntegra. `actor_email` disociado |
| `citas_eventos.actor_uid` (0) | — | Bitácora de citas | **Bloqueo** |
| `configuracion.actualizado_por` | — | Quién cambió un flag | **Bloqueo** |
| `invitaciones.aceptada_por` | — | Historial de invitaciones | **Bloqueo**; las **pendientes de ese correo se cancelan** (K-22) |

### K-24 · Publicador: nada obliga a borrar en cascada · **P1**
- **Evidencia:** `propiedades.owner_id` es **nullable** y con FK `NO ACTION`; hay **6 propiedades con dueño**. `citas`, `solicitudes_contacto` y los acuerdos guardan su propia copia de los datos que necesitan.
- **Consecuencia:** dar de baja a un publicador **no exige** tocar sus propiedades. La lápida sostiene la FK, y el catálogo sigue igual.
- **Esperado:** la baja de un publicador **no despublica, no borra y no reasigna** propiedades, citas, acuerdos ni operaciones. Lo que se pierde es el **acceso**, no el historial. Reasignar una propiedad a otro publicador es una decisión comercial aparte, de un administrador, y con su propia bitácora.
- **Y la vuelta:** una cuenta nueva con el mismo correo es un **cliente sin nada**. No recupera el rol, ni las propiedades, ni los acuerdos. Si debe volver a publicar, un administrador le da el rol otra vez (acto nuevo, no herencia).

### K-25 · Hoy nada liga una cuenta nueva con una anterior — y debe seguir así · **P2**
- **Evidencia:** no existe ninguna columna de «cuenta anterior», ni búsqueda de usuarios por correo en el alta. Las únicas búsquedas por correo son del panel (`/api/admin/invitaciones`, `/api/admin/buscar`, webhook de Telegram) y ninguna participa en crear cuentas.
- **Esperado:** se mantiene. La lápida **no** guarda a qué correo perteneció, y el alta nueva **no** consulta si hubo una baja. Sin rastro que seguir, la re-alta no puede heredar por accidente.
- **Riesgo a vigilar:** que alguien «mejore» el panel añadiendo un cruce por correo entre lápidas y cuentas nuevas. Eso reconstruiría la identidad que la baja acaba de disociar.

### K-26 · La ruta que **crea cuentas** es la única que se salta el autorizador central · **P0 · seguridad**
- **Evidencia:** `GET /api/usuarios/me` hace `verifyIdToken` + `getPerfil` directamente y **no mira `estado`** — ni siquiera `suspendido`. `PATCH` sí lo mira, pero con una copia a mano de la regla (`if (perfil.estado === 'suspendido')`), no con `autorizar()`. Ninguna de las dos pasa por `crearAutorizador`.
- **Consecuencia con la política nueva:** una sesión cuyo `uid` tiene lápida recibiría **200** y su perfil. Y como el alta silenciosa hace `upsert(... , {onConflict:'uid', ignoreDuplicates:true})` seguido de `update({rol: invitado}).eq('uid', …).eq('rol','cliente')`, una invitación pendiente podría **cambiarle el rol a una cuenta ya cerrada**.
- **Por qué importa justo aquí:** mientras la identidad de Firebase de U1 exista, entrar con Google **devuelve el UID de U1**, no uno nuevo. Sin esta guarda, «volver a registrarse» antes de tiempo no crea U2: reanima a U1.
- **Esperado:** las dos rutas pasan por la misma barrera, y el alta lleva una **guarda de lápida** explícita: un `uid` con `estado='eliminada'` nunca se revive, no recibe invitaciones y no cambia de rol. 403 y se empuja el proceso pendiente.
- **Pruebas:** **I** (re-registro antes de que Firebase confirme → bloqueado) y **J** (después de `completada` → UID nuevo → CLIENTE).

### K-27 · La matriz eran **22 referencias**, no 18 · **P1 · corrección propia**
- **Evidencia:** mi primer barrido buscó una **lista de nombres** (`uid`, `%_uid`, `owner_id`, `actor_uid`, `aceptada_por`, `revisor_uid`, `creado_por`, `actualizado_por`) y por eso se dejó fuera `citas.creada_por` (femenino), `citas.propuesta_por`, `invitaciones.invitado_por` y `propiedades.revisado_por`. Rehecho con un patrón sobre el catálogo completo (`uid|_por$|owner|actor|usuario|asesor|revisor|titular|autor`).
- **Consecuencia:** cuatro columnas que apuntan a una persona se habrían quedado **sin tratamiento**, que es justo lo que no puede pasar.
- **Esperado:** la matriz completa (§4 del diseño) y una prueba que **falle** si aparece una columna nueva que pueda apuntar a una persona y no esté declarada. La lista de nombres no vuelve a usarse como método.

### K-28 · `propiedades.revisado_por` guarda un **correo**, no un `uid` · **P1**
- **Evidencia:** cinco filas con `jemilianoponceperez@gmail.com`. La columna es texto libre sin FK. `invitaciones.invitado_por` tampoco guarda siempre un `uid`: hoy tiene la etiqueta `'D-13 · migración 21'`.
- **Consecuencia:** es **identidad por correo**, justo lo que D-35 prohíbe, y sobreviviría intacta a una baja: la lápida pondría su correo a `null` mientras esa columna lo sigue guardando.
- **Esperado (3b-3):** entra en la matriz como **disociar** — se pone a `null` cuando es el correo de quien se da de baja.
- **Pendiente de fondo (fuera de 3b-3):** migrar la columna a `uid`, que es lo que debería haber guardado siempre. No bloquea la migración 25.

## 2 · «Mi propiedad» (solicitud para publicar)

### K-06 · Hoy es un lead anónimo: no se liga a la cuenta ni evita duplicados · **P1**
- **Evidencia:** `QuieroPublicar` manda `POST /api/registro-lead` con `interes: 'Quiere publicar una propiedad'` y `origen: 'registro'`; `leads` no tiene `uid`; la ruta exige sesión y consentimiento, pero guarda un lead más.
- **Hoy:** el equipo ve un lead suelto; la persona no ve nada en su portal; si insiste, se duplica.
- **Esperado (D-28.6 = C):** **tabla propia** ligada al `uid`, con estado, sin duplicados (una solicitud viva por cuenta) y **sin** dar el rol: la activación la hace un administrador (fase 4).
- **Propuesta:** `solicitudes_publicacion` (uid, datos mínimos de la propiedad que quiere publicar, estado, fechas, revisor, motivo) + pantalla del portal que enseña el estado + cola en el panel. El lead anónimo del sitio público **no cambia**.

### K-07 · No hay convención de estados para «solicitudes» · **P2**
- **Evidencia:** el sistema tiene dos máquinas de estado buenas de las que copiar: publicación (`borrador → en_revision → publicada…`, con `puedeTransicionar` y roles) y citas (`AppointmentStatus`).
- **Propuesta:** una sola forma para las dos solicitudes nuevas —`recibida → en_revision → aprobada | rechazada | cancelada`— decidida en código puro y probada, como `puedeTransicionar`.

## 3 · Dependencias, permisos y bitácora

### K-08 · Doce archivos del servidor leen `leads` o `solicitudes_contacto` · **P1**
- **Evidencia:** actividad, analítica, buscador global, notificaciones, registros, resumen del panel, `/api/contacto`, `/api/leads`, `/api/registro-lead` y tres rutas del portal.
- **Riesgo:** anonimizar o borrar filas puede vaciar métricas, romper el buscador del panel o dejar tarjetas sin nombre.
- **Propuesta:** el procedimiento de baja **no borra** `leads` ni `solicitudes_contacto`: los anonimiza conservando fecha, origen y propiedad, que es lo que usan las métricas. Las pruebas del panel deben cubrir una fila anonimizada.

### K-09 · Falta el permiso para atender las colas · **P1**
- **Evidencia:** el catálogo tiene diez permisos; ninguno habla de bajas ni de solicitudes de publicación. Lo más cercano: `usuarios.gestionar` (admin y super admin) y `leads.ver_todos`.
- **Propuesta:** **no inventar** permisos nuevos si `usuarios.gestionar` describe bien lo que es (administrar cuentas). Decidir en el PLAN: reutilizar `usuarios.gestionar` para las bajas y `leads.ver_todos` (o `usuarios.gestionar`) para las solicitudes de publicación. Ejecutar la baja definitiva podría exigir **super admin**: es irreversible.

### K-10 · La bitácora ya sirve; sólo faltan nombres de acción · **P2**
- **Evidencia:** `registrar({actor, accion, entidad, entidadId, antes, despues})` escribe en `audit_logs`; hay 19 acciones en uso (`propiedad.editar`, `configuracion.flag`, `usuario.editar`…).
- **Propuesta:** seguir la misma convención: `cuenta.baja_solicitada`, `cuenta.baja_cancelada`, `cuenta.baja_ejecutada`, `publicacion.solicitada`, `publicacion.revisada`. Nada de tablas de bitácora paralelas.

## 4 · Estados reales del portal (vacío, con datos, error, suspendido, sin sesión, flags)

### K-11 · El patrón existe; lo que falta es **cubrir los estados nuevos** · **P2**
- **Evidencia:** `components/portal/Pantalla.tsx` (esqueleto → datos | vacío | error con «Reintentar»), `exigirPortal` (404/401/403), vista previa con tres casos y 63 capturas medidas.
- **Lo que 3b-3 añade y hoy no tiene estado definido:** «sin solicitud», «solicitud recibida», «en revisión», «aprobada», «rechazada», «cancelada» — para las dos solicitudes, y en los tres tamaños.
- **Propuesta:** ampliar los datos de prueba con esos casos y que la batería los mida como los demás.

## 5 · Centro de Ayuda — qué falta para que la arquitectura sea sólida

### K-12 · No hay nada de infraestructura de contenido · **P1**
- **Evidencia:** no existen `src/content`, MDX, ni librería de internacionalización; los textos viven en componentes.
- **Propuesta:** contenido en **base de datos** (no en archivos): es lo que permite estados, versiones, fuentes y que el panel lo administre. Se decide en el PLAN dónde viven los borradores.

### K-13 · La búsqueda necesita una extensión que no está instalada · **P1**
- **Evidencia:** `unaccent` y `pg_trgm` disponibles pero **no instaladas**; `vector` también (para búsqueda semántica futura, fuera de alcance).
- **Riesgo:** sin `unaccent`, buscar «como publico una propiedad» no encuentra «¿Cómo publico una propiedad?».
- **Propuesta:** instalar `unaccent` + `pg_trgm` en la migración del Centro de Ayuda y usar búsqueda de texto de Postgres en español. La semántica (`vector`) queda para el Knowledge Engine, fuera de 3b-3.

### K-14 · `/ayuda` es **pública**: al revés que todo lo del portal · **P1 (SEO)**
- **Evidencia:** `RUTAS_PRIVADAS` bloquea `/portal`, `/admin`, `/api`…; el sitemap lista siete páginas fijas y las fichas publicadas.
- **Esperado:** `/ayuda` y los artículos **sí** se rastrean e indexan, entran al sitemap con su fecha de actualización, y llevan datos estructurados de preguntas donde corresponda.
- **Propuesta:** decidir en el PLAN si el sitemap de ayuda es propio (`/ayuda/sitemap.xml`) y qué pasa con los artículos de publicador/admin (**ésos no se indexan**).

### K-15 · Las cuatro ayudas no pueden compartir tabla sin una regla de visibilidad · **P1**
- **Evidencia:** D-34 separa ayuda pública, de publicador, administrativa y técnica.
- **Riesgo:** un artículo interno indexado por Google, o visible para un cliente.
- **Propuesta:** `audiencia` obligatoria en cada artículo, consultas del sitio público filtradas por `audiencia='publica' and estado='publicado'`, y el resto sólo tras `exigir(...)`. Una prueba que lo vigile, como la de columnas públicas.

### K-16 · Sin `source_key` desde el día uno, el motor futuro no podrá existir · **P2**
- **Evidencia:** D-34 define `knowledge_article_sources` (producto, documentación, legal) con versión y fecha de verificación.
- **Propuesta:** aunque el Knowledge Engine sea posterior, **la arquitectura de 3b-3 debe guardar ya** de qué funcionalidad, ruta, componente o decisión sale cada artículo, y su `last_verified`. Es barato ahora y caro después.

## 6 · Regresiones posibles de 3b-1/3b-2

### K-17 · Lo que 3b-3 puede romper sin querer · **P2**
| Riesgo | Por qué | Cómo se evita |
|---|---|---|
| Entrada «Mi propiedad» en el menú | `lib/portal/rutas.ts` es la única verdad; si se añade sin página, el menú enseña un 404 | La prueba que compara la lista con los `page.tsx` ya lo vigila |
| Configuración gana «eliminar cuenta» | Hoy la prueba exige que **no** aparezca (3b-3 la cambia) | Actualizar esa prueba en el mismo commit, no después |
| Disociar rompe el panel | Doce archivos leen esas tablas (K-08) | Disociar en vez de borrar + prueba con fila disociada |
| **Una lápida se cuela como cuenta activa** | `resolverPerfil` normaliza lo desconocido a `'activo'` (K-19) | `CHECK` y normalización en el **mismo** commit + test A |
| **El alta nueva revienta con `23505`** | Índice único sobre `lower(email)` (K-18) | Disociar el correo en la lápida + test B |
| **Una cuenta nueva nace con rol** | Las invitaciones se aplican por correo (K-22) | Cancelar las pendientes al dar de baja + test D |
| **Se despublican propiedades sin querer** | La baja de un publicador toca `owner_id` (K-24) | La baja no toca el catálogo + tests F y G |
| Nueva migración y el ensayo | Dos tablas nuevas, un `CHECK` ampliado y dos extensiones | Ciclo completo: respaldo, PGlite, transacción revertida, evidencia y `REVERTIR` |
| `/ayuda` público y las rutas privadas | La prueba de `robots` comprueba que ninguna pública empiece por un prefijo privado | `/ayuda` no choca con ninguno; verificarlo igual |

## Lo que hace falta decidir antes de implementar
1. **K-04:** qué se conserva por obligación (abogado) y con qué plazos — condiciona el SQL de la baja.
2. **K-09:** qué permiso atiende la cola de «Mi propiedad». La baja **ya no necesita cola**: la ejecuta la persona (D-35).
3. **K-06:** qué datos mínimos pide «Mi propiedad» (¿tipo, operación, zona, cómo contactar?) sin convertirlo en un alta de propiedad.
4. **K-12/K-14:** dónde viven los artículos y cómo se indexa la ayuda pública.
5. **K-15:** nombres de las cuatro audiencias y quién aprueba publicar.
