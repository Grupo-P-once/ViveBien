# Reintento administrativo de una baja atascada

**Fase 3b-3 · D-35 / D-43 · 24-sep-2026 · V-1.1.88**

---

## 1 · El problema que lo hace necesario

Lo encontró el smoke test posterior al despliegue de la pantalla, no una prueba de laboratorio.

La baja tiene un punto de no retorno: el `COMMIT` del cierre local. A partir de ahí la cuenta está
cerrada (`usuarios.estado = 'eliminada'`, correo liberado) aunque Firebase falle. Cuando falla, el
proceso se queda en `bajas_de_cuenta.estado = 'error'` y **queda trabajo pendiente**: la identidad
sigue viva en Firebase.

Hasta hoy ese trabajo no tenía forma de terminarse:

- `POST /api/cuenta/eliminar` empieza por `exigir(req, 'cuenta.propia')`, y `exigir` corta con
  **403 `cuenta.eliminada`** a cualquier sesión cuya cuenta esté eliminada. La persona no puede
  empujar su propio proceso.
- `GET /api/cuenta/eliminar/estado` pasa por la misma puerta.
- El resultado `ya_eliminada` de la función SQL, que el endpoint sabe tratar, **es inalcanzable en
  producción**: nunca se llega a la RPC.

Consecuencia real, no hipotética: esa persona **no podría volver a registrarse con su correo**,
porque Google le devolvería el UID anterior, que sigue existiendo. Rompe la promesa central de D-35.

## 2 · La forma elegida

Una operación de administración separada, que **sólo termina la parte de Firebase**.

```
POST /api/admin/bajas/[uid]/reintentar     ← termina la limpieza pendiente
GET  /api/admin/bajas                      ← qué bajas quedaron a medias
```

Lo que la define es lo que **no** puede hacer, y está construido para que no pueda:

| No puede | Cómo se impide |
|---|---|
| Volver a ejecutar la baja SQL | La ruta no llama a `rpc('baja_de_cuenta')` en ningún camino |
| Reactivar la cuenta | La ruta **nunca escribe en `usuarios`**. `estado` sigue `'eliminada'` pase lo que pase |
| Cambiar de UID o elegir a quién borrar | Exige una fila en `bajas_de_cuenta`, en estado pendiente, y que la cuenta conste `eliminada` |
| Reabrir el proceso | De `error` sólo se avanza; nunca vuelve a `solicitada` ni a `bloqueada` |
| Enseñar la PII que la baja retiró | La lista devuelve metadatos de operación; el correo, el nombre, el teléfono y el motivo no se leen de ningún sitio |

## 3 · Estados

`bajas_de_cuenta.estado` (el proceso) y `usuarios.estado` (la cuenta) siguen separados, como quedó
en D-35. El reintento sólo mueve el primero.

**Reintentables** — `error` · `bloqueada` · `firebase_eliminada` · `datos_procesados`
**No reintentables** — `solicitada` · `completada`

`solicitada` se rechaza a propósito: significa que el cierre local **no llegó a confirmarse**, así
que no consta que la cuenta esté cerrada. Borrar la identidad de alguien que quizá sigue activo
sería el peor error posible de todo el sistema.

```
error ─────┐
bloqueada ─┼─→ revocar → borrar ─┬─ ok / user-not-found → firebase_eliminada → completada
           │                     └─ falla → error (intentos+1, código corto)
firebase_eliminada ─┐
datos_procesados ───┴────────────────────────────────────→ completada

usuarios.estado = 'eliminada'  ← constante en TODAS las ramas
```

`auth/user-not-found` es **éxito**: significa que el paso ya había ocurrido.

## 4 · Exclusividad sin migración

Dos administradores pulsando a la vez no pueden borrar dos veces ni pisarse el contador. La
exclusión se consigue con un **arriendo de 2 minutos** sobre `ultimo_intento_en`, en un único
`UPDATE` condicional:

```sql
update bajas_de_cuenta
   set ultimo_intento_en = now(), intentos = <intentos+1>
 where uid = $1
   and estado in ('error','bloqueada','firebase_eliminada','datos_procesados')
   and (ultimo_intento_en is null or ultimo_intento_en < now() - interval '2 minutes')
```

