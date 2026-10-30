/**
 * Guardia de QA para pruebas de NAVEGADOR contra PRODUCCIÓN (R-15, D-62 · observación 0008 · QA-021).
 *
 * POR QUÉ: una prueba «de solo lectura» con un navegador real ejecuta el JavaScript del sitio, y ese JavaScript escribe telemetría
 * (`POST /api/eventos` → `property_view` + contador de vistas) y manda balizas a terceros (Google Analytics). Las pruebas de la campaña D-62
 * dejaron 25 eventos `property_view` reales. Esta guardia hace que eso sea IMPOSIBLE por defecto:
 *   · contra producción solo pasan GET/HEAD/OPTIONS;
 *   · cualquier POST/PUT/PATCH/DELETE a producción se ABORTA ANTES de salir del navegador (la petición no llega a la red);
 *   · cualquier no-GET a un tercero (analítica, balizas) también;
 *   · la telemetría propia (`/api/eventos`) se distingue en el informe como «telemetría»; se puede permitir SOLO con `permitirTelemetria`;
 *   · una escritura real solo se permite con `escrituraAutorizada` (que los scripts exigen por variable de entorno + motivo escrito).
 * Contra el entorno AISLADO (localhost / réplica de Supabase) no restringe nada: allí las escrituras no llegan a producción.
 *
 * Uso (Playwright):  const g = instalarGuardia(contexto, { base })   // antes de abrir la primera página
 *                    ...navegar...   g.bloqueadas  // lo que se evitó
 */
const PRODUCCION = /(^|\.)vivebienn\.com$|\.vercel\.app$/i
const TELEMETRIA_PROPIA = ['/api/eventos']
const LECTURAS = new Set(['GET', 'HEAD', 'OPTIONS'])

function esProduccion(base) {
  try { return PRODUCCION.test(new URL(base).hostname) } catch { return false }
}

/** Decide si una petición puede salir. Pura: se prueba sin navegador. */
function decidirPeticion({ metodo, url, base, permitirTelemetria = false, escrituraAutorizada = false, produccion = esProduccion(base) }) {
  const m = String(metodo || 'GET').toUpperCase()
  if (!produccion) return { permitir: true, razon: 'entorno aislado: las escrituras no llegan a producción' }
  if (LECTURAS.has(m)) return { permitir: true, razon: 'lectura' }
  let u
  try { u = new URL(url) } catch { return { permitir: false, razon: 'URL no válida' } }
  let propio = false
  try { propio = u.hostname === new URL(base).hostname } catch { /* sin base */ }
  if (!propio) return { permitir: false, razon: `baliza/escritura a un tercero (${u.hostname}): bloqueada` }
  if (TELEMETRIA_PROPIA.some((r) => u.pathname === r || u.pathname.startsWith(r + '/'))) {
    return permitirTelemetria
      ? { permitir: true, razon: 'telemetría permitida a propósito' }
      : { permitir: false, razon: 'telemetría comercial (ensuciaría la analítica real): bloqueada' }
  }
  return escrituraAutorizada
    ? { permitir: true, razon: 'escritura autorizada explícitamente' }
    : { permitir: false, razon: `escritura real (${m} ${u.pathname}) contra producción: bloqueada` }
}

/** Instala la guardia en un contexto (o página) de Playwright. Devuelve el registro de lo bloqueado. */
function instalarGuardia(contexto, opciones) {
  const bloqueadas = []
  const permitidas = { lecturas: 0, otras: 0 }
  const ya = contexto.route('**/*', (route) => {
    const r = route.request()
    const d = decidirPeticion({ metodo: r.method(), url: r.url(), ...opciones })
    if (!d.permitir) {
      bloqueadas.push({ metodo: r.method(), url: r.url().slice(0, 140), razon: d.razon })
      return route.abort('blockedbyclient') // ANTES de salir del navegador: no hay petición
    }
    if (LECTURAS.has(r.method().toUpperCase())) permitidas.lecturas++; else permitidas.otras++
    return route.continue()
  })
  return { bloqueadas, permitidas, listo: ya }
}

module.exports = { decidirPeticion, instalarGuardia, esProduccion, TELEMETRIA_PROPIA, PRODUCCION }
