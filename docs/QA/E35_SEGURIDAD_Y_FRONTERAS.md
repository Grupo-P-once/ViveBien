# E-35 — Seguridad y fronteras (7-oct-2026) · PROMOVIDO Y CERRADO

Base: producción = E-34 `dpl_DsEZS1fK4kZnZvmo6FrtiZ29uEi4`. Rollback: `dpl_F1tkBFb56q6cuxieQpriz8MazLHt` (E-33) y, para E-35, la propia E-34.
Candidato Vercel (sin dominios, STAGED) — versión 1, **sustituida por el candidato FINAL de abajo**: `dpl_CkuYRXsKNsZfNUedWgT5yfRtHPaB` · `vive-bien-ql6zqa67g-grupo-p-once.vercel.app`.

## E-35.2 — Contador QA-021 corregido: `propiedades.vistas` 27 → 2 (8-oct-2026 ~01:49 UTC, autorización explícita del usuario)
**Alcance:** UPDATE de **una columna de una fila**: `public.propiedades.vistas` de VB-2026-00026 (`5243dab0-e301-4ce1-a5de-f5f57037e613`). Cierra el asunto abierto del cleanup de los 25 eventos.
| | antes (01:49:18Z) | después (01:49:41Z) |
|---|---|---|
| `vistas` de VB-2026-00026 | **27** | **2** |
| `property_view` de VB-26 | 2 (ids 179, 180) | 2 (ids 179, 180) |
| ids 188–212 en `eventos` | 0 | 0 |
| propiedades / eventos / audit_logs | 9 / 97 / 382 | 9 / 97 / 382 |
| usuarios / fotos / leads / citas / invitaciones | 11 / 118 / 1 / 0 / 2 | 11 / 118 / 1 / 0 / 2 |
| huella de flags | `e2329488…` | igual |
| huella `id:vistas` de las otras 8 propiedades | `648001c2…` | igual |
| huella de ids de `eventos` | `421160af…` | igual |
| último `audit_logs` | 2026-10-06 23:53 UTC | igual |
**PRECHECK PASS** (1 fila, `vistas`=27, exactamente 2 `property_view` con ids 179 y 180, ids 188–212 ausentes). **UPDATE PASS**: una sola sentencia atómica (`QA-021-contador-ejecutado.sql`, el script exacto) con precheck y postcheck dentro, condición `id + vistas = 27`, `row_count = 1`; sin excepción. **POSTCHECK PASS** independiente (tabla de arriba). Cambios totales: **1 fila, 1 columna**; eventos modificados 0 · `audit_logs` modificados 0 (no se insertó fila de auditoría: la autorización era solo esta columna) · otras propiedades 0 · otros datos 0 · migraciones 0 · despliegues 0.
**Rollback (preparado, NO ejecutado):** `QA-021-contador-rollback.sql` = `update … set vistas = 27 where id = '5243dab0-…' and vistas = 2` (si el contador ya se movió —p. ej. una visita real—, no hace nada). Independiente del rollback de eventos (`QA-021-rollback-solo-eventos.sql`).
**Pruebas:** 6 casos nuevos en `tests/qa021-sql.test.ts` (PGlite; 19/19 en el archivo): 27→2 con exactamente 1 fila cambiada; no actualiza si `vistas ≠ 27`; no toca otras propiedades; no modifica `eventos` ni `audit_logs`; aborta si los eventos de la propiedad no son exactamente 179 y 180; el rollback devuelve 2→27 y no pisa un contador que ya se movió.
**Codex L1: BLOCKED por disponibilidad** — al lanzarlo, Codex responde «usage limit … try again at Nov 6th, 2026». **No se sustituyó con una auto-revisión.** Mitigación: la operación es mínima (una fila, una columna), atómica con pre/postcheck internos, y la evidencia independiente pre/post (arriba) sostiene el alcance. La revisión L1 queda pendiente para cuando Codex vuelva (se le entregan `QA-021-contador-ejecutado.sql`, `QA-021-contador-rollback.sql`, `qa021-sql.test.ts` y esta tabla).
**QA-021: CLEANED + contador sincronizado** (eventos 2 = `vistas` 2).

