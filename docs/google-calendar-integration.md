# Google Calendar — integración

> Aprobada el 18-sep-2026; se implementa por fases (ver `appointments-architecture.md` §8). **Google es una salida, nunca la fuente.** Si Google falla, la cita existe igual y el fallo se ve en el panel.

## 1 · Qué hace y qué no

| Hace | No hace |
|---|---|
| Pone cada cita activa en el calendario del **asesor** y la actualiza o borra cuando cambia. | No decide nada: mover o borrar el evento en Google **no** cambia la cita. |
| Consulta cuándo está ocupado el asesor (`freebusy.query`) para no ofrecer esos horarios. | No lee el contenido de sus otros eventos. |
| Avisa si el asesor movió o borró nuestro evento en Google (canal `events.watch`). | No manda invitaciones de Google al cliente (ver §5). |

## 2 · Lo que tienes que hacer tú en Google Cloud

No lo puedo hacer yo: implica tu cuenta y aceptar términos de Google.

1. En el proyecto de Google Cloud de Vive Bien (el de Firebase), **habilitar Google Calendar API**.
2. **Pantalla de consentimiento OAuth:** nombre "Vive Bien", logo, dominio `vivebienn.com`, enlaces a `/privacidad` y `/terminos`, correo de soporte.
3. **Alcances** (los mínimos que alcanzan):
   - `https://www.googleapis.com/auth/calendar.events.owned` — crear, cambiar y borrar eventos en calendarios propios.
   - `https://www.googleapis.com/auth/calendar.freebusy` — ver disponibilidad.
4. **Cliente OAuth** tipo "Aplicación web":
   - Orígenes: `https://vivebienn.com` (y `http://localhost:3000` para pruebas).
   - Redirección: `https://vivebienn.com/api/google/callback`.
5. Poner en Vercel: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKENS_KEY` (llave de cifrado, la genero yo y te digo cómo ponerla sin pegarla en el chat).

### Publicación y verificación

Los alcances de Calendar son **sensibles**. Tres caminos:

| Modo | Qué pasa | Para quién sirve |
|---|---|---|
| **Pruebas** ("Testing") | Sólo usuarios que agregues a mano. **La conexión caduca cada 7 días** y hay que volver a conectar. | Sólo para probar. |
| **Producción sin verificar** | Google muestra "Google no verificó esta app" y limita a 100 usuarios. La conexión no caduca. | Viable si sólo se conectan el admin y pocos asesores. |
| **Producción verificada** | Sin aviso. Google revisa la app (política de privacidad, video del uso, dominio verificado); tarda días o semanas. | Si habrá muchos publicadores externos. |

Recomendación: empezar en **producción sin verificar** (sólo asesores internos) y pedir la verificación cuando haya publicadores externos.

> Esto se cruza con el pendiente del inicio de sesión con Google (`origin_mismatch`): conviene revisar orígenes y redirecciones de los dos clientes OAuth en la misma sesión.

## 3 · Conectar y desconectar

```
Asesor pulsa "Conectar Google Calendar" (portal o /admin/calendario)
  → POST /api/google/conectar  (con su sesión)
      · genera state aleatorio + verificador PKCE
      · guarda hash(state), uid y verificador cifrado en google_oauth_estados (10 min, un uso)
      · devuelve la URL de Google (access_type=offline, prompt=consent, code_challenge S256)
  → el navegador va a Google, el asesor acepta
  → GET /api/google/callback?code&state
      · valida state (existe, no usado, no vencido) y lo marca usado
      · canjea el code con el verificador PKCE
      · comprueba que concedió los dos alcances
      · cifra el refresh token (AES-256-GCM) y lo guarda en calendarios_google
      · abre el canal de avisos (§6)
      · redirige a la pantalla de origen con "Conectado"
```

- El token de acceso vive sólo en memoria del servidor mientras dura la petición; se renueva con el refresh token cuando hace falta.
- **Desconectar:** revoca el token en Google, cierra el canal (`channels.stop`), borra los tokens. Las citas no cambian.
- Si Google responde `invalid_grant` (el asesor quitó el permiso), la conexión pasa a `revocado` y el panel le pide reconectar.
- Sin librería `googleapis` (es muy pesada): llamadas `fetch` a la API REST con un envoltorio pequeño y tipado, como ya se hace con Resend.

## 4 · De la cita al evento

| Cambio de la cita | En Google |
|---|---|
| Pasa a un estado activo | `events.insert` |
| Cambia el horario (`RESCHEDULED`) | `events.patch` |
| `CANCELLED` | `events.delete` |
| `COMPLETED` / `NO_SHOW` | Se deja el evento (ya pasó) |

- Se hace **después** de guardar la cita (`after()`), con tiempo límite. Resultado en `citas.google_sync`: `ok`, `error` (+ mensaje), reintento con espera creciente desde la tarea programada, máximo 5.
- El evento lleva `extendedProperties.private.citaId` para reconocerlo, visibilidad privada y `sendUpdates: 'none'`.
- Contenido: "Visita · {propiedad}", lugar, nombre del cliente, estado y enlace al panel. **Sin teléfono ni correo del cliente.**
- Si el asesor no tiene Google conectado: `google_sync = 'no_aplica'` y todo funciona igual.

## 5 · Invitaciones de Google al cliente

No se agrega al cliente como invitado del evento, porque:

- Google mandaría su propio correo sin la marca, además del nuestro.
- La respuesta "Sí / No" de Google no es una confirmación válida (abrir o responder no confirma).
- Expondría el correo del asesor.

En su lugar, el correo de Resend lleva un archivo `.ics` y un botón "Agregar a Google Calendar" (ver `email-flow.md`).

## 6 · Disponibilidad y canales de avisos

**Disponibilidad:** `checkAvailability` resta los bloques ocupados de `freebusy.query` del calendario del asesor. Si Google no contesta, se ofrecen los horarios sin esa resta y la cita igual queda en "Por confirmar" hasta que el asesor la acepte.

**Canal de avisos (`events.watch`):**

- Al conectar se abre un canal hacia `https://vivebienn.com/api/google/notificaciones` con un id propio y un token secreto (se guarda su hash).
- Cuando Google avisa: se comprueba id y token; se leen los cambios con `events.list` y el `syncToken`; sólo interesan eventos con nuestro `citaId`.
- Si el asesor movió o borró nuestro evento: la cita **no cambia**; pasa a `google_sync = 'desincronizada'`, se anota en el historial y el asesor ve un aviso con dos opciones: "Restaurar en Google" o "Reprogramar en Vive Bien".
- Los canales caducan: la tarea programada los renueva antes de que venzan.

## 7 · Fallos visibles

| Situación | Qué ve el asesor/admin |
|---|---|
| Error al escribir en Google | Ícono de aviso en la cita + "Reintentar" |
| Conexión revocada | Aviso "Vuelve a conectar Google Calendar" |
| Evento movido o borrado en Google | "Desincronizada" con las dos opciones |
| Canal vencido sin renovar | Se reabre solo; si falla, aviso en la campana |

Referencias: [alcances de Calendar](https://developers.google.com/workspace/calendar/api/auth), [freebusy.query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [verificación de alcances sensibles](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
