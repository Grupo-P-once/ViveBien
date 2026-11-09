# Citas y portal del cliente — arquitectura

> **⚠️ Ajuste del Master PRD v2.0 (18-sep-2026), enmendado el 2-oct-2026 (ADR-0013):** el «asesor» de una cita es el dueño de la propiedad **si puede atender citas**: personal de VIVE BIEN, o un **publicador con `recibir_citas`** (p. ej. un asociado) para sus propias propiedades. El publicador-asesor ve la cita **sin datos del interesado** salvo el permiso `ver_datos_interesado` (apagado por defecto). Ver `adr/ADR-0013-…`, `adr/ADR-0006-…` (punto 3 enmendado), `DECISIONS.md` D-08 y D-47. Está implementado en código; en producción `citasEnLinea` sigue apagado, así que todavía no se crea ninguna cita. Lo demás de este documento sigue vigente.

> Proyecto: **Renovación del panel de cliente + sistema de citas + calendario admin/cliente + Google Calendar + Resend.**
> Estado: **aprobada el 18-sep-2026** («vas con tus recomendaciones»). Fase 1 hecha: migración 15 aplicada, servicio y API en `src/lib/citas/` y `src/app/api/citas/`.
>
> **Regla añadida al aprobar:** sólo agenda quien tiene **cuenta creada** (fila en `usuarios`). Quien sólo llenó el formulario de registro no puede, y el admin tampoco puede registrarle una visita: se elige siempre una cuenta existente.
> Mockups: `design/references/05-portal-inicio.webp`, `06-portal-mis-visitas.webp`, `07-admin-calendario.webp`.

Documentos hermanos:

| Documento | De qué trata |
|---|---|
| `calendar-architecture.md` | Qué calendario visual se usa y por qué; componentes; vistas por tamaño de pantalla |
| `appointment-state-machine.md` | Estados de una cita, quién puede moverla y a dónde |
| `google-calendar-integration.md` | Conexión por asesor, sincronización, disponibilidad, canales |
| `email-flow.md` | Correos con Resend, enlaces de acción seguros, recordatorios |
| `permissions.md` | Quién ve y quién hace qué |
| `testing-appointments.md` | Cómo se prueba sin tocar datos reales |

---

## 1 · Auditoría (lo que hay hoy)

Revisado en el código y en la base de producción (`uztssyrheqdhtoheecgf`), sólo lectura.

### 1.1 Base de datos

| Tabla | Relación con citas |
|---|---|
| `usuarios` (`uid text` pk = uid de Firebase) | Roles `cliente` / `publicador` / `admin`. Ya guarda lo que busca el cliente: `busca_operacion`, `busca_zonas`, `busca_tipos`, `presupuesto_max` (V-1.1.82: modelo único; `busca_zona`/`busca_tipo` se borraron en la migración 22). |
| `propiedades` (`id text` pk, `owner_id` → usuarios) | Hoy hay **15 propiedades y las 15 son del administrador**; el publicador de prueba tiene 0. |
| `solicitudes_contacto` | Ya tiene `tipo` (`informacion` \| `visita`) y `visita_preferida timestamptz`. La API los acepta, pero **ninguna pantalla manda `tipo: 'visita'`** y la tabla tiene 0 filas. Es una petición de contacto, no una cita: no reserva horario ni tiene estados. |
| `favoritos` | "Guardadas". 0 filas. |
| `busquedas_guardadas` | 1 fila. Tiene la bandera `alertas`, pero **no existe ningún proceso que mande alertas**. |
| `audit_logs`, `invitaciones`, `eventos`, `leads`, `contactos`… | Sin relación directa. |

- **No existe ninguna tabla de citas.**
- **Realtime:** la publicación `supabase_realtime` no tiene ninguna tabla.
- **Extensiones:** instaladas `pgcrypto` y `supabase_vault`. Disponibles sin instalar: `btree_gist`, `pg_cron`, `pg_net`.
- **RLS:** todas las tablas con RLS activo; el navegador (clave anónima) sólo lee propiedades publicadas. Todo lo demás pasa por el servidor con la clave de servicio.

### 1.2 Sesión

