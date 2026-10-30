# Baja de cuenta — AUDIT + PLAN de implementación (24-sep-2026)

- **Etapa 1 (endurecimiento) DESPLEGADA** el 24-sep — §I y §K. **D-41 aprobado** (fallo cerrado).
- Lo demás sigue sin tocar: sin endpoint de baja, sin `deleteUser`, sin cambios en la migración 25, sin `npm audit fix`.
- **Base:** D-35 · `DISENO_BAJA_DE_CUENTA.md` · migración 25 aplicada (`EVIDENCIA_MIGRACION_25.md`) · diagnóstico `Firebase Admin: OK` confirmado en producción por el dueño.
- Todo lo medible de aquí está **medido**, no supuesto: se dice cómo.

---

# A · AUDIT

## A.1 · Arquitectura actual

### Firebase Auth
Sólo SDK de navegador (`firebase@12.11.0`): correo/contraseña y Google. El servidor **no tenía** credenciales hasta ahora; `firebase-admin@14.5.0` se instaló para el diagnóstico y `FIREBASE_SERVICE_ACCOUNT` existe en Production.

### Cómo valida el backend los tokens
`verifyIdToken` (`src/lib/auth-server.ts:51`) verifica el JWT **localmente** contra el JWKS de Google, comprobando algoritmo, emisor y audiencia. **No hay `checkRevoked`** ni llamada a Firebase. Consecuencias que mandan sobre todo el diseño:

- Un ID token ya emitido **sigue siendo válido hasta que caduca (≤ 1 h)**, aunque la identidad se borre en Firebase.
- Por tanto **el cerrojo tiene que estar en la base**, no en Firebase.

### Supabase / PostgreSQL
PostgreSQL 17.6. RLS activo **sin políticas** en las 21 tablas (deny-by-default); el servidor entra con service role tras validar la sesión. Migración 25 aplicada.

### El punto de autorización
`crearAutorizador(deps)` → `autorizar(req, decide, que)`: sesión → suspensión → permiso → bitácora del intento denegado. `exigir()`, `requireAdmin()` y `exigirPortal()` pasan por ahí. **Medido sobre las 43 rutas de API:**

| Camino | Rutas | ¿Mira `estado`? |
|---|---|---|
| `exigir(...)` | 11 | **Sí** |
| `requireAdmin(...)` → `exigir('panel.admin')` | 10 | **Sí** |
| `exigirPortal(...)` → `exigir('cuenta.propia')` | 8 | **Sí** |
| **Sólo `verifyIdToken`** | **3** | **NO** |
| Mixtas (un método autoriza, otro no) | 2 | parcial |
| Públicas a propósito (catálogo, salud, webhooks, leads anónimos…) | 9 | n/a |

### Relaciones entre entidades
23 columnas apuntan a una persona (matriz §A.5). Siete claves foráneas a `usuarios.uid`, **todas `NO ACTION`**: `DELETE` de `usuarios` es imposible, y por eso la baja es lápida + tratamiento selectivo.

### Qué resuelve ya la migración 25, y qué no

| Resuelto | Pendiente (esta implementación) |
|---|---|
| `usuarios.email` nullable + `CHECK` que impide una cuenta viva sin correo | Escribir la lápida |
| `usuarios.estado` admite `eliminada` | Que `resolverPerfil` **deje de** normalizar lo desconocido a `'activo'` |
| `bajas_de_cuenta` con los 6 estados, marcas por paso, `intentos`, `ultimo_error` | Todo el procedimiento que la usa |
| `invitaciones` admite `revocada_por_baja` | Revocarlas |
| `propiedades.gestion` | Marcarlas |
| `bloqueado_en` + las dos vistas que enmascaran PII | Que la aplicación **lea las vistas** (hoy nadie las lee) |
| El índice único de correo, verificado NULLS DISTINCT | — |

### ⚠️ Qué ocurre HOY con un token válido de una cuenta marcada `eliminada`
Medido, no supuesto. Si hoy marcáramos a mano una cuenta como `eliminada`:

1. **`resolverPerfil` la devolvería como `'activo'`.** La línea `auth-server.ts:114` es `estado === 'suspendido' || estado === 'pendiente' ? estado : 'activo'`: cualquier valor desconocido **falla abierto**. La cuenta entraría a todo con rol cliente.
2. Aunque se arreglara esa línea, quedan **tres rutas que no pasan por el autorizador**:

| Ruta | Qué permite hoy a un token válido de una lápida |
|---|---|
| **`GET/PATCH /api/usuarios/me`** | GET **crea la cuenta** (`upsert` por `uid`) y aplica invitaciones por correo; **no mira `estado` en absoluto**, ni siquiera `suspendido`. PATCH lo mira, pero con una copia a mano de la regla, sólo para `suspendido`. Es la única ruta que crea cuentas y es la que se salta la barrera |
| **`POST /api/medios/firma`** | Devuelve una **firma de subida a Cloudinary**. Una cuenta cerrada podría seguir subiendo archivos |
| **`GET /api/leads`** | Lectura de leads, resuelta con `getPerfil` a mano |
| `POST /api/eventos` | Analítica; usa `verifyIdToken` en el POST (el GET sí es admin). Bajo impacto, pero cuenta |

3. **El propio token**: sin revocación, sirve hasta su caducidad. Cerrar sesión en el navegador **no invalida nada** del lado del servidor.

**Conclusión del AUDIT:** el punto 1 y el punto 2 son los dos agujeros por los que una cuenta eliminada seguiría teniendo acceso. **Cerrados el 24-sep en la etapa 1 — §I.** El punto 3 (el token vivo hasta 1 h) no se puede cerrar en Firebase: se cierra comprobando el estado local, que es justo lo que hace la etapa 1.

## A.2 · Node y Vercel

| | |
|---|---|
| Node en Vercel | **24.x** (leído de la configuración del proyecto) |
| `firebase-admin` | **14.5.0** (la última) |
| Requisito | `engines.node >= 22` → **compatible** |
| En el repo | **No hay `engines` en `package.json` ni `.nvmrc`** |

**Riesgo de no fijarlo:** la versión la elige Vercel. Si su valor por defecto bajara de 22 —o si alguien clona y construye con Node 20—, `firebase-admin` fallaría **en ejecución y en producción**, no en el build. Hoy no pasa nada; el problema es que nada lo impide.

**Propuesta exacta** (no aplicada): añadir a `package.json`
```json
"engines": { "node": ">=22" }
```
Vercel respeta `engines.node` para elegir el runtime, y `npm`/CI avisan si no se cumple. Un `.nvmrc` con `24` sería complementario para quien desarrolle en local.

## A.3 · Vulnerabilidades — qué trajo `firebase-admin` y qué alcance real tiene

Instalarlo añadió **114 paquetes** y **4 advisories nuevos**. Lo de «nuevo» está medido contra el diff del lockfile, no de memoria.

| Advisory | Severidad | Lo introduce | Rango afectado | Corregido en | ¿lo arregla `npm audit fix`? |
|---|---|---|---|---|---|
| `@grpc/grpc-js` — caída con mensajes malformados (CVSS 7.5 ×2) | alta | `firebase-admin` → `@google-cloud/firestore` | `<=1.9.15` | 1.9.16 | **Sí** (parche) |
| `brace-expansion` — agotamiento de memoria y DoS exponencial (hasta CVSS 7.5) | alta | cadena de `firebase-admin` | `<=1.1.17 \|\| 3.0.0-5.0.8` | 1.1.21 / 5.0.12 | **Sí** |
| `gaxios` | media | `firebase-admin` → `@google-cloud/storage` | `6.4.0-6.7.1` | — | **No** |
| `uuid` — falta comprobación de límites de buffer en v3/v5/v6 (CVSS 7.5) | media | `gaxios` → `uuid@9.0.1` | `<11.1.1` | 11.1.1 | **No** |

**`gaxios` no tiene advisory propio.** Su único `via` es `uuid`: está marcado porque depende de un `uuid` vulnerable.

### Alcance real dentro del árbol y del runtime
No me vale «no usamos esa funcionalidad». Dos medidas independientes:

