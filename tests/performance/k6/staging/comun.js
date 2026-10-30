// Piezas COMUNES de los escenarios de carga de STAGING (28-oct-2026). PREPARADOS, NO EJECUTADOS: correrlos exige la autorización específica del dueño.
//
// Guardas de seguridad (se evalúan al iniciar; si fallan, k6 se detiene ANTES de enviar una sola petición):
//   · BASE_URL es obligatoria y NUNCA puede ser `vivebienn.com` (producción) ni un dominio ajeno.
//   · Solo se aceptan `localhost`/`127.0.0.1` (pruebas del propio guion) o un host de staging (`vive-bien-staging…`).
//   · Solo GET de LECTURA: no escribe datos, no llama a rutas con límite por IP (`/api/valuador`, `/api/eventos`, `/api/favoritos`, `/api/contacto`…), no envía correos ni avisos.
//   · El acceso protegido (SSO de Vercel) se pasa por la variable de entorno `VERCEL_BYPASS` que el dueño define en SU terminal. Este código NO la imprime, NO la registra
//     y solo la envía en la cabecera `x-vercel-protection-bypass`. Nunca se pide ni se pega en el chat.
import http from 'k6/http'
import { Counter, Trend } from 'k6/metrics'

export const BASE = (__ENV.BASE_URL || '').replace(/\/+$/, '')
if (!BASE) throw new Error('Falta BASE_URL: la URL del staging AUTORIZADO (nunca producción).')
if (/vivebienn\.com/i.test(BASE)) throw new Error('PROHIBIDO: estos escenarios jamás se apuntan a producción (vivebienn.com).')
if (!/^https?:\/\/(localhost|127\.0\.0\.1|[a-z0-9-]*vive-bien-staging[a-z0-9.-]*\.vercel\.app)(:\d+)?$/i.test(BASE)) {
  throw new Error('BASE_URL no es localhost ni un host de staging reconocido (vive-bien-staging…vercel.app).')
}
export const SLUG_FICHA = __ENV.SLUG_FICHA || ''            // slug de una ficha PUBLICADA del staging (opcional; sin él se omite la ficha)
const CABECERAS = __ENV.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': __ENV.VERCEL_BYPASS, 'x-vercel-set-bypass-cookie': 'true' } : {}

// Cotas de PARO (seguridad, no calidad): la prueba se aborta sola. Ajustables por variable de entorno; el valor por defecto es conservador.
export const PARO_ERRORES = Number(__ENV.PARO_ERRORES || 0.05)   // 5 % de peticiones fallidas
export const PARO_P95_MS = Number(__ENV.PARO_P95_MS || 5000)     // p95 > 5 s sostenido
export const PARO_429 = Number(__ENV.PARO_429 || 0.02)           // 2 % de 429: algo limita (cuota del proveedor o límite de la app) → se detiene

export const solicitudesPorVisita = new Trend('solicitudes_por_visita')
export const respuestas429 = new Counter('respuestas_429')
export const respuestasNoEsperadas = new Counter('respuestas_no_esperadas')

let enIteracion = 0
export function iniciarVisita() { enIteracion = 0 }
export function cerrarVisita() { solicitudesPorVisita.add(enIteracion) }

/** GET de lectura con etiqueta de endpoint y control de estado. NUNCA reintenta (un reintento oculta el problema y duplica la carga). */
export function leer(nombre, ruta, esperados = [200]) {
  const r = http.get(BASE + ruta, { headers: CABECERAS, tags: { name: nombre }, redirects: 0, timeout: '30s', responseCallback: http.expectedStatuses.apply(null, esperados) })
  enIteracion++
  if (r.status === 429) respuestas429.add(1)
  if (!esperados.includes(r.status)) respuestasNoEsperadas.add(1)
  return r
}

/** Umbrales de PARO + lo que se reporta. `delayAbortEval` evita abortar por el arranque en frío. */
export function umbralesDeParo() {
  return {
    http_req_failed: [{ threshold: `rate<${PARO_ERRORES}`, abortOnFail: true, delayAbortEval: '1m' }],
    http_req_duration: [{ threshold: `p(95)<${PARO_P95_MS}`, abortOnFail: true, delayAbortEval: '1m' }],
    respuestas_429: [{ threshold: 'count<20', abortOnFail: true }],
  }
}
