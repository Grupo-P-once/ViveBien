# D-44 · Las operaciones de Firebase, por REST

**Fase 3b-3 · 25-sep-2026 · V-1.1.90**

---

## 1 · Qué pasó

La primera baja real —cuenta de QA, en producción— cerró la cuenta correctamente y **falló en Firebase**:

```
usuarios.estado      = eliminada     ✅ el cierre local funcionó
bajas_de_cuenta      = error
ultimo_error         = 'Error'       ← un código que no dice nada
auditoría            = { paso: 'revocar', codigo: 'Error' }
```

Falló en `revocarSesiones()`, el **primer** paso, así que `deleteUser` nunca llegó a llamarse y la
identidad de Firebase sigue viva.

## 2 · Causa raíz

`serverExternalPackages: ['firebase-admin']` saca el paquete del bundle. Turbopack lo carga con su
ayudante `externalImport`, que hace `await import(id)` y **envuelve cualquier fallo en un `Error`
pelado sin `code`**:

```js
// .next/server/chunks/[turbopack]_runtime.js
catch (err) { throw new Error(`Failed to load external module ${id}: ${err}`) }
```

Al otro lado, `firebase-admin/auth` resuelve la condición `import` a un envoltorio ESM que vuelve a
entrar en el CJS del propio SDK:

```
firebase-admin/auth → lib/esm/auth/index.js → import mod from "../../auth/index.js"  (CJS)
  └─ lib/utils/jwt.js:24   require("jwks-rsa")
       └─ jwks-rsa/src/utils.js:1   require('jose')      ← jose 6 es sólo ESM
```

**Nuestro `import()` dinámico nunca pudo arreglarlo:** el `require` problemático está tres niveles
más abajo, dentro del SDK. Lo dinámico sólo cambió *cuándo* se carga, no *cómo*. Por eso el smoke
test devolvió 401 en vez de 500 y pareció resuelto — el 401 se decide antes de tocar Firebase.

Y el `'Error'` de la bitácora se explica solo: `codigoSeguro()` guarda `code`, si no `name`, y
descarta el mensaje. El `name` de un `Error` pelado es `'Error'`.

**No es un problema de versiones.** Una sola copia de `jose@6.2.12`, pedida por `jwks-rsa@4.1.0`
(`^6.1.3`) y también por nosotros (`auth-server.ts` verifica tokens con ella). En Node puro todo
funciona: `require('jose')`, `require('firebase-admin/auth')` e `import()` — los tres. El fallo es
del empaquetado, no del árbol de dependencias.

## 3 · La decisión

**Opción B + D**, aprobadas el 25-sep:

- **B** — Las dos operaciones que necesita la baja se hacen con **Identity Toolkit REST**. Del SDK
  se queda **sólo `firebase-admin/app`**, para la credencial.
- **D** — `engines.node` pasa de `">=22"` a `"24.x"`, y CI de 22 a 24.

Descartadas: **A** (dejar de externalizar: arriesga meter los 4 advisories) y **C** (bajar `jose` a
v5: iría contra el rango declarado por `jwks-rsa`, un workaround frágil).

Lo que hizo a B la opción obvia: **la parte difícil ya estaba probada en producción**. La baja de QA
demostró que `cert()`, `initializeApp()` y `getAccessToken()` funcionan en el lambda — todo eso es
`firebase-admin/app`. Lo único nuevo son dos `fetch`.

| Antes | Ahora |
|---|---|
| `getAuth(app).revokeRefreshTokens(uid)` | `POST /v1/projects/{id}/accounts:update` · `{ localId, validSince }` |
| `getAuth(app).deleteUser(uid)` | `POST /v1/projects/{id}/accounts:delete` · `{ localId }` |

Autorización: `Bearer <token OAuth de la cuenta de servicio>`. Sin dependencias nuevas.

`USER_NOT_FOUND` conserva la semántica exacta: **éxito**, `yaNoExistia: true`.

### Lo que se midió

El lambda de la baja, antes y después:

| | Antes | Ahora |
|---|---|---|
| Archivos trazados | 515 | **320** |
| `firebase-admin` | 35 | 15 |
| `jwks-rsa` | 23 | **0** |
| `jose` | 47 | **0** |
| `jsonwebtoken` | 60 | **0** |
| Chunk `[externals]_firebase-admin_auth_*` | existía | **no existe** |

