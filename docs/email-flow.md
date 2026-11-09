# Correos de citas (Resend)

> Aprobada el 18-sep-2026; se implementa por fases (ver `appointments-architecture.md` §8).
> **Actualizado por D-76 (8-oct-2026):** el remitente por defecto ya no es `avisos@` sino el correo institucional (ver «0 · Correo institucional y Resend»).

## 0 · Correo institucional y Resend (D-76)

| Qué | Valor | De dónde sale |
|---|---|---|
| **Correo institucional (público)** | `informes@vivebienn.com` | `NEGOCIO.email` (`src/lib/config/negocio.ts`); lo leen pie, contacto, términos, privacidad, página de error, `mailto` de tarjetas y JSON-LD |
| **Remitente** de todo correo automático (citas, avisos de interesados, invitaciones) | `Vive Bien <informes@vivebienn.com>` | `process.env.RESEND_FROM` si existe; si no, `NEGOCIO.remitente`. En Vercel **`RESEND_FROM` no está definida**, así que manda el valor por defecto |
| **Reply-To** de los correos de citas | `informes@vivebienn.com` | `reply_to: NEGOCIO.email` (`src/lib/citas/enviar.ts`). Las invitaciones conservan el `reply_to` de quien invita; el aviso de interesados responde al correo del propio interesado |
| **Destinatario** de los avisos de nuevos interesados | `informes@vivebienn.com` (sólo) | `to: [CORREO_CONTACTO]` (`src/lib/aviso-lead.ts`). Desde D-77 ya **no** hay copia a la cuenta del propietario: el buzón fue verificado por el propietario el 8-oct-2026 |
| **Cuentas personales** (usuarios del sistema, NO contacto) | `joseponcer@vivebienn.com`, `joseponcep@gp-once.com` | `CUENTA_PROPIETARIO` (`src/lib/config/negocio-interno.ts`) para la siembra y el respaldo de Telegram (`TELEGRAM_OWNER_EMAIL` en Vercel manda sobre el respaldo); roles sembrados en `supabase/21` |

**Resend:** dominio `vivebienn.com` **verificado**, envío habilitado, recepción en Resend deshabilitada; `RESEND_API_KEY` configurada (no se documenta su valor). Esto prueba que se PUEDE enviar desde `informes@`; **no** prueba que el buzón exista ni que reciba (el correo entrante va por Google Workspace: MX `smtp.google.com`).

**Buzón VERIFICADO (8-oct-2026):** el propietario comprobó manualmente que `informes@vivebienn.com` existe y recibe correo (el MX es Google Workspace). Queda sin documentar —a propósito— quién lo lee y cómo está configurado en Workspace (usuario, alias o grupo).

**Variables de entorno:** no se necesita ninguna nueva. `NEXT_PUBLIC_ADMIN_EMAIL` (Vercel, Producción) está **huérfana**: ningún código la lee; queda pendiente de limpieza con autorización.

**Contactos públicos vs. personales:** los correos personales no se publican como contacto. El correo que cada persona escribe al registrarse o en un formulario es de ella y no se sustituye.

## 1 · Qué correo sale y cuándo

| Momento | Al cliente | Al asesor | Enlaces de acción |
|---|---|---|---|
| El cliente pide visita (`REQUESTED`) | "Recibimos tu solicitud" | "Nueva solicitud de visita" | Asesor: **Confirmar**, **Proponer otro horario** (este abre el panel) |
| El asesor/admin registra (`PENDING_CONFIRMATION`) | "Te agendamos una visita, confírmala" | — | Cliente: **Confirmar**, **Cancelar** |
| Confirmada | "Tu visita está confirmada" + `.ics` + "Agregar a Google Calendar" | "Visita confirmada" | Cliente: **Cancelar**; reprogramar abre el portal |
| Proponen otro horario | A quien no propuso | A quien no propuso | **Aceptar**, **Rechazar** |
| Reprogramada | "Tu visita cambió de hora" + `.ics` actualizado | Aviso | Cliente: **Cancelar** |
| Cancelada | "Tu visita se canceló" (+ motivo si lo hay) | Aviso | — |
| 24 h antes | Recordatorio | Recordatorio | Cliente: **Cancelar** |
| 2 h antes | Recordatorio | — (a confirmar) | — |

- El **admin** se entera por la campana del panel. Una copia por correo al institucional (`informes@vivebienn.com`) es opcional (a decidir); ya no se piensa en `joseponcer@` para esto.
- Si la cita se agendó con menos de 24 h, no sale el recordatorio de 24 h.
- No hay correos de "seguimiento comercial" (eso sería CRM).

## 2 · Enlaces de acción seguros