- La sesión es de **Firebase Auth**, no de Supabase Auth. El servidor verifica el token con `jose` contra las llaves públicas de Google (`src/lib/auth-server.ts`: `verifyIdToken`, `requireRole`, `requireAdmin`).
- Consecuencia importante: **Supabase no sabe quién es el usuario**, así que las políticas RLS "por usuario" y Realtime con `postgres_changes` no funcionan tal cual. Ver §3.4.

### 1.3 Correo

- Resend por `fetch`, sin librería: `src/lib/aviso-lead.ts` (aviso de lead a `joseponcer@vivebienn.com`) y `src/lib/invitacion-correo.ts` (invitaciones del panel).
- No hay plantillas React Email ni registro de correos enviados.

### 1.4 Google

- Google Maps (`@vis.gl/react-google-maps`) y el inicio de sesión con Google de Firebase (con el error `origin_mismatch` pendiente).
- **No hay integración con Google Calendar** ni la librería `googleapis`.

### 1.5 Tareas programadas

- `vercel.json` tiene **un** cron diario (`/api/alertas/resumen`, 15:00 UTC). El plan Hobby de Vercel sólo permite crons diarios, así que **los recordatorios de 24 h y 2 h no caben ahí** (ver §5).

### 1.6 Panel del cliente actual

- `/dashboard` (rama de cliente): métricas, favoritos, búsquedas, bienvenida, "Quiero publicar", "Mis consultas enviadas".
- `/mi-cuenta`: perfil (484 líneas).
- `/publicador` y el wizard `/publicador/propiedades/[id]/editar` para quien publica.
- El panel de administración nuevo (`/admin`, V-1.1.71–74) ya tiene la carcasa que el mockup pide: barra lateral de marca, barra superior con búsqueda y campana, tarjetas KPI, tablas, tokens `--marca`.

### 1.7 Librerías útiles que ya están

`react-hook-form`, `zod`, `jose`, `@tanstack/react-table` v9, `recharts`, shadcn/ui, `sonner`, `vitest`, `@playwright/test`. **No** hay React Query ni `date-fns`.

---

## 2 · Principios (del encargo)

1. **La base de datos es la única fuente de verdad.** Google Calendar y Resend son salidas: si fallan, la cita sigue existiendo y el fallo queda visible.
2. **Una sola cita** para cliente, asesor y administrador; cada uno ve lo que su permiso le deja.
3. **Nunca dos citas empalmadas** para el mismo asesor: lo impide la base de datos, no sólo la pantalla.
4. **Abrir o hacer clic en un correo no confirma nada.** Confirmar exige una acción explícita.
5. **No es un CRM.** Nada de embudos, etapas de venta, oportunidades ni puntuación de leads.
6. **No inventar datos.** Los ejemplos de prueba se marcan como tales.

---

## 3 · Arquitectura propuesta

```
                    ┌──────────────────────────────┐
                    │  Supabase / PostgreSQL        │  ← única fuente de verdad
                    │  citas · citas_eventos ·      │
                    │  citas_tokens · citas_correos │
                    │  disponibilidad · calendarios │
                    └──────────────┬───────────────┘
                                   │ (sólo el servidor, clave de servicio)
                    ┌──────────────┴───────────────┐
                    │  src/lib/citas/servicio.ts    │  ← un solo servicio
                    │  createAppointment, confirm…  │
                    └──┬─────────┬─────────┬───────┘
          API /api/citas/*     │         │ después de guardar (after())
                       │       │         ├─────────────► Resend (correos + .ics)
       ┌───────────────┼───────┘         ├─────────────► Google Calendar (evento del asesor)
       │               │                 └─────────────► Realtime Broadcast ("algo cambió")
  Cliente (/portal)  Asesor   Admin (/admin/calendario)
       ▲               ▲        ▲
       └───── vuelven a pedir por la API al recibir el aviso ─────┘
```

### 3.1 Un solo servicio

`src/lib/citas/servicio.ts`, con los nombres que pide el encargo:

