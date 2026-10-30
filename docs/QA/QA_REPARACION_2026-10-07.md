# Reparación post-QA D-62 — informe de cierre (7-oct-2026)

> **ESTADO FINAL DE QA-021 (supera cualquier «pendiente» de este documento):** **CLEANED**. Las 25 filas `property_view` (ids 188–212) se eliminaron el 8-oct-2026 con autorización explícita (D-66) y el contador `propiedades.vistas` se corrigió 27 → 2 (E-35.2, D-67). Eventos legítimos restantes: 179 y 180. Las menciones de «pendiente de autorización», «listo para corrección» o «no ejecutado» son el estado histórico al momento de escribirlas. Detalle: `docs/QA/E35_SEGURIDAD_Y_FRONTERAS.md`.

> **CORRECCIÓN (cierre independiente):** este informe usó «CERRADO» donde faltaba validación. El estado real, por punto y con su bloqueador, está en `CIERRE_E34_2026-10-07.md`, que **prevalece**. Capacidad base vs E-34: BLOCKED (sin A/B válido). Codex: BLOCKED por disponibilidad.

**Producción: NO MODIFICADA.** Sin despliegue, sin promoción, sin migraciones, sin flags activados. Candidato E-34 compuesto localmente (E-33 + solo archivos R-xx), **no** subido a Vercel.

## Resultados
| ID | Defecto | Severidad | Estado | Evidencia | Tests | Riesgo residual |
|---|---|---|---|---|---|---|
| QA-001 | Fuga de memoria por petición dinámica | P1 | **CERRADO** | heap tras GC 1410 → 52 MB en soak; RSS 2135 → 720 MB (`k6/reports/ab-antes.txt`, `ab-despues.txt`) | `supabase-servidor-barrera`, `supabase-timeouts` | Ninguno conocido; repetir en staging |
| QA-002 | `/api/salud` filtraba configuración | P2 | **CERRADO** | público = `{ok:true}` | `salud.test.ts` | `SALUD_SECRETO` por definir |
| QA-003 | Feedback de ayuda sin tope | P2 | **CERRADO** | 429 antes de leer el cuerpo | `limites.test.ts` | — |
| QA-004 | Límite solo en memoria por instancia | P2 | **CERRADO en código** | interfaz `RateLimitStore`, Upstash opcional | `limites.test.ts` | Distribuido solo con credenciales (no contratado) |
| QA-005 | CSP en Report-Only con `unsafe-eval` | P2 | **PARCIAL** | sin `unsafe-eval`; `CSP_MODO`; 0 violaciones medidas | `csp.test.ts`, `csp-violaciones.cjs` | No bloquea hasta validar login real en staging |
| QA-006 | Sin tiempo límite a Supabase | P2 | **CERRADO** | lecturas abortan a 4 s (público) / 10 s (API); escrituras nunca | `supabase-timeouts.test.ts` (servidor HTTP real) | Escrituras colgadas dependen del límite de Vercel |
| QA-007 | LCP alto | P2 | **CERRADO con residuo** | ver Performance | `medios-optimizar`, `ficha-cache` | Listado ~3,4 s en 4G lenta |
| QA-008 | CLS de `/entrar` | P2 | **CERRADO** | CLS < 0,1 en Pixel 7 / iPad / escritorio | `entrar-cls.e2e.ts`, `entrar-medida-inicial.test.ts` | Sin comprobar mutación contra la build base |
| QA-009 | Ficha sin caché | P3 | **CERRADO** | `unstable_cache` + etiqueta `ficha` | `ficha-cache.test.ts` | — |
| QA-010 | Catálogo completo al navegador | P3 | **ACEPTADO** | degradación probada | `chaos-catalogo.test.ts` (8) | Paginar al pasar de ~100 |
| QA-011/012/013/014/019 | Endpoints de diagnóstico, cabeceras, cobertura, portal | P3 | **ABIERTO** | fuera de R-01…R-17 | — | Bajo |
| QA-015 | Rama de degradación del catálogo | P3 | CERRADO (D-62) | — | `chaos-catalogo.test.ts` | — |
| QA-016 | Índices FK / RLS | P4 | ABIERTO | requiere migración 35 (no autorizada) | — | Bajo |
| QA-017 | Observabilidad | P3 | **PARCIAL** | métricas internas + `/api/admin/salud` | `salud.test.ts` | Sin APM ni logs > 1 h (plan) |
| QA-018 | Baselines visuales obsoletos / suite de sesión | P3 | **CERRADO** | 45/45 vigentes; sesión 95/95 | `baselines-visuales.test.ts` | Panel depende de datos fijos, no de login real |
| QA-020 | Concurrencia real de RPCs | P2 | **CERRADO en local** | Postgres 17 + trigger real, 6/6 | `concurrencia-real.test.ts` (`QA_CONCURRENCIA=1`) | Repetir en staging |
| QA-021 | 25 eventos `property_view` por mi prueba | P4 | **LISTO** | `docs/QA/QA-021-correccion.sql` | `guardia-produccion.test.ts` (barrera) | Esperando autorización |

Conteo conciliado: **P0 = 0 · P1 = 0 abiertos · P2 críticos abiertos = 0** (QA-005 parcial y QA-004 sin servicio externo son configuración, no código). FAIL = 0; P4 = 2.

