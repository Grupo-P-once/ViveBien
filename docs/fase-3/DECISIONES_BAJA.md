# Baja de cuenta — decisiones técnicas cerradas y diseño final (24-sep-2026)

- **Migración 26 APLICADA y verificada el 24-sep** (D-43) — evidencia en `EVIDENCIA_MIGRACION_26.md` §10. **La función SQL es ahora la capa atómica local de la baja.**
- **Nada más implementado.** Sin `/api/cuenta/eliminar`, sin `deleteUser`, sin `revokeRefreshTokens`, sin tocar dependencias, sin `npm audit fix`.

> ### ⚠️ Reglas que manda la migración 26
> 1. **`public.baja_de_cuenta(...)` es la única capa atómica del cierre local.** Todo lo demás —Firebase, reintentos, estados posteriores— ocurre **después** del `COMMIT`, desde TypeScript.
> 2. **La API es la única capa autorizada para invocarla** desde la aplicación. `anon`, `authenticated` y `public` no tienen `EXECUTE`; sólo `service_role`, que es como entra el servidor tras validar la sesión.
> 3. **El `uid` NUNCA viene del navegador.** La API lo obtiene **exclusivamente** del token de Firebase verificado (`verifyIdToken` → `perfil.uid`). Aceptarlo del cuerpo de la petición convertiría la función en un borrador de cuentas ajenas.
- **Base ya en producción:** migración 25 · etapa 1 de endurecimiento (D-41) · D-42 · diagnóstico `Firebase Admin: OK`.
- Todo número de aquí está **medido**, y se dice cómo.

---

# A · D-36 — `firebase-admin` frente a REST · **decisión: quedarse con `firebase-admin`**

## A.1 · `firebase-admin@14.5.0`

**Lo que usamos, y nada más:** `firebase-admin/app` (crear la app con la credencial) y `firebase-admin/auth` (`deleteUser`, `revokeRefreshTokens`, `getUser`).

**Lo que NUNCA debe importarse:** `firebase-admin/firestore` · `firebase-admin/storage` · `firebase-admin/database` · `firebase-admin/messaging` · cualquier otro submódulo.

### Instalado frente a cargado — la distinción que decide

| Medida | Número | Cómo se midió |
|---|---|---|
| Paquetes en el proyecto | **1 084** | `package-lock.json` |
| De ellos, **opcionales** | 199 | `optional: true` en el lock |
| Añadidos por `firebase-admin` | **114** | diff del lockfile antes/después |
| `firebase-admin` declara como dependencias | **7** | `@fastify/busboy`, `@firebase/database-compat`, `@firebase/database-types`, `fast-deep-equal`, `google-auth-library`, `jsonwebtoken`, `jwks-rsa` |
| …y como **opcionales** | 2 | `@google-cloud/firestore`, `@google-cloud/storage` |
| **Cargados** con `/app` | **14** | `require.cache` en un proceso limpio |
| **Cargados** con `/app` + `/auth` | **33** | íd. |
| Desplegados en la función de la ruta | 32 paquetes / 320 archivos | traza de Next (`route.js.nft.json`) |

**114 instalados, 33 cargados.** Ésa es la diferencia que el número bruto esconde.

### Por qué los cuatro advisories no están en el camino

No es «no usamos esa función». Es el árbol, demostrado:

```
firebase-admin@14.5.0
  dependencies         -> NO incluye uuid   (Firebase la quitó en 13.10.0; confirmado en el lock)
  optionalDependencies -> @google-cloud/storage@8.2.0
                            gaxios@6.7.1  (optional)  ->  uuid@^9.0.1  (optional)
                          @google-cloud/firestore@9.2.0
                            -> @grpc/grpc-js
```

Hay **seis copias de `gaxios`**. La del advisory es la `6.7.1` de raíz, opcional, la única que depende de `uuid`. La que se carga es la **`7.3.1` anidada bajo `google-auth-library`**, que no depende de `uuid`.

Medición en un proceso limpio, sin credenciales ni red:
```
@grpc/grpc-js    no se carga        brace-expansion  no se carga
uuid             no se carga        gaxios 6.7.1     NO está en memoria
```

Y el `require("uuid")` de gaxios 6.7.1 está en `build/src/gaxios.js:63`, **en el nivel superior del módulo, no es perezoso**: si esa copia se cargara, `uuid` se cargaría con ella. No se carga porque nada la pide.