| Función | Qué hace |
|---|---|
| `checkAvailability(propiedadId, dia)` | Horarios libres del asesor ese día (horario semanal − bloqueos − citas activas − ocupado en Google − anticipación mínima). |
| `createAppointment(datos, actor, claveIdempotencia)` | Crea la cita. Cliente → `REQUESTED`. Asesor/admin (para una cuenta existente) → `PENDING_CONFIRMATION`. Sin cuenta → 403. |
| `getAppointment(id, actor)` | Lee una cita recortada a lo que el actor puede ver. |
| `confirmAppointment(id, version, actor)` | Confirma. |
| `requestReschedule(id, version, nuevoInicio, actor)` | Propone otro horario. |
| `rescheduleAppointment(id, version, actor)` | La otra parte acepta el horario propuesto. |
| `cancelAppointment(id, version, motivo, actor)` | Cancela. |
| `completeAppointment(id, version, actor)` | Marca como realizada. |
| `markNoShow(id, version, actor)` | Marca que el cliente no llegó. |

Todas pasan por **una función de Postgres** (`cita_transicionar`) que, en una sola transacción: comprueba el estado actual y la versión, aplica el cambio, sube `version`, escribe el historial y revoca los enlaces de acción viejos. La API y los enlaces de correo llaman al mismo servicio; no hay dos caminos para cambiar una cita.

Los efectos de salida (correo, Google, aviso en vivo) se lanzan **después** de guardar con `after()` de Next.js, para no hacer esperar al usuario, y cada uno deja constancia de si salió bien.

### 3.2 Rutas de API

| Ruta | Uso |
|---|---|
| `GET /api/citas?desde&hasta&vista=cliente\|asesor\|admin&asesor&tipo` | Citas del rango visible del calendario. |
| `POST /api/citas` (cabecera `Idempotency-Key`) | Crear. |
| `GET /api/citas/[id]` | Detalle. |
| `POST /api/citas/[id]/transicion` `{ accion, version, … }` | Confirmar, cancelar, proponer, aceptar, realizada, no asistió. |
| `GET /api/citas/disponibilidad?propiedad&dia` | Horarios libres. |
| ~~`POST /api/citas/accion` / `/accion/ver`~~ | **Retirados el 9-nov-2026** (ADR-0014, decisión 5). |
| `GET/PUT /api/admin/citas/responsables` | Quién atiende cada propiedad y el responsable del equipo (admin; migración 76, auditado). |
| `POST /api/citas/tareas` (secreto) | Recordatorios, vencimientos, reintentos, renovación de canales de Google. |
| `/api/google/*` | Conectar, callback, desconectar, notificaciones (ver `google-calendar-integration.md`). |

Todas validan con `zod`, exigen sesión (salvo las de token y tareas) y usan los límites de `src/lib/limites.ts`.

### 3.3 Sin empalmes

- Cada cita guarda `ocupa_desde` / `ocupa_hasta` = inicio … fin + margen (el margen va **después** de la visita: con visitas de 1 h y 15 min de margen, tras una de 9:00 la siguiente puede ser a las 10:30).
- **Restricción de exclusión** (`btree_gist`) por asesor sobre `tstzrange(ocupa_desde, ocupa_hasta, '[)')`, sólo en estados activos. Dos peticiones al mismo tiempo por el mismo horario: una entra y la otra recibe el error `23P01`, que la API convierte en *"Ese horario se acaba de ocupar. Elige otro."* (409).
- Lo mismo por cliente (un cliente no puede tener dos visitas a la vez).
- Por qué columnas guardadas y no `inicio - margen` dentro de la restricción: restar un intervalo a un `timestamptz` no es "inmutable" en Postgres y la restricción no lo acepta.
- **Idempotencia:** el formulario genera una clave al abrirse; `unique (creada_por, clave_idempotencia)`. Si el usuario da doble clic o la red reintenta, se devuelve la misma cita, no dos.
- **Concurrencia en cambios:** cada transición manda la `version` que vio; si otro la cambió antes, 409 con la cita actualizada.

### 3.4 Tiempo real con sesión de Firebase

El encargo pide Supabase Realtime protegido por RLS. Con la sesión en Firebase hay dos caminos:

| | A · Avisos por Broadcast (recomendado) | B · Supabase con Firebase como proveedor externo |
|---|---|---|
| Cómo | El servidor, tras cada cambio, manda un aviso **sin datos** (`{ "cambio": true }`) a un canal por persona cuyo nombre es un HMAC secreto del uid. El navegador, al oírlo, vuelve a pedir `/api/citas` con su sesión. | Supabase acepta los tokens de Firebase y las políticas RLS usan `auth.jwt()->>'sub'`. |
| Qué exige | Nada nuevo en Firebase. Confirmar en Supabase que los canales públicos están permitidos. | Añadir a cada usuario el claim `role: authenticated` con Firebase Admin o funciones de bloqueo (plan Identity Platform), y escribir políticas RLS por tabla. |
| Si se filtra el nombre del canal | Sólo se sabe *que* algo cambió, nunca *qué*. | — |
| Riesgo | Bajo; los datos siguen pasando sólo por la API con sesión. | Mayor: abre las tablas al navegador; un error en una política expone citas. |