**1 · Qué se despliega.** La traza de ficheros de Next (`route.js.nft.json`) dice exactamente qué se sube a la función serverless:

```
ruta /api/diagnostico/firebase → 32 paquetes, 320 archivos
  gaxios              PRESENTE (15 archivos)
  firebase-admin      PRESENTE (15 archivos)
  google-auth-library PRESENTE (46 archivos)
  @grpc/grpc-js       ausente
  brace-expansion     ausente
  uuid                ausente
  @google-cloud/storage ausente
(para comparar, una ruta normal del portal: 4 paquetes, 148 archivos)
```

**2 · Qué se carga en ejecución.** Cargando los módulos en un proceso Node limpio, sin credenciales ni red, e inspeccionando `require.cache`:

```
firebase-admin/app          → 14 paquetes
firebase-admin/app + /auth  → 33 paquetes
  /auth añade: jsonwebtoken, jwks-rsa, jose, ms, semver, debug, limiter,
               lru-cache, lru-memoizer y 7 lodash.* sueltos
  @grpc/grpc-js    NO se carga
  brace-expansion  NO se carga
  uuid             NO se carga
  gaxios           CARGADO (14 archivos)
```

**3 · De dónde sale `uuid` exactamente** (segunda verificación, sobre `package-lock.json`). Confirma lo que anunció Firebase al quitar su dependencia de `uuid` en 13.10.0:

```
firebase-admin@14.5.0
  dependencies         : @fastify/busboy, @firebase/database-compat,
                         @firebase/database-types, fast-deep-equal,
                         google-auth-library, jsonwebtoken, jwks-rsa
  optionalDependencies : @google-cloud/firestore, @google-cloud/storage
  ¿depende de uuid?    : NO
```

El camino exacto, y **todo él por dependencias opcionales**:
```
firebase-admin ─(optional)→ @google-cloud/storage@8.2.0
                              └→ gaxios@6.7.1  (optional)  ─→ uuid@^9.0.1  (optional)
```

**Hay seis copias de `gaxios` en el árbol**, y ahí está la clave:

| Copia | Versión | ¿uuid? | ¿Se carga? |
|---|---|---|---|
| `node_modules/gaxios` | **6.7.1** (optional) | **sí, `^9.0.1`** | **NO** |
| `google-auth-library/node_modules/gaxios` | 7.3.1 | no | **sí** |
| `gcp-metadata/node_modules/gaxios` | 7.3.1 | no | **sí** |
| las otras tres (firestore-api, gtoken) | 7.x | no | no |

**Conclusión demostrada, no asumida.** De los 114 paquetes instalados, **33 se cargan** con `app + auth`. Y de los 4 advisories nuevos, **ninguno está en el conjunto cargado**:

```
archivos de uuid cargados        : 0
archivos de @grpc cargados       : 0
archivos de @google-cloud cargados: 0
¿está en memoria gaxios 6.7.1 (el del advisory)? → false
```

**Corrijo mi propia entrega anterior.** Dije que «gaxios se carga pero hereda el aviso de uuid». Es más limpio que eso: **el gaxios que se carga es el 7.3.1 anidado bajo `google-auth-library`, que no depende de uuid en absoluto**. El 6.7.1 marcado por el advisory no entra en memoria.

**Sobre los `require` perezosos:** el `require("uuid")` de gaxios 6.7.1 está en `build/src/gaxios.js:63`, en el nivel superior del módulo — **no es perezoso**. Si ese módulo se cargara, `uuid` se cargaría con él. No se carga porque nada requiere esa copia: `google-auth-library` resuelve su propia gaxios 7.3.1 anidada. Y `@grpc/grpc-js` no aparece porque `@google-cloud/firestore` —que sí lo usaría— es opcional y nunca se importa.

**El límite de esta conclusión:** vale para `firebase-admin/app` y `firebase-admin/auth`. Si alguien importa `/firestore` o `/storage`, entran `@grpc/grpc-js`, `@google-cloud/*` y la gaxios 6.7.1 con su `uuid` — y con ellos los cuatro advisories. Por eso la condición no es una recomendación: es una **prueba** que debe fallar si la lista de módulos cargados crece.

**Los límites de esta conclusión, dichos claramente:** mide el grafo de `require` de nivel superior. Un `require()` perezoso dentro de una función podría cargar más en el momento de llamarla — es justo lo que hace Firestore con `@grpc/grpc-js`, y por eso no aparece: nunca llamamos a Firestore. Si mañana alguien importa `firebase-admin/firestore` o `/storage`, esta medición deja de valer y hay que rehacerla. Propongo dejarla **como prueba automática**, no como párrafo de documento.

### Vulnerabilidad crítica preexistente
La única **crítica** del informe es `websocket-driver` (`<=0.7.4`, bypass de límite de recursos y corrupción de mensajes). **Ya estaba antes de `firebase-admin`** y no tiene nada que ver con esto. Igual que `@babel/core`, `browserslist`, `js-yaml`, `ws`, `@humanfs/node` y `baseline-browser-mapping`: preexistentes, casi todas de build/desarrollo.

### Qué tocaría `npm audit fix` (medido con `--dry-run`, no ejecutado)
`añade 1 · elimina 4 · cambia 18` paquetes: `@babel/*` (4), `browserslist`, `caniuse-lite`, `electron-to-chromium`, `node-releases`, `update-browserslist-db`, `baseline-browser-mapping`, `js-yaml`, `ws`, `websocket-driver`, `@humanfs/*`, `@grpc/grpc-js 1.9.15→1.9.16`, `brace-expansion` (las dos copias).
**No arregla `uuid` ni `gaxios`**: `gaxios@6` fija `uuid@^9` y saltar a `uuid@11` rompería el rango semver. Requeriría un `overrides`.
Casi todo lo que toca es cadena de build (Babel/browserslist), así que el riesgo es de romper el build, no la aplicación — pero **no es parte de esta tarea** y debe ir en su propio commit, con su propia verificación.

## A.4 · Privacidad — qué está decidido y qué no

| | |
|---|---|
| **Decidido por el producto** | El cierre es inmediato y no lo aprueba nadie · el correo se puede reutilizar · la cuenta nueva es CLIENTE y no hereda nada · la baja de un publicador no despublica |
| **Ya en la migración 25** | `email` nullable, `estado='eliminada'`, `bajas_de_cuenta`, `revocada_por_baja`, `gestion`, `bloqueado_en` y las vistas que enmascaran |
| **Requiere revisión legal (P-4)** | Qué se conserva por obligación, con qué plazo, y cuándo toca la supresión de lo bloqueado. `bajas_de_cuenta.bloqueo_revisar_en` es el hueco donde encaja |
| **Vía A — cierre** | Inmediato, automático: acceso, identidad, PII del perfil, preferencias, identidad de Firebase, invitaciones |
| **Vía B — datos retenidos** | Bloqueo inmediato; la supresión llega con la política aprobada |

Esto **no** es «borrar absolutamente todo», y los textos no dirán que lo es. No invento obligaciones legales ni plazos: los fija el abogado.

## A.5 · Las 23 referencias (matriz aprobada, verificada contra el catálogo de producción)

`declaradas = 23 · en el catálogo = 23 · sin tratamiento = 0 · declaradas que ya no existen = 0`.

| Trato | Columnas |
|---|---|
| **Preservar** (5) | `usuarios.uid` · `propiedades.owner_id` · `citas.cliente_uid` · `solicitudes_contacto.cliente_uid` · `solicitudes_contacto.owner_id` |
| **Suprimir** (7) | `ajustes_citas.asesor_uid` · `disponibilidad_asesores.asesor_uid` · `bloqueos_asesores.asesor_uid` · `calendarios_google.asesor_uid` · `favoritos.uid` · `busquedas_guardadas.uid` · `google_oauth_estados.uid` |
| **Desasociar** (5) | `propiedades.revisado_por` ⚠ *(guarda un **correo**, no un uid)* · `citas.creada_por` · `citas.propuesta_por` · `eventos.uid` · `audit_logs.actor_email` |
| **Bloquear** (5) | `audit_logs.actor_uid` · `citas_eventos.actor_uid` · `configuracion.actualizado_por` · `invitaciones.aceptada_por` · `invitaciones.invitado_por` |
| **Requiere gestión manual** (1) | `propiedades.owner_id` → además marca `gestion='requiere_gestion'` (P-1 = A) |
| **Pendiente P-3** (1) | `citas.asesor_uid` — citas futuras de un asesor que se va |

