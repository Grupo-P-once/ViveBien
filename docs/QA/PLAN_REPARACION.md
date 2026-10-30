# Plan de reparación, roadmap, capacidad y puntuación — QA integral (7-oct-2026)

> **ESTADO FINAL DE QA-021 (supera cualquier «pendiente» de este documento):** **CLEANED**. Las 25 filas `property_view` (ids 188–212) se eliminaron el 8-oct-2026 con autorización explícita (D-66) y el contador `propiedades.vistas` se corrigió 27 → 2 (E-35.2, D-67). Eventos legítimos restantes: 179 y 180. Las menciones de «pendiente de autorización», «listo para corrección» o «no ejecutado» son el estado histórico al momento de escribirlas. Detalle: `docs/QA/E35_SEGURIDAD_Y_FRONTERAS.md`.

> **ACTUALIZACIÓN 7-oct-2026 (D-63):** la campaña R-01…R-17 implementó en código lo marcado CERRADO en `DEFECTOS.md` (sin desplegar, sin migraciones). La numeración R-xx de la campaña es la del encargo, no la de esta tabla; el mapeo vigente está en `QA_REPARACION_2026-10-07.md`. Lo que sigue abierto: QA-011/012/013/014/016/019 (fuera de la campaña) y lo que exige autorización (QA-021, staging, Upstash, CSP en bloqueo).
>
> *Texto original de la fase de diagnóstico:* **Nada de esto está implementado.** Cada reparación espera tu autorización por fases. Las que tocan código pasan por el flujo habitual (rama → pruebas → Codex → candidato → smoke → tu autorización de promoción).

## 1. Plan por prioridad y grupo

Estimación relativa: S (horas) · M (1 día) · L (varios días).

### P1 — antes del siguiente release
| ID | Grupo | Problema | Solución | Archivos | Migración | Riesgo | Test necesario | Resultado esperado (medido en copia) | Est. |
|---|---|---|---|---|---|---|---|---|---|
| R-01 (QA-001) | PERFORMANCE / INFRA | Retención de memoria por petición dinámica | Opciones sin temporizadores en los 9 `createClient` de servidor; un solo helper `clienteServidor()` para no repetirlo | `lib/auth-server.ts`, `lib/ficha-servidor.ts`, `lib/ayuda/consultas.ts`, `app/api/admin/propiedades/route.ts`, `app/api/alertas/resumen/route.ts`, `app/api/ayuda/feedback/route.ts`, `app/api/catalogo/route.ts`, `app/sitemap.ts` | No | Bajo | Prueba que falle si un `createClient` de servidor no lleva las opciones + prueba de memoria (`heap-probe`) en CI opcional | Memoria viva estable (+7 MB tras 4 500 peticiones dinámicas, antes +117 MB por 1 500); p95 a 300 req/s 212→105 ms; 0 % de errores a 450 req/s | S |

### P2 — seguridad y resiliencia
| ID | Grupo | Problema | Solución | Archivos | Migración | Riesgo | Test | Est. |
|---|---|---|---|---|---|---|---|---|
| R-02 (QA-002) | SEGURIDAD | `/api/salud` filtra configuración | Público = `{ok}`; detalle solo ADMIN/secreto | `app/api/salud/route.ts` | No | Bajo (revisar quién la consulta: diagnóstico de login) | Forma de la respuesta pública fija | S |
| R-03 (QA-003) | SEGURIDAD | `feedback` sin tope | `frenar()` por origen y por artículo | `app/api/ayuda/feedback/route.ts` | No | Bajo | 429 tras N | S |
| R-04 (QA-004) | SEGURIDAD / INFRA | Límite en memoria por instancia | Contador compartido (Upstash/Vercel KV) o WAF/BotID | `lib/limites.ts` | No | Medio (dependencia) | Pruebas de `frenar` con almacén simulado | M |
| R-05 (QA-005) | SEGURIDAD | CSP solo Report-Only | Medir reportes → quitar `unsafe-eval` → CSP real con nonces | `next.config.ts`, `lib/csp.ts` | No | Medio (puede romper Firebase/Maps/GTM) | e2e de login/mapas con CSP activa | M |
| R-06 (QA-006) | RESILIENCIA | Sin tiempo límite a Supabase | `AbortSignal.timeout` en el cliente de servidor; ficha: una sola consulta (`or`) en vez de 3 secuenciales | helper `clienteServidor()` + `lib/ficha-servidor.ts` | No | Bajo | `tests/chaos-*` ampliadas (colgada/lenta) | M |
| R-07 (QA-007) | PERFORMANCE / UX | LCP y peso de imágenes | Desplegar la optimización de imágenes de V-1.1.95; `fetchpriority` y `sizes` en el héroe; héroe propio (no Unsplash) | `components/PropertyCard.tsx`, `lib/medios/optimizar.ts`, `app/page-client.tsx` | No | Medio (visual) | Playwright 4 anchos + LCP < 2,5 s en la ficha | M |
| R-08 (QA-008) | UX | CLS en `/entrar` | Reservar espacio / precargar fuente | `components/acceso/Entrar.tsx`, `globals.css` | No | Bajo | CLS < 0,1 en 390/768 | S |
| R-09 (QA-020) | CONCURRENCIA | Carrera real de RPCs sin probar | Rama de Supabase (branching) + dos sesiones QA; prueba de dos admins sobre el mismo usuario | infra + `tests/` | No | Bajo | 409 y reintento | M |

