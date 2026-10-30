# Migración 26 (`baja_de_cuenta`) — validación en Docker y PGlite

- **APLICADA en producción el 24-sep-2026 a las 15:28 UTC.** Antes: validada en dos motores y ensayada dentro de una transacción revertida (§4–6). La aplicación y sus verificaciones están en el **§10**.
- Decisión: **D-43** (función PostgreSQL atómica para el cierre local). Archivos: `supabase/26-baja-de-cuenta-funcion.sql` y su `REVERTIR`.

---

## 1 · Versión de PostgreSQL

| | Versión |
|---|---|
| **Producción** (Supabase) | `PostgreSQL 17.6 on aarch64-unknown-linux-gnu` |
| **Contenedor de pruebas** | `PostgreSQL 17.6 on x86_64-pc-linux-musl` (imagen `postgres:17.6-alpine`) |
| **PGlite** (segundo motor, en `vitest`) | PostgreSQL compilado a WebAssembly |

Misma versión mayor **y menor**. La única diferencia es la arquitectura (aarch64 frente a x86_64), que no afecta a nada de esto.

## 2 · Cómo reproducirlo

```bash
docker compose -f docker/docker-compose.yml up -d

# esquema → REVERTIR 25 → aplicar 25 → aplicar 26 → datos inventados
for f in docker/esquema.sql supabase/25-baja-de-cuenta.REVERTIR.sql \
         supabase/25-baja-de-cuenta.sql supabase/26-baja-de-cuenta-funcion.sql \
         docker/datos-sinteticos.sql; do
  docker exec -i vivebien-pruebas-pg psql -v ON_ERROR_STOP=1 -U postgres -d vivebien_pruebas -q < "$f"
done

docker exec -i vivebien-pruebas-pg psql -U postgres -d vivebien_pruebas < docker/pruebas.sql
docker compose -f docker/docker-compose.yml down -v
```

**Nada toca producción:** el contenedor escucha sólo en `127.0.0.1`, la contraseña es de usar y tirar, los datos están en `tmpfs` (se van al parar) y no se copió ninguna variable de entorno del proyecto.

## 3 · Archivos

| Archivo | Qué es |
|---|---|
| `docker/docker-compose.yml` | El contenedor, con la versión clavada |
| `docker/esquema.sql` | Las 17 tablas, copiadas del **catálogo** de producción (tipos, nulabilidad, valores por defecto, claves, CHECK, índices y las dos vistas). **Sin un solo dato real** |
| `docker/datos-sinteticos.sql` | 6 cuentas, 3 propiedades, 1 cita, 2 solicitudes, invitaciones, preferencias, agenda y bitácoras. Todo inventado: correos en el TLD reservado `.invalid`, teléfonos `477 000 000x`, nombres de ficción |
| `docker/pruebas.sql` | Las 29 comprobaciones |
| `tests/migracion-26-funcion.test.ts` | El segundo motor (PGlite), que corre en cada `vitest` sin Docker |

## 4 · Resultados — **29 de 29 en Docker, 8 de 8 en PGlite**

### Estado antes
`4 roles` (1 admin, 2 clientes, 1 publicador, 2 super admins, todos activos) · 2 propiedades con dueño · 0 con gestión · 2 invitaciones pendientes · 0 citas bloqueadas · 0 solicitudes bloqueadas · 3 favoritos · 2 búsquedas · 0 bajas.

### Las pruebas

| | Prueba | Resultado |
|---|---|---|
| **N** | `service_role` **sí** puede ejecutar la función | OK |
| **O** | `anon`, `authenticated` y `public` **no** pueden | OK |
| **N** | `SECURITY INVOKER` · `search_path=""` | OK |
| **D** | uid inexistente → `no_existe`, sin tocar nada | OK |
| **C1** | Super admin con otro activo → sí puede | OK |
| **C2** | **Último** super admin → `ultimo_super_admin`; sigue activo, con correo y sin baja | OK |
| **A** | Baja de cliente → `bloqueada`; lápida con estado, rol y PII retirada | OK |
| **I** | El correo queda **libre**, y una cuenta nueva lo toma; `U1 ≠ U2` | OK |
| **J** | Invitación pendiente de ese correo → `revocada_por_baja`; la de otra persona sigue `pendiente` | OK |
| **K** | Preferencias suprimidas (las de otra persona, intactas) · citas y solicitudes bloqueadas · **la vista devuelve nulo también en el texto libre** | OK |
| **L** | Hechos y consentimientos preservados (la cita sigue, con su `consentimiento_version`) | OK |
| **M** | `creada_por` y `eventos.uid` desasociados · `revisado_por` (que guarda un **correo**) limpiado · **bitácora conservada**, sólo se va `actor_email` | OK |
| **E** | Repetir la baja → `ya_eliminada`, sin duplicar | OK |
| **B/H** | Baja de publicador: las propiedades **siguen publicadas** (`disponible` + `publicada`) y pasan a `requiere_gestion`; la que no era suya, sin marcar. Agenda y credenciales de Google suprimidas | OK |
| **P-3** | La cita que atendía **como asesor** no se toca (decisión de negocio abierta) | OK |
| **F** | **Error a mitad → ROLLBACK TOTAL**: con un disparador que revienta al marcar propiedades, la función aborta y la cuenta queda **activa, con correo, con nombre y sin baja** | OK |
| **G1-G3** | Tres llamadas seguidas → una `bloqueada` y dos `ya_eliminada`, **una sola fila** | OK |