**`gaxios` no tiene advisory propio:** su único `via` es `uuid`. Así que de los cuatro, **ninguno tiene código alcanzable** en lo que desplegamos.

### El riesgo futuro, y qué lo contiene

Si alguien escribe `import 'firebase-admin/firestore'`, entra `@grpc/grpc-js` **al instante** — lo comprobé: pasa de `false` a `true` en la misma medición. Con `/storage` entrarían `gaxios@6.7.1` y `uuid`. Todo lo anterior dejaría de ser cierto **en silencio**.

**Lo contiene `tests/firebase-admin-superficie.test.ts`** (creada el 24-sep, en verde), que comprueba cuatro cosas: ningún paquete con advisory cargado · ningún opcional de Google Cloud cargado · la copia de `gaxios` cargada no es la del advisory · ningún archivo de `src/` importa otro submódulo. **Verificada contra el caso malo**: al añadir `/firestore` a mano, falla.

### Ventajas y desventajas para la baja

| A favor | En contra |
|---|---|
| `deleteUser`, `revokeRefreshTokens` y `getUser` resueltos y tipados | 114 paquetes en el árbol (33 cargados) |
| Errores con código (`auth/user-not-found`), que es lo que hace limpia la idempotencia | 4 advisories en el informe de `npm audit`, aunque no alcanzables |
| Reintentos, backoff y refresco del token de acceso, de la librería | Dependemos de que nadie importe otro submódulo (cubierto por la prueba) |
| **Ya validado en producción** (`Firebase Admin: OK`) | Actualizar la librería es mantenimiento recurrente |
| Node ≥22 exigido, Vercel da 24.x | |

## A.2 · Identity Toolkit REST

**Lo que necesitamos y cómo se haría:**

| Operación | REST |
|---|---|
| Borrar identidad | `POST https://identitytoolkit.googleapis.com/v1/projects/{p}/accounts:delete` con `localId` |
| Revocar sesiones | `POST .../accounts:update` con `validSince` |
| Consultar identidad (idempotencia) | `POST .../accounts:lookup` → lista vacía si no existe |
| Reautenticación | **No cambia**: la hace el navegador y el servidor la comprueba con el `auth_time` del token. Es idéntico en las dos opciones |

**Credenciales — corregido el 24-sep.** Hay que distinguir dos variantes, y mi redacción anterior las mezclaba:

- **`POST /v1/accounts:delete` con el `idToken` de la persona**: es la operación oficial para que alguien borre *su propia* cuenta. **No necesita cuenta de servicio, ni firmar JWTs, ni cachear tokens OAuth.** Basta el ID token que ya tenemos.
- **`POST /v1/projects/{p}/accounts:delete` con `localId`** (la administrativa, y `accounts:update` con `validSince` para revocar sesiones): **ésta sí** necesita un token OAuth de cuenta de servicio, y por tanto firmar el JWT y cachear el token.

Como la baja la inicia la persona con su sesión reautenticada, **la variante con `idToken` cubre el borrado sin ese trabajo**. Lo que seguiría necesitando credencial de servidor es revocar sesiones y consultar la identidad para la idempotencia — o habría que renunciar a ellas.

**Errores:** HTTP más un cuerpo JSON de Google. El mapeo a nuestro catálogo lo escribimos nosotros, incluido distinguir «no existe» de «no autorizado» de «cuota».

**Complejidad:** unas 60-80 líneas más sus pruebas: firma del JWT, caché del token con margen de expiración, reintentos con espera, y el mapeo de errores.

**Mantenimiento:** nuestro. Si Google cambia la API o rota algo, lo arreglamos nosotros; con la librería, llega en una actualización.

**Riesgos propios:** si se usa la variante administrativa, firmar mal el JWT o cachear mal el token son **fallos silenciosos** — funcionan hasta que caducan, y estarían en el camino de una operación irreversible. Con la variante de `idToken` ese riesgo desaparece para el borrado, pero queda para `revokeRefreshTokens` y `getUser`, que el diseño sí usa.

**Diferencias reales frente al SDK:** ninguna en capacidad. Las dos hacen lo que el diseño pide. La diferencia es **0 dependencias nuevas** frente a **escribir y mantener el transporte**: mapeo de errores y reintentos siempre, y además la autenticación de servidor a servidor **sólo para revocar sesiones y consultar la identidad** — no para el borrado, que va con el `idToken`.

