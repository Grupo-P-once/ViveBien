# Baja de cuenta — diseño final (migración 25 APLICADA el 24-sep)

- **Diseño técnico APROBADO** el 23-sep-2026, con **P-1 = A** y **P-2 = bloqueo inmediato + supresión posterior**.
- `Migración 25 aplicada ✅ (24-sep) · implementación ❌.` Archivos: `supabase/25-baja-de-cuenta.sql` y su `REVERTIR`. **Evidencia: `EVIDENCIA_MIGRACION_25.md`.**
- Decisión: `docs/DECISIONS.md` → **D-35**. Auditoría: `AUDIT_3B3.md` (K-01…K-28). Verificado contra producción (PostgreSQL 17.6) en lectura.

> ## ⚠️ Tres correcciones que encontré al preparar esto
> 1. **La matriz eran 23 columnas, no 18** (y tampoco 22: el 22 contaba filas de la tabla, y una juntaba las dos de `invitaciones`). Mi barrido anterior usó una lista de nombres y se dejó fuera `citas.creada_por`, `citas.propuesta_por`, `invitaciones.invitado_por` y `propiedades.revisado_por`. Rehecho por patrón sobre el catálogo completo (K-27).
> 2. **`propiedades.revisado_por` guarda un CORREO, no un `uid`** — hoy, cinco filas con `jemilianoponceperez@gmail.com`. Es identidad por correo, justo lo que D-35 prohíbe, y sobreviviría intacta a una baja (K-28).
> 3. **`GET /api/usuarios/me` no pasa por el autorizador central.** Verifica el token y crea la cuenta por su cuenta, **sin mirar `estado`** — ni siquiera `suspendido`. Es la única ruta que crea cuentas y es la que se salta la barrera (K-26). Tu corrección sobre Firebase es necesaria **y** no basta sin esto.

---

## 1 · Esquema final

Está escrito en `supabase/25-baja-de-cuenta.sql`. En resumen:

```sql
-- A · El correo puede faltar, pero sólo en una cuenta cerrada
alter table usuarios alter column email drop not null;
alter table usuarios add constraint usuarios_estado_check
  check (estado in ('activo','suspendido','pendiente','eliminada'));
alter table usuarios add constraint usuarios_email_solo_falta_si_eliminada
  check (email is not null or estado = 'eliminada');

-- B · El procedimiento, una fila por cuenta (la PK es el uid: ahí está la idempotencia)
create table bajas_de_cuenta (
  uid text primary key references usuarios(uid),
  estado text not null default 'solicitada'
    check (estado in ('solicitada','bloqueada','firebase_eliminada','datos_procesados','completada','error')),
  solicitada_por text not null check (solicitada_por in ('titular','admin')),
  auth_time timestamptz not null,
  motivo text,
  solicitada_en timestamptz not null default now(),
  bloqueada_en timestamptz, firebase_eliminada_en timestamptz,
  procesada_en timestamptz, completada_en timestamptz,
  bloqueo_revisar_en date,
  intentos smallint not null default 0, ultimo_intento_en timestamptz, ultimo_error text
);

-- C · Invitaciones que no eleven a la cuenta nueva
check (estado in ('pendiente','aceptada','cancelada','revocada_por_baja'))

-- D · P-1: la propiedad requiere gestión, sin tocar su estatus comercial
alter table propiedades add column gestion text
  check (gestion is null or gestion in ('requiere_gestion'));

-- E · P-2: bloqueo operativo de la PII de contacto
alter table citas                add column bloqueado_en timestamptz;
alter table solicitudes_contacto add column bloqueado_en timestamptz;
create view citas_operativas                as …  -- enmascara el contacto si está bloqueado
create view solicitudes_contacto_operativas as …
```

**Lo que NO se crea:** `solicitudes_eliminacion` (la baja no se aprueba).
**Lo que NO se renombra:** `'activo'` en `usuarios.estado`, ni `'pendiente'`.

---

## 2 · Estados de `usuarios` y de `bajas_de_cuenta`

### 2.1 · La cuenta — ¿puede esta identidad usar VIVE BIEN?
`activo` · `suspendido` · `pendiente` · **`eliminada`** ← terminal, sin vuelta.

