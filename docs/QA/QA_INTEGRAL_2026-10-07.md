# QA integral de VIVE BIEN — 7 de octubre de 2026

Campaña de descubrir, medir, documentar y priorizar. **No se desplegó, no se promovió, no se aplicó ninguna migración, no se activaron citas, no se agregaron funciones, no se modificó código de producción** y no se tocaron datos reales (hashes de propiedades/usuarios/invitaciones/flags/fotos/`audit_logs` idénticos antes y después). Producción = E-33 (`dpl_F1tkBFb56q6cuxieQpriz8MazLHt`).

Documentos hermanos: `MATRIZ_MAESTRA.csv` (137 filas × 22 columnas) y `.md`, `DEFECTOS.md`, `PLAN_REPARACION.md` (plan, roadmap, capacidad, puntuación). Evidencia cruda: `tests/performance/k6/reports/`. Cómo repetirlo: `tests/performance/README.md`.

## 1. Resumen ejecutivo

| | |
|---|---|
| Funciones inventariadas | **94 rutas** (43 páginas + 51 APIs, 73 combinaciones ruta×método de API) + sitemap/robots/manifest/404 + 17 funciones transversales = **137 filas** |
| PASS | 31 |
| PASS CON OBSERVACIÓN | 78 |
| BLOCKED (no probado: sin login real, sin BD de pruebas, flag OFF o sin secretos) | 25 |
| NOT APPLICABLE | 3 (`/vista-previa/*`, solo desarrollo; en producción responde 404) |
| FAIL | 0 |
| Defectos | **P0: 0 · P1: 1 · P2: 7 · P3: 10 abiertos (+1 cerrado) · P4: 2** |
| Hallazgo principal | **Retención de memoria por petición dinámica** (QA-001): confirmada con heap tras GC forzado, causa aislada (`createClient` por petición con auto-refresco de sesión) y **corrección validada en una copia aislada** (memoria −70 %, p95 a 300 req/s 212→105 ms, 0 % de errores a 450 req/s). **No aplicada** (plan R-01). |
| Segundo hallazgo | **LCP de 8–17 s** en la ficha y 7–10 s en el listado (imágenes sin transformar): rendimiento percibido pobre aunque el servidor es rápido |
| Seguridad | Sin P0/P1. La superficie protegida responde 401 sin sesión; RLS alineada con la app; sin XSS/SQLi reflejado. Brechas medias: `/api/salud` filtra configuración, CSP solo Report-Only, límite de peticiones en memoria, `feedback` sin tope |
| Lo que NO se pudo probar | Todo flujo **autenticado en vivo** (no hay cuentas QA vigentes; las 3 están suspendidas y yo no invento credenciales), carrera real entre dos administradores (no hay BD de pruebas), subida real a Cloudinary, envío real de Telegram/correo, citas (flag OFF) |

## 2. Fase 0 — Inventario real (de código, no supuesto)

Generado por `inv.py` leyendo `src/app`: **43 páginas** (11 de `/admin`, 9 de `/portal`, 3 de publicador, 4 de ayuda, 3 vistas previas de desarrollo, el resto sitio público/legal/auth), **51 APIs** (`/api/admin/*` 15, `/api/portal/*` 8, `/api/citas/*` 6, el resto públicas, de publicador/propiedades/medios, webhooks y sistema). Además: 1 cron (`/api/alertas/resumen`, 15:00 UTC), 10 flags (`portalCliente=true`; `citasEnLinea`, `publisherPortal` y el resto `false`), 15 capacidades (`aceptar_citas … ver_datos_interesado`), 4 roles (cliente, publicador [modalidad normal/asociado], admin, super_admin), 25+ tablas con RLS, RPCs atómicas (mig. 28, 31, 32, 33) y la política de lectura pública (mig. 34). Dependencias externas: Supabase, Firebase Auth, Cloudinary, Vercel, Telegram, correo (Resend), WhatsApp (webhook), Google (OAuth/Calendar), Unsplash/Google Maps (en el navegador).

Cobertura automática: 100 archivos de prueba / **2 007 pruebas** (todas pasan) + 137 de Playwright. 72 de 94 rutas se nombran en alguna prueba; **22 no** (`DEFECTOS.md` QA-014).