### P3 — mejora importante
| ID | Grupo | Solución | Est. |
|---|---|---|---|
| R-10 (QA-009) | CACHE / PERFORMANCE | Ficha con caché por etiqueta (revalida al cambiar estado, ya existe `refrescarCatalogo`); ISR de ayuda | M |
| R-11 (QA-011/012/013) | SEGURIDAD | Cerrar el GET anónimo de `/api/admin/propiedades` y `telegram/webhook`; `Cache-Control: private, no-store` en APIs con sesión | S |
| R-12 (QA-014) | CALIDAD | Pruebas de contrato (auth + forma) para las 22 rutas sin cobertura | L |
| R-13 (QA-017) | OBSERVABILIDAD | Vercel Pro (logs 1 día+), `@vercel/otel`, Speed Insights, alertas de p95/5xx a Telegram | M |
| R-14 (QA-018) | CALIDAD | Refrescar o retirar los baselines visuales; script `qa:sesion` con réplica + flags | S |
| R-15 (QA-019) | UX / RESILIENCIA | Portal: distinguir «cerrado» de «no se pudo leer» (503 con mensaje) | S |

### P4 — cuando crezca
| ID | Solución | Migración |
|---|---|---|
| R-16 (QA-010) | Paginación/filtros en servidor del catálogo al pasar de ~100 propiedades | No |
| R-17 (QA-016) | Índices de 3 FK; documentar «RLS sin política = cerrada» | **Sí (35, no aplicada)** |

## 2. Roadmap

| Fase | Contenido | Dependencias |
|---|---|---|
| **1 · Críticos** | R-01 (memoria) | ninguna |
| **2 · Seguridad** | R-02, R-03, R-11, luego R-04 y R-05 | R-04 requiere servicio externo |
| **3 · Performance** | R-06, R-07, R-08, R-10 | R-07 depende de desplegar V-1.1.95 |
| **4 · Escalabilidad** | R-09 (BD de pruebas/branching), R-04 compartido, R-16 | decisión de infraestructura |
| **5 · UX** | R-08, R-15, revisar CLS/LCP con datos reales (Speed Insights) | R-13 |
| **6 · Optimización** | R-12, R-14, R-17 | — |
| **7 · Hardening** | CSP estricta, WAF/BotID, revisión periódica con `tests/performance` en CI nocturno | R-05 |

## 3. Capacidad real (medida; sin inventar cifras)

**Qué se midió y qué no.** La carga se aplicó a una copia **aislada** del código en producción (E-33: `next start`, **un** proceso Node, Supabase de réplica en memoria que **no toca producción**; k6 y servidor comparten una máquina de 16 hilos). Por reglas, **producción no se sometió a carga** (solo smoke de 5 usuarios virtuales) y no existe base de pruebas: la capacidad de **Supabase bajo carga NO se midió**.

