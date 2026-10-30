# ADR-0013 · PUBLICADOR / ASOCIADO — modalidad comercial + permisos por usuario

- **Estado:** Aceptada (2-oct-2026) — definición oficial del usuario; implementada en código (modalidad, permisos y citas recibidas); **migraciones 28 y 29 preparadas y sin aplicar**
- **Relacionado:** ADR-0004 (roles y permisos), ADR-0006 (publicador sin PII de leads), DECISIONS D-02, D-08, D-09, D-47

## Contexto

El PRD distingue al publicador que opera con comisión de un socio premium sin comisión. Hacerlo con dos roles
habría duplicado la autorización (cada ruta tendría que preguntar por «publicador» y por «asociado») y habría
atado los permisos a la etiqueta, cuando el negocio necesita excepciones por persona: un publicador con una
capacidad premium, o un asociado al que se le apaga una.

## Decisión

1. **Un solo rol de seguridad:** `usuarios.rol = 'publicador'`. Jerarquía: cliente ⊂ publicador ⊂ admin ⊂ super_admin.
2. **Modalidad** dentro del rol: `usuarios.tipo_publicador = 'publicador' | 'asociado'`.
   - `publicador` — modalidad normal, **con comisión**.
   - `asociado` — modalidad premium, **sin comisión**.
3. **Permisos efectivos = defaults de la modalidad + overrides individuales** (`usuarios.permisos_override`, jsonb
   `{capacidad: true|false}`). La modalidad **no es la autorización**: sólo es la fuente de los valores por defecto.
   La tabla de defaults vive en un único sitio: `src/lib/acceso/capacidades.ts`. Ningún componente de UI decide nada.
4. **Quién los cambia:** sólo admin y super admin, vía `PATCH /api/admin/usuarios` (`tipo_publicador`, `permisos`),
   **con motivo (≥ 10 caracteres)** y bitácora (`usuario.editar`, antes/después). Nadie se cambia a sí mismo, y sólo se
   configura a quien **ya es** publicador (el rol es otra operación, con su propia regla). `/api/usuarios/me` ignora
   estas claves: un publicador no se da modalidad ni permisos.
5. **«Sin revisión» no es «sin seguridad».** `publicar_sin_revision` autoriza **sólo** `borrador → publicada`, sólo para
   un publicador y sólo sobre SU propiedad. El servidor sigue validando dueño, campos protegidos (folio, slug, `owner_id`,
   `estado_pub`), contenido mínimo, perfil de contacto, estados y auditoría (la bitácora anota `sinRevision: true`).
6. **Falla cerrado.** Sin modalidad, sin overrides legibles o con la migración 28 sin aplicar: `publicador` sin overrides.
   `getPerfil` lee las columnas nuevas **aparte** y sólo para publicadores, para que una base sin migrar no bloquee a nadie.

### Capacidades y defaults

| Capacidad | PUBLICADOR | ASOCIADO |
|---|:-:|:-:|
| `publicar_sin_revision` | ✘ | ✔ |
| `editar_publicadas` (corregir lo ya publicado; **lo que está en revisión nunca**) | ✘ | ✔ |
| `recibir_solicitudes` (aviso **sin datos personales**) | ✔ | ✔ |
| `ver_datos_interesado` (permiso aparte: recibir ≠ ver) | ✘ | ✘ |
| `recibir_citas` (puerta de las cuatro siguientes) | ✘ | ✔ |
| `aceptar_citas` · `rechazar_citas` · `reprogramar_citas` · `cancelar_citas` | ✘ | ✔ |
| `mostrar_perfil` · `mostrar_nombre` · `mostrar_foto` | ✘ | ✔ |
| `mostrar_telefono` · `mostrar_whatsapp` · `mostrar_email` | ✘ | ✘ («cuando esté habilitado») |

`recibir_citas` apagada deja apagadas las otras cuatro, aunque un override las encienda. Un cliente o un admin no tienen
capacidades de publicador, diga lo que diga la fila.

### Citas (dos perspectivas) — implementado el 2-oct-2026

Un publicador tiene **dos agendas que no se mezclan**:

- **Mis visitas** (vista `cliente`, `/portal/visitas`): las que él pidió como cliente a propiedades de terceros. No puede pedir una a una propiedad propia.
- **Citas recibidas** (vista `asesor`, `/publicador/citas`): las que clientes piden a SUS propiedades. Sólo existen si tiene `recibir_citas`; sin él, la API responde 403 y el servicio devuelve vacío.

**Quién es asesor.** `atiendeCitas`: el equipo siempre; un publicador sólo con `recibir_citas`; un cliente nunca. `propiedadAgendable` lo comprueba con los permisos efectivos del dueño (si no hay asesor, 409 «todavía no tiene asesor»). Registrar una visita **por otra persona** sigue siendo sólo del equipo.

