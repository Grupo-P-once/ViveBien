# Permisos de citas

> **⚠️ Ajuste del Master PRD v2.0 (18-sep-2026), enmendado el 2-oct-2026 (ADR-0013):** el «asesor» de una cita es el dueño de la propiedad **si puede atender citas**: personal de VIVE BIEN, o un **publicador con `recibir_citas`** (p. ej. un asociado) para sus propias propiedades. El publicador-asesor ve la cita **sin datos del interesado** salvo el permiso `ver_datos_interesado` (apagado por defecto). Ver `adr/ADR-0013-…`, `adr/ADR-0006-…` (punto 3 enmendado), `DECISIONS.md` D-08 y D-47. Está implementado en código; en producción `citasEnLinea` sigue apagado, así que todavía no se crea ninguna cita. Lo demás de este documento sigue vigente.

> Aprobada el 18-sep-2026; se implementa por fases (ver `appointments-architecture.md` §8).

> **Quién administra estos permisos:** un admin o super admin, desde `/admin/usuarios/[uid]` (ADR-0013, D-48): implementado, **no desplegado**; `citasEnLinea` sigue apagado.
>
> **ENMIENDA del 6-nov-2026 (tabla de roles del dueño, ADR-0014):** el **asociado que ATIENDE** una cita ve lo necesario para coordinarla —**nombre, teléfono y las notas que la persona escribió para la visita**—, nunca su **correo** (salvo `ver_datos_interesado`), ni las notas internas ni el estado de Google. El **publicador** (que no atiende: la coordina VIVE BIEN) ve las visitas a sus propiedades en solo lectura y **sin ningún dato personal**. Lo que sigue describe la regla del 2-oct-2026, que esta enmienda sustituye en lo del nombre, teléfono y notas del asociado.
>
> **Detalle de la enmienda del 2-oct-2026 (SUSTITUIDA en parte, ver arriba):** un publicador-asesor ve la cita **sin** nombre, teléfono, correo ni notas del interesado salvo que tenga `ver_datos_interesado`, no ve notas internas ni el estado de Google, y cada acción (aceptar, rechazar, reprogramar, cancelar) exige su propio permiso. La tabla «Quién es quién» de arriba dice «Al crearla se copia de `propiedades.owner_id`»: sigue siendo cierto, y por eso un publicador sin `recibir_citas` no recibe ninguna. La fila «Admin = `ADMIN_EMAILS`» de la tabla de arriba está obsoleta desde V-1.1.81: el rol vive sólo en la base. Detalle en `adr/ADR-0013-…`.

> **DECISIONES del 9-nov-2026 (ADR-0014):** (1) el **asociado dueño** de una propiedad que atiende otra persona ve nombre, teléfono y notas en solo lectura (correo solo con `ver_datos_interesado`); el publicador no asociado, nada. (2) Un **admin que es el cliente** de una cita actúa como cliente en ella (no se confirma sola; regla de 2 h intacta). (6) El admin ve en el historial **quién** hizo cada cambio (nombre, nunca uid). Quién atiende cada propiedad se asigna en `/admin/citas/responsables`.


## Quién es quién

| Papel | Cómo se sabe |
|---|---|
| **Cliente** de una cita | `citas.cliente_uid = uid` de la sesión. **Sólo cuentas creadas** (fila en `usuarios`): quien sólo llenó el formulario de registro no puede agendar. |
| **Asesor** de una cita | `citas.asesor_uid = uid`. Al crearla lo decide `responsableDeCitas` (`src/lib/citas/servicio.ts`, ADR-0014 §3), en este orden: el **responsable asignado** a la propiedad (`propiedades.responsable_citas_uid`) → el **dueño** (`propiedades.owner_id`) **si puede atender citas** (el equipo de VIVE BIEN, o un **publicador con `recibir_citas`**, ADR-0013; «publicador-asesor» abajo) → el **responsable del equipo** (`configuracion.citas.responsable_equipo_uid`). Si ninguno aplica, **409 «sin asesor»** (falla cerrado). *Corregido el 8-nov-2026: antes decía «se copia de `owner_id`».* **Nota operativa:** hoy ninguna pantalla ni ruta escribe `responsable_citas_uid` ni `responsable_equipo_uid`; se asignan por SQL (pendiente de decisión del dueño: construir esa pantalla). |
| **Admin** | `usuarios.rol` = `admin` o `super_admin` en la base (la lista `ADMIN_EMAILS` ya no se lee desde V-1.1.81). Ve y actúa sobre todas. |
| **Sistema** | Tareas programadas (vencidas, recordatorios). |

La sesión es de Firebase; el servidor la verifica con `verifyIdToken`. Toda lectura y escritura pasa por la API con la clave de servicio. Las tablas de citas tienen **RLS activo y ninguna política**: el navegador no puede leerlas directamente, ni con la clave anónima.