**Recomendación: A**, con respaldo de consulta cada 60 s cuando la pestaña está visible (como la campana del panel). Las tablas de citas quedan con RLS activo y **sin políticas**: nadie fuera del servidor las lee.

### 3.5 Zona horaria

- Se guarda todo en `timestamptz` (UTC).
- Se muestra y se calcula la disponibilidad siempre en `America/Mexico_City` (León), con la etiqueta "hora de León", aunque el navegador esté en otra zona.
- México no cambia de horario desde 2022, pero el cálculo usa la zona por nombre (`Intl`), nunca un `-06:00` fijo.

---

## 4 · Migraciones (una sola: `15-citas.sql`)

> La 13 está reservada para el arreglo de seguridad pendiente. La 14 es el panel admin (aplicada).
> **Se aplica sólo con tu "sí"**: crea tablas y activa extensiones en producción.

```sql
create extension if not exists btree_gist with schema extensions;

-- Horario semanal de cada asesor (hora local de León)
create table public.disponibilidad_asesores (
  id           bigint generated always as identity primary key,
  asesor_uid   text not null references public.usuarios(uid),
  dia_semana   smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  desde        time not null,
  hasta        time not null check (hasta > desde),
  unique (asesor_uid, dia_semana, desde)
);

-- Ajustes por asesor (valores por defecto a confirmar, ver §7)
create table public.ajustes_citas (
  asesor_uid          text primary key references public.usuarios(uid),
  duracion_min        smallint not null default 60,   -- el mockup muestra visitas de 1 h
  margen_min          smallint not null default 15,
  anticipacion_horas  smallint not null default 2,
  ventana_dias        smallint not null default 30,
  confirmacion        text not null default 'manual' check (confirmacion in ('manual', 'automatica'))
);

-- Días u horas en que el asesor no atiende
create table public.bloqueos_asesores (
  id          bigint generated always as identity primary key,
  asesor_uid  text not null references public.usuarios(uid),
  desde       timestamptz not null,
  hasta       timestamptz not null check (hasta > desde),
  motivo      text
);

create table public.citas (
  id                  uuid primary key default gen_random_uuid(),
  propiedad_id        text references public.propiedades(id) on delete set null,
  cliente_uid         text not null references public.usuarios(uid),   -- sólo cuentas creadas
  asesor_uid          text not null references public.usuarios(uid),

  inicio              timestamptz not null,
  fin                 timestamptz not null check (fin > inicio),
  ocupa_desde         timestamptz not null,
  ocupa_hasta         timestamptz not null,
  zona_horaria        text not null default 'America/Mexico_City',
  check (ocupa_desde <= inicio and ocupa_hasta >= fin),

  estado              text not null check (estado in (
                        'REQUESTED','PENDING_CONFIRMATION','CONFIRMED','RESCHEDULE_REQUESTED',
                        'RESCHEDULED','CANCELLED','COMPLETED','NO_SHOW')),
  estado_previo       text,       -- a dónde vuelve si se rechaza una propuesta de cambio
  version             integer not null default 1,

  -- Propuesta de cambio de horario pendiente
  propuesta_inicio    timestamptz,
  propuesta_fin       timestamptz,
  propuesta_por       text,

  -- Copia de lo que se compartió al agendar (como solicitudes_contacto)
  cliente_nombre      text not null,
  cliente_telefono    text,
  cliente_email       text,
  consentimiento_version text not null,
  consentimiento_en   timestamptz not null default now(),
  propiedad_titulo    text,
  lugar               text,

  notas_cliente       text check (char_length(notas_cliente) <= 500),
  notas_internas      text check (char_length(notas_internas) <= 2000),
  motivo_cancelacion  text,

  -- Google (salida, nunca fuente)
  google_event_id     text,
  google_sync         text not null default 'no_aplica'
                      check (google_sync in ('no_aplica','pendiente','ok','error','desincronizada')),
  google_error        text,
  google_intentos     smallint not null default 0,

  clave_idempotencia  text,
  creada_por          text not null,
  creada_en           timestamptz not null default now(),
  actualizada_en      timestamptz not null default now(),
  unique (creada_por, clave_idempotencia)   -- quien la crea, sea cliente o admin
);

-- Nunca dos citas activas empalmadas para el mismo asesor ni para el mismo cliente
alter table public.citas add constraint citas_asesor_sin_empalme exclude using gist (
  asesor_uid with =, tstzrange(ocupa_desde, ocupa_hasta, '[)') with &&
) where (estado in ('REQUESTED','PENDING_CONFIRMATION','CONFIRMED','RESCHEDULE_REQUESTED','RESCHEDULED'));

alter table public.citas add constraint citas_cliente_sin_empalme exclude using gist (
  cliente_uid with =, tstzrange(inicio, fin, '[)') with &&
) where (cliente_uid is not null and estado in ('REQUESTED','PENDING_CONFIRMATION','CONFIRMED','RESCHEDULE_REQUESTED','RESCHEDULED'));

create index citas_asesor_inicio  on public.citas (asesor_uid, inicio);
create index citas_cliente_inicio on public.citas (cliente_uid, inicio);
create index citas_inicio_activas on public.citas (inicio) where estado in ('CONFIRMED','RESCHEDULED');

-- Historial y auditoría: cada cambio, quién, cuándo, por qué vía
create table public.citas_eventos (
  id             bigint generated always as identity primary key,
  cita_id        uuid not null references public.citas(id),
  tipo           text not null,          -- CREATED, CONFIRMED, RESCHEDULE_PROPOSED, …
  estado_antes   text,
  estado_despues text,
  actor_uid      text,                   -- null si fue el sistema o un enlace de correo sin cuenta
  actor_rol      text not null,          -- cliente | asesor | admin | sistema
  via            text not null check (via in ('panel','correo','sistema','google')),
  datos          jsonb not null default '{}',   -- horarios antes/después, motivo
  creado_en      timestamptz not null default now()
);

-- Enlaces de acción de los correos (sólo el hash; el token nunca se guarda)
create table public.citas_tokens (
  id           uuid primary key default gen_random_uuid(),
  cita_id      uuid not null references public.citas(id),
  accion       text not null check (accion in ('confirmar','cancelar','aceptar_cambio','rechazar_cambio')),
  para_rol     text not null check (para_rol in ('cliente','asesor')),
  hash         text not null unique,     -- sha256 del token
  version_cita integer not null,         -- deja de valer si la cita cambió
  expira_en    timestamptz not null,
  usado_en     timestamptz,
  revocado_en  timestamptz,
  creado_en    timestamptz not null default now()
);

-- Registro de correos (y llave de no-duplicado)
create table public.citas_correos (
  id                  bigint generated always as identity primary key,
  cita_id             uuid not null references public.citas(id),
  tipo                text not null,
  destinatario_rol    text not null,
  destinatario_email  text not null,
  clave_idempotencia  text not null unique,   -- p. ej. cita/<id>/confirmada/v3/cliente
  resend_id           text,
  estado              text not null default 'pendiente' check (estado in ('pendiente','enviado','error')),
  error               text,
  intentos            smallint not null default 0,
  creado_en           timestamptz not null default now(),
  enviado_en          timestamptz
);

-- Google Calendar por asesor (tokens cifrados en la app; ver google-calendar-integration.md)
create table public.calendarios_google (
  asesor_uid            text primary key references public.usuarios(uid),
  google_email          text not null,
  calendar_id           text not null default 'primary',
  refresh_token_cifrado text not null,
  alcances              text[] not null,
  estado                text not null default 'activo' check (estado in ('activo','revocado','error')),
  canal_id              text,
  canal_recurso_id      text,
  canal_token_hash      text,
  canal_expira_en       timestamptz,
  sync_token            text,
  conectado_en          timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

create table public.google_oauth_estados (
  hash           text primary key,         -- sha256 del parámetro state
  uid            text not null,
  verificador_cifrado text not null,       -- PKCE
  expira_en      timestamptz not null,
  usado_en       timestamptz
);

-- Nadie fuera del servidor
alter table public.disponibilidad_asesores enable row level security;
alter table public.ajustes_citas           enable row level security;
alter table public.bloqueos_asesores       enable row level security;
alter table public.citas                   enable row level security;
alter table public.citas_eventos           enable row level security;
alter table public.citas_tokens            enable row level security;
alter table public.citas_correos           enable row level security;
alter table public.calendarios_google      enable row level security;
alter table public.google_oauth_estados    enable row level security;
revoke all on public.disponibilidad_asesores, public.ajustes_citas, public.bloqueos_asesores,
              public.citas, public.citas_eventos, public.citas_tokens, public.citas_correos,
              public.calendarios_google, public.google_oauth_estados
  from anon, authenticated;
```