## QA-021 — PREPARED → EXECUTED → **CLEANED** (8-oct-2026, autorizado explícitamente por el usuario)
**Motivo:** las pruebas de navegador de la campaña D-62 contra producción generaron 25 eventos `property_view` falsos en VB-2026-00026 (observaciones 0008 y barrera `guardia-produccion.cjs`). Solo se eliminan esas 25 filas.
| | |
|---|---|
| Propiedad | VB-2026-00026 · `5243dab0-e301-4ce1-a5de-f5f57037e613` |
| Filas | `eventos` ids **188–212** (25, consecutivos), `nombre='property_view'`, `uid` y `datos` nulos, 25 sesiones distintas |
| Rango temporal | 2026-10-07 04:49:58.875103 → 07:28:20.054780 UTC |
| Ejecución | 2026-10-08 ~01:28 UTC, **una sola sentencia atómica** (`QA-021-borrado-ejecutado.sql`, el script exacto) con precheck y postcheck DENTRO (excepción = reversión total) |

**PRECHECK (solo lectura, 01:27:19Z) — PASS:** candidatos 25 · min 188 · max 212 · 25 sesiones distintas · ids 188–212 en la tabla 25 (0 que no cumplan las condiciones) · coincidencias accidentales fuera del rango 0 · `property_view` de VB-26 = 27 (los otros 2: ids 179, 180, anteriores y legítimos) · eventos 122 · property_view totales 74. **Huella md5 de «id|sesion|creado_en» en producción = la de `QA-021-filas.csv`** (`c598d968665adfa4450770a43a300682`): las filas de producción son byte a byte las documentadas.
**DELETE — PASS:** condiciones combinadas (rango de ids + `nombre` + `propiedad_id` exacto + `uid is null` + `datos is null` + ventana temporal) tras comprobar count=25, min=188, max=212, huella y totales 122/74; **25 eliminadas**; postcheck interno (borradas=25, restantes=0, VB-26=2, eventos=97, property_view=49) sin excepción.
**POSTCHECK independiente (01:33:23Z) — PASS:** ids 188–212 restantes **0** · `property_view` de VB-26 = **2** (ids 179 y 180 intactos) · eventos 122→**97** · property_view 74→**49** (resto de propiedades intacto) · `audit_logs` 382, usuarios 11, propiedades 9, fotos 118, leads 1, citas 0, invitaciones 2 y huella de flags: **sin cambios**.
**Otros datos modificados: 0.** Migraciones 0 · despliegue 0 · código de producción sin cambios.

### Decisión de alcance y asunto abierto (para el usuario)
El script preparado antes (`QA-021-correccion.sql`) también bajaba el contador `propiedades.vistas` (27→2) y escribía una fila en `audit_logs`. La autorización de esta operación fue **exclusivamente borrar las 25 filas** y prohibía modificar `propiedades`, así que esas dos escrituras **no se hicieron**. Consecuencia: el contador `propiedades.vistas` de VB-2026-00026 **sigue en 27** mientras los eventos suman 2. **Resuelto en E-35.2** (arriba): el contador se corrigió a 2 con autorización aparte.

### Rollback (verificado, NO ejecutado)
- `QA-021-rollback-solo-eventos.sql` (generado por `scripts/qa/generar-qa021-rollback.py` desde `QA-021-filas.csv`): reinserta las 25 filas con sus ids, sesiones y fechas originales (`OVERRIDING SYSTEM VALUE`), aborta si ya existen y **verifica la huella** al terminar. Probado en PGlite: tras borrar y restaurar, las filas son idénticas a las de antes (ids, sesión, `creado_en`, `nombre`, `uid`, `datos`).
- El rollback original `QA-021-rollback.sql` (también restaura `vistas` 2→27) **no aplica** a lo ejecutado: aborta a salvo con «vistas = 27» (probado). Se conserva por si el contador se corrige después.
- Limitación: la secuencia de `eventos.id` no retrocede (los ids 188–212 se reinsertan explícitamente; los nuevos eventos seguirán por encima).
- Pruebas: `tests/qa021-sql.test.ts`, 13 (PGlite en UTC): borrado exacto (122→97, 74→49, VB-26 27→2), aborta sin borrar si una fila cambió (huella), si los totales no son los autorizados o si una de las filas tiene `uid` (la condición completa decide, no los ids), rollback idéntico, rollback que no duplica y rollback original que aborta a salvo.
**Codex L1 (solo el SQL ejecutado, su alcance, la evidencia y el rollback):** `CODEX L1 = PASS` — P0 0 · P1 0 · P2 0 · P3 2: (1) la huella final del rollback de solo-eventos cubre `id|sesion|creado_en`, no `nombre/propiedad_id/uid/datos` (el `insert` sí los reconstruye; mejora futura posible); (2) la secuencia de identidad no retrocede (ya documentado arriba). No corregidos: no bloquean y el rollback no se ha usado.