## 3. Fases 1–15 — Resultado por área (matriz completa en `MATRIZ_MAESTRA.csv`)

| Área | Estado | Cómo se probó y qué quedó sin probar |
|---|---|---|
| **AUTH** (login, Google, logout, sesión, cambio de cuenta A→B, suspendido, invitación) | PASS CON OBSERVACIÓN | `sesion.e2e.ts` (92 pruebas × 4 anchos; **92/92** una vez el servidor lee los flags) + `acceso*`, `cambio-de-sesion`, `estado-de-cuenta`, `invitaciones-*` (Vitest). Tras cerrar sesión no queda nada del usuario anterior en `localStorage/sessionStorage/cookies` (verificado en las 4 pruebas de diagnóstico). **No probado:** login real con contraseña/Google (cuentas QA suspendidas; Google en localhost da `unauthorized-domain`). |
| **CLIENTE** (portal, favoritos, búsquedas, alertas, consultas, baja) | PASS CON OBSERVACIÓN | Pruebas de portal/aislamiento/DTO (Vitest), 8 páginas cargan 200 en producción, APIs 401 sin sesión. Contenido autenticado solo simulado. 4 páginas del portal sin prueba directa (BLOCKED). |
| **PUBLICADOR normal / ASOCIADO** | PASS CON OBSERVACIÓN | QA autenticado real ya hecho el 4-oct (D-58: 114/121, P0=P1=0); hoy solo regresión automática (`publicador-completo`, `-seguridad`, `-modalidad`, `-citas`) y Playwright publicador 76/76. Matriz de capacidades **por capacidad efectiva**, nunca por `tipo === asociado` (`permissions.md`, pruebas). |
| **ADMIN / SUPER_ADMIN** | PASS CON OBSERVACIÓN | RPCs atómicas con PGlite; último super admin protegido en SQL; 7 APIs de lectura del panel **sin prueba directa** (BLOCKED en lo funcional; sin sesión 401 ✔). Concurrencia real de dos admins: **BLOCKED** (QA-020). |
| **PROPIEDADES** (ciclo de estados, visibilidad D-59, RLS 34) | PASS | Máquina de estados en SQL (mig. 33) y pruebas; visibilidad pública verificada en vivo en producción (23/23) y con la clave anónima de Supabase (0 filas ocultas, 0 fotos de ocultas). |
| **IMÁGENES** | BLOCKED (subida) | Validación de URL/firma probada (Vitest); la subida real a Cloudinary no se ejercita (claves «sensibles» no descargables, D-58). |
| **BÚSQUEDA Y CATÁLOGO** | PASS CON OBSERVACIÓN | Catálogo 27 KB, edge HIT; DB: 27 ms con 20 000 filas publicadas (consulta con `ORDER BY created_at LIMIT 500`); sin paginación (QA-010). Búsqueda de ayuda con acentos/comas/XSS/SQL: 200 sin reflejo ni 5xx. |
| **LEADS / SOLICITUDES** | PASS CON OBSERVACIÓN | `registro-lead`: valida (400), exige consentimiento, tope 6/h (429 en la 7.ª), escrituras descartadas en la réplica; sin PII real. |
| **CITAS** | BLOCKED en vivo / PASS CON OBS simulado | `citasEnLinea=false`: no se activó. Máquina de estados, capacidades, tokens, correos y solapes probados con PGlite/dobles (`citas*.test.ts`). Enlaces de correo: `POST /api/citas/accion` con token inválido → 410; `accion/ver` → `{valido:false}`. |
| **AUDITORÍA** | PASS CON OBSERVACIÓN | `audit_logs` escrito en la **misma transacción** que el cambio (RPC); 382 filas, sin cambios durante la campaña. Prueba de antes/después/actor en las suites de migración. |
| **SEO / SITEMAP** | PASS | Sitemap con 7 fichas y sin ocultas; robots; manifest; pausada 404 con `noindex`. |
| **WHATSAPP / TELEGRAM / CORREO** | BLOCKED (envío real) | WhatsApp webhook sin firma → 403 ✔; Telegram sin secreto → 503/«No configurado» ✔; no se enviaron avisos reales a propósito. |