Además: la función `cita_transicionar(...)` (plpgsql, `security invoker`, `search_path` fijo) descrita en `appointment-state-machine.md`.

Para el portal (sin borrar nada):

```sql
-- El mockup "Tu búsqueda" muestra varias zonas y varios tipos; hoy hay un solo texto de cada uno.
alter table public.usuarios add column if not exists busca_zonas text[];
alter table public.usuarios add column if not exists busca_tipos text[];
update public.usuarios set busca_zonas = array[busca_zona] where busca_zona is not null and busca_zonas is null;
update public.usuarios set busca_tipos = array[busca_tipo] where busca_tipo is not null and busca_tipos is null;
-- busca_zona / busca_tipo se conservan hasta que nada los lea.
```

Tareas programadas (migración aparte, `16-citas-tareas.sql`, también con tu "sí"): activar `pg_cron` y `pg_net`, guardar el secreto en `supabase_vault` y programar una llamada cada 10 min a `/api/citas/tareas`.

---

## 5 · Tareas programadas

Cada 10 min, `pg_cron` + `pg_net` llaman a `POST /api/citas/tareas` con un secreto guardado en Vault. Esa ruta:

1. Manda recordatorios de 24 h y 2 h (el registro de correos impide duplicados).
2. Cancela como vencidas las citas `REQUESTED` / `PENDING_CONFIRMATION` cuya hora ya pasó sin respuesta.
3. Reintenta lo que falló con Google o con Resend (con espera creciente, máximo 5 intentos).
4. Renueva los canales de Google que caducan en menos de 24 h.

