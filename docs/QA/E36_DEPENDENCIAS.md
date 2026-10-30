# E-36 — Dependencias y CVEs (8-oct-2026)

**Resultado:** `npm audit` **23 → 14** (crítico **2 → 0**, alto 16 → 12, moderado 4 → 2, bajo 1 → 0). Cambios: `next` 16.3.4 → **16.3.8** (único cambio de `package.json`) y el lockfile (`npm update` puntual de 14 transitivas). Sin majors, sin `npm audit fix --force`, sin tocar V-1.1.95. **No desplegado.**
Escala: **A** explotable/relevante en producción · **B** transitiva pero alcanzable · **C** no alcanzable · **D** solo desarrollo/build/herramienta · **E** falso positivo/no aplica.

## Antes / después
| | crítico | alto | moderado | bajo | total |
|---|---|---|---|---|---|
| Antes (E-35) | 2 | 16 | 4 | 1 | 23 |
| Después (E-36) | 0 | 12 | 2 | 0 | 14 |
Trivy: ver sección «Verificación».

## Inventario completo (todas las avisadas por npm audit en E-35)
| dependencia | instalada antes | instalada después | severidad | CVE / GHSA | directa / transitiva | runtime / dev | clase | estado y razón |
|---|---|---|---|---|---|---|---|---|
| `next` | 16.3.4 | 16.3.8 | critical | [critical] Next.js: Remote Code Execution in next/og ImageResponse (GHSA-vcvr-r3jv-pc5j)<br>[moderate] Next.js: Pending `use cache` fill can leak Draft Mode content into reg (GHSA-3w37-wq28-93x7)<br>[moderate] Next.js has cache poisoning of SSG and ISR pages in self-hosted applic (GHSA-4jqv-mc3x-m676) | directa | runtime | **A** | ✔ resuelta — No usamos `next/og` ni `use cache` (grep en `src/`), pero es el framework en producción: se actualiza el parche 16.3.4→16.3.8 (sin cambio de API). |
| `websocket-driver` | 0.7.4 | 0.7.5 | critical | [moderate] websocket-driver: Resource limit bypass via message compression (GHSA-mp7j-qc5w-4988)<br>[critical] websocket-driver: Message corruption via abuse of protocol length head (GHSA-xv26-6w52-cph6) | transitiva (firebase → @firebase/database → faye-websocket) | runtime (cliente) | **B** | ✔ resuelta — Actualizado 0.7.4→0.7.5 por lockfile. |
| `@grpc/grpc-js` | 1.14.5, 1.9.15 | 1.14.5, 1.9.16 | high | [high] @grpc/grpc-js: A malformed request can cause a server crash (GHSA-5375-pq7m-f5r2)<br>[high] @grpc/grpc-js: An incoming malformed compressed message can cause a cl (GHSA-99f4-grh7-6pcq)<br>[high] @grpc/grpc-js: In certain configurations, getAuthContext can return un (GHSA-m9gg-hp2v-232j) | transitiva (firebase-admin ✔ actualizado a 1.14.5; @firebase/firestore ✘ fija ~1.9.0) | la copia 1.9.16 vive en `@firebase/firestore`, que `src/` NO importa (grep de `firebase/firestore` y `getFirestore` = 0) | **C** | ✘ abierta (no accesible / sin arreglo) — La copia de firebase-admin se actualizó. La de `@firebase/firestore` no tiene arreglo posible: incluso `firebase@12.19.0` (última 12.x) la sigue fijando a `~1.9.0`; el «arreglo» de npm es bajar a `firebase@9.14.0` (major, en sentido contrario). Rechazado; no accesible. |
| `@modelcontextprotocol/sdk` | 1.30.0 | 1.32.1 | high | [high] MCP TypeScript SDK: OAuth client could send credentials to an authoriz (GHSA-6qxp-vccf-f47h) | transitiva (shadcn) | herramienta (CLI) | **D** | ✔ resuelta — Actualizado 1.30.0→1.31.x por lockfile (el cliente OAuth del SDK MCP no se ejecuta en producción). |
| `@next/eslint-plugin-next` | 16.2.1 | 16.2.1 | high | por dependencia | transitiva (eslint-config-next) | solo desarrollo (lint) | **D** | ✘ abierta (no accesible / sin arreglo) — Hereda `fast-glob`/`micromatch`/`braces` sin versión corregida; el «arreglo» de npm es bajar a `eslint-config-next@14.2.35` (major hacia atrás). Rechazado. |
| `@ts-morph/common` | 0.27.0 | 0.27.0 | high | por dependencia | transitiva (shadcn) | herramienta (CLI) | **D** | ✘ abierta (no accesible / sin arreglo) — Ver `shadcn`. |
| `brace-expansion` | 1.1.12, 2.1.7, 5.0.12, 5.0.5 | 1.1.21, 2.1.7, 5.0.12 | high | [moderate] brace-expansion: Zero-step sequence causes process hang and memory exh (GHSA-f886-m6hf-6m8v)<br>[moderate] brace-expansion: Large numeric range defeats documented `max` DoS prot (GHSA-jxxr-4gwj-5jf2)<br>[high] brace-expansion: DoS via exponential-time expansion of consecutive non (GHSA-3jxr-9vmj-r5cp) | transitiva (varias herramientas) | build/herramienta | **D** | ✔ resuelta — Actualizado por lockfile. |
| `braces` | 3.0.3 | 3.0.3 | high | [high] braces vulnerable to stack-exhaustion denial of service through deeply (GHSA-vfj7-8cjw-p6xm) | transitiva | solo desarrollo / CLI | **D** | ✘ abierta (no accesible / sin arreglo) — Sin versión corregida publicada. DoS por agotamiento de pila en entradas hostiles; solo procesa patrones de nuestros propios archivos de configuración. |
| `browserslist` | 4.28.1 | 4.29.3 | high | [high] Browserslist: Unbounded memory growth (no cache eviction) via distinct (GHSA-c83g-rgw3-j3cx)<br>[high] Browserslist: Uncaught crash / prototype write via untrusted browsersl (GHSA-73wf-gq98-2v4g) | transitiva (shadcn/@babel) | build/herramienta | **D** | ✔ resuelta — Actualizado 4.28.1→4.29.3. |
| `eslint-config-next` | 16.2.1 | 16.2.1 | high | por dependencia | directa (dev) | solo desarrollo (lint) | **D** | ✘ abierta (no accesible / sin arreglo) — Ver `@next/eslint-plugin-next`. |
| `fast-glob` | 3.3.1, 3.3.3 | 3.3.1, 3.3.3 | high | por dependencia | transitiva (eslint-config-next, shadcn) | solo desarrollo / CLI | **D** | ✘ abierta (no accesible / sin arreglo) — `braces` no tiene ninguna versión corregida (rango `*`). |
| `js-yaml` | 4.1.1 | 4.3.2 | high | [moderate] JS-YAML: Quadratic-complexity DoS in merge key handling via repeated a (GHSA-h67p-54hq-rp68)<br>[high] js-yaml: YAML merge-key chains can force quadratic CPU consumption (GHSA-52cp-r559-cp3m)<br>[high] JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x)  (GHSA-5p4m-2wfm-xmqj) | transitiva (shadcn → cosmiconfig) | build/herramienta | **E** | ✔ resuelta — Actualizado 4.1.1→4.3.2. |
| `micromatch` | 4.0.8 | 4.0.8 | high | por dependencia | transitiva | solo desarrollo / CLI | **D** | ✘ abierta (no accesible / sin arreglo) — Ver `fast-glob`. |
| `shadcn` | 4.21.0 | 4.21.0 | high | por dependencia | directa | herramienta (CLI) + `shadcn/tailwind.css` en build | **D** | ✘ abierta (no accesible / sin arreglo) — La CLI no corre en producción; solo se importa su CSS en build. El «arreglo» de npm es `shadcn@1.0.0` (major hacia atrás): rechazado. Recomendación P3: moverla a `devDependencies`. |
| `sharp` | 0.35.4 | 0.35.5 | high | [high] sharp : Vulnerability in librsvg dependency CVE-2026-96889 (GHSA-wq5f-xc86-pv6w) | transitiva (next) | runtime (optimización de imágenes) | **A** | ✔ resuelta — Actualizado 0.35.4→0.35.5 por lockfile. |
| `source-map-js` | 1.2.1 | 1.2.2 | high | [high] source-map-js allows event-loop denial of service through indexed sour (GHSA-68fv-2mgg-jv7q) | transitiva (next/postcss) | build | **B** | ✔ resuelta — Actualizado 1.2.1→1.2.2. |
| `ts-morph` | 26.0.0 | 26.0.0 | high | por dependencia | transitiva (shadcn) | herramienta (CLI) | **D** | ✘ abierta (no accesible / sin arreglo) — Ver `shadcn`. |
| `ws` | 8.20.0 | 8.22.0 | high | [moderate] ws: Uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx)<br>[high] ws: Memory exhaustion DoS from tiny fragments and data chunks (GHSA-96hv-2xvq-fx4p) | transitiva (@supabase/realtime-js) | runtime | **B** | ✔ resuelta — Actualizado 8.20.0→8.22.0 por lockfile. |
| `@humanfs/node` | 0.16.7 | 0.16.8 | moderate | [moderate] humanfs: Recursive copy follows symlinked files and copies data from o (GHSA-p498-v437-472g) | transitiva (eslint) | solo desarrollo | **D** | ✔ resuelta — Actualizado por lockfile. |
| `baseline-browser-mapping` | 2.10.10 | 2.11.27 | moderate | [moderate] baseline-browser-mapping process termination on invalid input causes d (GHSA-w5vr-8v7q-w6rv) | transitiva (next/shadcn) | build | **D** | ✔ resuelta — Actualizado por lockfile. |
| `gaxios` | 6.7.1, 7.1.3, 7.3.1 | 6.7.1, 7.1.3, 7.3.1 | moderate | por dependencia | transitiva (firebase-admin → @google-cloud/storage) | servidor (no se usa Storage) | **C** | ✘ abierta (no accesible / sin arreglo) — Hereda `uuid@9`. `npm audit fix` lo «arreglaba» bajando gaxios 6.7.1→6.3.0 y subiendo todo Firebase (71 paquetes): rechazado por desproporcionado. |
| `uuid` | 9.0.1 | 9.0.1 | moderate | [moderate] uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided (GHSA-w5hq-g745-h8pq) | transitiva (gaxios) | servidor | **C** | ✘ abierta (no accesible / sin arreglo) — La falla es «sin comprobación de límites en v3/v5/v6 **cuando se pasa `buf`**»; gaxios usa v4 sin buffer. No alcanzable. |
| `@babel/core` | 7.29.0 | 7.29.7 | low | [low] @babel/core: Arbitrary File Read via sourceMappingURL Comment (GHSA-4x5r-pxfx-6jf8) | transitiva (shadcn) | herramienta | **D** | ✔ resuelta — Actualizado por lockfile. |