## A.3 · Recomendación final

**Quedarse con `firebase-admin@14.5.0`**, con tres condiciones que ya están o entran con la implementación:

1. Importar **sólo** `/app` y `/auth`. ✅ ya vigilado por la prueba de superficie.
2. Nunca `verifyIdToken(token, true)` por petición: el cerrojo es el estado local. ✅ ya es así.
3. Revisar la superficie al actualizar la librería (la prueba lo hace sola).

**El razonamiento, sin el número bruto:** los 114 paquetes son de disco; al runtime llegan 33 y al despliegue 32. Los cuatro advisories cuelgan de dependencias **opcionales** que no se cargan, y el `gaxios` marcado ni siquiera es el que entra en memoria. A cambio, REST nos haría dueños del transporte —mapeo de errores, reintentos y, para revocar sesiones y consultar la identidad, la autenticación de servidor a servidor— **en el camino de un borrado irreversible**, donde un error nuestro es bastante más probable que un DoS en código que no se ejecuta. (El borrado en sí **no** necesitaría eso: `accounts:delete` acepta el `idToken` de la persona.)

**Cuándo cambiaría de opinión:** si la política de la casa fuera no añadir árboles grandes por tres llamadas, o si apareciera un advisory **en el camino cargado** (`google-auth-library`, `jsonwebtoken`, `jwks-rsa`, `jose`, `gaxios@7`). Ahí REST pasaría a ser la opción sensata, y el trabajo son ~1 día más de código y pruebas.

> **No se cambia ninguna dependencia con esta decisión.** `firebase-admin` ya está instalado desde el diagnóstico.

---

# B · D-38 — Límite de peticiones

## B.1 · Lo que ya existe

`src/lib/limites.ts`: `frenar(clave, tope)` devuelve un **429 con `Retry-After`** o `null`, y un catálogo `TOPES` con nueve entradas (`contacto`, `favoritos`, `eventos`, `edicion`, `busquedas`, `citas`, `medios`, `acceso`…). Identifica por `origenDe(req)` (primera IP de `x-forwarded-for`) o por la clave que se le pase.

**Sirve, con una limitación que el propio archivo ya documenta con honestidad:** es un contador **en memoria del proceso**. Se reinicia en cada despliegue, cada instancia lleva su cuenta —con tres instancias el tope real es el triple— y no sobrevive a un arranque en frío. Es bueno para un script torpe o una pestaña en bucle; **no** para un atacante decidido.

## B.2 · Propuesta para `/api/cuenta/eliminar`

```ts
// en TOPES
bajaCuenta: { maximo: 5, ventanaMs: 60 * 60 * 1000 },
```

| | |
|---|---|
| **Clave** | `baja:<uid>`, **no** la IP. La operación es sobre la propia cuenta y el `uid` sale del token |
| **Dónde** | **Después** de autorizar, nunca antes: si no, un desconocido podría gastarle el cupo a alguien |
| **Límite** | 5 por hora |
| **Por qué 5** | Darse de baja es un acto único. Los reintentos legítimos tras un fallo de Firebase caben de sobra, y un doble clic o un bucle del navegador se corta enseguida |
| **Varias solicitudes** | Las primeras encuentran la fila de `bajas_de_cuenta` y **retoman** sin repetir nada destructivo; a partir de la sexta en una hora, 429 con `Retry-After` |

## B.3 · ¿Hace falta algo más por ser irreversible?

**El límite no es la protección aquí, y conviene decirlo claro.** Lo que protege de verdad una operación irreversible es otra cosa:

1. **La reautenticación reciente** (`auth_time` ≤ 5 min, comprobada en el servidor): sin eso, no hay operación. Un token robado y viejo no sirve.
2. **La idempotencia**: la clave primaria de `bajas_de_cuenta` es el `uid`, así que repetir no duplica ni corrompe.
3. **La confirmación explícita** en la interfaz (escribir ELIMINAR).

El límite sólo evita ruido. **No propongo un limitador compartido (Redis/WAF) para esta fase**: sería la única ruta del proyecto con uno, y el problema que resolvería —un atacante que ya tiene un token válido y reautenticado de la víctima— tiene consecuencias peores que darla de baja. Si algún día se pone un contador compartido, que sea para todo el proyecto, no sólo aquí.

