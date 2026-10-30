/**
 * Contadores internos de la instancia (R-11 / observabilidad, D-62). En memoria, por instancia: sirven para ver QUÉ pasa, no para
 * facturar nada. Se leen en `GET /api/admin/salud` (solo administrador). NUNCA guardan valores de usuario: solo nombres de evento
 * fijos y rutas sin parámetros. No reemplazan a un APM (QA-017): son la base mínima y gratuita.
 */
type Contadores = Record<string, number>

const desde = Date.now()
const contadores: Contadores = {}
const lat: Record<string, number[]> = {}

/** Cuenta un evento con nombre fijo (p. ej. `supabase.timeout.publico`, `limite.429`, `http.5xx`). */
export function contar(nombre: string, n = 1): void {
  contadores[nombre] = (contadores[nombre] ?? 0) + n
}

/** Registra una latencia (ms) en una ventana deslizante pequeña (últimas 200) para sacar p50/p95 sin guardar nada más. */
export function medir(nombre: string, ms: number): void {
  const v = (lat[nombre] ??= [])
  v.push(ms)
  if (v.length > 200) v.shift()
}

function percentil(v: number[], p: number): number | null {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))])
}

export function instantanea() {
  const mem = process.memoryUsage()
  return {
    instanciaDesdeMs: Date.now() - desde,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    memoria: { heapUsadoMB: Math.round(mem.heapUsed / 1048576), rssMB: Math.round(mem.rss / 1048576) },
    contadores: { ...contadores },
    latencias: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, { n: v.length, p50: percentil(v, 50), p95: percentil(v, 95), p99: percentil(v, 99) }])),
  }
}

/** Solo para pruebas. */
export function reiniciarMetricas(): void {
  for (const k of Object.keys(contadores)) delete contadores[k]
  for (const k of Object.keys(lat)) delete lat[k]
}