`eliminada` está contemplada en **toda** ruta de autorización:
- `resolverPerfil` deja de normalizar lo desconocido a `'activo'` (hoy `auth-server.ts:114` falla abierto).
- `crearAutorizador` corta `eliminada` **antes** que `suspendido`, con mensaje propio.
- **`/api/usuarios/me` (GET y PATCH) dejan de decidir por su cuenta** y pasan por la misma barrera (K-26).

### 2.2 · El procedimiento
```
(sin fila) ──► solicitada ──► bloqueada ──► firebase_eliminada ──► datos_procesados ──► completada
                                  ▲              │                        │
                                  └──── error ◄──┴────────────────────────┘
                                         reintento: al paso que falló, nunca atrás
```

| Estado | Hito | Qué es verdad | `usuarios.estado` | ¿Se puede registrar de nuevo con ese correo? |
|---|---|---|---|---|
| `solicitada` | **baja iniciada** | Reautenticada; nada tocado | `activo` | No |
| `bloqueada` | **cuenta bloqueada** | **Punto de no retorno.** No autentica; PII del perfil retirada | `eliminada` | **No** |
| `firebase_eliminada` | **Firebase eliminada** | La identidad anterior ya no existe | `eliminada` | Técnicamente sí; **no se promete todavía** |
| `datos_procesados` | — | Vía A hecha; vía B en bloqueo con fecha de revisión | `eliminada` | Sí |
| `completada` | **baja completada** | Verificado de punta a punta | `eliminada` | **Sí — y es cuando se dice** |
| `error` | — | Falló un paso; `intentos` / `ultimo_error` dicen cuál | `eliminada` desde `bloqueada` | Depende de si Firebase llegó a confirmar |

**Reglas:** desde `bloqueada` sólo se avanza · `error` no revierte · no hay vuelta a una cuenta activa.

---

## 3 · Flujo Firebase / Supabase, y **por qué no se promete el correo antes de tiempo**

### 3.1 · El mecanismo que hace obligatoria tu corrección
Mientras la identidad de Firebase de U1 exista, «volver a registrarse» **no crea una cuenta nueva**:

- **Con Google:** Firebase reconoce esa identidad y devuelve **el mismo UID de U1**. No hay U2.
- **Con contraseña:** `createUserWithEmailAndPassword` falla con `auth/email-already-in-use`.

Es decir: antes de `firebase_eliminada`, quien lo intente con Google acaba con **una sesión de U1**, la cuenta cerrada. Si `/api/usuarios/me` no mira el estado —que es lo que pasa hoy (K-26)— esa sesión recibe un 200 y la cuenta se comporta como si hubiera vuelto.

**Por eso la barrera es doble y ninguna sustituye a la otra:**
1. **Guarda de lápida** en el alta: un `uid` con `estado='eliminada'` **nunca** se revive, no se le aplican invitaciones y no se le cambia el rol. Responde 403 y empuja el proceso pendiente.
2. **La promesa** («ya puedes registrarte con este correo») **sólo** cuando `bajas_de_cuenta.estado = 'completada'`. Antes, la pantalla dice que la cuenta está cerrada y que queda un paso técnico en curso.

### 3.2 · Cuándo se pone el correo a `NULL`, y por qué eso no es la promesa
`email = NULL` se escribe en **`bloqueada`**, junto con `estado='eliminada'`, dentro de la misma transacción.

Razones: (a) es donde el `CHECK` lo permite; (b) dejar el correo hasta el final significaría que una baja atascada conserva la PII de la persona en una cuenta ya cerrada; (c) si se liberara sólo al final, un proceso detenido entre `firebase_eliminada` y `datos_procesados` dejaría a alguien con la identidad ya borrada y el correo aún ocupado → `23505`, sin poder registrarse nunca.

**La columna no es el cerrojo.** El cerrojo es Firebase (mientras la identidad exista, no hay UID nuevo) más la guarda de lápida. Liberar el correo antes no permite registrarse antes — lo he puesto a prueba explícitamente en los tests **I** y **J**.