Más la PII de columnas de `usuarios` (no son referencias): `email`, `nombre`, `telefono`, `whatsapp`, `foto_url`, `inmobiliaria`, `biografia`, `zonas` → desasociar; preferencias → suprimir; `rol` → `cliente`; foto en Cloudinary → suprimir.

**No hacen falta columnas nuevas.** Todo lo que necesita el procedimiento ya está en la migración 25.

---

# B · RIESGOS

| # | Riesgo | Probabilidad | Impacto | Cómo se evita |
|---|---|---|---|---|
| R-1 | **Fallo abierto:** se escribe una lápida y `resolverPerfil` la trata como `activo` | Alta si se olvida | **Crítico** — cuenta cerrada con acceso total | Cambiar la línea y la guarda **en el mismo commit**; test que falla si `resolverPerfil('eliminada')` devuelve `'activo'` |
| R-2 | **Resurrección por UID:** con la identidad de Firebase viva, entrar con Google devuelve el UID de U1 y `/api/usuarios/me` lo revive | Alta | **Crítico** | Guarda de lápida en el alta + tests I/J |
| R-3 | Las 3 rutas sin barrera siguen sirviendo a una lápida (sobre todo la **firma de subida**) | Alta | Alto | Pasarlas por `autorizar` en la etapa 1 |
| R-4 | Doble clic o reintento crea dos procesos o repite operaciones destructivas | Media | Medio | PK por `uid` + transiciones `WHERE estado = <anterior>` + `USER_NOT_FOUND` como éxito |
| R-5 | Supabase OK y Firebase falla → se promete el correo antes de tiempo | Media | Alto | La promesa va atada a `completada`, no a la columna |
| R-6 | La PII bloqueada se sigue leyendo porque alguien escribe una consulta nueva a la tabla | Media | Alto | Prueba de guarda que prohíbe leer esas columnas fuera del módulo autorizado |
| R-7 | Se borra el último super admin y nadie puede administrar | Baja | **Crítico** | Guarda antes de tocar nada (hoy hay **uno solo** en producción) |
| R-8 | La bitácora de la baja guarda una copia de la PII que se está retirando | Media | Alto | Las entradas `cuenta.baja_*` llevan `uid`, rol, paso y hora; **nunca** el perfil |
| R-9 | Abuso del endpoint (llamadas repetidas contra Google) | Baja | Bajo | **Corrección a mi AUDIT anterior: sí hay limitador** (`frenar`/`TOPES` en `lib/limites.ts`); mi grep en inglés no lo vio. Basta añadir una entrada al catálogo — ver D.3 |
| R-10 | Alguien importa `firebase-admin/firestore` o `/storage` y entra `@grpc/grpc-js` | Baja | Medio | Prueba que vigile la lista de módulos cargados |
| R-11 | Vercel cambia su Node por defecto y `firebase-admin` deja de arrancar | Baja | Alto | Fijar `engines` |

---

# C · Admin SDK vs REST — comparación técnica para **este** proyecto

**Opción A:** `firebase-admin@14.5.0` (ya instalado y validado en producción).
**Opción B:** Identity Toolkit REST + token OAuth2 firmando un JWT con el `crypto` de Node.

| | A · Admin SDK | B · REST directo |
|---|---|---|
| **Borrar identidad** | `getAuth(app).deleteUser(uid)` | `POST …/v1/projects/{p}/accounts:delete` con `localId` |
| **Revocar sesiones** | `revokeRefreshTokens(uid)` | `POST …/accounts:update` con `validSince` |
| **Consultar identidad** (idempotencia) | `getUser(uid)` → `auth/user-not-found` | `accounts:lookup` → lista vacía |
| **Credenciales** | `cert()` + refresco automático del token | Firmar el JWT y cachear el token a mano (~40 líneas) |
| **Errores** | Códigos tipados (`auth/user-not-found`, `auth/invalid-credential`) | HTTP + cuerpo JSON de Google; el mapeo lo escribimos nosotros |
| **Reintentos y backoff** | Los trae la librería | A mano |
| **Dependencias** | +114 instaladas · **33 cargadas** en runtime | **0 nuevas** |
| **Advisories nuevos** | 4, **ninguno alcanzable** (demostrado en A.3) | 0 |
| **Superficie desplegada** | 32 paquetes / 320 archivos por función | ~0 extra |
| **Mantenimiento** | Google lo mantiene; actualizar la librería | Nuestro: si Google cambia la API, la arreglamos nosotros |
| **Node / Vercel** | Exige ≥22; Vercel da 24.x ✅ | Cualquiera |
| **Complejidad** | Baja: 3 llamadas | Media: firma JWT, caché de token, mapeo de errores, pruebas del transporte |
| **Riesgo de error propio** | Bajo | **Real**: firmar mal un JWT o cachear mal un token son fallos silenciosos |
| **Qué se puede hacer hoy** | Todo lo del diseño | Todo lo del diseño |
| **Qué queda fuera** | Nada que necesitemos | Nada que necesitemos |
| **Ya validado en producción** | **Sí** (`Firebase Admin: OK`) | No |

### Recomendación tras la segunda verificación — **D-36 sigue PENDIENTE DE VALIDACIÓN FINAL**
La segunda verificación **refuerza A**: los cuatro advisories llegan por dependencias **opcionales** que nunca se cargan, y el `gaxios` vulnerable ni siquiera es el que entra en memoria (§A.3). Con eso, el argumento en contra de A se queda casi sin base técnica: lo que queda es una cuestión de política —114 paquetes en el árbol— y de confianza en que nadie importe `/firestore` o `/storage` mañana, que es justo lo que la prueba de guarda impide.

**Me inclino por A**, con dos condiciones. El argumento del peso pierde fuerza con los números medidos: los 114 paquetes son de disco, al despliegue llegan 32, y ninguno de los 4 advisories está en el camino. A cambio, B nos hace dueños de firmar JWTs y cachear tokens OAuth en el camino de una operación irreversible — ahí un fallo nuestro es más probable que un DoS en una dependencia que no se carga.

Las dos condiciones: **(1)** importar **sólo** `firebase-admin/app` y `firebase-admin/auth`, nunca `/firestore` ni `/storage`, con una prueba que lo vigile; **(2)** una prueba que fije la lista de módulos cargados y falle si entra `@grpc/grpc-js` o `uuid`.

**Cuándo elegiría B:** si prefieres cero dependencias nuevas en el camino de una operación irreversible, o si la política de la casa es no añadir 114 paquetes por tres llamadas. Es defendible y el coste es ~un día más de trabajo y pruebas.

**Decisión abierta: D-36.**

---

# D · PLAN DE IMPLEMENTACIÓN POR ETAPAS

## D.1 · Flujo completo de cierre (diseño, sin implementar)

