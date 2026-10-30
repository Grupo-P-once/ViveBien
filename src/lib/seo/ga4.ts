/**
 * Lectura de Google Analytics 4 con su API de datos (solo lectura), para la pestaña «Métricas» del Super Admin (24-oct-2026).
 * Misma conexión sin claves que Search Console (`gsc.ts`): token OIDC de Vercel → Google → token de la cuenta de servicio, ahora con el alcance
 * `analytics.readonly`. Se piden cinco informes en UNA sola llamada (`batchRunReports`). `fetch` inyectable: las pruebas no salen a internet.
 */

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export type FilaGa4 = { clave: string; a: number; b: number }
export type ResumenGa4 = {
  dias: number
  totales: { usuarios: number; usuariosNuevos: number; sesiones: number; vistas: number; interaccion: number; duracionMedia: number }
  porDia: Array<{ fecha: string; usuarios: number; sesiones: number }>
  canales: FilaGa4[]     // a = sesiones, b = usuarios
  paginas: FilaGa4[]     // a = vistas,   b = usuarios
  eventos: FilaGa4[]     // a = eventos,  b = usuarios
}

/** Error de la API con el estado y un mensaje corto de Google (nunca el token). */
export class ErrorGa4 extends Error {
  constructor(public estado: number, mensaje: string) { super(`Google Analytics: HTTP ${estado} — ${mensaje}`) }
}

/** Traduce el error de Google a lo que hay que hacer. */
export function causaDelError(e: unknown): { codigo: 'identidad' | 'api_apagada' | 'sin_acceso' | 'propiedad' | 'otro'; ayuda: string } {
  // Un error que NO es de la API de Analytics viene de la autenticación con Google (identidad federada): no se culpa a los permisos de Analytics.
  if (!(e instanceof ErrorGa4)) return { codigo: 'identidad', ayuda: 'No se pudo autenticar con Google. Revisa la conexión sin claves (Workload Identity) y que la cuenta de servicio exista.' }
  const m = e.message
  if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(m)) return { codigo: 'api_apagada', ayuda: 'Falta habilitar «Google Analytics Data API» en el proyecto de Google Cloud.' }
  if (/permission|403|does not have sufficient|PERMISSION_DENIED/i.test(m)) return { codigo: 'sin_acceso', ayuda: 'Falta agregar la cuenta de servicio como «Lector» en la propiedad de Google Analytics (Administrar → Administración de acceso).' }
  if (/404|not found|invalid.*propert/i.test(m)) return { codigo: 'propiedad', ayuda: 'El número de propiedad de Google Analytics no existe o no es de esta cuenta.' }
  return { codigo: 'otro', ayuda: 'No se pudo leer Google Analytics.' }
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
type Fila = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }
type Informe = { rows?: Fila[] }
const d = (f: Fila, i = 0) => f.dimensionValues?.[i]?.value ?? ''
const m = (f: Fila, i = 0) => num(f.metricValues?.[i]?.value)

/** `20261022` → `2026-10-22`. */
export const fechaIso = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s)

export function armarResumen(dias: number, informes: Informe[]): ResumenGa4 {
  const [tot, dia, can, pag, eve] = informes
  const t = tot?.rows?.[0]
  return {
    dias,
    totales: {
      usuarios: t ? m(t, 0) : 0, usuariosNuevos: t ? m(t, 1) : 0, sesiones: t ? m(t, 2) : 0, vistas: t ? m(t, 3) : 0,
      interaccion: t ? Math.round(m(t, 4) * 1000) / 10 : 0,         // tasa de interacción en %
      duracionMedia: t ? Math.round(m(t, 5)) : 0,                      // segundos
    },
    porDia: (dia?.rows ?? []).map((f) => ({ fecha: fechaIso(d(f)), usuarios: m(f, 0), sesiones: m(f, 1) })).sort((x, y) => x.fecha.localeCompare(y.fecha)),
    canales: (can?.rows ?? []).map((f) => ({ clave: d(f) || '(sin canal)', a: m(f, 0), b: m(f, 1) })),
    paginas: (pag?.rows ?? []).map((f) => ({ clave: d(f), a: m(f, 0), b: m(f, 1) })),
    eventos: (eve?.rows ?? []).map((f) => ({ clave: d(f), a: m(f, 0), b: m(f, 1) })),
  }
}

/** Los cinco informes del panel en una sola petición. `propiedad` es el número (sin «properties/»). */
export async function consultarGa4(token: string, propiedad: string, dias: number, fetcher: Fetcher = fetch): Promise<ResumenGa4> {
  if (!/^\d{5,15}$/.test(propiedad)) throw new ErrorGa4(400, 'número de propiedad no válido')
  const rango = [{ startDate: `${dias}daysAgo`, endDate: 'today' }]
  const informe = (dimensions: string[], metrics: string[], extra: Record<string, unknown> = {}) => ({
    dateRanges: rango, dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), ...extra,
  })
  const r = await fetcher(`https://analyticsdata.googleapis.com/v1beta/properties/${propiedad}:batchRunReports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      requests: [
        informe([], ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate', 'averageSessionDuration']),
        informe(['date'], ['activeUsers', 'sessions'], { orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 100 }),
        informe(['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], { orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 }),
        informe(['pagePath'], ['screenPageViews', 'activeUsers'], { orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 15 }),
        informe(['eventName'], ['eventCount', 'activeUsers'], { orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 25 }),
      ],
    }),
  })
  if (!r.ok) {
    let msg = ''
    try { const j = (await r.json()) as { error?: { message?: string } }; msg = j.error?.message ?? '' } catch { /* sin cuerpo */ }
    throw new ErrorGa4(r.status, msg.slice(0, 200))
  }
  const j = (await r.json()) as { reports?: Informe[] }
  return armarResumen(dias, j.reports ?? [])
}