### 3.3 · El flujo
```
Navegador                        Servidor                              Firebase
──────────────────────────────────────────────────────────────────────────────────
reautenticación reciente
   └─ POST /api/cuenta/eliminar ─►
                              verifica token (JWKS) + auth_time ≤ 5 min
                              guardas: último super admin · lápida existente
                              crea o RETOMA bajas_de_cuenta ────── solicitada
                              bitácora: cuenta.baja_iniciada (sin copiar PII)
                              ┌─ TRANSACCIÓN ─────────────────────┐
                              │ usuarios.estado='eliminada'       │
                              │ rol='cliente', email=NULL, PII    │
                              │ invitaciones → revocada_por_baja  │
                              │ propiedades → gestion='requiere_gestion'
                              │ citas/solicitudes → bloqueado_en  │
                              └───────────────────────────────────┘ ── bloqueada
                              Admin SDK deleteUser(uid) ──────────►
                              USER_NOT_FOUND = éxito        ◄──────  identidad borrada
                                                                  ── firebase_eliminada
                              vía A: supresiones y disociaciones
                              vía B: bloqueo_revisar_en
                                                                  ── datos_procesados
                              verificación + cuenta.baja_completada ── completada
   ◄── 200 ────────────────────
cerrar sesión → página pública
```

**Autenticación reciente:** el token trae `auth_time` firmado por Google; el servidor exige **≤ 5 min**. No se le cree nada al navegador.

**Por qué Supabase es la barrera:** los ID tokens se validan localmente contra las claves públicas y **siguen valiendo hasta una hora** aunque la identidad se borre. Desde `bloqueada`, cualquier petición con ese token recibe **403 cuenta eliminada** porque lo dice la base.

**Admin SDK:** se usa `deleteUser(uid)`, `getUser(uid)` (verificar idempotencia) y `revokeRefreshTokens(uid)`. **No** se usa `verifyIdToken(token, true)` en cada petición: sería una llamada de red por petición y el estado en la base ya cierra el paso.
**Configuración manual del dueño** (sin secretos por el chat): Firebase Console → ⚙️ *Configuración del proyecto* → **Cuentas de servicio** → *Generar nueva clave privada*; luego Vercel → `vive-bien` → *Environment Variables* → `FIREBASE_SERVICE_ACCOUNT` con el contenido del `.json`, en Production y Preview, marcada **Sensitive**. El permiso *Firebase Authentication Admin* ya lo trae esa cuenta; no hay que tocar IAM.

---

## 4 · Matriz completa — **23 columnas**, ninguna sin tratamiento

**Tratamientos:** **suprimir** (desaparece) · **disociar** (la fila se queda, deja de llevar a la persona) · **bloquear** (se conserva sin usarse, sólo para una obligación) · **conservar** (se conserva y se sigue usando).