**Acciones.** `capacidadDeAccionDeCita` (el estado decide): confirmar y aceptar cambio → `aceptar_citas`; rechazar una solicitud sin confirmar (`cancelar` en REQUESTED/PENDING_CONFIRMATION) y rechazar cambio → `rechazar_citas`; proponer y retirar cambio → `reprogramar_citas`; cancelar una ya firme → `cancelar_citas`; completar / no asistió → `recibir_citas`. Se comprueba en `transicionar` con el perfil calculado en servidor (el body no aporta permisos); un 403 queda en la bitácora (`cita.accion:*`). La base no cambia: `cita_transicionar` ya admitía el papel `asesor`.

**Datos del interesado (PII).** `ver_datos_interesado` es independiente de recibir citas y está apagado en ambas modalidades. Sin él, un publicador-asesor NO recibe, por ningún canal: nombre, teléfono, correo ni notas del interesado.
- *Vistas API* (`recortar`): el nombre sale como «Interesado», sin teléfono ni correo; sin `notasCliente`, sin `notasInternas`, sin estado de Google; `acciones` sólo las que su permiso autoriza.
- *Historial* (`GET /api/citas/[id]`): sólo horarios y motivo, como al cliente.
- *Correos* (`enviar.ts`): sin bloque del cliente ni notas; sólo botones —y sólo tokens— de lo permitido; enlazan a `/publicador/citas`.
- *Página de acción por correo* (`verToken`): sin nombre del interesado; si el permiso ya se retiró, el enlace deja de ofrecerse (`motivo: 'permiso'`); `usarToken` actúa con los permisos actuales de la cuenta.
- **Falla cerrado:** si no se puede leer la cuenta del asesor, el correo sale sin PII ni botones, el enlace no enseña nada y al cliente se le muestra «Vive Bien».

**Al cliente.** Ve el nombre del publicador sólo si tiene `mostrar_perfil` **y** `mostrar_nombre`; si no, «Vive Bien». Nunca su teléfono.

**VIVE BIEN se entera.** Cada visita creada en la propiedad de un publicador dispara un aviso interno (alerta Telegram, sin datos personales).

**Horario.** Se usa el modelo que ya existía por asesor (`disponibilidad_asesores`, `ajustes_citas`): sin filas, el horario estándar (L–V 9–18, sáb 10–14, 1 h, confirmación manual). **No hay todavía pantalla para editar el horario propio.** No se creó ninguna tabla nueva.

**Capacidad implementada ≠ función disponible.** Todo lo anterior es backend listo en esta rama. Qué está encendido hoy en producción
(leído de `configuracion.flags` el 2-oct-2026): `citasEnLinea = false` → **no se crea ninguna cita**, para nadie, aunque esto se despliegue;
`portalCliente = true` → el portal de clientes está **abierto** (por lo que «Mis visitas» existe como pantalla, aunque hoy no pueda llenarse
mientras no haya citas); `publisherPortal = false` existe como flag pero **ningún código lo lee** (`/publicador` no depende de él). Antes de
afirmar el estado de un flag en un documento, leerlo; no copiarlo de otro documento.

### Contacto público

Por defecto VIVE BIEN es el contacto comercial. Las capacidades `mostrar_*` sólo las concede un admin; el publicador no
se las concede. Cuándo aparece realmente un dato en el sitio (perfil público habilitado + capacidad + cuenta activa) se
resuelve en la fase de exposición pública (P4).

### Comisión

La modalidad deja **modelado** el modelo comercial (`publicador` = con comisión, `asociado` = sin comisión). **No** se
implementa cálculo, pago ni liquidación: ese módulo no existe.

### Folio

Sin cambios: `VB-AAAA-NNNNN` (p. ej. `VB-2026-00125`), asignado por la base, inmutable, independiente del UUID y del slug.

## Administración de modalidad y permisos (fase ADMIN, 2-oct-2026)

**Pantalla:** `/admin/usuarios` (lista, con la modalidad de cada publicador y la acción «Modalidad y permisos») y `/admin/usuarios/[uid]` (ficha: datos de la cuenta + `PermisosPublicador`). Sólo admin y super admin (`requireAdmin`); sólo cuentas con rol publicador; nunca la propia.

**Cada permiso se ve en tres capas:** lo que da la modalidad (lee `DEFAULTS_POR_TIPO`, sin repetir la tabla), el ajuste individual (Según modalidad / Encendido / Apagado) y el resultado efectivo (calculado por el servidor con `capacidadesEfectivas`). Los permisos van en cinco grupos que respetan la separación **identidad** (perfil, nombre, foto) frente a **contacto** (teléfono, WhatsApp, correo). No existe una capacidad «contacto público»: no se inventó. Lo que hoy ninguna función usa (foto, teléfono, WhatsApp, correo, aviso de solicitudes) se marca «Hoy sin efecto» en vez de prometerlo. La pantalla avisa que `citasEnLinea` está desactivado.

