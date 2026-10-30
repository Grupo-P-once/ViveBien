# Entorno de staging y QA autenticado (R-12 · R-14, D-62)

**Estado:** diseñado y con barrera de código; **sin crear** — falta autorización para el único elemento de pago (rama de Supabase).

## Separación de entornos
| Entorno | Para qué | Datos | Escrituras |
|---|---|---|---|
| Producción (`vivebienn.com`) | Fuente visual de verdad; solo lectura y humo | reales | **nunca** desde QA (`scripts/qa/guardia-produccion.cjs`) |
| Local (`localhost`) | Desarrollo | réplica Supabase (`tests/performance/mock-supabase.mjs`) o PGlite/Docker | a la réplica, nada sale |
| Staging (Vercel candidato + Supabase **rama**) | Validación autenticada y concurrencia por HTTP | sintéticos | permitidas, aisladas |

## Barrera
`scripts/qa/entorno-staging.ts` se niega a continuar si alguna variable apunta a producción (Supabase `uztss…`, Firebase `vivebien-84685`, Cloudinary, dominio) o si hay tokens reales de Telegram/Resend/WhatsApp/CRON. 6 pruebas en `tests/entorno-staging.test.ts`. No imprime valores.

## Variables necesarias (nombres, nunca valores)
`ENTORNO_QA=staging`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (proyecto Firebase **distinto**), `ADMIN_EMAILS` (solo cuentas QA), `SALUD_SECRETO` (propio), `TELEGRAM_BOT_TOKEN`/`RESEND_API_KEY`/`WHATSAPP_TOKEN` vacíos o `mock`.

## Cuentas de QA (convención)
`qa+admin@…`, `qa+publicador@…`, `qa+asociado@…`, `qa+cliente@…` en el proyecto Firebase de staging; datos con prefijo `QA-` para limpiarlos con una sola consulta. Las credenciales se guardan en el gestor del usuario, no en el repo.

## Lo que falta y quién decide
1. **Rama de Supabase para staging** (de pago): requiere autorización explícita. Alternativa gratuita ya operativa: Docker `postgres:17.6` + `tests/concurrencia-real.test.ts` (6/6) para concurrencia, y la réplica para UI.
2. Proyecto Firebase de staging (gratis) y su configuración de dominio autorizado.
3. Con 1 y 2: correr las **25 funciones BLOCKED** de la matriz (login real, cambio de cuenta, cola de revisión, citas con flag apagado) con `playwright.sesion.config.ts` apuntando a staging.
4. Con staging real: validar `CSP_MODO=bloquear` (R-05) iniciando sesión con Google y Firebase; hoy el CSP corre en modo informe.

## Limpieza
Todo dato de QA lleva `QA-`; limpieza = `delete … where … like 'QA-%'` sobre la **rama**, o borrar la rama. Nunca sobre producción.