## Decisiones
- **`next/og`:** verificado con grep en `src/`: no se importa `next/og` ni `ImageResponse`; tampoco `use cache`. La RCE no era alcanzable, pero `next` es la pieza central y el parche es seguro: se actualizó igual.
- **Lo que NO se hizo (a propósito):** `npm audit fix` (arrastraba +70 paquetes de Firebase y bajaba `gaxios`), `--force` (proponía bajar `shadcn` a 1.0.0, `eslint-config-next` a 14.2.35 y `firebase` a 9.14.0: majors hacia atrás), `firebase` 12.19.0 (probado: no elimina el aviso, revertido), mover `shadcn` a devDependencies (hecho posible, sin cambio de riesgo real; P3).
- **Abiertas (14):** todas son clase C (no alcanzables: Firestore no se usa; `uuid` sin `buf`) o D (herramientas de desarrollo/CLI sin versión corregida). Ninguna es A ni B.
- Nada se cerró como «no aplica» sin evidencia: cada fila cita la razón y, cuando es alcanzabilidad, el `grep`/versión usados.

## Verificación (E-36)
| Control | Antes (E-35) | Después (E-36) |
|---|---|---|
| `npm audit` total / crítico / alto | 23 / 2 / 16 | **14 / 0 / 12** |
| Trivy HIGH+CRITICAL (filesystem) | 10 (2 críticos: `next`, `websocket-driver`) | **2** (`@grpc/grpc-js` 1.9.16 dentro de `@firebase/firestore`, clase C; `braces`, clase D) |
| Semgrep | 0 hallazgos | sin cambios de código en `src/` (solo `package.json`/lockfile): no se repite |
| `tsc --noEmit` | limpio | limpio |
| Vitest | 2080 pasan (+8 ajenos) | 2079 pasan, 6 omitidas, 8 fallos = los mismos ajenos (V-1.1.95 y artefactos solo del repo) |
| Build (`next build`, réplica aislada) | OK | OK |
| Playwright visual (45) | 45/45 | 44 + 1 timeout de 30 s en frío (`catalogo` móvil) que **pasa 2/2 al repetirlo**: flaky de arranque, no regresión |
| Playwright e2e (sesión, CLS, publicador, revisión) | 95 pasan | **95 pasan**, 9 omitidas por diseño |
| axe (E-35 vs E-36) | 8/108/204/3 | 8/108/204/3 en las 23 mediciones completadas, **0 regresiones** (1 medición —`/entrar` a 390 px— expiró en frío; se repite en E-37) |
**Codex:** BLOCKED por cuota (disponible el 6-nov-2026); no se sustituye con auto-revisión. El cambio es un parche de `next` + actualizaciones de lockfile sin tocar código.
**Archivos modificados (E-36):** `package.json` (`next` `^16.3.4` → `^16.3.8`) y `package-lock.json` (14 transitivas: sharp, ws, websocket-driver, @grpc/grpc-js, source-map-js, js-yaml, browserslist, brace-expansion, baseline-browser-mapping, uuid-gaxios (sin cambio), @humanfs/node, @babel/core, @modelcontextprotocol/sdk, next). Sincronizados al repo (que era idéntico a producción en ambos archivos); **Pendiente (decisión tuya):** ejecutar `npm ci` en el repo para que su `node_modules` coincida con el nuevo lockfile (no se hizo para no alterar tu entorno de desarrollo con V-1.1.95).
**Pendiente (no bloquea):** P3 — mover `shadcn` a `devDependencies` (hoy en `dependencies`, es una CLI); revisar de nuevo cuando Firebase publique una versión de `@firebase/firestore` sin `@grpc/grpc-js ~1.9`; `braces` sin versión corregida.
**Rollback:** restaurar `package.json` y `package-lock.json` de E-35 (producción) y reinstalar; el código no cambió.