---

# C · D-39 — Node

| | Comprobado |
|---|---|
| Node en Vercel | **24.x** (configuración del proyecto) |
| `firebase-admin` | **14.5.0** |
| Requisito de la librería | `engines.node >= 22` → **se cumple** |
| En el repositorio | **no hay `engines` ni `.nvmrc`** |

**Riesgo:** la versión la elige Vercel. Si su valor por defecto bajara de 22, o alguien construyera con Node 20, `firebase-admin` fallaría **en ejecución y en producción**, no en el build.

**Cambio exacto propuesto** (en `package.json`, no aplicado):
```json
"engines": {
  "node": ">=22"
}
```
Vercel respeta `engines.node` al elegir el runtime, y `npm`/CI avisan si no se cumple. Un `.nvmrc` con `24` sería complementario, para quien desarrolle en local.

**Recomiendo aplicarlo en su propio commit**, antes de la implementación: es una línea y quita un riesgo que hoy no está cubierto por nada.

---

# D · DISEÑO FINAL DE LA BAJA

| # | Punto | Especificación |
|---|---|---|
| 1 | **Endpoint** | `POST /api/cuenta/eliminar` ejecuta; `GET /api/cuenta/eliminar` consulta el estado. **Fuera de `/api/portal/*`**: cerrar la cuenta no depende de que el portal esté encendido |
| 2 | **Autenticación** | Token de Firebase en `Authorization: Bearer`, verificado con JWKS. El `uid` sale **del token**, nunca del cuerpo |
| 3 | **Reautenticación reciente** | El navegador reautentica (`reauthenticateWithPopup` / `WithCredential`); el **servidor** exige `auth_time` ≤ **5 min**. Si no, 401. No se le cree al navegador |
| 4 | **Validación de estado** | `exigir(req, 'cuenta.propia')`. Si ya está `eliminada`, **no empieza otra**: retoma el proceso pendiente. Guarda del **último super admin activo** → 409 antes de tocar nada |
| 5 | **Transacción** | Una sola, en Postgres, con los puntos 6-11 y el paso a `bloqueada`. **El `COMMIT` es el punto de no retorno** |
| 6 | **Se preserva** | `usuarios.uid` (la lápida) · `propiedades` (fila, `estatus` y `owner_id`) · `citas` y `solicitudes_contacto` como filas · consentimiento con su versión y fecha · bitácora íntegra |
| 7 | **Se desasocia** | En `usuarios`: `nombre`, `telefono`, `whatsapp`, `foto_url`, `inmobiliaria`, `biografia`, `zonas` → `null`; preferencias → `null`/`0`/`false`; `rol` → `cliente`. Fuera: `propiedades.revisado_por` (guarda un **correo**), `citas.creada_por`, `citas.propuesta_por`, `eventos.uid`, `audit_logs.actor_email`. **Se suprimen**: `favoritos`, `busquedas_guardadas`, `google_oauth_estados`, `calendarios_google`, `disponibilidad_asesores`, `bloqueos_asesores`, `ajustes_citas`. Foto en Cloudinary: supresión fuera de la transacción |
| 8 | **Texto libre** | `citas.notas_cliente` y `solicitudes_contacto.mensaje` quedan **bloqueados** con el resto del contacto: las vistas `*_operativas` los devuelven nulos cuando `bloqueado_en` no es nulo. Suelen llevar nombre o teléfono dentro |
| 9 | **Propiedades** | `gestion = 'requiere_gestion'`. **No se despublica nada**: `estatus` y `owner_id` intactos (P-1 = A). Cola en el panel + bitácora `propiedad.requiere_gestion` |
| 10 | **Invitaciones** | Las `pendiente` de ese correo → `revocada_por_baja`, **dentro de la transacción**. Se bloquean, no se borran: son historial de quién invitó a quién |
| 11 | **Correo** | `email = NULL`, junto a `estado='eliminada'` y en la misma transacción. Es donde el `CHECK` lo permite, y evita que una baja atascada conserve la PII |
| 12 | **Estado del proceso** | `bajas_de_cuenta`: `solicitada → bloqueada → firebase_eliminada → datos_procesados → completada`, más `error` |
| 13 | **Firebase: revocar** | `revokeRefreshTokens(uid)` **antes** de borrar. Redundante si el borrado sale bien; imprescindible si falla, porque si no una sesión abierta seguiría renovando su token cada hora |
| 14 | **Firebase: borrar** | `deleteUser(uid)` **después** del `COMMIT`, nunca antes |
| 15 | **Cierre de sesión** | Lo hace el navegador al final y lleva a una página pública. **No es el cerrojo**: el cerrojo ya está en la base |
| 16 | **Idempotencia** | PK por `uid`; cada paso es `UPDATE … WHERE uid = $1 AND estado = '<el anterior>'`; supresiones con `DELETE … WHERE uid = $1`; desasociaciones escriben `null` sobre `null`; `USER_NOT_FOUND` = éxito |
| 17 | **Concurrencia** | La PK impide dos bajas de la misma cuenta. Dos peticiones simultáneas: una crea la fila, la otra la encuentra y retoma. Si al probarlo apareciera una carrera real, un `advisory lock` de Postgres — **no una columna** |
| 18 | **Reintentos** | Los empuja: la misma llamada repetida · la siguiente sesión de esa cuenta · una pantalla de administración con las bajas atascadas. `intentos`, `ultimo_intento_en`, `ultimo_error` |
| 19 | **Timeout** | Queda en el último estado alcanzado; la siguiente llamada retoma. Desde `bloqueada`, la persona ya no entra |
| 20 | **Supabase caído** | La transacción no se aplica: la cuenta **sigue activa** y el error es honesto. **No hay estado intermedio** |
| 21 | **Firebase caído** | `usuarios.estado='eliminada'` + `bajas_de_cuenta.estado='error'`. La cuenta **está cerrada**; se reintenta. **No se le dice que terminó ni que ya puede registrarse** |
| 22 | **Vercel caído** | Igual que el timeout: el proceso vive en la base, no en la petición |
| 23 | **`USER_NOT_FOUND`** | **Éxito**, no error: significa que el paso ya ocurrió. Avanza a `firebase_eliminada` |
| 24 | **Token antiguo** | Sigue siendo criptográficamente válido hasta 1 h. **No importa**: desde el `COMMIT`, `autorizar` lee `estado='eliminada'` y responde **403**. Ya funciona así desde la etapa 1 |
| 25 | **Re-registro** | `mismo correo → Firebase UID nuevo → fila nueva → CLIENTE`. Sólo cuando el proceso está `completada`; antes, la guarda de lápida impide revivir a U1. Nunca se busca cuenta anterior por correo |