| Concepto | Valor medido | Condición |
|---|---|---|
| **CAPACIDAD ACTUAL SEGURA** | **~200 peticiones/s sostenidas** (p50 4 ms, p95 39 ms, p99 85 ms, 0 % errores) | 1 proceso, mezcla pública realista, latencia de BD ≈ 0 |
| **CAPACIDAD DEGRADADA** | **300 req/s**: p95 212 ms, p99 595 ms, primeras iteraciones descartadas | igual |
| **PRIMEROS ERRORES** | objetivo 450 req/s (logrados 387): **p95 6,2 s, 5 % de errores** | igual |
| **BREAKPOINT** | **~390 req/s** (código actual). Con R-01 aplicado: sin errores a 450 pero p95 3,0 s; satura entre 415 y 510 req/s | igual |
| Recuperación | La sonda volvió a 18 ms de mediana al terminar la presión; sin errores durante la recuperación | `local-07-recovery.md` |
| Soak (6 min, 40 VU, 78 req/s) | 0 % errores, pero **la memoria sube linealmente 243→1 320 MB** (QA-001) | `memoria-soak-actual.csv` |
| Producción (smoke 5 VU, 230 peticiones) | p50 196 ms · p95 331 ms · p99 582 ms globales (desde esta máquina, incluye red); 0 % errores | `prod-01-smoke.md` |

**Conversión a «usuarios concurrentes» (supuesto explícito, no medición):** una sesión humana genera ~1 petición cada 3–5 s; 200 req/s ≈ 600–1 000 usuarios activos por instancia. Vercel (Fluid compute) escala horizontalmente, así que el techo de producción lo fija lo que **no** escala solo: Supabase (plan y pool, no medido), límites del plan Hobby, y servicios de terceros.

| | |
|---|---|
| **Principal cuello de botella** | **Next.js/Node (CPU de SSR dinámico)**: la ficha cuesta ~10× una página estática (p50 700 ms vs 70 ms en saturación) y los artículos de ayuda pesan 110–125 KB de HTML |
| **Segundo** | **Código de la app (API)**: retención de memoria por petición dinámica (QA-001) que además alarga la cola de latencia |
| **Tercero** | **Supabase (red/BD) sin tiempo límite** (QA-006): una base lenta o colgada arrastra toda la petición |
| Origen del límite | Next.js/Node + uso de la librería de Supabase (no Vercel como infraestructura) |
| Límites **no medidos** (riesgo) | Supabase (plan/pool), Firebase Auth, Cloudinary (ancho de banda de imágenes sin transformar), plan Hobby de Vercel (logs 1 h) |

## 4. Puntuación (0–100) con evidencia

| Dimensión | Pts | Evidencia a favor | Evidencia en contra |
|---|---|---|---|
| FUNCIONALIDAD | **72** | 2 007 pruebas Vitest + PGlite pasan; smoke de producción 23/23; sesión 92/92; 109 de 137 funciones con evidencia | 25 funciones BLOCKED (sin login real ni BD de pruebas); citas OFF; subida real de imágenes sin ejercitar |
| SEGURIDAD | **76** | Toda ruta protegida responde 401 sin sesión; RLS alineada con la app (mig. 34); sin XSS/SQLi reflejados ni errores verbosos; topes en las rutas públicas de escritura; IDOR/escalamiento cubiertos por pruebas | `/api/salud` filtra configuración; CSP solo Report-Only; límite en memoria; `feedback` sin tope |
| PERFORMANCE | **55** | Servidor muy rápido bajo carga normal (p95 < 40 ms hasta 200 req/s); catálogo cacheado en el borde | **LCP 8–17 s** en la ficha; 5,2 MB de imágenes en el listado; ficha sin caché; fuga de memoria |
| ESCALABILIDAD | **55** | Stateless sobre Vercel Fluid, BD con índices adecuados (catálogo de 20 000 filas: 27 ms) | Fuga por petición; catálogo sin paginación; límite por instancia; techo de Supabase desconocido |
| RESILIENCIA | **62** | Catálogo con copia vieja + 503 honesto + aviso (ahora con 6 pruebas); ficha con respaldo en el navegador; recuperación sin errores | Sin tiempos límite (colgada = 45 s+); portal 404 si no se leen flags; concurrencia real no probada |
| UX | **70** | 4 anchos sin desborde en las pruebas; axe sin serias; a11y cuidada | CLS 0,29–0,45 en `/entrar`; LCP; baselines visuales obsoletos (no auditado de nuevo a fondo) |
| OBSERVABILIDAD | **45** | `audit_logs` atómico, aviso a Telegram si cae la BD, `/api/salud`, barrera de QA | Logs de 1 h (Hobby), sin APM ni alertas de latencia, sin Web Vitals reales |
| MANTENIBILIDAD | **82** | 100 archivos de prueba, ADR/decisiones D-1…D-62, barreras estructurales (tests de arquitectura), skills + Task Observer | 22 rutas sin prueba directa; baselines visuales rotos; funciones largas en rutas |