| # | Tabla · columna | FK | Nulo | Hoy | Vía | Tratamiento | Qué se hace |
|---|---|---|---|---|---|---|---|
| 1 | `usuarios.uid` | PK | NO | 4 | A | **conservar** | La lápida: sostiene las siete FK |
| 2 | `propiedades.owner_id` | ✅ | SÍ | 6 | A | **conservar** + marca | Sigue apuntando a la lápida; la propiedad pasa a `gestion='requiere_gestion'` (**P-1 = A**) |
| 3 | `propiedades.revisado_por` | — | SÍ | 5 | A | **disociar** | ⚠️ Guarda un **correo**, no un uid (K-28). Se pone a `null` si es el de la persona |
| 4 | `citas.cliente_uid` | ✅ | NO | 0 | A | **conservar** | La cita es historial; el contacto va por P-2 |
| 5 | `citas.asesor_uid` | ✅ | NO | 0 | — | **P-3 abierto** | Citas futuras de un asesor que se va |
| 6 | `citas.creada_por` | — | NO | 0 | A | **disociar** | Quién la creó; `null` no se puede (NOT NULL) → pasa a nullable en la 25 |
| 7 | `citas.propuesta_por` | — | SÍ | 0 | A | **disociar** | `null` |
| 8 | `ajustes_citas.asesor_uid` | ✅ | NO | 0 | A | **suprimir** | Configuración de agenda |
| 9 | `disponibilidad_asesores.asesor_uid` | ✅ | NO | 0 | A | **suprimir** | Íd. |
| 10 | `bloqueos_asesores.asesor_uid` | ✅ | NO | 0 | A | **suprimir** | Íd. |
| 11 | `calendarios_google.asesor_uid` | ✅ | NO | 0 | A | **suprimir** | Guarda credenciales OAuth: obligado |
| 12 | `favoritos.uid` | — | NO | 0 | A | **suprimir** | Preferencia |
| 13 | `busquedas_guardadas.uid` | — | NO | 1 | A | **suprimir** | Preferencia |
| 14 | `google_oauth_estados.uid` | — | NO | 0 | A | **suprimir** | Estado efímero de OAuth |
| 15 | `eventos.uid` | — | SÍ | 76 (0 con uid) | A | **disociar** | `uid → null`; la analítica agregada sigue |
| 16 | `solicitudes_contacto.cliente_uid` | — | NO | 0 | A | **conservar** | El lead es de VIVE BIEN; el contacto va por P-2 |
| 17 | `solicitudes_contacto.owner_id` | — | SÍ | 0 | A | **conservar** | A qué publicador tocaba; no es dato del cliente |
| 18 | `audit_logs.actor_uid` | — | NO | 262 | B | **bloquear** | Fila íntegra |
| 19 | `audit_logs.actor_email` | — | SÍ | 262 | A | **disociar** | Es PII directa: `null` |
| 20 | `citas_eventos.actor_uid` | — | SÍ | 0 | B | **bloquear** | Bitácora de citas |
| 21 | `configuracion.actualizado_por` | — | SÍ | — | B | **bloquear** | Quién cambió un flag: trazabilidad de seguridad |
| 22 | `invitaciones.aceptada_por` | — | SÍ | 2 | B | **bloquear** | Quién aceptó la invitación |
| 23 | `invitaciones.invitado_por` | — | NO | 2 | B | **bloquear** | Quién invitó. Hoy guarda etiquetas de texto (`'D-13 · migración 21'`), no siempre un uid |

> **Corrección del recuento:** primero dije 18, luego 22 y son **23**. El 22 salió de contar filas de esta tabla, y una de ellas juntaba las dos columnas de `invitaciones`. Lo cazó la propia prueba al comparar la lista con el catálogo; por eso la prueba existe.

**Prueba que lo vigila:** una columna nueva que pueda apuntar a una persona y no esté declarada aquí **rompe la suite**. La matriz deja de ser documentación y pasa a ser código.

### 4.1 · PII dentro de `usuarios` (columnas, no referencias) — vía A, en `bloqueada`
`email`, `nombre`, `telefono`, `whatsapp`, `foto_url`, `inmobiliaria`, `biografia`, `zonas` → `null` (**disociación**). `busca_*`, `presupuesto_max`, `completitud`, `bienvenida_vista`, `ultimo_acceso`, `notificaciones_vistas_en` → `null`/`0`/`false` (**supresión**). `rol` → `'cliente'`. La foto en Cloudinary se **suprime**; si falla se registra y se reintenta sin bloquear el cierre.

### 4.2 · La bitácora no puede ser la fuga
Las entradas `cuenta.baja_*` registran `uid`, rol, paso y momento — **nunca una copia de la PII que se retira**.

---

## 5 · Publicador y propiedades (**P-1 = A**)

```
PUBLICADOR pide la baja
        ↓
cuenta bloqueada (inmediato, no se detiene por esto)
        ↓
sus propiedades:  estatus comercial  →  SIN TOCAR
                  gestion            →  'requiere_gestion'
                  owner_id           →  sigue apuntando a la lápida
        ↓
VIVE BIEN decide después: pausar · continuar · reasignar
```

- **No se despublica nada automáticamente.** El `estatus` (hoy las 8 son `disponible`) no cambia.
- `gestion` es una **columna nueva**, no un valor de `estatus`, para no alterar lo que ve el público.
- Cola en el panel con las propiedades en `requiere_gestion`, y bitácora `propiedad.requiere_gestion`.
- **La cuenta nueva con el mismo correo no hereda la propiedad**: `owner_id` sigue en la lápida (test D).
- **Acuerdos y operaciones:** verificado que **no existen esas tablas**. Cuando existan, la regla tendrá que estar escrita en el contrato con el publicador. Anotado, no inventado.