```
CUENTA U1
  ↓ «Eliminar mi cuenta» en /portal/configuracion (y en /mi-cuenta)
  ↓ advertencia: qué se cierra, qué se conserva, que NO se recupera
  ↓ escribir ELIMINAR
  ↓ REAUTENTICACIÓN (popup de Google o contraseña)
  ↓ POST /api/cuenta/eliminar
      · verifica el token (JWKS) y que auth_time ≤ 5 min      ← el servidor, no el navegador
      · guarda: último super admin activo → 409
      · guarda: ¿ya hay lápida? → retoma, no empieza otra
      · crea o RETOMA bajas_de_cuenta                          [solicitada]
      · bitácora cuenta.baja_iniciada (uid, rol, paso, hora — nunca PII)
      ┌─ TRANSACCIÓN SQL ────────────────────────────────────┐
      │ usuarios: estado='eliminada', rol='cliente',         │
      │           email=NULL, PII del perfil a null          │
      │ invitaciones pendientes de ese correo                │
      │           → 'revocada_por_baja'                      │
      │ propiedades del uid → gestion='requiere_gestion'     │
      │ citas y solicitudes del uid → bloqueado_en = now()   │
      │ supresiones: favoritos, búsquedas, agenda,           │
      │           calendarios_google, google_oauth_estados   │
      │ desasociaciones: revisado_por, creada_por,           │
      │           propuesta_por, eventos.uid, actor_email    │
      │ bajas_de_cuenta → 'bloqueada' + bloqueada_en         │
      └──────────────────────────────────────────────────────┘
        ↑ desde aquí NO puede volver a entrar (el servidor lo rechaza)
      · Firebase: revokeRefreshTokens(uid) y deleteUser(uid)
        USER_NOT_FOUND = éxito                                [firebase_eliminada]
      · foto de Cloudinary (fuera de la transacción; si falla, se reintenta)
      · verificación                                          [datos_procesados]
      · bitácora cuenta.baja_completada                       [completada]
  ↓ respuesta al navegador: { estado, puedeRegistrarseDeNuevo }
  ↓ cerrar sesión → página pública
  ↓ (sólo si completada) «Puedes registrarte otra vez con este correo»
```

**Cumple lo exigido:** no hay aprobación de admin · el cierre es inmediato desde el paso de bloqueo · el correo se libera · las propiedades **siguen publicadas** con su `estatus` y pasan a `requiere_gestion` · leads y citas quedan bloqueados según la migración 25, **incluido el texto libre** · las invitaciones pendientes se revocan · el token antiguo no entra · y la PK por `uid` lo hace seguro frente a dobles solicitudes.

## D.2 · Estado del proceso — qué falta (y **no** se añade ahora)

`bajas_de_cuenta` ya trae todo lo necesario: los 6 estados, `solicitada_por`, `auth_time`, `motivo`, las cinco marcas de tiempo por paso, `intentos`, `ultimo_intento_en`, `ultimo_error`, `bloqueo_revisar_en`.

> **Discrepancia que tengo que señalar.** Tu punto 8 pide `usuarios.eliminada_en`, `eliminada_por` y `eliminada_motivo`. **Esas tres columnas no existen**: en la migración 25 viven en `bajas_de_cuenta` como `solicitada_en`, `solicitada_por` y `motivo`, con una fila por cuenta. Lo hice así para no tener el mismo dato en dos sitios. Si prefieres tenerlas también en `usuarios` para que el panel no tenga que cruzar, es una migración 26 de tres columnas — **decisión D-37**, y no la doy por hecha.

Lo único que podría faltar más adelante, y que **no propongo añadir todavía**: un `lock` optimista o un `advisory lock` si dos peticiones simultáneas llegaran al mismo milisegundo. Con la PK y las transiciones condicionadas, la segunda no hace daño; si al probar concurrencia apareciera una carrera real, se añade entonces.

## D.3 · Seguridad del endpoint

| | |
|---|---|
| **Ruta** | `POST /api/cuenta/eliminar` — **fuera de `/api/portal/*`**, porque cerrar la cuenta no depende de que el portal esté encendido |
| **Método** | `POST` (destructivo, nunca `GET`). Un `GET` acompañante devuelve el estado del proceso |
| **Autenticación** | Token de Firebase en `Authorization: Bearer`, verificado con JWKS |
| **Reautenticación** | El servidor exige `auth_time` del token **≤ 5 min**. No se le cree al navegador |
| **Autorización** | `exigir(req, 'cuenta.propia')`, y **sólo sobre la propia cuenta**: el `uid` sale del token, **nunca del cuerpo** |
| **Idempotencia** | PK por `uid` en `bajas_de_cuenta`; cada paso es `UPDATE … WHERE estado = <anterior>`; `USER_NOT_FOUND` = éxito |
| **CSRF** | No aplica: la sesión va en cabecera, no en cookie, así que un formulario de otro sitio no la lleva. Aun así se exige `content-type: application/json` |
| **Doble clic** | El botón se deshabilita, y el servidor retoma en vez de repetir |
| **Límite de peticiones** | El proyecto **ya tiene** limitador (`frenar(clave, tope)` + catálogo `TOPES`, respuesta 429 con `Retry-After`). Se añade una entrada: `bajaCuenta: { maximo: 5, ventanaMs: 60 * 60 * 1000 }`, aplicada **después** de autorizar y con clave `baja:<uid>`. **Por qué 5 en una hora:** darse de baja es un acto único; los reintentos legítimos tras un fallo de Firebase caben de sobra en cinco, y un bucle accidental del navegador se corta enseguida. Es memoria por instancia, igual que el resto: frena el bucle, no a un atacante decidido |
| **Errores** | Catálogo fijo; nunca el mensaje crudo de la librería |
| **Bitácora** | `cuenta.baja_iniciada`, `cuenta.baja_completada`, `cuenta.baja_error` con `uid`, rol, paso y hora |
| **Nunca en los registros** | El correo, el nombre, el teléfono, la foto, el token, la credencial de servicio, la clave privada ni el `motivo` que escriba la persona |
| **Respuesta al navegador** | `{ estado, puedeRegistrarseDeNuevo }` y nada más. **`puedeRegistrarseDeNuevo` sólo es `true` cuando el estado es `completada`** |

## D.4 · Consistencia: qué va en la transacción y qué no

**Dentro de una transacción SQL** (todo o nada): la lápida, la revocación de invitaciones, la marca de las propiedades, `bloqueado_en`, las supresiones, las desasociaciones y el paso a `bloqueada`. Si algo falla, **no se aplica nada** y la cuenta sigue activa.

**Fuera, y por eso el proceso tiene estados:** el borrado en Firebase, la supresión de la foto en Cloudinary y la verificación final. Son sistemas distintos: no pueden estar en la misma transacción, y por eso hace falta un registro del avance.

## D.5 · Identidad de Firebase

| Pregunta | Respuesta |
|---|---|
| ¿Cuándo se elimina? | **Después** de que la base esté bloqueada, nunca antes |
| ¿Refresh tokens? | Al borrar la identidad dejan de servir: no se pueden acuñar ID tokens nuevos |
| ¿ID tokens ya emitidos? | **Siguen válidos hasta caducar (≤ 1 h)**: los verificamos localmente contra el JWKS |
| ¿Cómo lo impide el backend? | Por **estado en la base**. Desde `bloqueada`, cualquier petición con ese token recibe 403. Ésa es la barrera |
| ¿Hace falta revocación explícita? | **No como mecanismo**, sí como higiene: `revokeRefreshTokens(uid)` cierra sesiones abiertas antes del borrado. Comprobarla en cada petición exigiría `verifyIdToken(token, true)`, una llamada de red por petición — **descartado** |
| ¿A o B? | Las dos resuelven las tres piezas (borrar, revocar, consultar). Ver §C |

## D.6 · UX

| Momento | Qué ve |
|---|---|
| **Dónde** | `/portal/configuracion`, al final, separado del resto y en tono de advertencia. También en `/mi-cuenta` cuando le toque (tarea 03.08) |
| **Advertencia** | Qué se cierra, qué se conserva y por qué, que **no se puede recuperar**, y que **sí** podrá registrarse otra vez con el mismo correo empezando de cero. Si es publicador: «tus N propiedades **siguen publicadas**; perderás el acceso a ellas y VIVE BIEN decidirá qué hacer» |
| **Confirmación** | Escribir **ELIMINAR**. El botón no se activa antes |
| **Reautenticación** | Popup de Google o contraseña, justo antes. Si falla, no se llama al servidor |
| **Procesando** | Pantalla honesta: «tu cuenta ya está cerrada; estamos terminando». **No** se dice que puede registrarse todavía |
| **Éxito** | Sólo con `completada`: cerrar sesión y página pública con «puedes registrarte otra vez con este correo cuando quieras» |
| **Error recuperable** | «Tu cuenta está cerrada y no se puede recuperar. Queda un paso técnico en curso; lo terminamos nosotros.» Con botón de reintentar. **Nunca** parece que se pueda deshacer |
| **Propiedades** | Siguen publicadas; se dice antes y después |
| **Rol de publicador** | Se pierde. Una cuenta nueva con el mismo correo es **cliente** |
| **Si vuelve** | Cuenta nueva, desde cero: sin favoritos, búsquedas, perfil, historial, rol ni propiedades |