## Qué ve cada uno

| Dato | Cliente | Asesor | Admin |
|---|---|---|---|
| Fecha, hora, estado, propiedad, lugar | ✔ | ✔ | ✔ |
| Nombre del asesor | ✔ (si es un publicador, sólo con `mostrar_perfil` y `mostrar_nombre`; si no, «Vive Bien») | ✔ | ✔ |
| Teléfono / correo del cliente | Los suyos | ✔ el equipo (aceptó compartirlos al agendar) · **asociado que atiende: teléfono ✔, correo ✘ salvo `ver_datos_interesado`** (desde el 6-nov-2026) · publicador que no atiende: ✘ (ve «Interesado») | ✔ |
| Teléfono / correo del asesor | ✘ (ve el contacto de Vive Bien) | ✔ | ✔ |
| Notas del cliente | ✔ | ✔ el equipo · **asociado que atiende: ✔ (notas de la visita)** · publicador que no atiende: ✘ salvo `ver_datos_interesado` | ✔ |
| Notas internas | ✘ | ✔ el equipo · **publicador-asesor: ✘** | ✔ |
| Historial completo | Sólo cambios de fecha y estado | ✔ el equipo · **publicador-asesor: sólo horarios y motivo** | ✔ |
| Estado de Google / correos | ✘ | Sus citas (el equipo) · **publicador-asesor: ✘** | ✔ |
| Citas de otros clientes | ✘ | Sólo de sus propiedades; un publicador-asesor, sólo con `recibir_citas` | ✔ |

La API arma la respuesta según el papel (`getAppointment(id, actor)`); nunca manda un campo para que la pantalla lo esconda.

## Qué puede hacer cada uno

| Acción | Cliente | Asesor | Admin |
|---|---|---|---|
| Pedir visita (`REQUESTED`) | ✔ propiedades publicadas | — | — |
| Registrar visita (`PENDING_CONFIRMATION`) | — | ✔ sus propiedades, para una cuenta existente (**sólo el equipo; un publicador-asesor no registra por otras personas**) | ✔ cualquiera, para una cuenta existente |
| Confirmar | Si la registró el asesor | Si la pidió el cliente (publicador-asesor: con `aceptar_citas`) | ✔ |
| Proponer otro horario | ✔ | ✔ (publicador-asesor: con `reprogramar_citas`) | ✔ |
| Aceptar / rechazar la propuesta | Si la propuso el asesor | Si la propuso el cliente (publicador-asesor: `aceptar_citas` / `rechazar_citas`) | ✔ |
| Cancelar | ✔ | ✔ (motivo). Publicador-asesor: `rechazar_citas` si aún no está confirmada, `cancelar_citas` si ya es firme | ✔ (motivo) |
| Realizada / no asistió | — | ✔ después de la hora (publicador-asesor: con `recibir_citas`) | ✔ |
| Corregir realizada ↔ no asistió | — | — | ✔ |
| Notas internas | — | ✔ el equipo · publicador-asesor: ✘ | ✔ |
| Horario, bloqueos y ajustes | — | Los suyos | De todos |
| Conectar Google Calendar | — | El suyo | Ver estado y desconectar (nunca ve tokens) |

## Enlaces de acción en correos

Un enlace sirve para **una** acción, sobre **una** cita, para **una** persona:

- Token aleatorio de 32 bytes; en la base sólo se guarda su hash SHA-256.
- Vale una vez, caduca (72 h o la hora de la visita, lo que llegue antes) y deja de valer si la cita cambió (`version_cita`).
- Va después de `#` en la URL: el servidor, los registros de Vercel y el encabezado `Referer` nunca lo ven.
- Abrir el enlace sólo muestra la cita; la acción exige pulsar el botón (así los escáneres de correo no confirman nada).
- Límite de intentos por IP con `src/lib/limites.ts`.

## Google Calendar

- Los tokens de Google se cifran en el servidor (AES-256-GCM, llave en variable de entorno) y **nunca** llegan al navegador.
- El admin puede ver si un asesor está conectado y desconectarlo; no puede leer su calendario.

## Tiempo real

- Canal por persona con nombre secreto (HMAC del uid). El aviso no lleva datos; la pantalla vuelve a pedir por la API con sesión.

## Datos personales (LFPDPPP)

- Al agendar se guarda la versión del aviso de privacidad aceptado (como en `solicitudes_contacto`).
- Al evento de Google del asesor sólo va: propiedad, lugar, nombre del cliente y un enlace al panel. Teléfono y correo, no.
- **Pendiente de tu revisión:** el aviso de privacidad debería mencionar que la visita se agenda en el calendario del asesor y que se envían recordatorios por correo.