La ruta frágil no está «arreglada»: ha desaparecido del despliegue.

## 4 · Los errores ya no son mudos

`codigoDeIdentityToolkit()` acepta **sólo** el identificador en MAYÚSCULAS de Identity Toolkit
(`^[A-Z][A-Z0-9_]{1,59}$`). Cualquier otra cosa se descarta y se responde `credencial_rechazada`
(401), `permiso_denegado` (403) o `http_<código>`. Así, ningún texto arbitrario puede acabar en la
base ni en la bitácora.

El detalle completo va a **`console.error`** —registro privado de Vercel—, nunca la cabecera
`Authorization`, nunca el token. Es lo que faltaba: este incidente costó una sesión entera de
diagnóstico por no tener esa línea.

## 5 · La sonda

El diagnóstico de Firebase **nunca probó lo que se rompía**: validaba la credencial, que era justo
la parte que funcionaba, y decía «OK» durante semanas sobre un camino roto.

`GET /api/diagnostico/firebase?sonda=1` (Super Admin) ejecuta ahora **las dos operaciones reales**
contra un identificador inexistente y responde tres líneas:

```
token OAuth: OK
accounts:update: USER_NOT_FOUND
accounts:delete: USER_NOT_FOUND
```

Por qué es segura:

- El identificador lo genera el servidor con `randomBytes`: 28 caracteres alfanuméricos, el formato
  real de Firebase. **No se acepta por parámetro**, ni por query, ni por cuerpo, ni por cabecera.
- Se comprueba el formato y se rechaza el UID de la cuenta de QA antes de enviar nada.
- **Se prueba primero `accounts:update`**, que como mucho cerraría sesiones, y sólo si contesta
  `USER_NOT_FOUND` —o sea, sólo cuando está demostrado que ese identificador no existe— se prueba
  `accounts:delete`. El borrado nunca puede alcanzar a nadie.
- Un HTTP 200 sobre ese identificador se trata como **anomalía**: se para.
- Sale sólo el código de cada paso. Ni el identificador, ni el token, ni la credencial, ni el cuerpo
  de las respuestas.

## 6 · Cómo se comprueba

**993 pruebas en 63 archivos.** Las nuevas:

- `tests/firebase-rest.test.ts` (21) — cada rama del adaptador: éxito, `USER_NOT_FOUND` en las dos
  operaciones, 401, 403, 400, 503, respuesta que no es JSON, red caída, credencial ausente,
  `validSince` en segundos, y que un mensaje arbitrario (clave PEM, `Bearer …`, un correo) **nunca**
  se convierte en código.
- `tests/diagnostico-sonda.test.ts` (17) — formato del identificador, sin repeticiones, nunca el de
  QA, orden `update` → `delete`, parada si `update` no dice `USER_NOT_FOUND`, anomalía con HTTP 200,
  permisos de la ruta, y una prueba que **lee el código fuente** y exige que lo único que la ruta
  saca de la petición sea el interruptor `sonda`.
- `tests/firebase-admin-superficie.test.ts` (6, reescrita) — **`firebase-admin/auth` está prohibido**
  en todo `src`, en cualquier forma (`from`, `import()`, `require`), ignorando comentarios. Y cargar
  `/app` no arrastra `jwks-rsa`.

**Verificado contra el caso malo, tres veces:** reintroducir `firebase-admin/auth` deja 2 pruebas en
rojo; aceptar un `localId` de fuera y borrar antes de comprobar, 7.

## 7 · Lo que queda

- **R-6 y R-7 abiertos** hasta ejecutar la sonda una vez en producción. No se pudieron cerrar en
  local: `FIREBASE_SERVICE_ACCOUNT` está marcada como cifrada en Vercel y `vercel env pull` la
  devuelve **vacía** — la protección funcionando como debe.
- **La cuenta de QA sigue a medias**, a la espera de autorización: `usuarios.estado = eliminada`,
  `bajas_de_cuenta.estado = error`, `intentos = 1`, identidad de Firebase viva.
- `engines: "24.x"` no lo cumple el Node local (v25). `npm` sólo avisa (`EBADENGINE`); si molesta,
  la alternativa es `">=22.12 <26"`, que mantiene la garantía real (`require(esm)` disponible).