## E-35 PROMOVIDO Y CERRADO (autorizado por el usuario)
| | |
|---|---|
| Deployment anterior | `dpl_DsEZS1fK4kZnZvmo6FrtiZ29uEi4` (E-34) |
| Deployment nuevo | **`dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U`** (E-35 FINAL) |
| Hora UTC | 2026-10-08 01:18:53Z (inicio) → 01:18:58Z (fin) |
| Duración | ~5 s (`vercel promote … --yes`: «Success! vive-bien was promoted to vive-bien-1yqf6fa3o-grupo-p-once.vercel.app», exit 0) |
| Resultado | **PROMOCIÓN EXITOSA** — no se construyó otro candidato, no se modificó código, sin commit/push |
**Pre-checks (01:18:39Z, antes de promover):** candidato READY / STAGED; manifiesto `329cc48089358d45bfbe2a49912021ed0d488eb829da00fc972c72c764eba524` y payload `59d4a2044d8a09c7695d4e83f3059ace2b6af2055eabc61f3b5c671c488bb513` idénticos a los autorizados (SHA-256 recalculado); árbol real 376/376, 0 sobran, 0 faltan, 0 sha1 distintos; producción aún en E-34.
**Dominios después:** `vivebienn.com`, `www.vivebienn.com`, `vive-bien.vercel.app` y `vive-bien-grupo-p-once.vercel.app` → `dpl_89Hy6…`; target de producción `READY / PROMOTED`. `data-dpl-id="dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U"` en vivebienn.com, www y vive-bien.vercel.app.

### Smoke post-promoción (modo `produccion`, solo GET) — 24/24 PASS
Todas las rutas pedidas: `/` 200 · `/propiedades` 200 · ficha disponible 200 · ficha pausada `/propiedades/sanjuan` **404** · `/entrar` 200 · `/ayuda` 200 · `/contacto` 200 · `/publicador` 200 · `/admin/usuarios` 200 · `/admin/usuarios/[uid]` 200 · `/publicador/citas` 200 · `/sitemap.xml` 200 (sin `sanjuan`) · `/api/catalogo` 200 (sin `sanjuan`) · `/api/salud` 200 `{"ok":true}` · APIs sin sesión **401**: `/api/admin/salud`, `/api/publicador/propiedades`, `/api/usuarios/me`, `/api/admin/usuarios`, `/api/citas` · ruta inexistente 404 · API inexistente 404. Más los controles de E-35: `/api/admin/propiedades` **401** (antes era lectura pública), `/api/admin/telegram/diagnostico` **401**, `/api/telegram/webhook` GET **405**. Sin 5xx. Las páginas protegidas devuelven 200 porque su protección es del cliente y de las APIs (igual que en E-34).