**API:** se reutiliza `PATCH /api/admin/usuarios` (escribir) y se añade `GET /api/admin/usuarios/[uid]` (leer, con efectivos). Reglas añadidas: se guardan **sólo los overrides que se apartan de los defaults de la modalidad resultante** (`compactarOverrides`); un cambio que no cambia nada da 400 y no audita; el cambio de permisos va aparte de rol y estado.

**Atomicidad (hallazgo P2 de Codex L2):** el cambio y su bitácora se hacen en UNA transacción con la función `usuario_cambiar_permisos` (migración 28, aún sin aplicar): bloquea la fila, comprueba que nadie la cambió desde que se leyó (`conflicto` → 409), actualiza y escribe `audit_logs`; exige una huella completa (actor, acción, antes, después y motivo ≥ 10 caracteres: la base también lo exige) y sólo la ejecuta `service_role`. Sin función no hay cambio (503).

**Auditoría:** `usuario.editar` con quién (actor), a quién (`entidad_id` y `objetivo`), `antes` y `despues` (modalidad, overrides **y** permisos efectivos), motivo y fecha (`audit_logs.creado_en`).

**Estado real (verificado el 2-oct-2026): ADMIN está implementado, NO desplegado.** En producción `/admin/usuarios/[uid]` y `/api/admin/usuarios/[uid]` responden 404; `/admin/usuarios` y `/api/admin/usuarios` son las versiones anteriores. La migración **28 (columnas + función) está APLICADA en producción desde el 3-oct-2026** (verificado: 8 cuentas en el valor por defecto, `anon` y `authenticated` sin permiso de ejecución, `service_role` sí, huella incompleta rechazada); las **29 y 30 (ayuda) siguen preparadas, no aplicadas**: sus artículos son de ámbito `publicador`/`administrativa` y hoy no hay pantalla que los muestre, así que aplicarlas no aporta nada. Citas: backend implementado, `citasEnLinea` apagado.

**Validación visual (local, con la vista previa de desarrollo `/vista-previa/admin/usuarios[...]`, que sólo existe con `next dev`):** 390, 768, 1024 y 1440 px, sin desbordes horizontales en ningún estado; contraste ≥ 4.5:1 en los textos pequeños. Correcciones: la tarjeta de la cuenta ya no parte el nombre letra por letra en móvil; el diálogo de confirmación tiene alto máximo y su lista de cambios se desplaza sola (los botones quedan siempre visibles); el conflicto de edición ofrece «Recargar la cuenta»; el contador del motivo dice «N caracteres». La vista previa usa un servidor de prueba en memoria cuya paridad con la ruta real vigila una prueba.

## SUPER_ADMIN: mutaciones sensibles atómicas (3-oct-2026, D-49)

Migración 31: `configuracion_cambiar_flag` y `usuario_cambiar_rol_estado`, mismo patrón que `usuario_cambiar_permisos`. Cambio y huella en una sola transacción, control de concurrencia por valor previo, motivo textual ≥10 al dar/quitar admin. Reversa: `31-…REVERTIR.sql` (sólo borra las funciones; el código nuevo responde 503 hasta reaplicar).
## Alternativas descartadas

- **Dos roles (`publicador`, `asociado`)** → duplica la autorización y ata los permisos a la etiqueta.
- **`tipo === 'asociado'` como única comprobación** → impide excepciones por persona (premium parcial, asociado restringido).
- **Permisos sólo globales en `configuracion`** → no permite overrides individuales.

## Consecuencias

- Migración `supabase/28-publicador-modalidad.sql` (+ `.REVERTIR.sql`): dos columnas con default, aditiva. **No aplicada.**
  El código funciona sin ella (todos como `publicador`); la API que cambia la modalidad responde 503 hasta aplicarla.
- ADR-0006, punto 3 (que decía que el asesor de una cita era siempre personal de VIVE BIEN), queda **enmendado**: un
  publicador con `recibir_citas` puede ser asesor de las citas de sus PROPIAS propiedades (el asesor sigue siendo el dueño,
  `owner_id`; no hay asignación distinta, tarea 08.01), sin datos del interesado por defecto (implementado, ver «Citas»).
- **Confirmado por el usuario (2-oct-2026):** el asociado corrige sus propiedades publicadas por defecto (`editar_publicadas`), sin volver a revisión y respetando los campos protegidos; el publicador normal **no** edita directamente lo publicado y por ahora **no** hay «cambio pendiente de aprobación»: interviene un admin. Lo que está en revisión sigue bloqueado para ambos. `editar_publicadas` es independiente de `publicar_sin_revision`.