## 4. Rendimiento (fases 15–23)

### 4.1 Producción — baseline controlado (k6 smoke, 5 VU, 38 s, solo GET públicos; 230 peticiones, 0 % errores)
Medido **desde esta máquina** (incluye ~250–300 ms de red/TLS).

| Endpoint | p50 ms | p95 | p99 | max |
|---|---|---|---|---|
| global | 196 | 331 | 582 | 1 570 |
| `/api/salud` | 300 | 482 | 503 | 508 |
| `/propiedades/[id]` (slug) | 213 | 763 | 1 396 | 1 570 |
| `/propiedades/[id]` (id) | 261 | 379 | 528 | 568 |
| ficha pausada (404) | 243 | 325 | 400 | 420 |
| `/api/ayuda/buscar` | 216 | 268 | 272 | 272 |
| `/api/catalogo` (edge) | 97 | 185 | 211 | 217 |
| `/`, `/propiedades`, `/ayuda`, `/sitemap.xml` | 123, 100, 111, 81 | 159, 126, 154, 101 | 347, 141, 188, 102 | 399, 145, 198, 102 |

Barrido de las 43 páginas (3 GET, mediana): la más lenta `/propiedades/[id]` **1 291 ms**; artículos de ayuda **1,0–1,2 s** (110–125 KB de HTML); el resto 0,3–0,9 s.

Propuesta de umbrales (a partir de este baseline; **no son criterios previos**): API pública p95 < 500 ms; página SSR p95 < 1 s; estática/edge p95 < 250 ms; error < 0,1 %.

### 4.2 Carga contra la copia aislada (1 proceso Node; ver `PLAN_REPARACION.md` §3)
| Prueba | Resultado |
|---|---|
| **Load** 20 VU, 90 s (2 193 req, 17 req/s) | 0 % errores; global p50 4 ms · p95 18 ms · p99 26 ms |
| **Stress** escalones 10→800 VU (97 958 req, 267 req/s) | 0 % errores HTTP, pero p95 global 3,2 s con 800 VU (ficha 3,6–4,5 s; estáticas 0,8 s) |
| **Escalones de tasa** (constante) | 25–200 req/s: p95 14–39 ms; 300: p95 212 ms; 450: p95 6,2 s y 5 % errores; 600: 30 % errores |
| **Spike** 5→300 VU 45 s (20 631 req) | 0 % errores; p95 global 1,8 s en el pico; ficha 2,6 s |
| **Recovery** (sonda cada 2 s) | línea base 24 ms (0–20 s) → 1 385 ms con 300 VU (20–70 s) → **9 ms a los 10 s de terminar** y 16 ms estable; sin errores |
| **Soak** 40 VU, 6 min (28 390 req) | 0 % errores; **memoria 243 → 1 320 MB lineal** (QA-001) |
| **Breakpoint** (rampa de tasa) | abortó a ~145 req/s con 6 % de errores **porque el proceso ya acumulaba 4,2 GB** de memoria; repetido en limpio con escalones de tasa: ~390 req/s |

Archivos: `local-02..07`, `escalones-*.tsv`, `memoria-*.csv`, `atribucion-memoria.tsv`. **Corrección de una lectura inicial mía:** el crecimiento de RSS de rutas estáticas/cacheadas (`/`, `/propiedades`, `/api/catalogo`, `/sitemap`) es recolección de basura perezosa (el heap vivo tras GC no crece); la retención real es **solo de rutas dinámicas** (QA-001).