Alternativas si no quieres activar `pg_cron`: Vercel Pro (crons cada minuto) o un cron externo. La lógica es la misma ruta.

---

## 6 · Portal del cliente

Carcasa **igual a la del panel admin** (mismos componentes: `SidebarProvider`, barra superior con búsqueda y campana, `TarjetaKpi`, tokens de marca), en `/portal`.

| Menú | Ruta | Datos | Estado hoy |
|---|---|---|---|
| Inicio | `/portal` | Saludo, 4 tarjetas, "Nuevas propiedades para ti", "Tu búsqueda", consultas, próximas visitas, búsquedas guardadas | Se arma con lo que ya existe + citas |
| Buscar propiedades | `/propiedades` (sitio público) | — | Existe |
| Propiedades ▸ Guardadas | `/portal/propiedades?vista=guardadas` | `favoritos` | ✅ V-1.1.85 |
| Propiedades ▸ Me interesan | `/portal/propiedades?vista=me-interesan` | Consultas y visitas tuyas (D-28.1: sólo lo ligado a la cuenta) | 3b-2 |
| ~~Por revisar~~ | — | Sin dato: ninguna visita a una ficha guarda quién la vio | ❌ fuera (D-27.1) |
| Mis búsquedas | `/portal/busquedas` | `busquedas_guardadas` | Existe |
| Mis alertas | `/portal/alertas` | Coincidencias nuevas calculadas al abrir el portal | **El envío por correo no existe** (ver §7) |
| Mis visitas | `/portal/visitas` | `citas` | Nuevo |
| Mis consultas | `/portal/consultas` | `solicitudes_contacto` del cliente | Existe |
| Mi búsqueda | `/portal/mi-busqueda` | `usuarios.busca_*` | Existe (un valor) → varios |
| Mi propiedad (Vender / Rentar) | `/portal/mi-propiedad` | Flujo "Quiero publicar" actual → wizard | Existe |
| Mi perfil | `/portal/perfil` | Contenido de `/mi-cuenta` | Existe |
| Cerrar sesión | — | — | Existe |