## Performance
**A) Soak de memoria** (`ab-memoria.sh`, 7-oct 08:26–08:45; ANTES = E-33, DESPUÉS = E-33 + solo el parche R-01, no E-34 completo; escalones + soak en el mismo proceso; heap vivo tras GC forzado; **no reproducido en esta ronda**): antes 1410 MB → después **52 MB** (−96 %); RSS 2135 → 720 MB. Tras ~1500 peticiones a la ficha: 111 → 64 MB.
**Latencia en el soak (73–76 req/s):** p95 101 → 71 ms, p99 833 → 142 ms, 0 % errores en ambos. A 300 req/s (D-62) p95 212 → 105 ms; sin errores a 450 req/s.
**B) Benchmark de capacidad: BLOCKED.** Referencia histórica D-62 (no es evidencia de E-34): la cifra vigente sigue siendo la de D-62 (segura ~200 req/s, degradada 300, quiebre ~390 por proceso). **El A/B de capacidad repetido en esta ronda NO es válido:** dos trabajos se pisaron al lanzarse, el portátil pasó a batería durante la corrida y la guarda abortó la del candidato. Sus archivos quedaron como `INVALIDO-*`. Pendiente repetirlo enchufado y con una sola corrida.
**Web Vitals (local, réplica, sin limitar red; base → candidato):** portada 390 px LCP 836 → 432 ms; `/propiedades` 390 px: el LCP local sin limitar red **no mejora** (748 → 1208 ms, la réplica local ya lo servía rápido) pero el peso baja 6,2 MB → 1,2 MB, que es lo que pesa en red real; con 4G lenta el listado queda ~3,4 s (residuo); `/propiedades` 1440 px bytes 6,3 MB → 1,5 MB; ficha 390 px LCP 7948 → 1004 ms, 768 px 8904 → 1080 ms. CLS `/entrar`: 0,31–0,48 → < 0,1 (e2e). Producción real: los LCP de 8–17 s de D-62 no se re-midieron (no se desplegó).
**Pendiente de medir:** latencia p95 con CPU libre en el candidato (por la guarda de batería).

## Seguridad
- P0 0 · P1 0. Semgrep (`p/typescript` + `p/owasp-top-ten`, `src/lib` y `src/app/api`): **0 hallazgos**. Trivy (secretos): **0**.
- Trivy dependencias (HIGH/CRITICAL, 15): `next 16.3.4 → 16.3.6` (RCE en `next/og`; **no se usa** `next/og`), `websocket-driver`, `ws`, `sharp`, `js-yaml`, `browserslist`, `@grpc/grpc-js`, `@modelcontextprotocol/sdk`, `braces`, `source-map-js`. Actualizar dependencias cambia el candidato: **requiere autorización** y una pasada completa de pruebas.
- Abiertos: QA-005 (CSP en bloqueo), QA-011/012/013.
- Hallazgo de proceso: un servidor de pruebas heredó la clave de servicio real por arrancarlo desde un shell con `.env.local`; solo habló con la réplica local. Reiniciado con entorno explícito (observación 0010).

## Cobertura (matriz D-62, 137 funciones)
PASS 31 · PASS CON OBSERVACIÓN 78 · BLOCKED 25 · N/A 3 · **FAIL 0**. Las 25 BLOCKED necesitan staging con login (`STAGING.md`); no se reclasificó ninguna sin evidencia.

## QA
| Suite | Resultado |
|---|---|
| `tsc --noEmit` | limpio |
| Vitest completo | 110 archivos + 1 omitido · **2095 pasan**, 6 omitidas (opt-in: concurrencia real) |
| Concurrencia real (Docker Postgres 17.6) | 6/6 |
| Playwright visual (público + panel, candidato) | **45/45** |
| Playwright e2e (sesión, CLS, publicador, revisión) | **95 pasan**, 9 omitidas por diseño |
| ESLint en archivos tocados | errores solo preexistentes (`set-state-in-effect`, `no-explicit-any`, `Date.now` en la ficha) |
| Semgrep / Trivy | ver Seguridad |
| k6 | ver Performance |
| axe | no se volvió a ejecutar en esta ronda (sin cambios de marcado accesible) |

## Producción
**NO MODIFICADA.** Las pruebas con navegador pasan por `guardia-produccion.cjs` (aborta telemetría/escrituras antes de salir). Las lecturas a Supabase real fueron anónimas y de solo lectura (fixtura de baselines).

## Riesgos pendientes
1. **Sin revisión independiente de Codex**: cupo agotado hasta 2026-11-01 (L1 de D-62 sí se hizo). Hueco que bloquea cualquier promoción.
2. CSP sin bloqueo real; límite compartido sin Upstash.
3. Latencia/capacidad medida en una sola máquina y con réplica (Supabase y producción bajo carga no medidos).
4. Dependencias con CVE HIGH/CRITICAL (Trivy).
5. El árbol de trabajo contiene cambios ajenos de V-1.1.95 sin commitear; el candidato E-34 los excluye por composición.

## Siguiente autorización requerida
1. **QA-021**: «QA-021 listo para corrección exacta; 25 filas identificadas; esperando autorización explícita para ejecutar limpieza de producción.»
2. Rama de Supabase para staging (de pago) y proyecto Firebase de staging.
3. Subir el candidato E-34 a Vercel (sin alias) para humo.
4. Credenciales Upstash, `SALUD_SECRETO` y paso de `CSP_MODO` a bloquear tras staging.
5. Actualizar dependencias (Trivy) y reabrir revisión con Codex (o revisor alternativo).
6. Promoción — solo con manifiesto/hashes, árbol exacto, escaneo de secretos, tsc, pruebas, build, Playwright, seguridad, Codex, humo y rollback.