PostgreSQL **reevalúa la condición** después de un `UPDATE` concurrente sobre la misma fila, así
que de dos reintentos simultáneos sólo uno ve filas afectadas; el otro recibe 409 `en_curso`. El
arriendo por tiempo recupera además un reintento que muriera a mitad, sin necesidad de una columna
nueva, un worker, un cron ni Redis.

### 4.1 · Cuando Firebase tarda más que el arriendo

El arriendo dura dos minutos: un Firebase más lento **permite legítimamente que entre un segundo
intento** mientras el primero sigue en vuelo. Los dos llaman a `deleteUser`, y eso está bien —
`deleteUser` es idempotente y el que llega tarde recibe `auth/user-not-found`, que aquí es éxito.

Lo que **no** estaba bien era la escritura de vuelta. Sin guarda, el intento que volvía tarde y
fallaba escribía `error` **encima de una baja ya `completada`**: a una persona que ya podía
registrarse de nuevo se le habría dicho que no. Por eso el proceso ahora sólo avanza, con una tabla
de estados anteriores (`ANTERIORES`, en `src/lib/cuentas/baja.ts`) aplicada como
`in('estado', ANTERIORES[destino])` en cada escritura, en **las dos rutas**:

| Se escribe | Sólo si el proceso está en |
|---|---|
| `bloqueada` | `solicitada` |
| `error` | `bloqueada`, `error` |
| `firebase_eliminada` | `bloqueada`, `error` |
| `datos_procesados` | `firebase_eliminada` |
| `completada` | `bloqueada`, `error`, `firebase_eliminada`, `datos_procesados` |

Es el mismo patrón que ya usaba la parte SQL. Cuando la escritura no se aplica, `marcar` **lee la
fila y devuelve el estado real**, así que la respuesta dice lo que hay de verdad y no lo que ese
intento quiso escribir. Quitar el `in(...)` hace fallar las dos pruebas de R-3.

**No hace falta ninguna migración.** Se usan columnas que la migración 25 ya creó.

## 5 · Permisos y bitácora

Permiso del catálogo existente: **`usuarios.gestionar`** (`admin` y `super_admin`). No hay sistema
de roles paralelo.

La bitácora guarda **el correo del administrador**: es su operación, y no tiene relación con la PII
que la baja retiró de la persona eliminada. Acciones: `cuenta.baja_reintento`,
`cuenta.baja_reintento_completado`, `cuenta.baja_reintento_fallido`,
`cuenta.baja_reintento_rechazado`. En `despues` sólo van el paso, el código y el número de intento.

## 6 · Respuestas

| Situación | HTTP | `codigo` |
|---|---|---|
| Terminó | 200 | `{estado:'completada', terminada:true, requiereReintento:false}` |
| Volvió a fallar | 200 | `{estado:'error', terminada:false, requiereReintento:true}` |
| No hay baja para ese uid | 404 | `sin_registro` |
| Ya estaba terminada | 409 | `ya_completada` |
| Estado sin paso pendiente (`solicitada`) | 409 | `sin_paso_pendiente` |
| La cuenta **no** consta eliminada | 409 | `cuenta_no_eliminada` |
| Otro reintento en curso | 409 | `en_curso` |
| Sin sesión / sin permiso | 401 / 403 | (autorizador) |

## 7 · Cómo se comprueba

`tests/baja-reintento-admin.test.ts` — **31 pruebas** sobre las rutas reales con el autorizador
real; sólo se simulan el token, la base y las dos llamadas a Firebase Admin. Ninguna cuenta se
borra: `deleteUser` no sale del proceso de pruebas.

Las guardas se verificaron **contra el caso malo**, dos veces:

- se parcheó la ruta para que escribiera en `usuarios` y volviera a llamar a la función SQL →
  **4 pruebas en rojo**;
- se le quitó el `in('estado', ANTERIORES[...])` → **las 2 pruebas de R-3 en rojo**.

Restaurada la ruta, 31 en verde. Una prueba que no se ha visto fallar no prueba nada.

## 8 · Lo que queda fuera

- No hay pantalla de administración: por ahora la operación se ejecuta contra la API.
- No hay worker, cron, Redis ni infraestructura nueva.
- `tests/cuenta-eliminar.test.ts` conserva la defensa ante el estado incoherente
  (`perfil activo` + RPC `ya_eliminada`), pero **dicha por su nombre**: es una prueba de
  fail-safe, no un flujo de producción, y así lo dice su encabezado. El camino real para empujar
  una baja atascada es la operación administrativa.