## D.1 · El orden, que es la parte que no se negocia

```
reautenticación → validación en el servidor → TRANSACCIÓN LOCAL → COMMIT
                                                                    │
                                          ◄── punto de no retorno ──┘
                                                                    │
                                          revoke → delete (Firebase)
                                                                    │
                                          procesar datos → completada
```

**Nunca se depende de Firebase para bloquear el acceso.** El bloqueo es el `COMMIT`. Firebase es limpieza de identidad, y su fallo no reabre nada.

---

# E · MODELO DE ESTADO E IDEMPOTENCIA

**D-37 se mantiene:** no se duplican `eliminada_en`, `eliminada_por` ni `eliminada_motivo` en `usuarios`. El registro del proceso es `bajas_de_cuenta`.

## E.1 · Lo que la tabla ya tiene (migración 25, aplicada)

| Campo | Para qué |
|---|---|
| `uid` (**PK**, FK a `usuarios`) | Identidad **y** idempotencia: una baja por cuenta |
| `estado` (CHECK de 6 valores) | El paso del proceso |
| `solicitada_por` (`titular` \| `admin`) | Auditoría |
| `auth_time` | La reautenticación que lo autorizó |
| `motivo` | Opcional, lo escribe la persona |
| `solicitada_en`, `bloqueada_en`, `firebase_eliminada_en`, `procesada_en`, `completada_en` | Marca por paso |
| `intentos`, `ultimo_intento_en`, `ultimo_error` | Reintentos y diagnóstico |
| `bloqueo_revisar_en` | Vía B: cuándo revisar la supresión de lo bloqueado |

## E.2 · Columnas adicionales imprescindibles: **ninguna**

Revisé los seis criterios que pediste (estado, idempotencia, reintentos, errores, marcas de tiempo, auditoría) y **los seis están cubiertos**. No propongo migración 26 para esto.