## D.7 · Etapas

| # | Etapa | Qué entra | Se puede desplegar sola |
|---|---|---|---|
| **1** | **Cerrar los agujeros** (sin nada de baja todavía) | `resolverPerfil` deja de fallar abierto · `crearAutorizador` corta `eliminada` antes que `suspendido` · las 3 rutas sin barrera pasan por `autorizar` · guarda de lápida en el alta de `/api/usuarios/me` | **Sí, y es inofensiva**: hoy no hay ninguna cuenta `eliminada`, así que no cambia nada visible |
| **2** | **El motor de la baja**, sin interfaz | `lib/cuentas/baja.ts` con el procedimiento y sus estados · Firebase (A o B, según D-36) · pruebas con dobles inyectados | Sí (código muerto hasta la etapa 3) |
| **3** | **El endpoint** | `POST/GET /api/cuenta/eliminar` con todas las guardas de D.3 | Sí (sin interfaz que lo llame) |
| **4** | **La interfaz** | Sección en `/portal/configuracion`, reautenticación, confirmación, estados, textos DRAFT | Sí |
| **5** | **La cola de «requiere gestión»** | Pantalla del panel con las propiedades marcadas + bitácora | Sí |
| **6** | **Leer por las vistas** | Los 12 archivos que leen `leads`/`solicitudes_contacto` pasan a `*_operativas` + prueba de guarda | Sí |
| **7** | **Cierre** | Capturas medidas, axe, documentación, evidencia | — |

La **etapa 1 es la que quita el riesgo**, y no depende de ninguna decisión pendiente. Si quieres avanzar sólo una cosa, que sea ésa.

---

# E · ORDEN EXACTO DE EJECUCIÓN

1. **D-36** (Admin SDK o REST) y **D-37** (columnas en `usuarios`) — decides tú.
2. **Etapa 1** · commit propio, suite completa, despliegue, verificación en producción de que nada cambió.
3. **Etapa 2** · commit propio, pruebas con Firebase y Supabase simulados, incluidos los fallos.
4. **Etapa 3** · commit propio; se comprueba que responde con los flags apagados y que rechaza sin reautenticación reciente.
5. **Primera baja de verdad**: una **cuenta de prueba creada para eso**, nunca una real. Con evidencia antes y después.
6. **Etapa 4** · interfaz, con textos DRAFT y capturas medidas en los tres tamaños.
7. **Etapas 5 y 6** · cola de gestión y migración de lectores a las vistas.
8. **Etapa 7** · documentación, evidencia y cierre de V-1.1.87.

Aparte y en su propio commit, cuando lo autorices: **fijar `engines`** y **`npm audit fix`** (§A.2 y §A.3).

---

# F · MATRIZ DE FALLOS Y RECUPERACIÓN

| Fallo | Estado en que queda | ¿Puede entrar? | ¿Correo libre? | Qué se le dice | Recuperación |
|---|---|---|---|---|---|
| **Supabase falla en la transacción** | Sin fila o `solicitada` | **Sí, sigue activa** | No | «No se pudo, inténtalo otra vez» | Volver a pulsar. No hay estado a medias |
| **Supabase OK, Firebase falla** | `usuarios='eliminada'`, proceso `error` | **No** | Sí en la base, pero **no se promete** | «Tu cuenta está cerrada; queda un paso técnico» | Reintento automático o desde el panel; sólo avanza |
| **Firebase OK, Supabase falla después** | `firebase_eliminada`, proceso `error` | **No** | Sí | Igual | Reintento; los pasos que quedan son idempotentes |
| **Timeout de la función** | El último estado alcanzado | Depende del paso | Sí desde `bloqueada` | Igual | La siguiente llamada retoma donde quedó |
| **Reintento** | Avanza | — | — | — | `UPDATE … WHERE estado = <anterior>`: no repite |
| **Doble solicitud simultánea** | Una gana; la otra encuentra la fila | — | — | El mismo estado | PK por `uid` |
| **Cierra la pestaña a mitad** | El proceso **sigue en el servidor** | No, desde `bloqueada` | Sí | Al volver a entrar: «tu cuenta está cerrada» | El servidor lo termina |
| **Caída de Vercel** | El último estado | — | — | — | Al volver, la siguiente petición de esa cuenta lo empuja |
| **Caída temporal de Firebase** | `error` en el paso de identidad | No | Sí | Igual | Reintento con espera |
| **`USER_NOT_FOUND`** | Avanza a `firebase_eliminada` | No | Sí | Normal | **Es éxito**, no error |

**Ninguna combinación deja una cuenta ambigua.** Sólo hay dos situaciones posibles: activa (nada se aplicó) o cerrada (con trabajo pendiente o sin él). No existe «medio cerrada con acceso».

---

# G · TEST PLAN (preparado, sin ejecutar)

**Por rol:** cliente · publicador · admin · super admin (con otro activo) · **último super admin → rechazado**.
**Por proveedor:** cuenta con contraseña · cuenta de Google sin contraseña.
**Por contenido:** con propiedad publicada (sigue publicada + `requiere_gestion`, `estatus` intacto) · con citas (bloqueadas, la cita sigue) · con solicitudes (bloqueadas, el hecho se conserva) · con invitación pendiente del mismo correo (**la cuenta nueva es CLIENTE**).
**Por acceso:** token anterior aún válido → **403** en el endpoint, no un logout del navegador · sin reautenticación reciente (`auth_time` de 30 min) → **401**; con 1 min → pasa · el endpoint responde **con los flags del portal apagados**.
**Por resistencia:** doble solicitud · baja repetida · `USER_NOT_FOUND` · **Firebase falla** · **Supabase falla** · timeout · **reintento exitoso**.
**Re-registro:** antes de que Firebase confirme → **bloqueado** (con Google devuelve el UID de U1 → guarda de lápida) · después de `completada` → UID nuevo → fila nueva → **CLIENTE**, `U1 ≠ U2`, sin heredar nada.
**Guardas:** las 23 referencias tras la baja · la lápida sin PII · `resolverPerfil('eliminada')` ≠ `'activo'` · la PII bloqueada no se lee por las vistas ni por el panel · ningún archivo del servidor lee las columnas de contacto fuera del módulo autorizado · **la lista de módulos de `firebase-admin` no crece** (no entra `@grpc/grpc-js` ni `uuid`).

Todo contra PGlite con el esquema real y el procedimiento de verdad, con el autorizador real y dobles inyectados para Firebase. **La primera baja real será sobre una cuenta de prueba creada para eso.**

---

# H · DECISIONES QUE NECESITAN TU APROBACIÓN

| # | Decisión | Mi recomendación | Bloquea |
|---|---|---|---|
| **D-36** | `firebase-admin` (A) o REST directo (B) | **A**, con las dos condiciones del §C. Los números medidos desinflan el argumento del peso, y B nos hace dueños de firmar JWTs en una operación irreversible | Etapa 2 |
| **D-37** | ¿`usuarios.eliminada_en/por/motivo` además de `bajas_de_cuenta`? | **No**: un dato, un sitio. El panel cruza con un `join` | Etapa 2 (sería migración 26) |
| **D-38** | Límite de peticiones del endpoint | 5 intentos por `uid` cada 10 min, en memoria, sabiendo que es por instancia. Un limitador real, aparte | Etapa 3 |
| **D-39** | Fijar `engines: node >=22` | **Sí**, en su propio commit | No bloquea |
| **D-40** | `npm audit fix` (1 añadido, 4 eliminados, 18 cambiados; no arregla `uuid`/`gaxios`) | **Sí, pero aparte**, con su propia verificación de build. No mezclarlo con la baja | No bloquea |
| **P-3** | Citas futuras de un asesor que se da de baja | Sin propuesta: es de negocio | Etapa 2 (hay 0 citas hoy) |
| **P-4** | Plazos y excepciones de conservación | Abogado | Publicar los textos, no el código |

