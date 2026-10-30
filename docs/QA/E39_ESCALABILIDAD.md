# E-39 — Escalabilidad, webhooks y guardias (8-oct-2026) · preparado, NO desplegado

Base: producción E-35 (+ E-36/E-37/E-38 en el árbol de trabajo). **La corrección de E-34 de los clientes de Supabase de servidor permanece intacta** (fábrica única `lib/supabase-servidor.ts`, sin auto-refresco, lecturas con tiempo límite, escrituras sin abortar): no se tocó y la guardia de R-01 sigue verde.

## CANDIDATO CONSOLIDADO E-36 → E-39 (preparado, NO promovido)
| | |
|---|---|
| Deployment | **`dpl_CfwgKgpGRRAniArNXymWBSEWSVXj`** · `vive-bien-2o6z7t2ax-grupo-p-once.vercel.app` · READY / **STAGED**, sin dominios propios |
| Producción durante la fase | `dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U` (E-35) en los 3 dominios (`data-dpl-id` comprobado) |
| Manifiesto | `22fa0b42fe1a477a5d7d0dd521e9c68e400c33faac91b6d35add27b4f2a2d4ca` (vs base E-35: 16 modificados, 7 nuevos, 0 quitados) |
| Payload | `81d07122095b9d1e3657a1d81b0bc2fe561087adb72a1076f61b8db74cf12957` · 379 archivos = 376 + 3 nuevos · **15 modificados, 3 nuevos, 0 quitados** vs producción |
| Árbol real del deployment | **379/379**, 0 sobran, 0 faltan, 0 sha1 distintos (`verificar_deployment_e36.py`) |
| Build remoto en Vercel | OK (lockfile nuevo: `next` 16.3.8 y transitivas) |
| Smoke del candidato | **18/18 PASS** (solo GET; bypass 0 → 0) |
Contenido del payload (todo el programa, agrupado por fase): **E-36** `package.json` (`next` ^16.3.8, scripts `qa:*`) + `package-lock.json`; **E-37** `contacto/page-client`, `not-found`, `Consentimiento`, portada (`page-client`); **E-38** `registro-seguro`, `http-metricas`, `umbrales`, `metricas` + rutas `catalogo`, `salud`, `ayuda/feedback`, `usuarios/me`, `admin/salud`; **E-39** webhooks de Telegram y WhatsApp, `next.config.ts` (+11 rutas privadas). Construido con `armar_stage_e36.py` (fail-closed: lista cerrada de cambios, escáner de secretos LIMPIO, base E-35 verificada por SHA-256 y contra el árbol real de producción). Solo viaja a staging, sin desplegar al dominio: **requiere tu autorización para promoverlo**.
**Riesgos a vigilar tras promover:** (1) cambia el árbol de dependencias (Next 16.3.8): comprobar páginas e inicio de sesión reales; (2) `Cache-Control: private, no-store` en 11 carpetas más de API (comprobar en Vercel, como se hizo con las 7 de E-35); (3) los webhooks siguen contestando igual a Telegram/Meta, pero conviene mirar el primer mensaje real; (4) el paso 9 del `qa:gate` se repitió enchufado el 8-oct: pasó (ver «Resultado»). **Rollback:** `vercel promote dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U` (E-35); sin migraciones.


## E39-01 · Cliente de Supabase de servidor protegido contra regresión
Ya existía la barrera de R-01 (`tests/supabase-servidor-barrera.test.ts`): solo `lib/supabase-servidor.ts` y `lib/supabase.ts` (navegador) llaman a `createClient`; opciones exactas (`autoRefreshToken:false`, `persistSession:false`, `detectSessionInUrl:false`); y una prueba de **comportamiento** que comprueba que no se registra ningún `setInterval` (con control positivo). Se reutiliza sin cambios y entra en `qa:gate` y `qa:security`. Nada que añadir.

## E39-02 · `npm run qa:performance` (k6) — regresión frente a E-34
- `npm run qa:performance` → `tests/performance/qa-performance.sh`: se niega a correr en batería, construye el árbol actual contra la réplica local, ejecuta los escalones **100 / 200 / 300 / 450 req/s** (40 s cada uno, una sola corrida a la vez), guarda `docs/QA/performance/<fecha>-<etiqueta>.md/.json` (RPS, p50, p95, p99, errores, descartadas, RSS, duración) y sale con código ≠ 0 si hay **regresión** respecto a `docs/QA/performance/baseline-e34.json`.
- Reglas (generosas a propósito; máquina de pruebas ≠ producción; réplica con latencia de BD ≈ 0): 100/200 req/s → 0 % errores y p95 ≤ max(2×base, base+30 ms); 300 → errores ≤ 0,1 % y p95 ≤ 3×base+50 ms; 450 → errores ≤ 2 % y caudal ≥ 93 % del mínimo de la base (≈ 400 req/s); RSS ≤ 700 MB (E-34: 566–572 MB).
- **No declara 450 req/s como capacidad garantizada**: detecta regresiones. Control positivo verificado con datos reales: la corrida de E-34 pasa («sin regresión»); la de E-33 falla («caudal 376,7 < 401 | RSS 1975 MB > 700 MB»).
- Fuera de `qa:gate` (tarda ~8 min y exige corriente).

