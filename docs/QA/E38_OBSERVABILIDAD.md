# E-38 — Observabilidad (8-oct-2026) · preparado, NO desplegado

Base: producción E-35 (+ E-36/E-37 en el árbol de trabajo). Objetivo: dejar de depender solo de la ventana de 1 hora de los logs de Vercel Hobby y poder **correlacionar** una petición fallida **sin exponer** nada sensible. Nada de infraestructura nueva, nada de pago, ninguna variable de entorno nueva.

## Qué hay ahora (y qué se añadió)
| Pieza | Estado |
|---|---|
| `lib/metricas.ts` (R-11) | contadores y latencias en memoria; **E-38 añade p99** |
| `lib/registro-seguro.ts` (**nuevo**) | `registrarError` / `registrarEvento`: **una línea JSON** con nivel, evento, hora, `despliegue`, **id de petición** (`x-vercel-id`), método, **ruta sin consulta**, nombre del error y mensaje **truncado y limpio**; `extra` redactado. **Nunca** pila, cuerpo, cabeceras, cookies ni la consulta |
| `lib/http-metricas.ts` (**nuevo**) | `conMetricas(nombre, handler)`: contadores `http.<n>.2xx/3xx/4xx/5xx`, latencia (p50/p95/p99), **una línea de aviso por cada 5xx** y **una línea de error saneada por cada excepción** (que se relanza intacta). El nombre es fijo (no viene de la petición) |
| `lib/umbrales.ts` (**nuevo**) | umbrales iniciales y `evaluarUmbrales` → `estado: ok \| atencion` + qué umbral se pasó |
| Rutas medidas | `catalogo` (GET), `salud` (GET), `ayuda/feedback` (POST), `usuarios/me` (GET) |
| `GET /api/admin/salud` | ahora incluye `metricas` (con p99) y **`umbrales`** |

### Qué se registra y qué no (probado)
Se sustituyen por etiqueta: **JWT** (`[jwt]`), **Bearer/Basic**, **token de bot de Telegram** (`[token-bot]`), **correos**, **teléfonos/números largos**, y parámetros `?token=`/`apikey=`/`password=`…; se redactan por nombre de clave `authorization, cookie, token, password, secret, apiKey, service_role, session, email, correo, teléfono, whatsapp, dirección, curp, rfc, nombre, apellido`. Texto inocente (códigos de error, rutas, tiempos) se conserva. 21 pruebas en `tests/e38-observabilidad.test.ts` (nunca lanza, ni con objetos circulares).

## Métricas definidas
| Qué | Dónde |
|---|---|
| requests por estado (2xx/3xx/4xx/5xx) | `metricas.contadores['http.<grupo>.<n>xx']` |
| latencia p50/p95/p99 | `metricas.latencias['http.<grupo>']` (ventana de 200) |
| memoria | `metricas.memoria` (heap y RSS) |
| timeouts de Supabase, 429, lecturas de ficha fallidas | contadores de R-11 (`supabase.timeout.*`, `limite.429`, …) |
Limitaciones honestas: viven **en la memoria de cada instancia** (se reinician con cada despliegue/arranque y no se suman entre instancias); `catalogo` está en caché de Next (`revalidate=300`), así que su contador cuenta las **regeneraciones**, no cada visita. Sirven para ver QUÉ pasa, no para facturar ni para un SLA.

## Salud
- **`GET /api/salud` (pública):** exactamente `{"ok":true}`, `no-store`, sin tocar la base (probado). Sigue así.
- **`GET /api/admin/salud` (admin o `x-salud-secreto`):** detalle de configuración (solo verdadero/falso), métricas y umbrales; `private, no-store`. Probado que **no devuelve valores de entorno** (se fijan secretos en la prueba y se comprueba que no aparecen) y que sin sesión ni secreto responde 401. Nunca pila, cadenas de conexión ni variables.