### Concurrencia — **cinco sesiones simultáneas**
```
1:bloqueada   2:ya_eliminada   3:ya_eliminada   4:ya_eliminada   5:ya_eliminada
filas de baja: 1 · cuenta: eliminada · correo liberado: sí
```
El `select … for update` del principio serializa las llamadas: **exactamente una** hace el trabajo.

### `REVERTIR` de la 26
La función desaparece (`0`), la migración 25 queda intacta (`email` nulable, `bajas_de_cuenta`, las dos vistas) y **las bajas ya hechas no se deshacen** — las 4 cuentas eliminadas siguen eliminadas, que es lo correcto: una baja es irreversible. Reaplicar la 26 dos veces seguidas no da error.

## 5 · Ensayo en producción, dentro de una transacción revertida

```json
{ "funcion_creada": 1, "security_invoker": true, "search_path": "search_path=\"\"",
  "puede_service_role": true, "puede_anon": false, "puede_authenticated": false,
  "uid_inexistente": "no_existe",
  "super_admins_activos": 1, "guarda_ultimo_super_admin": "ultimo_super_admin",
  "cuentas_eliminadas_tras_el_ensayo": 0, "bajas_registradas": 0 }
```

La función se creó contra el catálogo **real** sin un solo error de tipo o de columna, y la guarda del último super admin se probó **contra la cuenta real**: devolvió `ultimo_super_admin` sin tocar nada (hoy hay exactamente uno).

**Tras el `rollback`:** función `0` · usuarios `5` (5 activos, 0 eliminadas, 0 sin correo) · super admins `1` · propiedades con gestión `0` · invitaciones pendientes `2`, revocadas `0` · bajas `0`. **Sin rastro.**

## 6 · Diferencias entre Docker y PGlite

| | Docker (17.6) | PGlite | Impacto |
|---|---|---|---|
| `pgcrypto` | disponible | **no disponible** | Ninguno: `gen_random_uuid()` es del núcleo desde PostgreSQL 13. `esquema.sql` lo intenta y sigue si no está |
| plpgsql, `for update`, `get diagnostics`, `on conflict`, vistas con `security_invoker` | ✅ | ✅ | Ninguno: idéntico comportamiento |
| Roles y `has_function_privilege` | ✅ | ✅ | Ninguno |
| Concurrencia real (varias sesiones) | ✅ | ❌ (un solo proceso) | Por eso la prueba de concurrencia **sólo** existe en Docker |

**Ningún resultado difiere entre los dos motores** en lo que ambos pueden probar.

## 7 · Incompatibilidades y hallazgos

**Hallazgo que corrigió la migración: `citas.propuesta_por` NO es una referencia a una persona.** Su `CHECK` es `in ('cliente','asesor','admin')`: guarda un **rol**. Mi matriz lo tenía clasificado como «disociar», y la migración traía un `update … set propuesta_por = null where propuesta_por = p_uid` que nunca habría hecho nada. Lo cazó el esquema fiel del contenedor. **Quitado**, con la explicación en el SQL.

**Dos aserciones mías estaban mal, no la migración:**
1. Exigí que **sólo** `service_role` tuviera `EXECUTE`. El **dueño** (`postgres`) siempre conserva sus privilegios en PostgreSQL y no se le pueden quitar. Lo que importa —y se cumple— es que `anon`, `authenticated` y `public` tengan `false`.
2. Busqué `search_path=` cuando el valor real es `search_path=""`.