### 4.3 Navegador (producción, 3 repeticiones × 4 anchos, sin limitar red; INP no medible sin interacción real)
| Página | TTFB ms | FCP ms | **LCP ms** | CLS | Peticiones |
|---|---|---|---|---|---|
| `/` | 298–408 | 1 228–2 216 | **2 756–4 168** | 0–0,011 | 40–54 |
| `/propiedades` | 295–389 | 804–1 100 | **6 896–10 208** | ≤ 0,049 | 39–57 |
| ficha | 287–338 | 1 212–2 324 | **8 304–16 844** | ≤ 0,005 | 60–80 |
| `/ayuda` | 292–346 | 920–1 640 | 920–1 640 | ≤ 0,148 | 42–65 |
| `/entrar` | 268–334 | 1 128–1 984 | 1 128–6 132 | **0,29–0,45 (390/768)** | 20–21 |
| `/publicador`, `/admin/propiedades/pendientes`, `/portal` | 264–447 | 688–1 620 | 2 420–9 768 | 0 | 26–31 |
Causa del LCP: héroe remoto (Unsplash 1 600 px) y JPG originales de Cloudinary de 1,1–1,5 MB en las tarjetas (5,2 MB de imágenes en `/propiedades`); 0 errores JS en todas las páginas.

### 4.4 Base de datos (solo lectura)
Datos diminutos hoy (9 propiedades, 118 fotos, 8 usuarios). Índices adecuados: `slug` y `folio` únicos, `estado_pub`, `owner_id`, `fotos(propiedad_id, orden)`, citas con GiST anti-solape. Catálogo con 20 000 filas sintéticas (tabla temporal, sin tocar datos): **top-N heapsort, 27 ms**; la BD no es el cuello de botella. Advisors de Supabase: solo INFO (3 FK sin índice, 7 índices sin uso, 25 tablas con RLS y **sin política = cerradas a anon/authenticated a propósito**). Sin N+1 en lo medido; las 2–3 consultas secuenciales de la ficha por id sí suman (QA-006). Conexiones/locks/overhead de RLS bajo carga: **no medibles sin BD de pruebas**.

### 4.5 Caché
Catálogo: `revalidate=300` + «última copia buena» en memoria; en producción `X-Vercel-Cache: HIT` (Age 115 s). Sitemap `revalidate=3600`. Ficha: dinámica sin caché (QA-009). Invalidación al cambiar estado: `refrescarCatalogo()`; tras el cambio D-59 el catálogo tarda hasta 5 min en reflejarlo (conocido). Estado incorrecto por caché: no se observó.

### 4.6 Vercel / runtime
Región `iad1` (misma región que Supabase `us-east-1`), Node 24, **Fluid compute activo**, plan Hobby. Logs de runtime del candidato: sin líneas de error/warning. Arranque en frío: la primera ficha tras despliegue 0,5 s en local; no medible por separado en producción. Cron único diario.

### 4.7 Dependencias externas
| Dependencia | Función | Timeout/reintento/fallback | Riesgo / cuello |
|---|---|---|---|
| Supabase | BD + RLS | Catálogo: 8 s + copia vieja; **resto sin timeout** (QA-006) | Principal; plan/pool no medido |
| Firebase Auth | Identidad (ID token verificado con claves públicas) | Falla cerrado (401) | Google en localhost no autorizado |
| Cloudinary | Imágenes | URL validada; firma en servidor | Imágenes sin transformar (QA-007); claves sensibles |
| Vercel | Hosting, cron, caché | Rollback/promoción probados (E-31/32/33) | Hobby: logs 1 h |
| Telegram / correo | Alertas, avisos | Aviso best-effort (no rompe la petición) | Sin envío real en la campaña |
| WhatsApp | Webhook | Firma → 403 | No probado con Meta |
| Unsplash / Google Maps | Héroe, mapa (navegador) | — | Héroe remoto afecta el LCP |

## 5. Seguridad (fase 14)
Sonda **sin sesión** contra la copia aislada (escrituras descartadas): 73 combinaciones ruta×método, **0 respuestas 5xx por la app** (la excepción, el webhook de Telegram con 503, es «No configurado» por no haber secreto local), 0 respuestas con trazas/secretos, 16 casos de abuso básico: JSON malformado en 5 rutas (400), cuerpo de 1 MB (401, sin 500), XSS/traversal/SQLi en ficha (404) y en la búsqueda de ayuda (200, **sin reflejo**), URL de 20 000 caracteres (431). Rutas protegidas sin 401 en la sonda aislada: `/api/portal/*` → 404 porque allí los flags están apagados; **en producción dan 401** (smoke 23/23). Límites verificados con cargas útiles válidas: `eventos` 429 en la 301.ª (tope 300), `registro-lead` 429 en la 7.ª (tope 6); **`ayuda/feedback`: 400/400 aceptadas** (QA-003). IDOR, escalamiento de rol, campos reservados, URLs de medios, firma y fuga de PII ajena: cubiertos por Vitest (`publicador-seguridad`, `cliente-seguridad`, `consultas-dto`, `medios-firma`, `portal-aislamiento`) y por el QA real del 4-oct. **CSRF:** las APIs usan `Authorization: Bearer` (no cookies), no aplica. **RLS:** `anon` lee solo `publicada` no pausada/eliminada y sus fotos. Hallazgos: QA-002/003/004/005/011/012/013.