**Me detengo aquí.** No escribo código hasta que apruebes el plan.


---

# I · ETAPA 1 — ENDURECIMIENTO (implementada el 24-sep, **sin desplegar**)

Sólo cierra los bypasses. **No toca nada del borrado**: no hay endpoint de baja, no se llama a `deleteUser`, la migración 25 está intacta y no se ejecutó `npm audit fix`.

## I.1 · Qué cambió, archivo por archivo

| Archivo | Cambio |
|---|---|
| `src/lib/auth-server.ts` | `Estado` gana `eliminada` y `desconocido` · `ESTADOS_GUARDADOS` y **`ESTADOS_QUE_ENTRAN`** (lista blanca) · `estadoDeLaFila()` · `getPerfil` falla **cerrado** · `revisarEstado()` y su uso en `crearAutorizador` |
| `src/app/api/usuarios/me/route.ts` | GET y PATCH pasan por `exigir(req, 'cuenta.propia')`. Se va la copia a mano de la regla |
| `src/app/api/leads/route.ts` | Igual. Se conserva el reparto por rol (quien no es admin ve sólo lo suyo). Se quita un import muerto **que ya estaba muerto antes** (`frenar`, `origenDe`, `TOPES`: 0 usos en `HEAD`) |
| `src/app/api/medios/firma/route.ts` | Igual, y el autorizador va **antes** del tope de peticiones |
| `tests/que-busco.test.ts` · `tests/perfil-3b2.test.ts` · `tests/acceso-google.test.ts` | Sus simulaciones apuntaban a `verifyIdToken`, que estas rutas ya no llaman. Ahora arman el **autorizador real** con sus extremos inyectados, como `portal-aislamiento` |
| `tests/estado-de-cuenta.test.ts` | **Nuevo**: 33 pruebas |

**Rutas que NO se tocaron:** las 9 públicas siguen públicas (catálogo, salud, sitemap, webhooks de Telegram y WhatsApp, `registro-lead`, `acceso/registro`, `citas/accion`). `POST /api/eventos` sigue con `verifyIdToken`: es telemetría que acepta peticiones **sin sesión**, y meterla en la barrera cambiaría su comportamiento. **Queda anotado como riesgo residual menor**, no como olvido.

## I.2 · La regla nueva

```
                    +- sin fila en usuarios  -> activo      (si no, nadie podria registrarse)
estadoDeLaFila() ---+- valor conocido        -> ese valor
                    +- valor raro / no texto -> desconocido

ESTADOS_QUE_ENTRAN = ['activo', 'pendiente']     <- lista BLANCA

revisarEstado()  eliminada   -> 403 . bitacora SIEMPRE
                 suspendido  -> 403 . bitacora en escrituras (como antes)
                 desconocido -> 503 . NUNCA a la bitacora
```

**Dos decisiones que conviene que veas:**

1. **`getPerfil` ahora falla cerrado.** Si la tabla no responde, devuelve `desconocido` y el autorizador contesta **503**. Antes devolvía `activo`. Es un cambio de comportamiento **en la ruta de fallo**: si Supabase se cae, las APIs privadas dejan de responder en vez de dejar pasar. Lo considero correcto —sin la fuente de verdad no se puede autorizar, y esas APIs consultan Supabase de todos modos, así que fallarían igual—, pero es tuyo decidirlo: **D-41**.
2. **`desconocido` responde 503, no 403.** Un 403 diría «no puedes»; la verdad es «no pudimos comprobarlo». Y no se registra en la bitácora: si la base está caída, escribir en ella tampoco funciona.

## I.3 · Pruebas

**`tests/estado-de-cuenta.test.ts`, 33 pruebas nuevas**, con el autorizador de producción y sus dos extremos inyectados:

- **`resolverPerfil`**: sin fila → `activo` · los cuatro estados guardados se respetan · **`eliminada` NO se resuelve como `activo`** · cinco valores desconocidos (`borrada`, `ELIMINADA`, `activa`, vacío, `cancelada`) → `desconocido` · cinco tipos corruptos (número, `null`, booleano, objeto, array) y la ausencia de la clave → `desconocido` · el rol se decide igual que antes.
- **`revisarEstado`**: sólo entran `activo` y `pendiente` · los tres códigos y su política de bitácora · **ningún mensaje filtra correo ni `uid`**.
- **Las cuatro entradas** (`me` GET, `me` PATCH, `leads`, `firma`), cada una con: sin sesión → 401 · **eliminada → 403 + bitácora** · **suspendida → sigue 403** · **desconocido → 503 sin bitácora** · **activa → pasa la puerta**.
- **La firma de Cloudinary, aparte:** una cuenta eliminada no obtiene `signature` ni `apiKey`, y la respuesta no menciona Cloudinary.

**Resultados:** `841 pruebas en 54 archivos, todas en verde` · typecheck limpio · lint sin errores · `next build` compila.

Antes del cambio, la suite daba **12 fallos en 3 archivos**: las pruebas que simulaban `verifyIdToken` dejaron de interceptar nada al pasar las rutas por `exigir`. No era un fallo del código: era que las simulaciones apuntaban al sitio viejo. Lo digo porque el número de pruebas cambió y conviene saber por qué.

## I.4 · Lo que la etapa 1 **no** arregla
El ID token sigue siendo criptográficamente válido hasta caducar. Eso no se arregla aquí ni en Firebase: se arregla porque **el servidor comprueba el estado local en cada petición**, que es exactamente lo que ahora hace.

---

# J · LA BAJA COMO SAGA ENTRE DOS SISTEMAS

No hay transacción distribuida y **no se va a fingir una**. Hay una transacción local, un registro de avance, y pasos externos que se reintentan.

```
            +---------------- SUPABASE (transaccional) ----------------+
  PASO 1    |  BEGIN                                                   |
 (local)    |    usuarios -> lapida (estado, rol, email, PII)          |
            |    invitaciones pendientes -> revocada_por_baja          |
            |    propiedades -> gestion='requiere_gestion'             |
            |    citas / solicitudes -> bloqueado_en                   |
            |    supresiones y desasociaciones                         |
            |    bajas_de_cuenta -> 'bloqueada'                        |
            |  COMMIT   <- EL PUNTO DE NO RETORNO                      |
            +----------------------------------------------------------+
                                   |
                  desde este COMMIT, ningun token anterior entra
                                   |
            +------------- FIREBASE (fuera de la transaccion) ----------+
  PASO 2    |  revokeRefreshTokens(uid)   (higiene, ver abajo)          |
            |  deleteUser(uid)   .  USER_NOT_FOUND = EXITO              |
            +-----------------------------------------------------------+
                                   |
  PASO 3    bajas_de_cuenta -> 'firebase_eliminada' -> 'datos_procesados'
            -> 'completada'   (cada uno UPDATE ... WHERE estado = anterior)
```

**El objetivo crítico, cumplido por construcción:** el bloqueo está en el `COMMIT` del paso 1, **antes** de tocar Firebase. A partir de ahí, cualquier petición con un token anterior pasa por `autorizar` → `getPerfil` → `estado='eliminada'` → **403**. No depende de que Firebase responda, ni de que el token haya caducado, ni de que el navegador cierre sesión.

### Revocar los refresh tokens: ¿hace falta?
**No es el mecanismo, pero conviene hacerlo, y antes del borrado.** Tres razones:

1. **Borrar la identidad ya invalida los refresh tokens**: sin usuario no se acuñan ID tokens nuevos. En ese sentido, revocar es redundante.
2. **Pero el orden importa si el borrado falla.** Si `deleteUser` se cae y el proceso queda en `error`, una sesión abierta seguiría renovando su ID token cada hora indefinidamente. Con `revokeRefreshTokens` hecho **antes**, esa renovación deja de funcionar aunque el borrado nunca llegue. Cuesta una llamada y cierra la ventana.
3. **No sirve como cerrojo de acceso**, porque comprobar la revocación exigiría `verifyIdToken(token, true)` —una llamada de red a Google en cada petición—. Descartado: el estado local ya lo resuelve, y más rápido.