**Una trampa de PostgreSQL que conviene conocer:** poner las dos llamadas de la prueba de idempotencia en **una sola sentencia** la hacía fallar. Dentro de una sentencia, todas las subconsultas ven la **misma instantánea**, así que la segunda llamada no veía la baja de la primera. No es un fallo de la función; es cómo funciona el motor. Las pruebas van ahora en sentencias separadas, con el porqué escrito al lado.

## 8 · Riesgos

| # | Riesgo | Estado |
|---|---|---|
| **R-26-1** | El dueño (`postgres`) puede ejecutar la función | Inherente a PostgreSQL, no se puede evitar. `anon` y `authenticated` no pueden, que es lo que importa |
| **R-26-2** | La función confía en el `uid` que le pasan | Por diseño. **La API nunca acepta un uid del navegador**: lo saca de la sesión verificada. Se probará en la implementación |
| **R-26-3** | Lógica de negocio en SQL, más difícil de leer que en TypeScript | Aceptado: es el precio de la atomicidad real, y sigue el patrón que el proyecto ya usa para citas |
| **R-26-4** | `bloqueo_revisar_en` se queda nulo | La vía B (plazos de conservación) es **P-4**, del abogado. La columna está lista |
| **R-26-5** | El esquema del contenedor lo escribí yo desde el catálogo | Mitigado: el ensayo en producción creó la función contra el catálogo **real** sin errores |

## 9 · Qué falta para aplicarla

Tu aprobación. Después: respaldo → aplicar → verificación → evidencia. La 26 es **puramente aditiva** (sólo crea una función; no toca tablas, columnas ni datos), así que el riesgo de aplicarla es el más bajo de todas las migraciones de esta fase.


---

# 10 · APLICACIÓN EN PRODUCCIÓN (24-sep-2026)

| | |
|---|---|
| **Fecha y hora** | Prechecks `15:27:05 UTC` · verificación posterior `15:28:20 UTC` |
| **Commit aplicado** | `990e3c9` |
| **Archivo** | `supabase/26-baja-de-cuenta-funcion.sql` (282 líneas) |
| **sha256 del archivo** | `67cd42246f2df92431327fee43f86102a64eb3157a14cc091a4af76e3f0cad5e` |
| **¿Coincide con git?** | **Sí** — el blob de `HEAD` da el mismo sha256, y `git diff` estaba limpio |
| **Base** | PostgreSQL 17.6 (Supabase `uztssyrheqdhtoheecgf`) |

> **Nota sobre la ruta.** Indicaste `docs/fase-3/migraciones/26-baja-de-cuenta-funcion.sql`. Esa carpeta no existe en este repositorio: las migraciones viven en `supabase/`, junto a la 25 y todas las anteriores. Se aplicó la ruta real.

## 10.1 · Prechecks (antes de aplicar)

**Migración 25 aplicada — 10 de 10 marcadores:**
`usuarios.email` nulable `YES` · `usuarios_estado_check` admite `eliminada` · `usuarios_email_solo_falta_si_eliminada` presente · `bajas_de_cuenta` existe · `propiedades.gestion` existe · `citas.bloqueado_en` existe · `solicitudes_contacto.bloqueado_en` existe · las 2 vistas `*_operativas` existen · `invitaciones_estado_check` admite `revocada_por_baja` · `citas.creada_por` nulable `YES`.

**Otros:** la función **no existía** (`0`) · los 3 roles (`anon`, `authenticated`, `service_role`) presentes.
**`REVERTIR` 26: NO ejecutado.**

## 10.2 · Aplicación

Se aplicó dentro de `begin; … commit;`. **Sin errores.**

## 10.3 · Verificaciones posteriores — 15 de 15

| Comprobación | Resultado |
|---|---|
| `public.baja_de_cuenta` existe | **1** |
| Firma | `p_uid text, p_solicitada_por text, p_auth_time timestamptz, p_motivo text` |
| Llamable con un solo argumento | **Sí** — 4 argumentos, **3 con valor por defecto** |
| Devuelve | `jsonb` · lenguaje `plpgsql` |
| Propietario | `postgres` |
| `SECURITY INVOKER` | **true** (no es DEFINER) |
| `proconfig` | `search_path=""` |
| `EXECUTE` para `anon` | **false** |
| `EXECUTE` para `authenticated` | **false** |
| `EXECUTE` para `public` | **false** |
| `EXECUTE` para `service_role` | **true** |
| Concesiones | `postgres, service_role` — el dueño es inevitable en PostgreSQL |
| Comentario de la función | presente |
| Migración 25 intacta | `email` nulable, los cuatro estados, `bajas_de_cuenta`, `gestion`, las 2 vistas, y el índice de correo **sin tocar** (`indnullsnotdistinct = false`) |
| Datos modificados | **Ninguno** (§10.5) |

