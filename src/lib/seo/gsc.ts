/**
 * Cliente de solo lectura de la API de Search Console (Fase B del apartado SEO, 23-oct-2026).
 *
 * Sin claves de cuenta de servicio: la organización las bloquea (`iam.managed.disableServiceAccountKeyCreation`). Se usa federación de identidad:
 *  1. Vercel entrega un token OIDC temporal de la ejecución (cabecera `x-vercel-oidc-token`).
 *  2. Se cambia en Google STS por un token federado del grupo de identidad.
 *  3. Con ese token se pide a IAM Credentials un token de acceso de la cuenta de servicio, solo con el alcance `webmasters.readonly`.
 * Todo con `fetch` inyectable: las pruebas no salen a internet y no hace falta ninguna dependencia nueva.
 */

export type ConfigGsc = { proyecto: string; cuenta: string; pool: string; proveedor: string; sitio: string }
export type LecturaConfig = { ok: true; config: ConfigGsc } | { ok: false; faltan: string[] }

const VARIABLES = {
  proyecto: 'GCP_PROJECT_NUMBER',
  cuenta: 'GCP_SERVICE_ACCOUNT_EMAIL',
  pool: 'GCP_WORKLOAD_IDENTITY_POOL_ID',
  proveedor: 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  sitio: 'GSC_SITE_URL',
} as const

/** Lee la configuración del entorno. Si falta algo, dice QUÉ (nombres de variables, nunca valores). */
export function leerConfigGsc(env: Record<string, string | undefined>): LecturaConfig {
  const faltan: string[] = []
  const config = {} as Record<keyof ConfigGsc, string>
  for (const [campo, nombre] of Object.entries(VARIABLES) as [keyof ConfigGsc, string][]) {
    const v = env[nombre]?.trim()
    if (v) config[campo] = v
    else faltan.push(nombre)
  }
  if (faltan.length) return { ok: false, faltan }
  // Los valores se meten en URL y audiencias: solo caracteres esperados.
  if (!/^\d{6,20}$/.test(config.proyecto)) return { ok: false, faltan: [`${VARIABLES.proyecto} (debe ser el número del proyecto)`] }
  if (!/^[\w.-]+@[\w-]+\.iam\.gserviceaccount\.com$/.test(config.cuenta)) return { ok: false, faltan: [`${VARIABLES.cuenta} (no parece una cuenta de servicio)`] }
  if (!/^[\w-]{1,100}$/.test(config.pool) || !/^[\w-]{1,100}$/.test(config.proveedor)) return { ok: false, faltan: [`${VARIABLES.pool} / ${VARIABLES.proveedor} (solo letras, números y guiones)`] }
  if (!/^(sc-domain:[\w.-]+|https?:\/\/[^\s]+\/)$/.test(config.sitio)) return { ok: false, faltan: [`${VARIABLES.sitio} (sc-domain:dominio o URL con «/» final)`] }
  return { ok: true, config }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** Mensaje corto del error de Google, sin credenciales ni cuerpo completo. */
async function falla(r: Response, paso: string): Promise<never> {
  let detalle = ''
  try { const j = (await r.json()) as { error?: { message?: string } | string; error_description?: string }; detalle = typeof j.error === 'string' ? (j.error_description ?? j.error) : (j.error?.message ?? '') } catch { /* sin cuerpo */ }
  throw new Error(`${paso}: HTTP ${r.status}${detalle ? ` — ${detalle.slice(0, 200)}` : ''}`)
}

export const ALCANCE_SEARCH_CONSOLE = 'https://www.googleapis.com/auth/webmasters.readonly'
export const ALCANCE_ANALYTICS = 'https://www.googleapis.com/auth/analytics.readonly'

/** Token de acceso, solo de LECTURA (Search Console por defecto; Analytics con `ALCANCE_ANALYTICS`), a partir del token OIDC de Vercel. */
export async function tokenDeAcceso(config: ConfigGsc, tokenOidc: string, fetcher: Fetcher = fetch, alcance: string = ALCANCE_SEARCH_CONSOLE): Promise<string> {
  const audiencia = `//iam.googleapis.com/projects/${config.proyecto}/locations/global/workloadIdentityPools/${config.pool}/providers/${config.proveedor}`
  const sts = await fetcher('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience: audiencia,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      subjectToken: tokenOidc,
    }),
  })
  if (!sts.ok) await falla(sts, 'Intercambio de identidad con Google')
  const federado = ((await sts.json()) as { access_token?: string }).access_token
  if (!federado) throw new Error('Google no devolvió un token federado.')

  const iam = await fetcher(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(config.cuenta)}:generateAccessToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${federado}` },
    body: JSON.stringify({ scope: [alcance] }),
  })
  if (!iam.ok) await falla(iam, 'Token de la cuenta de servicio')
  const acceso = ((await iam.json()) as { accessToken?: string }).accessToken
  if (!acceso) throw new Error('Google no devolvió el token de acceso.')
  return acceso
}

export type DimensionGsc = 'query' | 'page' | 'device' | 'country' | 'date'
export const DIMENSIONES: readonly DimensionGsc[] = ['query', 'page', 'device', 'country', 'date']
export type FilaGsc = { clave: string; clics: number; impresiones: number; ctr: number; posicion: number }
export type RangoGsc = { desde: string; hasta: string; dias: number }

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Los datos de Search Console llegan con 2–3 días de retraso: el rango termina 3 días antes de `hoy`. */
export function rangoDeDias(dias: number, hoy: Date = new Date()): RangoGsc {
  const hasta = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 3))
  const desde = new Date(hasta.getTime() - (dias - 1) * 86_400_000)
  return { desde: iso(desde), hasta: iso(hasta), dias }
}

/** Rendimiento agrupado por una dimensión. CTR en porcentaje (igual que las exportaciones CSV). Máximo 250 filas. */
export async function consultarRendimiento(
  token: string, sitio: string, op: { dimension: DimensionGsc; dias: number; hoy?: Date }, fetcher: Fetcher = fetch,
): Promise<{ rango: RangoGsc; filas: FilaGsc[] }> {
  const rango = rangoDeDias(op.dias, op.hoy)
  const r = await fetcher(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(sitio)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ startDate: rango.desde, endDate: rango.hasta, dimensions: [op.dimension], rowLimit: 250, dataState: 'final' }),
  })
  if (!r.ok) await falla(r, 'Consulta a Search Console')
  const j = (await r.json()) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> }
  const filas = (j.rows ?? []).map((f) => ({
    clave: f.keys?.[0] ?? '', clics: f.clicks ?? 0, impresiones: f.impressions ?? 0, ctr: (f.ctr ?? 0) * 100, posicion: f.position ?? 0,
  })).filter((f) => f.clave)
  return { rango, filas }
}