**Resumen:** `revokeRefreshTokens` sí, antes de `deleteUser`, como cinturón. El cerrojo sigue siendo el estado en Supabase.

### Idempotencia
Cada paso es `UPDATE ... WHERE uid = $1 AND estado = '<el anterior>'`: repetirlo no hace nada. Las supresiones son `DELETE ... WHERE uid = $1`; las desasociaciones escriben `null` sobre `null`. `USER_NOT_FOUND` es éxito. La clave primaria de `bajas_de_cuenta` es el `uid`: **no puede haber dos bajas de la misma cuenta**, y una segunda petición retoma en vez de empezar.

### ¿Hacen falta columnas nuevas?
**No**, y por eso no las añado. `bajas_de_cuenta` ya trae estado, `solicitada_por`, `auth_time`, `motivo`, las cinco marcas de tiempo, `intentos`, `ultimo_intento_en`, `ultimo_error` y `bloqueo_revisar_en`. Lo único que podría hacer falta, si al probar concurrencia apareciera una carrera real, es un `advisory lock` de Postgres — que **no es una columna** y sólo se añadiría con la carrera demostrada.


---

# K · ETAPA 1 — DESPLIEGUE Y VERIFICACIÓN (24-sep-2026)

**D-41 APROBADO:** Supabase disponible + estado válido → sigue la autorización · Supabase caído o error de consulta → **503** · un fallo de Supabase **nunca** se convierte en usuario activo · sólo afecta a la autorización privada, las rutas públicas no se tocan. Es exactamente lo implementado.

| | |
|---|---|
| **Commits** | `494b855` (etapa 1) · `e0a384c` (prueba de superficie de firebase-admin) |
| **Despliegue** | `dpl_53snGvsj4hw97Z5obFRheyZuF7ET` · READY · producción |
| **Pruebas** | **845 en 55 archivos, todas en verde** |
| **Typecheck** | limpio |
| **Lint** | **delta cero**: 63 errores en 23 archivos, todos preexistentes; los 7 archivos tocados aportan **0** |
| **Build** | compila |

## K.1 · Limpieza de archivos temporales (punto 1)

**Nada temporal llegó al repositorio ni a ningún commit** — comprobado con `find` sobre el árbol y con `git log --diff-filter=A` sobre los patrones. Los scripts de medición vivían en el directorio de trabajo de la sesión, fuera del repositorio.

| Archivo | Decisión | Por qué |
|---|---|---|
| `traza.cjs` | **A · eliminar** | Lee `route.js.nft.json`, que sólo existe tras un build. De un solo uso; su resultado está documentado en §A.3 |
| `anexo.py`, `mensaje.txt` | **A · eliminar** | Andamios de edición |
| `_medicion-temporal.cjs`, `_medicion-temporal-2.cjs` | **A · eliminados** ya en su momento | Se copiaron al proyecto para poder resolver módulos y se borraron en la misma orden |
| `superficie.cjs` | **B · conservar, convertido en prueba** | → `tests/firebase-admin-superficie.test.ts` |

**Por qué esa medición se queda.** Toda la decisión sobre `firebase-admin` se apoya en un hecho medido: sólo se cargan 33 módulos y ninguno de los 4 avisos entra. Eso deja de ser cierto **en silencio** en cuanto alguien escriba `import 'firebase-admin/firestore'`. La prueba comprueba las cuatro cosas —ningún paquete con aviso cargado, ningún opcional de Google Cloud, que la copia de `gaxios` no sea la del aviso, y que `src/` no importe otro submódulo— y **está verificada contra el caso malo**: al añadir `/firestore` a mano, `@grpc/grpc-js` entra al instante y la prueba lo caza.

## K.2 · Revisión del diagnóstico de Firebase (punto 2)

| Comprobación | Resultado |
|---|---|
| `console.*` o registro en el camino de Firebase | **ninguno** |
| `FIREBASE_SERVICE_ACCOUNT` mencionada fuera de `lib/firebase-admin.ts` | **no** |
| La ruta devuelve `project_id`, correo o clave | **no**: sólo `linea`, `ok`, `proyectoCoincide` (booleano) y `nodo` |
| Mensajes de la librería reenviados al cliente | **no**: catálogo fijo + código validado contra `/^[\w.\-/]{1,60}$/` |
| Secretos en el bundle del navegador | **ninguno** |

**Sobre `nodo: process.version`:** lo dejé porque responde en ejecución a la pregunta «¿el runtime cumple ≥22?» y está detrás de super admin. No es sensible, pero **no estaba en lo que pediste que devolviera**; si lo quieres fuera, es una línea.

### Búsqueda de secretos en el bundle — con un susto que conviene contar
El barrido marcó dos cosas, y las dos resultaron ser falsos positivos **después de comprobarlas**, no antes:

1. **`service_accounts` en un chunk de navegador** → es la URL **pública** del JWKS de Google (`googleapis.com/service_accounts/v1/jwk/...`), no una credencial. Cero `private_key_id`, cero `BEGIN PRIVATE KEY`.
2. **Dos chunks con un JWT de Supabase** → decodifiqué la carga de los dos: `role: anon`. Es la clave anónima, que va en el navegador **por diseño** y que con RLS deny-by-default no lee nada. **Ningún chunk menciona `SUPABASE_SERVICE_ROLE`.**

### Hallazgo nuevo, preexistente: `flags.ts` arrastra `auth-server` al navegador
Investigando el primer positivo apareció esto: **`src/lib/config/flags.ts` importa `supabaseAdmin` desde `../auth-server`** (línea 1). Como la pantalla de flags es un componente de cliente y importa ese módulo, el bundle del navegador acaba incluyendo `auth-server.ts`, **podado hasta dejar sólo el efecto de módulo** (la creación del `createRemoteJWKSet`).

- **No hay fuga**: el chunk no contiene `supabaseAdmin`, `verifyIdToken`, `crearAutorizador`, `createClient` ni la clave de servicio. Lo que salva es el *tree-shaking*, que es una red frágil para depender de ella.
- **Es anterior a mi cambio**: comprobado en `HEAD~1` — la pantalla ya importaba `flags`, y `flags.ts` ya importaba `auth-server`.
- **Propuesta (D-42, no hecha):** partir `flags.ts` en un módulo de constantes puras (`FLAGS`, `ETIQUETA_FLAG`, `normalizarFlags`) y otro que lea la base (`leerFlags`), para que el cliente importe sólo el primero. Y una prueba que impida que un módulo de cliente alcance `auth-server`.

## K.3 · Migración 25 y datos (punto 3)

`sha256` del archivo = `314ec16a3f33b636`, **idéntico al que se aplicó**. Ninguna migración nueva (la 25 sigue siendo la última). Estado de producción tras el despliegue: `usuarios eliminadas = 0` · `sin correo = 0` · `propiedades con gestión = 0` · `bajas registradas = 0` · `citas/solicitudes bloqueadas = 0`. **Ningún dato movido.**

> Nota de contexto: `usuarios` pasó de 4 a 5 durante la sesión. Es un alta real del sitio, ajena a estos cambios — pero es justo el camino que toqué, así que importa que el alta siga funcionando (lo cubre la prueba «sin fila → activo → pasa la puerta»).

## K.4 · Smoke tests en producción (punto 7)

Sin crear ni eliminar ninguna cuenta real.

| Grupo | Resultado |
|---|---|
| **Privadas sin sesión → 401** | `/api/usuarios/me` · `/api/leads` · `/api/medios/firma` · `/api/diagnostico/firebase` · `/api/admin/usuarios` → **401 (5/5)** |
| **Token inválido → 401, no 500** | `/api/usuarios/me` · `/api/leads` · `/api/medios/firma` → **401 (3/3)** |
| **Públicas siguen funcionando** | `/` · `/propiedades` · `/api/catalogo` · `/api/salud` · `/sitemap.xml` · `/privacidad` → **200 (6/6)** |
| **Portal cerrado por flag** | `/api/portal/resumen` · `/portal` → **404 (2/2)**, igual que antes |
| **Registros de ejecución** | 8×401, 5×200, 2×404. **Cero errores, avisos y fatales** en 30 minutos |
| **Bitácora** | `seguridad.denegado` por estado de cuenta: **0** — nadie ha sido bloqueado por la puerta nueva |
| **Flags** | Los diez en `false`. Estuvieron encendidos entre 04:50 y 05:16 por pruebas del dueño y se devolvieron a apagado, con motivo y autor en la bitácora |