## 6. Caos / resiliencia controlada (fase 29; solo copia aislada)
| Escenario (Supabase de réplica) | Resultado |
|---|---|
| BD lenta (+3 s) | ficha 6,0 s (dos consultas secuenciales); API de ayuda 3 s; sin errores |
| BD responde 500 | ficha **200 con `noindex` y `no-store`** (el navegador la reintenta con su cliente); ayuda devuelve vacío; `/api/salud` degrada a `null`; catálogo: copia vieja `desactualizado:true` o 503 honesto (ahora con 6 pruebas) |
| BD caída (conexión cortada) | igual que 500 |
| BD colgada (sin respuesta) | **la petición cuelga >45 s** (QA-006) |
| BD recuperada | todo vuelve a 200 de inmediato |
| Flags ilegibles | portal **404** a clientes con sesión (QA-019) |
| Firebase/Cloudinary/API externas caídas | **BLOCKED** (no simulable sin tocar servicios reales) |

## 7. UX (fase 30)
Playwright existente sobre el código de producción en 390/768/1024/1440: **publicador+revisión 76/76**, **cambio de cuenta 92/92** (con flags), 0 desbordes y 0 errores de consola en el barrido de 8 páginas × 4 anchos. Defectos reales: CLS de `/entrar` (QA-008), LCP (QA-007). Suite de capturas: 33/45 fallan por baselines de hace 3 semanas (QA-018, deriva, no regresión). Navegación por teclado, foco y contraste: cubiertos por las pruebas de accesibilidad previas (D-58, axe sin serias/críticas); no se repitió una auditoría completa.

## 8. Qué está muy bien, qué mal, qué no tocar
- **Muy bien:** disciplina de seguridad (falla cerrado, atomicidad en SQL, RLS alineada), catálogo resiliente, ficha con respaldo, auditoría, 2 007 pruebas, barreras estructurales, CI manual con candidato/rollback, servidor veloz en carga normal.
- **Mal:** memoria por petición (P1), LCP/imágenes, ficha sin caché, ausencia de timeouts, observabilidad básica, `/api/salud`.
- **No tocar:** `lib/visibilidad-publica.ts` + RLS 34, RPCs atómicas (28/31/32/33), `lib/auth-server.ts` salvo las opciones del cliente (R-01), el catálogo con copia vieja, el flujo de candidato/promoción.

## 9. Condición de terminación (fase 39)
1 inventario ✔ · 2 PASS/FAIL/BLOCKED por función ✔ (matriz) · 3 cada rol probado: **parcial** (sin sesión y por pruebas automáticas; en vivo BLOCKED, explicado) · 4 flujos cruzados: sesión A→B ✔ simulado; propiedad→publicación→catálogo ✔ (D-58/D-59) · 5 seguridad ✔ · 6 performance medida ✔ · 7 límites donde es seguro ✔ (aislado) · 8 cuellos ✔ · 9 defectos con evidencia ✔ · 10 plan ✔ · 11 roadmap ✔ · 12 capacidad estimada ✔ (con límites declarados) · 13 riesgos ✔ · 14 sin destrucción de datos reales ✔.

**Limpieza:** no se crearon datos QA en Supabase (la réplica descarta las escrituras: 0 mutaciones; el único acceso a producción fue lectura anónima y smoke). Se borraron la copia `vivebien-perf`, los snapshots de heap (~300 MB) y los restos de Playwright del staging; el staging E-33 sigue idéntico a su manifiesto.