Dos cosas que **podrían** hacer falta y que **no propongo todavía**, porque añadir columnas «por si acaso» es justo lo que no queremos:

- `siguiente_intento_en` (para espaciar reintentos automáticos). Sólo si se implementa un reintento automático en segundo plano; con reintento a demanda no hace falta.
- Un `advisory lock` si la prueba de concurrencia demostrara una carrera real. **No es una columna.**

---

# F · MATRIZ DE FALLOS Y RECUPERACIÓN

| Fallo | Estado que queda | ¿Entra? | ¿Correo libre? | Qué se le dice | Recuperación |
|---|---|---|---|---|---|
| Supabase falla en la transacción | sin fila o `solicitada` | **sí, activa** | no | «No se pudo, inténtalo otra vez» | Volver a pulsar. Sin estado a medias |
| Supabase OK, Firebase falla | `eliminada` + proceso `error` | **no** | sí, pero **no se promete** | «Tu cuenta está cerrada; queda un paso técnico» | Reintento; sólo avanza |
| Firebase OK, falla persistir el estado | `firebase_eliminada` o `error` | **no** | sí | Igual | Los pasos que quedan son idempotentes |
| Timeout de la función | el último alcanzado | desde `bloqueada`, no | sí | Igual | La siguiente llamada retoma |
| Reintento | avanza | — | — | — | `WHERE estado = <anterior>`: no repite |
| Doble solicitud simultánea | una gana; la otra retoma | — | — | el mismo estado | PK por `uid` |
| Cierra la pestaña a mitad | sigue en el servidor | no | sí | Al volver: «tu cuenta está cerrada» | El servidor lo termina |
| Caída de Vercel | el último alcanzado | — | — | — | La siguiente petición de esa cuenta lo empuja |
| `USER_NOT_FOUND` | avanza | no | sí | normal | **Es éxito** |
| Token antiguo aún válido | — | **no: 403** | — | «Esta cuenta fue eliminada» | — |

**Ninguna combinación deja una cuenta ambigua.** Sólo hay dos situaciones: activa (nada se aplicó) o cerrada (con trabajo pendiente o sin él). No existe «medio cerrada con acceso».

---

# G · TEST PLAN

**Por proveedor y rol:** cliente con contraseña · cliente con Google (sin contraseña) · publicador · admin · super admin con otro activo · **último super admin → 409**.

**Por contenido:** con propiedad publicada (**sigue publicada**, `estatus` y `owner_id` intactos, `gestion='requiere_gestion'`) · con leads (bloqueados; el hecho, el origen y el consentimiento se conservan; nombre, teléfono, correo y **mensaje** salen nulos por la vista) · con citas (íd. con `notas_cliente`) · con invitación pendiente del mismo correo (**la cuenta nueva es CLIENTE**).

**Por acceso:** token anterior aún válido → **403** en el endpoint · `auth_time` de 30 min → **401**; de 1 min → pasa · el endpoint responde **con los flags del portal apagados**.

**Por resistencia:** doble solicitud simultánea · baja repetida · `USER_NOT_FOUND` · **Firebase falla** · **Supabase falla** · timeout · **reintento exitoso**.

**Re-registro:** **antes** de que Firebase confirme → bloqueado (con Google devuelve el UID de U1 → guarda de lápida) · **después** de `completada` → UID nuevo → fila nueva → **CLIENTE**, `U1 ≠ U2`, sin heredar nada.

**Guardas:** las 23 referencias tras la baja · la lápida sin PII · la PII bloqueada no se lee por las vistas ni por el panel · ningún archivo del servidor lee las columnas de contacto fuera del módulo autorizado · la superficie de `firebase-admin` no crece · la frontera cliente/servidor sigue intacta.

Todo contra PGlite con el esquema real y el procedimiento de verdad, con el autorizador real y un doble de Firebase inyectado. **La primera baja real será sobre una cuenta de prueba creada para eso.**

---

# H · ARCHIVOS QUE SE MODIFICARÁN DESPUÉS

**Nuevos:** `src/lib/cuentas/baja.ts` (el procedimiento y sus estados) · `src/app/api/cuenta/eliminar/route.ts` · `src/components/portal/EliminarCuenta.tsx` · pantalla de la cola de «requiere gestión» en el panel · `tests/baja-de-cuenta.test.ts`.