**Lo que NO pude comprobar yo:** cuenta activa, admin y super admin en producción necesitan una sesión real, y el token es tuyo. Están cubiertos por las 33 pruebas con el autorizador real, y por los smoke tests que demuestran que la puerta no rechaza de más (0 denegados). **Confírmalo entrando al panel**: si entras y navegas con normalidad, el camino de cuenta activa está probado.

## K.5 · Riesgos residuales

| # | Riesgo | Estado |
|---|---|---|
| **RR-1** | `POST /api/eventos` sigue fuera de la barrera | Acepta telemetría sin sesión; meterla dentro cambiaría su comportamiento. Impacto bajo, **decisión pendiente** |
| **RR-2** | `flags.ts` arrastraba `auth-server` al bundle de cliente | **RESUELTO — D-42, desplegado el 24-sep (§L)** |
| **RR-3** | Fallo cerrado = menos disponibilidad si Supabase cae | **Aceptado (D-41)**. Esas APIs consultan Supabase igualmente |
| **RR-4** | La medición de módulos caduca si se importa otro submódulo | **Cubierto** por `tests/firebase-admin-superficie.test.ts` |
| **RR-5** | Cuenta activa / admin en producción, sin comprobar por mí | Pendiente de que entres al panel |
| **RR-6** | 63 errores de lint preexistentes en 23 archivos | Baseline, delta cero. Fuera de alcance |



---

# L · D-42 — LA FRONTERA ENTRE CLIENTE Y SERVIDOR (desplegada el 24-sep-2026)

**El problema no era una fuga, era la arquitectura.** `src/lib/config/flags.ts` importaba `supabaseAdmin` de `auth-server.ts`. Como la pantalla de Super Admin es un componente de cliente y necesita las etiquetas de los flags, el grafo de módulos del navegador acababa incluyendo `auth-server.ts`. No se filtraba nada porque el compilador lo podaba hasta dejar un efecto de módulo — pero **depender de la poda para que un secreto no viaje es apostar, no diseñar**.

| | |
|---|---|
| **Commit** | `d31e44e` |
| **Despliegue** | `dpl_5SmqHUF2gaKitsbVwh59qPq2eAoy` · READY · producción |
| **Pruebas** | **850 en 56 archivos, todas en verde** (antes 845 en 55) |
| **Typecheck** | limpio |
| **Lint** | **idéntico al baseline**: 63 errores y 38 avisos, los mismos de antes; 0 en lo tocado |
| **Build** | compila |

## L.1 · La separación

| Módulo | Qué lleva | Quién lo puede importar |
|---|---|---|
| `src/lib/config/flags.ts` | `FLAGS`, `Flag`, `Flags`, `FLAGS_APAGADOS`, `normalizarFlags`, `MINIMO_MOTIVO_FLAG`, `decidirCambioDeFlag`, `ETIQUETA_FLAG` | **Cualquiera**, cliente incluido. No importa nada del servidor |
| `src/lib/config/flags-servidor.ts` **(nuevo)** | `leerFlags`, `flagEncendido`, `olvidarFlags` y la memoria de 60 s | **Sólo servidor.** Lleva `import 'server-only'`: el build **falla** si un componente de cliente lo importa |

**El comportamiento de los flags no cambia en nada.** Mismos nombres, mismos valores, misma regla de fallo cerrado, misma memoria de 60 s. Sólo se movió de archivo quién habla con la base.

## L.2 · Archivos

**Nuevos:** `src/lib/config/flags-servidor.ts` · `tests/frontera-cliente-servidor.test.ts` · `tests/dobles/server-only.ts`
**Modificados:** `src/lib/config/flags.ts` (se queda puro) · seis módulos de servidor reapuntados (`api/admin/flags`, `api/citas`, `api/portal/resumen`, `api/portal/visitas`, `lib/portal/exigir-portal`, `app/portal/layout`) · cuatro pruebas que simulaban los flags (`citas-enlaces`, `portal-3b2`, `portal-aislamiento`, `portal-apertura`) · `vitest.config.mts`
**Sin tocar:** migración 25 · baja de cuenta · Firebase Auth · el autorizador · los permisos · los flags existentes · los valores de producción

## L.3 · La prueba que impide la recaída (punto 5)

`tests/frontera-cliente-servidor.test.ts` recorre el **grafo de imports** desde cada módulo con `'use client'` y falla si alcanza `auth-server`, `firebase-admin`, `flags-servidor` o **cualquier archivo marcado con `server-only`**, por muchos saltos que haya en medio. Salta los `import type`, que se borran al compilar.

**Verificada contra el caso malo:** al reintroducir a mano el import en `flags.ts`, la prueba falla y **imprime el camino exacto** (`src/lib/config/flags.ts → ../auth-server ← auth-server (supabaseAdmin, service role)`). Sin esa comprobación sería una prueba que siempre pasa.

> **Sobre `tests/dobles/server-only.ts`:** el paquete real lanza al importarse fuera del entorno de React Server, así que en vitest se resuelve a un módulo vacío. **No debilita la barrera**: la aplican `next build` y esta prueba. El doble sólo evita que las pruebas exploten al cargar un módulo de servidor, que es lo que tienen que hacer.

## L.4 · Verificación de bundles (punto 6)

| Marcador | Cliente (`.next/static`) | Servidor (`.next/server`) |
|---|---|---|
| `supabaseAdmin` | **0** | 105 |
| `SUPABASE_SERVICE_ROLE` | **0** | — |
| `FIREBASE_SERVICE_ACCOUNT` | **0** | — |
| `firebase-admin` | **0** | 4 |
| `@grpc` | **0** | — |
| `BEGIN PRIVATE KEY` | **0** | — |
| `verifyIdToken` · `crearAutorizador` | **0** | — |
| `createRemoteJWKSet` · `service_accounts/v1/jwk` | **0** *(antes de D-42: 1)* | — |

Único JWT en el navegador: **`role: anon`**, la clave pública, que va ahí por diseño.

**La prueba concreta de que D-42 arregló lo que decía arreglar:** la URL del JWKS pasó de aparecer en 1 chunk de cliente a **0**. `auth-server.ts` ya no está en el grafo del navegador — no podado, **ausente**.

## L.5 · Smoke test en producción (punto 12)

| Comprobación | Resultado |
|---|---|
| `/admin/configuracion` carga | **200** |
| `/api/admin/flags` sin sesión | **401** |
| Los chunks que sirve esa página | **ninguno** con código ni secretos del servidor (descargados y revisados uno a uno) |
| `/api/usuarios/me` · `/api/leads` · `/api/medios/firma` | **401**, como tras la etapa 1 |
| `/api/portal/resumen` · `/portal` | **404**, el portal sigue cerrado |
| `/` · `/propiedades` · `/api/catalogo` | **200** |
| Registros de ejecución | 5×200, 4×401, 2×404. **Cero errores** |
| **Valores de los flags** | Los diez en `false`, **0 cambios** en la última media hora |
| Estado de cuentas | 0 no activas · 0 bajas registradas |

## L.6 · Riesgos

| # | Riesgo | Estado |
|---|---|---|
| **RD-1** | El doble de `server-only` en vitest podría ocultar un error real | Compensado: la barrera la aplican el build **y** la prueba de frontera, que no usa el doble para decidir |
| **RD-2** | La prueba de frontera no sigue imports dinámicos (`await import(...)`) | Hoy ningún módulo de cliente usa esa forma para alcanzar el servidor. Si apareciera, habría que ampliarla |
| **RD-3** | `POST /api/eventos` sigue fuera de la barrera de autorización | Sin cambios desde la etapa 1 (RR-1). Sigue pendiente |
| **RD-4** | 63 errores de lint preexistentes | Baseline intacto, delta cero |