---

## 6 · Bloqueo operativo de la PII (**P-2 = bloqueo inmediato, supresión posterior**)

**Qué significa:** al bloquear la cuenta, los datos de contacto **quedan fuera de todo uso operativo**. Ninguna función de contacto, notificación, consulta o lead puede usarlos. Siguen guardados sólo mientras sea necesario conservarlos, y la supresión o disociación definitiva llega con la política legal aprobada.

**Cómo se garantiza** (porque «no usarlos» tiene que ser algo más que una promesa):

1. **Marca:** `citas.bloqueado_en` y `solicitudes_contacto.bloqueado_en`, escritas en la transacción de `bloqueada`.
2. **Vistas que enmascaran:** `citas_operativas` y `solicitudes_contacto_operativas` devuelven `null` en nombre, teléfono y correo cuando `bloqueado_en` no es nulo. Todo lo demás (fechas, propiedad, tipo, origen, consentimiento) pasa igual.
3. **La aplicación lee las vistas, nunca las tablas** para esos campos. Los doce archivos que hoy leen `leads`/`solicitudes_contacto` (K-08) se migran a las vistas.
4. **Prueba de guarda:** falla si un archivo del servidor selecciona `nombre`, `telefono`, `email`, `cliente_nombre`, `cliente_telefono` o `cliente_email` directamente de la tabla fuera del módulo autorizado. Sin esto, basta que alguien escriba una consulta nueva para saltarse el bloqueo.
5. **Plazo:** `bajas_de_cuenta.bloqueo_revisar_en` marca cuándo toca revisar. Lo fija la política legal (**P-4**); el diseño deja el hueco y **no inventa plazos**.

**Consentimiento — DRAFT de conservación.** `consentimiento_en` y `consentimiento_version` se **conservan**, y queda **sin decidir** si hace falta una referencia seudónima para acreditar al titular. No se decide ahora.

---

## 7 · Reintentos

**Idempotencia por construcción:**
- Los pasos de base son `UPDATE … WHERE uid = $1 AND estado = '<el anterior>'`: repetir no hace nada.
- **`USER_NOT_FOUND` de Firebase = éxito.** Significa que el paso ya ocurrió; nunca un error fatal que deje la cuenta en un estado imposible.
- Las supresiones son `DELETE … WHERE uid = $1`; las disociaciones escriben `null` sobre `null`.
- Una segunda llamada a `POST /api/cuenta/eliminar` **no repite operaciones destructivas**: lee el estado y sigue o repara desde donde quedó.

**Quién reintenta:** (1) la misma llamada · (2) una sesión que llega con la cuenta cerrada y el proceso sin completar · (3) una pantalla de administración con las bajas atascadas y un botón de reintentar.

**Contabilidad:** `intentos`, `ultimo_intento_en`, `ultimo_error`; tras varios fallos, `estado='error'` — visible, no silencioso.

**Los dos fallos:**
- **Supabase falla en `bloqueada`:** la transacción no se aplica, la cuenta sigue activa, error honesto. **No hay estado intermedio.**
- **Firebase falla:** `usuarios.estado = 'eliminada'` y `bajas_de_cuenta.estado = 'error'`. La cuenta **está cerrada**; la persona no puede entrar. **No se le dice que terminó ni que ya puede registrarse**: la pantalla dice que su cuenta está cerrada y que queda un paso en curso. Se reintenta.

---

## 8 · Pruebas