**Modificados:** `src/lib/firebase-admin.ts` (añadir `deleteUser`, `revokeRefreshTokens`, `getUser`) · `src/app/api/usuarios/me/route.ts` (guarda de lápida explícita en el alta) · `src/lib/limites.ts` (entrada `bajaCuenta`) · `src/components/portal/ConfiguracionPortal.tsx` y su prueba (hoy **exige** que no mencione «eliminar cuenta») · `src/lib/portal/rutas.ts` si la baja gana pantalla propia · los **12 archivos** que leen `leads`/`solicitudes_contacto`, para pasar a las vistas `*_operativas` · `package.json` (`engines`, D-39).

**Documentación:** `DISENO_BAJA_DE_CUENTA.md` · `AUDIT_PLAN_BAJA.md` · `DECISIONS.md` (D-35…D-42) · aviso de privacidad **en DRAFT**.

---

# I · MIGRACIONES FUTURAS

| # | Para qué | ¿Hace falta? |
|---|---|---|
| **26** | Columnas extra en `bajas_de_cuenta` | **No** — ninguna es imprescindible (§E.2) |
| **26** *(alternativa)* | `propiedades.revisado_por` de correo a `uid` | Deseable, **no bloquea**. Hoy se resuelve desasociando |
| **26** *(alternativa)* | Invitaciones con token de un solo uso en vez de por correo | Deseable, **no bloquea**: la revocación ya cierra el agujero |
| **27** | Centro de Ayuda (`unaccent`, `pg_trgm`, tablas `knowledge_*`) | Fuera de esta fase (D-34) |

**Ninguna migración es necesaria para implementar la baja.** La 25 ya dejó el terreno.

---

# J · RIESGOS

| # | Riesgo | Estado |
|---|---|---|
| **RJ-1** | `POST /api/eventos` fuera de la barrera de autorización | **Documentado, no bloquea esta fase.** Es telemetría que acepta peticiones sin sesión; meterla dentro cambiaría su comportamiento |
| **RJ-2** | El limitador es **por instancia**: con tres instancias el tope real es el triple, y se reinicia con cada despliegue | Aceptado. Lo que protege la baja es la reautenticación reciente, no el tope |
| **RJ-3** | Que alguien importe `firebase-admin/firestore` o `/storage` y entren los cuatro advisories | **Cubierto** por `tests/firebase-admin-superficie.test.ts` |
| **RJ-4** | 63 errores de lint preexistentes en 23 archivos | Baseline, delta cero. Fuera de alcance |
| **RJ-5** | La prueba de frontera no sigue imports dinámicos (`await import(...)`) | Hoy nadie los usa para cruzar la frontera; ampliarla si aparecen |
| **RJ-6** | `getPerfil` falla cerrado: si Supabase cae, las APIs privadas dan 503 | **Aceptado (D-41)** |
| **RJ-7** | Sin `engines`, un cambio del Node por defecto de Vercel rompería `firebase-admin` en producción | **D-39 propuesto**, sin aplicar |
| **RJ-8** | La bitácora podría convertirse en la fuga si guardara la PII que se retira | Las entradas `cuenta.baja_*` llevan `uid`, rol, paso y hora. **Nunca** el perfil |

---

# K · DECISIONES QUE NECESITAN TU APROBACIÓN

| # | Decisión | Mi recomendación | Bloquea |
|---|---|---|---|
| **D-36** | `firebase-admin` frente a REST | **`firebase-admin`**, con las tres condiciones de §A.3. Evidencia: 114 instalados / **33 cargados**, y ningún advisory en el camino | La implementación |
| **D-38** | Tope del endpoint | `bajaCuenta: 5 por hora`, clave `baja:<uid>`, **después** de autorizar. Sin limitador compartido en esta fase | La implementación |
| **D-39** | `engines: { "node": ">=22" }` | **Sí**, en su propio commit y antes de implementar | No, pero quita un riesgo real |
| **P-3** | Citas futuras de un asesor que se da de baja | Sin propuesta: es de negocio. Hoy hay **0 citas** | La fila `citas.asesor_uid` de la matriz |
| **P-4** | Plazos y excepciones de conservación | Abogado | Publicar los textos, **no** el código |

**Me detengo aquí.** No escribo código de la baja hasta que apruebes.