## 10.4 · La definición instalada frente al archivo — **diferencia conocida**

| | Bytes | sha256 |
|---|---|---|
| Cuerpo del **archivo** | 9 569 | `cbea2175…` |
| Cuerpo **instalado** | 4 600 | `ec5ff44d…` |
| **Archivo normalizado** (sin comentarios, espacios colapsados) | **3 720** | **`aac7c62784e1aac42f95184d3a7cf10a…`** |
| **Instalado normalizado** | **3 720** | **`aac7c62784e1aac42f95184d3a7cf10a3ac528f418a5237dcc2448791df89d4a`** |

**La lógica es idéntica**: misma longitud y mismo sha256 una vez quitados los comentarios. Lo que falta en la base son **los comentarios**, que no viajan por el canal con el que se aplicó (se transmiten sentencias, no ficheros).

**Decidí NO reaplicar** la versión comentada. Reproducir ~200 líneas con caracteres de caja y acentos exactos por ese canal es propenso a erratas, y sería tocar producción por algo cosmético cuando la lógica ya está verificada. **La versión canónica y comentada es el archivo del repositorio**, en el commit `990e3c9`. Si algún día se quiere que `prosrc` lleve los comentarios, hay que aplicar la migración con una herramienta que envíe el fichero (`psql -f` contra la cadena de conexión de producción), no por este canal.

## 10.5 · Conteos antes y después — **nada se movió**

| Tabla | Antes | Después |
|---|---|---|
| usuarios (activos / eliminadas / sin correo) | 5 (5 / 0 / 0) | **5 (5 / 0 / 0)** |
| super admins activos | 1 | **1** |
| propiedades (publicadas / con gestión) | 8 (7 / 0) | **8 (7 / 0)** |
| invitaciones (pendientes / revocadas) | 2 (2 / 0) | **2 (2 / 0)** |
| bajas_de_cuenta | 0 | **0** |
| citas · solicitudes_contacto | 0 · 0 | **0 · 0** |
| favoritos · búsquedas guardadas | 0 · 1 | **0 · 1** |
| audit_logs · eventos | 267 · 76 | **267 · 76** |

La migración es **puramente aditiva**: crea una función y nada más.

## 10.6 · Prueba funcional en producción, **no destructiva**

```json
{ "uid_inexistente": { "uid": "uid-inexistente-de-verificacion", "resultado": "no_existe" },
  "guarda_ultimo_super_admin": { "uid": "KjLY…", "resultado": "ultimo_super_admin", "estado_cuenta": "activo" } }
```

La guarda del último super admin se probó **contra la cuenta real** (hoy hay exactamente uno): devolvió `ultimo_super_admin` y la cuenta siguió **activa**. Tras las dos llamadas: 5 usuarios, 5 activos, 0 eliminadas, 0 sin correo, 0 bajas, 0 propiedades en gestión, 2 invitaciones pendientes. **Ninguna cuenta real fue cerrada.**

## 10.7 · Lo que NO se hizo

Sin endpoint de eliminación · sin `deleteUser` ni `revokeRefreshTokens` de Firebase · sin procesamiento real de PII · sin pruebas destructivas sobre usuarios reales · sin cerrar ninguna cuenta real · sin desplegar nada.

## 10.8 · Riesgos pendientes

| # | Riesgo | Estado |
|---|---|---|
| **R-26-1** | El dueño (`postgres`) puede ejecutar la función | Inherente a PostgreSQL. `anon` y `authenticated` están a `false`, que es lo que importa |
| **R-26-2** | La función confía en el `uid` que recibe | **Por diseño, y es la regla que la API debe cumplir**: el `uid` sale del token de Firebase verificado, **nunca** del cuerpo de la petición. Se probará al implementar el endpoint |
| **R-26-3** | `prosrc` sin comentarios (§10.4) | Documentado. La versión canónica es el archivo en `990e3c9` |
| **R-26-4** | La función existe pero nadie la llama | Correcto por ahora: el endpoint no está implementado |
| **R-26-5** | `bloqueo_revisar_en` se queda nulo | Vía B (plazos de conservación) = **P-4**, del abogado |