## E39-03 · Rate limiting distribuido — evaluación (NO se instaló nada)
Estado real: `lib/limites-almacen.ts` ya tiene la interfaz `AlmacenLimite` con dos implementaciones: **memoria por instancia** (la que corre hoy) y **Upstash REST** (se activa solo si existen `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; si no, memoria). Es decir, **hoy NINGÚN límite es distribuido**: con varias instancias de Vercel el tope real se multiplica por el número de instancias y se reinicia en cada arranque. El código ya está listo; falta el servicio.
Rutas con límite (20): `acceso/registro` (20/10 min), `contacto` y `registro-lead` (6/h), `ayuda/feedback` (20/10 min + 3/10 min por artículo), `busquedas`·`portal/busquedas`·`portal/alertas`·`admin/flags` (30/10 min), `eventos` (300/10 min), `favoritos` (120/10 min), `citas` (×4, 40/10 min), `medios/firma` (150/10 min), `cuenta/eliminar` (5/h), edición de propiedades (×3, 240/10 min).
| Opción | Protege a quién | Coste / riesgo | Veredicto |
|---|---|---|---|
| **Upstash Redis (REST)** | todas las rutas anteriores, sin cambiar código (se activa con 2 variables) | nivel gratuito (~10 000 comandos/día; el tráfico actual es bajísimo); añade ~10–30 ms de ida y vuelta a cada petición limitada; nuevo proveedor y secretos | **Recomendado** cuando haya abuso real o más tráfico; requiere tu autorización (cuenta + 2 variables de entorno) |
| Tabla en Supabase (contador atómico por RPC) | igual | escribe en la base de producción en CADA petición (carga y latencia; mezcla telemetría con datos de negocio); requiere migración | No recomendado |
| Vercel Firewall / reglas de límite de tasa | login y formularios por IP en el borde, antes de ejecutar la función | disponibilidad y topes según plan (verificar en el panel de Hobby); no ve la identidad ni el artículo | Complemento para formularios y webhooks; no sustituye lo anterior |
| No hacer nada | — | el riesgo real hoy es bajo (no hay tráfico de abuso observado) pero el límite de formularios/feedback es fácilmente eludible repartiendo peticiones entre instancias | Aceptable de forma temporal |
**Prioridad si se activa:** login/registro de acceso, `contacto`/`registro-lead`, `feedback`, webhooks (por firma), `eventos`. **Decisión: pendiente de tu autorización** (no se contrató nada, no se tocaron variables de entorno). Mientras tanto la defensa de `feedback` no depende solo del contador (tamaño, id acotado, RLS).

## E39-04 · Webhooks endurecidos (Telegram y WhatsApp/Meta) — pruebas `tests/e39-webhooks.test.ts` (10; **7 nacieron rojas**)
| Control | Telegram (`/api/telegram/webhook`) | WhatsApp (`/api/whatsapp/webhook`) |
|---|---|---|
| Autenticación | cabecera `X-Telegram-Bot-Api-Secret-Token`; **ahora en tiempo constante** (antes `!==`); sin secreto configurado → 503 | firma HMAC-SHA256 `X-Hub-Signature-256` (ya en tiempo constante); GET de verificación con token **ahora en tiempo constante** (antes `===`) |
| Tamaño | **413 si > 64 KB** (cabecera y lectura real), antes de interpretar nada | **413 si > 256 KB** antes de calcular el HMAC |
| Repetición / idempotencia | **`update_id` ya visto → 200 `{duplicado:true}` sin procesarse** (best-effort, por instancia, últimos 500) | actualizar el estado por `whatsapp_id` es idempotente; **hallazgo P3:** un acuse tardío `sent` tras `delivered` puede degradar el estado (no hay orden monótono) — no se cambia la lógica sin datos reales |
| Marca de tiempo | Telegram no firma el momento; rechazar actualizaciones viejas descartaría entregas legítimas tras una caída → no se aplica | Meta no incluye marca de tiempo firmada: la repetición válida solo se acota por idempotencia |
| Límite de tasa | lista de chats permitidos (`TELEGRAM_CHATS_PERMITIDOS`); un chat ajeno solo registra su id | firma obligatoria antes de tocar la base |
| Registros | **sin texto del usuario** (antes registraba 80 caracteres del mensaje) y errores/respuestas **limpiados** (`limpiarTexto`: sin JWT, Bearer, token de bot, correos, teléfonos) | idem (antes volcaba el objeto de error completo) |
| Tiempo límite | descarga/subida de fotos con `AbortSignal.timeout(8000)` (ya existía) | solo escribe una fila |
| Respuesta | siempre 200 salvo 401/413/503 (para que Telegram no reintente en bucle; ya existía) | 200, 403 o 413 |
**Lógica de publicación de Telegram: sin cambios.** Contratos externos: sin cambios (mismos códigos y cuerpos para las peticiones legítimas).

## E39-GUARDIAS · `tests/e39-guardias.test.ts` (9)
1. **Caracteres de control** en `src/`, `tests/` y `scripts/` (la barrera de la observación 0006: un `\b` escrito desde un script quedó como retroceso). **Al activarla encontró UN caso real**: `tests/diagnostico-sonda.test.ts` tenía `/\x08ey…/` (una regex de JWT que **nunca podía coincidir**, así que esa comprobación estaba muerta desde D-62); corregido a `/\bey…/` y la prueba sigue pasando con la comprobación ya efectiva.
2. **Secretos fuera del navegador:** ninguna `NEXT_PUBLIC_*` con nombre de secreto; un archivo `'use client'` solo lee `NEXT_PUBLIC_*`; la clave de servicio nunca en componentes de cliente.
3. **Respuestas privadas no cacheables:** toda carpeta de `/api` con rutas que exigen sesión debe estar en `rutasPrivadas` de `next.config.ts` (`Cache-Control: private, no-store` + `Vary`). **Encontró 11 carpetas sin cubrir** (`alertas, busquedas, contacto, cuenta, diagnostico, eventos, favoritos, leads, medios, portal, propiedades`) que E-35 no cubría (E-35 cubría las 4 pedidas); **ya añadidas** y la guardia obliga a mantener la lista. Las carpetas públicas (`catalogo`, `salud`, `ayuda`, webhooks…) se comprueba que **no** están marcadas.
4. **Rate limit:** toda ruta pública que ESCRIBE (POST/PUT/PATCH/DELETE sin sesión, salvo webhooks firmados) debe pasar por `frenarAsync`/`frenar` (hoy: todas).
5. **Webhooks:** todo `webhook/route.ts` debe tener `timingSafeEqual`, `MAX_CUERPO` y `limpiarTexto`.
6. **Registros sin secretos:** ningún `console.*` de `src/` imprime `process.env`, cabeceras, cookies, contraseñas, secretos ni claves de servicio (se analizan las expresiones, no los textos de los mensajes).
7. Barrera de Supabase de servidor: la de R-01 (E39-01).

## E39-05 · Concurrencia (entorno aislado; nada contra producción)
| Qué | Evidencia |
|---|---|
| Publicaciones/ediciones simultáneas, RPCs atómicas con el trigger real | `tests/concurrencia-real.test.ts` (Docker `postgres:17.6`, `QA_CONCURRENCIA=1`): **6/6** (rerun del 8-oct) |
| Rate limits bajo carga | `limites.test.ts`: 300 peticiones en paralelo desde un origen → solo 20 llegan a la base; `e35-fronteras`: tope por artículo/origen |
| Caché | `ficha-cache.test.ts` (invalidación por etiqueta), `chaos-catalogo.test.ts` (8) |
| Cambio de cuenta (auth switching) | e2e de sesión (`sesion.e2e.ts`: CLIENTE↔ADMIN en 4 anchos): dentro de los **95** del `qa:gate` |
| Webhooks repetidos | `e39-webhooks.test.ts`: mismo `update_id` dos veces → una sola vez |

## Puerta de calidad `npm run qa:gate` (y `qa:gate:rapido`, `qa:security`, `qa:performance`)
`scripts/qa/gate.cjs`: 10 pasos, aborta en el primero que falla y dice cuál. **Entorno explícito** (nada heredado del shell; de `.env.local` solo variables públicas; todo lo no público —token de Telegram, claves— se pasa VACÍO, y la clave de servicio es ficticia) contra la réplica local de Supabase.
| # | Paso | Detalle |
|---|---|---|
| 1 | typecheck | `tsc --noEmit` |
| 2 | pruebas críticas | 13 archivos (Supabase de servidor, límites, salud, CSP, ficha/catálogo, timeouts, visibilidad, e37, e38, QA-021, baselines, CLS de `/entrar`) |
| 3 | seguridad | 8 archivos (e35 fronteras, e39 guardias y webhooks, guardia de producción, entorno de staging, sonda de diagnóstico, seguridad de cliente/publicador) |
| 4 | secretos | `escanear-secretos.cjs` (JWT `service_role`, asignaciones de secretos con valor, tokens de bot, AWS, claves privadas); **control positivo verificado** (un secreto plantado → falla); 3 valores ficticios de pruebas en lista de excepciones con su motivo |
| 5 | lint | `lint-comparar.cjs`: **sin empeorar** respecto a `docs/QA/lint-baseline.json` (64 errores heredados en 24 archivos; una línea base, no un permiso para empeorar) |
| 6 | build | `next build` contra la réplica (solo lecturas anónimas) |
| 7 | navegador | e2e de sesión, publicador, revisión y CLS (95) |
| 8 | axe | `axe-comparar.cjs`: **sin empeorar** respecto a `docs/QA/axe-baseline.json` (24 mediciones; critical 8 · serious 56 · moderate 76 · minor 4); **control positivo verificado** (el estado de E-35 «empeora» frente a la base de E-37) |
| 9 | baselines visuales | las 48 capturas |
| 10 | API | `smoke-deployment.ts staging` con `scripts/qa/specs/gate-api.json` (14 comprobaciones) |
**Qué NO incluye:** k6 (`qa:performance`, ~8 min, solo enchufado), Codex, Lighthouse. **Salvaguardas:** se niega a correr los pasos de navegador **en batería** (se ralentizan y fallan por tiempo, no por el código; `QA_ACEPTAR_BATERIA=1` para forzarlo y etiquetar), nunca salta el build al reanudar (`--desde`), calienta las rutas antes de las pruebas (observación 0015), y sube el tiempo de prueba a 60 s con 2 reintentos solo para el gate (las páginas cargan fuentes y fotos de terceros).
**Resultado de la última corrida completa (árbol E-36…E-39, réplica aislada):** typecheck ✓ · críticas ✓ (125 pruebas) · seguridad ✓ (107) · secretos ✓ (0 de 641 archivos) · lint ✓ (64 = base) · build ✓ · navegador ✓ (**95**) · axe ✓ (**sin empeorar**) · visuales ✓ · API ✓ (14/14). **Repetición enchufado (8-oct, equipo con corriente):** corrida 1: 43 OK, 4 flaky, 1 fallo (catálogo/portada/panel: texto desplazado en toda la página = carga de fuentes/terceros, con diferencia distinta entre reintentos: 0,42 → 0,04); corrida 2 (build limpio): **`qa:gate: TODO OK`** — navegador 95, axe sin empeorar, visuales **46 OK + 2 flaky (reintento OK), 0 fallos**, API ✓. Conclusión: el 47/48 anterior fue la batería; el residuo es flakiness de fuentes de terceros bajo carga, no regresión de código (ningún archivo de interfaz tocado desde E-37). Línea base visual sin cambios.

## Verificación del bloque
Repo reconciliado: `tsc` limpio · Vitest **2178 pasan, 0 fallan** (6 omitidas, opt-in) · `e39-webhooks` 10/10 (**7 nacieron rojas** contra E-35) · `e39-guardias` 9/9 (**2 nacieron rojas**: caracteres de control y 11 carpetas sin `no-store`) · concurrencia real 6/6 · build OK. **Codex:** BLOCKED por cuota (hasta el 6-nov-2026); sin auto-revisión.
**Hallazgos nuevos del bloque:** (1) `tests/diagnostico-sonda.test.ts` llevaba una regex de JWT inoperante por un retroceso en vez de `\b` (corregida); (2) `QA-022` (P3): `next start` puede cachear un 503 del catálogo ISR (ver `DEFECTOS.md`); (3) acuses de WhatsApp fuera de orden pueden degradar el estado (P3, sin cambio de lógica); (4) 11 carpetas de API autenticadas sin `no-store` (corregido).
**Archivos (payload):** `src/app/api/telegram/webhook/route.ts`, `src/app/api/whatsapp/webhook/route.ts`, `src/lib/registro-seguro.ts`, `next.config.ts` (+11 rutas privadas), `package.json` (scripts `qa:*`). **QA/herramientas (no se despliegan):** `scripts/qa/{gate,lint-comparar,escanear-secretos,axe-comparar,comparar-rendimiento}.cjs`, `scripts/qa/specs/gate-api.json`, `tests/performance/qa-performance.sh`, `tests/e39-{webhooks,guardias}.test.ts`, `docs/QA/{lint,axe}-baseline.json`, `docs/QA/performance/baseline-e34.json`, `playwright*.config.ts` (puerto, reutilización de servidor, tiempo y reintentos por entorno).
**Pendiente / necesita tu autorización:** almacén distribuido de límites (Upstash: cuenta + 2 variables), `SALUD_SECRETO` + monitor externo, Sentry (E-38), desplegar. **P3:** QA-022, orden de acuses de WhatsApp, repetir el paso 9 del gate enchufado, mover `shadcn` a devDependencies. **Rollback:** restaurar los archivos de payload de E-35 (el resto es herramienta de QA).