### Seguridad post-promoción
- **CSP:** presente y **solo en modo informe** (`Content-Security-Policy-Report-Only`); **sin `unsafe-eval`**. HSTS (`max-age=63072000`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` presentes.
- **Cabeceras de caché en Vercel real (lo que quedó pendiente en E-35):** las 7 rutas autenticadas (`/api/usuarios/me`, `/api/citas`, `/api/publicador/propiedades`, `/api/admin/usuarios`, `/api/admin/propiedades`, `/api/admin/salud`, `/api/admin/telegram/diagnostico`) responden `Cache-Control: private, no-store` y `Vary: Cookie, Authorization` — **confirmado en producción**. `/api/salud` mantiene `no-store`; `/api/catalogo`, `public, max-age=0, must-revalidate` (la plataforma prevalece sobre el `s-maxage` local; igual que en E-34, sin cambio).
- **Secretos:** la clave de servicio no aparece (clave completa, firma ni literal `service_role`) en el HTML ni en los JS públicos de la portada (1,1 MB revisados). **Bypass de Vercel: 0** (el smoke de producción no lo usa).

### Datos (solo SELECT; antes 01:18Z / después 01:20Z) — **sin cambios**
| | antes = después |
|---|---|
| flags | idénticos (`citasEnLinea:false`, `portalCliente:true`, `publisherPortal:false`, resto false) |
| usuarios | 11; roles admin 1 · cliente 6 · publicador 3 · super_admin 1; última modificación 2026-10-07 23:48 UTC (actividad previa a la promoción) |
| propiedades | 9 (7 publicadas/disponibles, 1 publicada/pausada, 1 borrador/eliminada); última alta 2026-10-05 |
| fotos | 118 |
| leads | 1 (2026-04-07) · citas 0 · invitaciones 2 (2026-09-19) |
| audit_logs | 382; última 2026-10-06 23:53 UTC |
| eventos | 122; último 2026-10-07 07:28 UTC (el smoke no generó eventos) |
| **QA-021** | **intacto: 25 filas `property_view` (ids 188–212) y `vistas` de VB-2026-00026 = 27**; no se ejecutó ni la corrección ni el rollback |

### Logs observados
`vercel logs` (solicitudes) del deployment nuevo, ventana **01:19:15Z–01:19:56Z** tras promover (~1 min; hay además registros previos 01:10–01:11Z del smoke del candidato): solo estados 200, 401, 404 y 405 esperados; **no se observaron 5xx ni errores de aplicación en esa ventana**. El tráfico es casi todo el del propio smoke, así que esto **no** equivale a «0 errores absolutos» ni cubre un periodo prolongado.

### Rollback (preparado, NO ejecutado)
`vercel promote dpl_DsEZS1fK4kZnZvmo6FrtiZ29uEi4` (E-34, READY). Sin migraciones que revertir. Cadena de rollback: E-35 → E-34 → E-33 (`dpl_F1tkBFb56q6cuxieQpriz8MazLHt`). El candidato E-35 anterior (`dpl_CkuYRXsKNsZfNUedWgT5yfRtHPaB`) sigue STAGED sin uso.

**Estado: E-35 PROMOVIDO Y CERRADO.** Pendientes que NO bloquean (siguen abiertos): QA-021 (autorización), CSP en informe (E-35-07), CVE de dependencias (E-36), deuda axe (E-37), commit del repo (obs. 0013).

---

## ACTUALIZACIÓN FINAL (P3 resuelto + reconciliación del repo)
**Candidato FINAL:** `dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U` · `vive-bien-1yqf6fa3o-grupo-p-once.vercel.app` · READY / STAGED, sin dominios. Sustituye al candidato anterior `dpl_CkuYRXsKNsZfNUedWgT5yfRtHPaB` (queda STAGED sin uso; no se promueve).
| | |
|---|---|
| Manifiesto | `329cc48089358d45bfbe2a49912021ed0d488eb829da00fc972c72c764eba524` |
| Payload | `59d4a2044d8a09c7695d4e83f3059ace2b6af2055eabc61f3b5c671c488bb513` (376 archivos) |
| Árbol real del deployment | **376/376**, 0 sobran, 0 faltan, 0 sha1 distintos |
| Candidato final vs anterior (árbol real de ambos) | **un solo archivo distinto: `src/app/api/ayuda/feedback/route.ts`**; 0 nuevos, 0 quitados |
| Manifiesto v1 vs v2 | `feedback/route.ts` y `tests/e35-fronteras.test.ts` (solo pruebas, no viaja) |
**P3 de Codex resuelto:** los dos 429 de `/api/ayuda/feedback` (por origen y por artículo) pasan por `sinCache()` y llevan `Retry-After` **y** `Cache-Control: no-store`; `lib/limites.ts` y los 429 del resto de rutas no cambian. Regresión: «Codex E-35 P3 …» (**roja contra la ruta anterior**, verde ahora) y «el helper compartido NO cambia».
**Validación tras el cambio:** `tsc` limpio · `tests/e35-fronteras` 17/17 · Vitest del staging 2080 pasan, 7 fallos = los mismos ajenos ya documentados (V-1.1.95 y artefactos solo del repo) · build OK · lint 0 errores en los archivos tocados · smoke del candidato final **18/18 PASS**, bypass 0 → 0.
**Codex L1 (solo el cambio de feedback + la reconciliación):** `CODEX L1 = PASS` — P0 0 · P1 0 · P2 0 · P3 0.
**Reconciliación del repo:** ver `docs/QA/E35_RECONCILIACION.md`. Resultado: para los 17 archivos de E-35 el repo era idéntico a producción; se aplicó SOLO el hunk E-35 (12 archivos escritos, 5 ya iguales, 0 omitidos), sin commit ni push; V-1.1.95 intacto (6 archivos de residuo: `globals.css`, `PortalShell.tsx`, y las versiones completas de `PropertyCard`, `propiedades/page-client`, `propiedades/[id]/page-client`, `Entrar`). Repo reconciliado: `tsc` limpio, Vitest **2117 pasan / 0 fallan**.
**QA-021:** PREPARADO / NO EJECUTADO (`QA-021-filas.csv`, `QA-021-correccion.sql`, `QA-021-rollback.sql`, `scripts/qa/generar-qa021-rollback.py`). **Migraciones: 0. Mutaciones de datos de producción: 0. Despliegue a producción: NO.**

## Integridad
| | |
|---|---|
| Manifiesto E-35 | `1cd158ecc084e0f9483ece461fd5871b10f9c34f976c9ca84cd02a03b6f3c7af` (staging `…\vivebien-deploy-stage-e35-final`; vs base E-34: 11 modificados, 6 nuevos, 0 quitados) |
| Payload E-35 | `22419b49011f33c678190bfcdc6f0e789eb93cd5cb3b4b212c98017194f299e6` — 376 archivos = 375 de E-34 + 1 nuevo; **8 modificados, 1 nuevo, 0 quitados** |
| Árbol real del deployment | **376/376**, 0 sobran, 0 faltan, 0 sha1 distintos (`verificar_deployment_e35.py`) |
| Producción durante la fase | `dpl_DsEZ…` (E-34) en `vivebienn.com`, `www` y `vive-bien.vercel.app` (`data-dpl-id` comprobado) |
Base verificada antes de construir: manifiesto E-34 `66d2958a…` y payload `0656bb50…` por SHA-256, cada archivo por sha1, y árbol real de producción == payload (375/375).

## Qué cambia (payload)
| ID | Cambio | Archivos |
|---|---|---|
| E35-02 · QA-011 | `GET /api/admin/propiedades`: 401 sin sesión · 403 cliente/publicador · 200 admin/super admin con todo el inventario, `private, no-store`. Consumidores migrados: portal (`MetricasCliente`, `MisFavoritos`) → `/api/catalogo`; `dashboard` (solo admin) envía la sesión | `api/admin/propiedades/route.ts`, `MetricasCliente.tsx`, `MisFavoritos.tsx`, `dashboard/page.tsx` |
| E35-03 · QA-012 | Se elimina el `GET` público de diagnóstico del webhook de Telegram (ahora 405). Nuevo `GET /api/admin/telegram/diagnostico` (admin/super admin; solo `configurado`, `conToken`, `remitentes`; sin valores ni largos) | `api/telegram/webhook/route.ts`, `api/admin/telegram/diagnostico/route.ts` (nuevo) |
| E35-04 · QA-013 | `Cache-Control: private, no-store` + `Vary: Cookie, Authorization` en `/api/usuarios/*`, `/api/citas/*`, `/api/publicador/*`, `/api/admin/*` (central, en `next.config.ts`) | `next.config.ts` |
| E35-05 · QA-003 | `feedback`: cuerpo acotado a 4 KB (413, corta el stream), id `^[A-Za-z0-9_-]{1,64}$` (400), tope por origen+artículo 3/10 min (429 + `Retry-After`), `no-store` | `api/ayuda/feedback/route.ts`, `lib/limites.ts` |
| E35-01 · QA-021 | Preparado, **sin ejecutar** (ver abajo) | solo staging/docs |
| E35-07 · CSP | Sigue en **informe**; `docs/QA/CSP_E35.md` | — |

## QA-021 — (histórico) preparación: listo, NO ejecutado al escribir esto — ver «CLEANED» más arriba
Evidencia de solo lectura (7-oct): `eventos` de la propiedad VB-2026-00026 (`5243dab0-e301-4ce1-a5de-f5f57037e613`) = 27 `property_view`: ids 179 y 180 (5–6-oct, anteriores) + **ids 188–212 = 25 filas consecutivas**, 25 sesiones distintas, 04:49:58 → 07:28:20 UTC del 7-oct, `uid` y `datos` nulos (sin PII) = las ventanas de las pruebas de navegador de la campaña. `vistas` = 27 (27 = 2 + 25). Sin triggers sobre `eventos`; los de `propiedades` solo tocan el folio.
- Evidencia exacta: `docs/QA/QA-021-filas.csv` (huella de ids `754d2d75…`).
- Corrección transaccional: `docs/QA/QA-021-correccion.sql` (aborta si no son exactamente 25 filas o si `vistas` ≠ 27; borra solo esas; `vistas` 27→2; huella en `audit_logs`).
- **Rollback:** `docs/QA/QA-021-rollback.sql` (generado por `scripts/qa/generar-qa021-rollback.py`; reinserta las 25 con sus ids y fechas con `OVERRIDING SYSTEM VALUE`; `vistas`→27; aborta si el estado no es el esperado).
- Pruebas (PGlite, esquema equivalente): `tests/qa021-sql.test.ts`, 7: corrección exacta, aborta con 24/26 filas, aborta si el contador se movió (protege una visita legítima), rollback idéntico (ids, fechas, sesiones), rollback aborta si no se corrigió. **Nada se tocó en producción.**
- Estado: **PENDIENTE DE AUTORIZACIÓN explícita** para ejecutar la corrección.

## Pruebas (todas con evidencia y regresión)
| Control | Resultado |
|---|---|
| Regresión nueva | `tests/e35-fronteras.test.ts` 15/15 — **nacieron 13 rojas contra E-34** y quedaron verdes con el arreglo |
| `tsc --noEmit` | limpio |
| Vitest (árbol de trabajo) | las suites de E-35 y las afectadas pasan; solo siguen fallando las 8 + 2 ajenas ya documentadas en E-34 (tests de V-1.1.95 y de artefactos solo del repo). 3 pruebas existentes se actualizaron porque describían el comportamiento ANTERIOR, cambiado a propósito (`limites`, `supabase-timeouts`, `visibilidad-publica`) |
| Build | OK (réplica aislada) |
| Playwright | visual **45/45**, e2e **95** (9 omitidas por diseño) |
| axe | E-34 = E-35 = 8 critical / 108 serious / 204 moderate / 4 minor · **0 regresiones** (deuda previa abierta; E-37) |
| Semgrep (`src/app/api`, `src/lib`, `next.config.ts`) | 0 hallazgos |
| Secretos | escáner del constructor LIMPIO · 0 coincidencias de la clave de servicio |
| Lint | sin errores nuevos en los archivos tocados (mismos conteos que E-34) |
| Cabeceras reales (`next start`) | 401 de las 7 rutas protegidas salen con `Cache-Control: private, no-store` y `Vary: Cookie, Authorization`; catálogo mantiene `s-maxage=300`; webhook GET → 405 |
| CSP | 17 páginas, 0 violaciones reales (solo `connect-src` a la réplica local) → se mantiene en informe |
| Smoke del candidato en Vercel | **18/18 PASS** (solo GET, bypass 0 → 0): `/api/admin/propiedades` 401, `/api/admin/telegram/diagnostico` 401, webhook GET 405, APIs protegidas 401, 404, 8 páginas con la redirección 308 esperada |
Límite: las cabeceras de caché se comprobaron en un `next start` local; en Vercel se verificarán tras la promoción (la plataforma podría reescribirlas).

## Codex L2 — ronda 1
`CODEX L2 = PASS`. **P0 0 · P1 0 · P2 0 · P3 1:** el 429 de `frenarAsync` lleva `Retry-After` pero no `Cache-Control: no-store` (impacto bajo: un 429 no suele cachearse). **No corregido** (P3 no bloquea; evita reabrir el staging y una segunda ronda); queda para el siguiente bloque que toque `limites.ts`. Ronda 2: no necesaria.

## Datos / migraciones / producción
Sin migraciones, flags, roles ni datos tocados. Producción sin cambios (E-34). Las lecturas SQL fueron solo de agregados/QA-021.

## Notas
- **Visible para usuarios:** el panel de administración (`/dashboard`, solo admin) ahora puede listar borradores y pausadas (antes solo veía lo público por falta de sesión en esa llamada). El portal del cliente no cambia. **No se actualiza el Centro de Ayuda** (público; cambio interno de administración).
- **Reconciliación del repo (decisión pendiente, observación 0013):** `HEAD f4834e5` está detrás de producción y el árbol de trabajo mezcla V-1.1.95; los archivos que E-35 toca tienen diferencias ajenas. Se sincronizaron al repo solo los archivos NUEVOS (`api/admin/telegram/diagnostico/route.ts`, las dos pruebas nuevas, QA-021, scripts) y el diff completo queda en `docs/QA/E35_diff_E34_a_E35.patch`. Las modificaciones de E-35 sobre archivos existentes viven en el staging hasta reconciliar.
- **CSP:** `docs/QA/CSP_E35.md`.

## Bloqueadores / no bloqueantes
- Bloqueadores técnicos: **ninguno** (solo falta la autorización del usuario).
- No bloquean: P3 de Codex (429 sin `no-store`); CSP en informe; sin límite compartido (Upstash); CVE de dependencias (E-36); deuda axe (E-37); reconciliación del repo.
- **Rollback:** `vercel promote dpl_DsEZS1fK4kZnZvmo6FrtiZ29uEi4` (E-34); sin migraciones que revertir.