## Umbrales iniciales (a partir de lo medido; se ajustan con tráfico real)
| Señal | Umbral | Origen |
|---|---|---|
| 5xx de un grupo | > **1 %** con ≥ 20 muestras | evita alarmas por 1 fallo en 3 peticiones |
| p95 de API | > **500 ms** | propuesta de D-62 (E-34 en carga segura: p95 ≈ 40 ms) |
| p95 de página SSR (ficha) | > **1000 ms** | propuesta de D-62 |
| memoria RSS | > **900 MB** | E-34 ≈ 570 MB tras 450 req/s; E-33 llegaba a ~2 GB |
| heap | > **400 MB** | el soak sano deja ~50 MB |
**Alertas:** no se creó infraestructura de alertas (ruido y coste). Opción gratuita lista: un monitor externo que consulte `/api/admin/salud` con la cabecera `x-salud-secreto` y avise cuando `umbrales.estado !== 'ok'`. Eso requiere **definir la variable de entorno `SALUD_SECRETO` en Vercel → necesita tu autorización**.

## Rastreo de errores (Sentry): evaluado, NO instalado
- No hay integración ni paquete (`@sentry/*` no está en `package.json`).
- Instalarlo implica: cuenta de Sentry, DSN como variable de entorno (**necesita tu autorización**), `@sentry/nextjs` (peso en el JS del cliente que habría que medir contra LCP/TBT) y sourcemaps (token de autenticación).
- Datos que enviaría: errores de servidor y de cliente, ruta, despliegue, entorno. **Configuración exigida si se adopta:** `sendDefaultPii: false`, `beforeSend`/`beforeBreadcrumb` que reutilicen `redactar()` de `registro-seguro.ts` (sin cookies, `Authorization`, cuerpos ni correos), ignorar errores de red de Firebase/Google, nivel gratuito (Developer, ~5 000 errores/mes).
- Recomendación: adoptarlo cuando haya tráfico real y tras tu visto bueno; mientras tanto la base de este bloque (líneas JSON saneadas + métricas + umbrales) cubre lo esencial sin pagar nada.
- **Errores de cliente:** hoy `error.tsx` solo muestra la pantalla; no se reportan al servidor. Pendiente (P3) con Sentry o con un endpoint propio sin PII.

## Retención de logs
Vercel Hobby: **1 hora** de registros de runtime. Las líneas JSON de E-38 son consultables con `vercel logs` en esa ventana; para más retención haría falta Pro (1 día) o un drenaje de logs (de pago). Se documenta; no se contrata nada.

## Verificación
`tsc` limpio · `tests/e38-observabilidad.test.ts` 21/21 (+ salud, chaos-catalogo, e35, límites: 68 verdes en el repo) · build OK · servidor real: `/api/admin/salud` con secreto de prueba devuelve contadores (`http.salud.2xx: 7`, `http.usuarios_me.4xx: 1`), latencias p50/p95/p99, memoria y `umbrales.estado = ok`; sin secreto 401. **Codex:** BLOCKED por cuota (6-nov-2026).
**Archivos (payload):** `src/lib/registro-seguro.ts`, `http-metricas.ts`, `umbrales.ts` (nuevos), `src/lib/metricas.ts`, `src/app/api/{catalogo,salud,ayuda/feedback,usuarios/me,admin/salud}/route.ts`. **QA:** `tests/e38-observabilidad.test.ts`. Sincronizados al repo (idéntico a producción en esos archivos).
**Lección (reincidencia, obs. 0006):** al escribir una expresión regular con `\b` desde un script de shell quedó un carácter de control (retroceso) en vez de `\b`; la prueba lo cazó. **Barrera en E-39:** guardia estática que falla ante caracteres de control en `src/`.
**Pendiente / P3:** `SALUD_SECRETO` + monitor externo (autorización), Sentry (autorización), errores de cliente, p99 de rutas SSR de ficha (la ficha no está envuelta: usa `resolverFicha` con su propio presupuesto). **Rollback:** restaurar los 9 archivos de E-35.