| | Prueba | Qué confirma |
|---|---|---|
| **A** | `U1 CLIENTE` → baja → Firebase eliminada → datos procesados → **completada** → mismo correo → **`U2` CLIENTE** | El camino completo |
| **B** | **`U1 ≠ U2`** y `U2` sin nada privado | Dos `uid`; sin favoritos, búsquedas, perfil, consultas ni historial |
| **C** | `U1` **Google** → baja → mismo Google/correo → `U2` | Igual que A con Google |
| **D** | `U1` **PUBLICADOR** → baja → `U2` mismo correo → **CLIENTE sin propiedades**; la propiedad en `requiere_gestion` con su `estatus` intacto | P-1 = A |
| **E** | `U1` **ADMIN** → baja → `U2` mismo correo → **CLIENTE**, aun con invitación pendiente | Revocación de invitaciones |
| **F** | `U1` **SUPER_ADMIN** último → **rechazado**; con dos, el segundo sí | Protección del último super admin |
| **G** | `U1` baja → **token viejo aún válido** → API → **403** | La barrera es el servidor, no el logout |
| **H** | Idempotencia y fallos: baja dos veces · `USER_NOT_FOUND` · Firebase falla · Supabase falla · **reintento exitoso** | No duplica, no corrompe, no revierte, termina |
| **I** | **Re-registro ANTES de que Firebase confirme** → **bloqueado** | Con Google devuelve el UID de U1 → guarda de lápida → 403; nunca revive |
| **J** | **Re-registro DESPUÉS de `completada`** → UID nuevo → fila nueva → **CLIENTE** | La promesa se cumple justo cuando se dice |
| **K** | **PII bloqueada no se puede leer** por las vistas ni por el panel | P-2 de verdad, no de palabra |

**Guardas, además:** la matriz de las 23 referencias · la lápida sin PII · `resolverPerfil('eliminada')` ≠ `'activo'` · `auth_time` de 30 min → 401 y de 1 min → pasa · `/api/cuenta/eliminar` responde **con los flags apagados** · ningún archivo del servidor lee las columnas de contacto fuera del módulo autorizado.

---

## 9 · Invitaciones

**Hoy:** `aplicarInvitacion` busca pendientes con `ilike('email', …)` y escribe el rol, desde el alta silenciosa de `GET /api/usuarios/me`. Índice único parcial sobre `lower(email)`. **2 pendientes en producción.**

**Riesgo:** `U1 ADMIN` se da de baja, `U2` usa el mismo correo y **nace admin**. Igual con super admin y publicador.

**Qué se hace**, dentro de la transacción de `bloqueada`:
```
invitaciones donde lower(email) = lower(<correo de U1>) y estado = 'pendiente'
        → estado = 'revocada_por_baja'
```
Se **bloquean**, no se borran: son historial de quién invitó a quién. Y la guarda de lápida impide además que se apliquen a un `uid` cerrado.

**Después:** `U2` se registra, no hay pendientes → **CLIENTE**. Si de verdad debe ser publicador o admin: **invitación nueva**, acto nuevo de un administrador.

> **Pendiente de fondo, fuera de 3b-3:** que la invitación no dependa sólo del correo (un token de un solo uso). No bloquea la migración, porque la revocación ya cierra el agujero.

---

## 10 · Super Admin

- **El último super admin activo no puede darse de baja.** Guarda en `POST /api/cuenta/eliminar`, antes de tocar nada: si `count(*) where rol='super_admin' and estado='activo'` es 1 y es quien pide, **409 con explicación**. Hoy hay **uno solo** en producción: la guarda afecta al dueño.
- Con dos o más, el segundo sí puede: la baja es un derecho, no una excepción de cargo.
- La lápida pasa a `rol='cliente'`, así que una baja **nunca** deja un super admin fantasma sosteniendo el conteo.
- `U2` con el mismo correo es **CLIENTE**. Recuperar super admin exige que otro super admin lo conceda (test F + E).

---

## 11 · Antes de ejecutar la migración 25

1. **Respaldo** de `usuarios`, `invitaciones`, `propiedades`, `citas`, `solicitudes_contacto`.
2. **Ensayo en PGlite** con el esquema real y las pruebas A–K.
3. **Ensayo en producción dentro de una transacción revertida**, con evidencia antes/después.
4. **Aplicar**, verificar y guardar la evidencia. `25-baja-de-cuenta.REVERTIR.sql` queda escrito de antemano.

**Sigue sin decidir (no bloquea la migración):** P-3 (citas futuras de un asesor) y P-4 (plazos y excepciones de conservación, abogado). Los textos legales siguen en DRAFT: **no se redacta política jurídica en código**.