> **RETIRADO el 9-nov-2026 (ADR-0014, decisión 5):** los endpoints `POST /api/citas/accion` y `/accion/ver` y la página `/citas/accion` ya no existen; los correos no llevan botones de acción (el enlace lleva al panel con sesión). Lo que sigue describe el diseño original y se conserva solo como historial; las tablas/funciones SQL de tokens quedan sin uso.
> **Cancelación (9-nov-2026):** el cliente que cancela recibe el correo de cancelación con `.ics` (`STATUS:CANCELLED`).


Nunca `/confirmar?id=123`. Cada enlace:

1. Es `https://vivebienn.com/citas/accion#<token>`: el token va **después del `#`**, así no llega al servidor, a los registros de Vercel ni al encabezado `Referer`.
2. El token son 32 bytes aleatorios (base64url). En la base sólo va su **hash SHA-256** (`citas_tokens`).
3. Sirve para **una** acción, **una** cita y **una** persona; caduca a las 72 h o a la hora de la visita; se revoca si la cita cambia (`version_cita`) o si se usa otro enlace de la misma cita.
4. **Abrirlo no hace nada.** La página lee el token, pide `POST /api/citas/accion/ver` y muestra la cita ("Nave Industrial San Juan Bosco · martes 3 de sep · 11:00"). Sólo al pulsar **Confirmar visita** se hace `POST /api/citas/accion`.
   Por eso los escáneres de correo (que abren enlaces solos) no confirman nada, y un clic en el correo tampoco.
5. El uso es atómico: `update citas_tokens set usado_en = now() where hash = $1 and usado_en is null and revocado_en is null and expira_en > now() returning …`. Si no devuelve fila: "Este enlace ya se usó o venció" + botón al portal.
6. La acción pasa por el mismo servicio y la misma máquina de estados que el panel (`via = 'correo'`).
7. Página `noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, límite de intentos por IP.

**Rastreo de aperturas y clics de Resend:** debe estar **apagado** para el dominio. El rastreo de clics reescribe los enlaces pasando por un servidor de Resend y, en cualquier caso, un clic no cuenta como confirmación. (Hay que revisar cómo está hoy en Resend.)

## 3 · No duplicar

- Antes de enviar se inserta la fila en `citas_correos` con `clave_idempotencia` única, por ejemplo `cita/<id>/confirmada/v3/cliente`. Si ya existe, no se envía otra vez.
- La misma clave va en la cabecera `Idempotency-Key` de Resend: si la red corta y se reintenta, Resend devuelve la respuesta original sin mandar otro correo (Resend guarda la llave 24 h y admite hasta 256 caracteres).
- La versión en la clave hace que un cambio de horario sí genere un recordatorio nuevo.
- Resultado guardado: `resend_id`, `estado` (`enviado` / `error`), `error`, `intentos`. Los fallidos se reintentan desde la tarea programada.

## 4 · Recordatorios

La tarea de cada 10 min (`/api/citas/tareas`, ver arquitectura §5):

- **24 h:** citas `CONFIRMED`/`RESCHEDULED` con `inicio − 24 h ≤ ahora` y `inicio > ahora + 2 h`, sin correo `recordatorio_24h` de esa versión.
- **2 h:** citas `CONFIRMED`/`RESCHEDULED` con `inicio − 2 h ≤ ahora < inicio`, sin correo `recordatorio_2h` de esa versión.

## 5 · El archivo `.ics`

- `UID` = `<id de la cita>@vivebienn.com` (el mismo siempre), `SEQUENCE` = versión de la cita: los calendarios que lo soportan actualizan el evento en vez de duplicarlo.
- Horas en UTC; `SUMMARY` "Visita · {propiedad}"; `LOCATION` la dirección pública; descripción con el enlace al portal.
- Cancelada: `.ics` con `STATUS:CANCELLED`. No todos los calendarios lo aplican solos; el correo lo dice claramente.
- "Agregar a Google Calendar": enlace de plantilla de Google con título, horario y lugar. **Sin datos personales en la URL.**

## 6 · Plantillas

- HTML con los colores y el logo de la marca, en el estilo de `invitacion-correo.ts` / `aviso-lead.ts` (sin librería nueva; si crecen, se evalúa React Email).
- Siempre con versión de texto plano.
- Todo texto que venga del usuario (nombre, notas) se escapa.
- Fechas en español y hora de León: "martes 3 de septiembre, 11:00 a. m. (hora de León)".
- Pie con el contacto de Vive Bien (`informes@vivebienn.com`) y cómo dejar de recibir recordatorios (los de confirmación y cancelación son transaccionales y siempre salen).

Referencia: [idempotencia en Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