- `/dashboard` (cliente) y `/mi-cuenta` redirigen a `/portal` y `/portal/perfil`. Son rutas privadas (no indexadas), así que el cambio no toca el SEO.
- El administrador no cambia salvo **un** elemento nuevo en la barra: **Calendario** (`/admin/calendario`).

Cosas del mockup que **no** tienen datos detrás hoy y cómo se tratarían sin inventar:

| En el mockup | Realidad | Propuesta |
|---|---|---|
| Consultas "Recibida" / "En revisión" | `solicitudes_contacto` no tiene estado de seguimiento | Mostrar "Enviada" + fecha. Añadir estados sería seguimiento de leads (acercarse a CRM): sólo si lo pides. |
| "Te avisaremos cuando haya nuevas propiedades…" | No hay envío de alertas | No mostrar esa frase hasta que exista el envío. |
| Métricas "vs. mes anterior" en el calendario admin | Sin historial de citas al inicio | Mismas reglas del panel: sin historial no hay porcentaje. |
| Fotos, nombres y fechas de 2024 | Ejemplos del diseño | Sólo en las pruebas visuales, marcados como ficticios. |

---

## 7 · Decisiones que necesito de ti

1. **Tiempo real:** ¿avisos por Broadcast (A, recomendado) o Firebase como proveedor de Supabase (B)?
2. **Horario de visitas por defecto** (se puede cambiar por asesor): días, horas, duración (el mockup sugiere 1 h), margen entre visitas, anticipación mínima y hasta cuántos días adelante se puede agendar.
3. **Confirmación:** ¿el asesor confirma cada solicitud a mano (recomendado al inicio) o se confirma sola si el horario está libre?
4. **"Me interesan" y "Por revisar":** ¿qué significan para ti? (propuestas en §6).
5. **Alertas por correo** de búsquedas guardadas: ¿entran en este proyecto o sólo se muestran dentro del portal?
6. **Publicadores:** ¿usan también `/portal` (con "Visitas a mis propiedades") o su "Mis visitas" va dentro de `/publicador`?
7. **Google Calendar:** necesitas crear el cliente OAuth en Google Cloud (ver `google-calendar-integration.md`). ¿Lo hacemos en esta fase o después de que funcionen las citas sin Google?
8. **Tareas programadas:** ¿activar `pg_cron` + `pg_net` en Supabase (recomendado, gratis) o pagar Vercel Pro?
9. **Migraciones 15 y 16:** se aplican a producción sólo con tu "sí".

---

## 8 · Fases de implementación

Cada fase que llega a producción es un deploy con su versión (V-1.1.75, V-1.1.76, …) anotada en Obsidian.

| Fase | Qué | Depende de |
|---|---|---|
| 1 | Migración 15, función de transición, servicio `src/lib/citas`, API, pruebas de la máquina de estados | Decisiones 2, 3, 9 |
| 2 | Correos (plantillas, `.ics`, enlaces de acción, registro) | Fase 1 |
| 3 | Carcasa `/portal` + Inicio + redirecciones | Decisiones 4, 6 |
| 4 | Mis visitas del cliente + "Agendar visita" en la ficha de la propiedad | Fases 1–3 |
| 5 | Calendario del admin | Fase 1 |
| 6 | Visitas del publicador | Fase 1, decisión 6 |
| 7 | Avisos en tiempo real | Decisión 1 |
| 8 | Tareas programadas: recordatorios, vencidas, reintentos | Decisión 8 |
| 9 | Google Calendar: conectar, escribir eventos, disponibilidad | Decisión 7 + cliente OAuth |
| 10 | Google: canales de cambios y renovación | Fase 9 |
| 11 | Resto del portal (propiedades, búsquedas, alertas, consultas, mi búsqueda, perfil) | Decisiones 4, 5 |
| 12 | Capturas Playwright (las 8 pedidas) y pruebas completas | Todo |
| 13 | Retirar el panel de cliente anterior | Tu visto bueno |

Referencias usadas como idea, sin copiar código: Cal.com (horarios, márgenes, anticipación mínima, enlaces de cancelar/reprogramar), FullCalendar (componente visual, licencia MIT).
