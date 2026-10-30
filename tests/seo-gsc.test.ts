import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consultarRendimiento, leerConfigGsc, rangoDeDias, tokenDeAcceso, type ConfigGsc } from '../src/lib/seo/gsc'

/** Fase B del apartado SEO (23-oct-2026): lectura de Search Console con identidad federada de Vercel, sin claves. Nada sale a internet: `fetch` es de mentira. */

const ENTORNO = {
  GCP_PROJECT_NUMBER: '820817523792',
  GCP_SERVICE_ACCOUNT_EMAIL: 'vivebien-seo-lector@light-reality-508621-r9.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel',
  GSC_SITE_URL: 'sc-domain:vivebienn.com',
}
const CONFIG = leerConfigGsc(ENTORNO) as { ok: true; config: ConfigGsc }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })

describe('leerConfigGsc', () => {
  it('con las 5 variables correctas devuelve la configuración', () => {
    expect(CONFIG.ok).toBe(true)
    expect(CONFIG.config.sitio).toBe('sc-domain:vivebienn.com')
  })
  it('si falta algo dice QUÉ variables faltan (nombres, no valores)', () => {
    const r = leerConfigGsc({ ...ENTORNO, GCP_PROJECT_NUMBER: undefined, GSC_SITE_URL: '  ' })
    expect(r).toEqual({ ok: false, faltan: ['GCP_PROJECT_NUMBER', 'GSC_SITE_URL'] })
  })
  it('rechaza valores que no tienen la forma esperada (se usan dentro de URL)', () => {
    expect(leerConfigGsc({ ...ENTORNO, GCP_PROJECT_NUMBER: '12/../x' }).ok).toBe(false)
    expect(leerConfigGsc({ ...ENTORNO, GCP_SERVICE_ACCOUNT_EMAIL: 'alguien@gmail.com' }).ok).toBe(false)
    expect(leerConfigGsc({ ...ENTORNO, GCP_WORKLOAD_IDENTITY_POOL_ID: 'a/b' }).ok).toBe(false)
    expect(leerConfigGsc({ ...ENTORNO, GSC_SITE_URL: 'vivebienn.com' }).ok).toBe(false)
  })
  it('acepta también una propiedad de prefijo de URL con «/» final', () => {
    expect(leerConfigGsc({ ...ENTORNO, GSC_SITE_URL: 'https://vivebienn.com/' }).ok).toBe(true)
  })
})

describe('tokenDeAcceso', () => {
  it('cambia el token de Vercel por uno federado y luego por el de la cuenta de servicio, solo lectura', async () => {
    const llamadas: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init })
      return url.includes('sts.googleapis.com') ? json({ access_token: 'FEDERADO' }) : json({ accessToken: 'ACCESO' })
    })
    const t = await tokenDeAcceso(CONFIG.config, 'OIDC-DE-VERCEL', fetcher)
    expect(t).toBe('ACCESO')

    const sts = JSON.parse(String(llamadas[0].init?.body))
    expect(sts.audience).toBe('//iam.googleapis.com/projects/820817523792/locations/global/workloadIdentityPools/vercel/providers/vercel')
    expect(sts.subjectToken).toBe('OIDC-DE-VERCEL')
    expect(sts.subjectTokenType).toBe('urn:ietf:params:oauth:token-type:jwt')

    expect(llamadas[1].url).toContain('/serviceAccounts/vivebien-seo-lector%40light-reality-508621-r9.iam.gserviceaccount.com:generateAccessToken')
    expect((llamadas[1].init?.headers as Record<string, string>).authorization).toBe('Bearer FEDERADO')
    // Alcance mínimo: solo lectura de Search Console.
    expect(JSON.parse(String(llamadas[1].init?.body)).scope).toEqual(['https://www.googleapis.com/auth/webmasters.readonly'])
  })
  it('si Google rechaza la identidad, el error dice en qué paso y no incluye el token', async () => {
    const fetcher = async () => json({ error: 'invalid_grant', error_description: 'The audience is not allowed.' }, 400)
    const e = await tokenDeAcceso(CONFIG.config, 'SECRETO-OIDC', fetcher).catch((x: Error) => x)
    expect((e as Error).message).toContain('Intercambio de identidad con Google: HTTP 400')
    expect((e as Error).message).not.toContain('SECRETO-OIDC')
  })
  it('si la cuenta de servicio no puede ser usada (falta el permiso de identidad), falla en el segundo paso', async () => {
    const fetcher = async (url: string) => (url.includes('sts.') ? json({ access_token: 'F' }) : json({ error: { message: 'Permission denied' } }, 403))
    await expect(tokenDeAcceso(CONFIG.config, 'x', fetcher)).rejects.toThrow('Token de la cuenta de servicio: HTTP 403 — Permission denied')
  })
})

describe('rangoDeDias', () => {
  it('termina 3 días antes de hoy (retraso de Search Console) y cuenta los días completos', () => {
    expect(rangoDeDias(28, new Date('2026-10-23T12:00:00Z'))).toEqual({ desde: '2026-09-23', hasta: '2026-10-20', dias: 28 })
    expect(rangoDeDias(7, new Date('2026-10-23T12:00:00Z'))).toEqual({ desde: '2026-10-14', hasta: '2026-10-20', dias: 7 })
  })
})

describe('consultarRendimiento', () => {
  const hoy = new Date('2026-10-23T12:00:00Z')
  it('pide la dimensión y devuelve filas con CTR en porcentaje (como las exportaciones CSV)', async () => {
    let pedido: { url: string; body: Record<string, unknown> } | null = null
    const fetcher = async (url: string, init?: RequestInit) => {
      pedido = { url, body: JSON.parse(String(init?.body)) }
      return json({ rows: [
        { keys: ['valuador'], clicks: 2, impressions: 40, ctr: 0.05, position: 8.25 },
        { keys: ['vive inmobiliaria'], clicks: 0, impressions: 11, ctr: 0, position: 12 },
        { clicks: 9 },   // sin clave: se descarta
      ] })
    }
    const r = await consultarRendimiento('TOKEN', 'sc-domain:vivebienn.com', { dimension: 'query', dias: 28, hoy }, fetcher)
    expect(pedido!.url).toBe('https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Avivebienn.com/searchAnalytics/query')
    expect(pedido!.body).toMatchObject({ startDate: '2026-09-23', endDate: '2026-10-20', dimensions: ['query'], dataState: 'final' })
    expect(r.filas).toEqual([
      { clave: 'valuador', clics: 2, impresiones: 40, ctr: 5, posicion: 8.25 },
      { clave: 'vive inmobiliaria', clics: 0, impresiones: 11, ctr: 0, posicion: 12 },
    ])
  })
  it('sin filas devuelve una lista vacía; con error de Google lanza con el estado', async () => {
    expect((await consultarRendimiento('T', 's', { dimension: 'page', dias: 7, hoy }, async () => json({}))).filas).toEqual([])
    await expect(consultarRendimiento('T', 's', { dimension: 'page', dias: 7, hoy }, async () => json({ error: { message: 'User does not have sufficient permission' } }, 403)))
      .rejects.toThrow('Consulta a Search Console: HTTP 403 — User does not have sufficient permission')
  })
})

// ---- La ruta ----
const estado = vi.hoisted(() => ({ perfil: null as null | { uid: string; rol: string; superAdmin: boolean } }))
vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  return {
    ...real,
    exigir: async (_r: Request, permiso: string) => (estado.perfil && puede(estado.perfil as never, permiso as never)
      ? { perfil: estado.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: estado.perfil ? 403 : 401 }) }),
  }
})

describe('GET /api/admin/seo/gsc', () => {
  const pedir = (q = '', cab: Record<string, string> = {}) => new Request(`https://preview.test/api/admin/seo/gsc${q}`, { headers: cab })
  const guardado = { ...process.env }
  beforeEach(() => { estado.perfil = { uid: 'su', rol: 'admin', superAdmin: true }; Object.assign(process.env, ENTORNO) })
  afterEach(() => { process.env = { ...guardado }; vi.unstubAllGlobals() })

  it('un admin que no es Super Admin recibe 403 y sin sesión 401', async () => {
    const { GET } = await import('../src/app/api/admin/seo/gsc/route')
    estado.perfil = { uid: 'ad', rol: 'admin', superAdmin: false }
    expect((await GET(pedir())).status).toBe(403)
    estado.perfil = null
    expect((await GET(pedir())).status).toBe(401)
  })
  it('valida la dimensión y el rango', async () => {
    const { GET } = await import('../src/app/api/admin/seo/gsc/route')
    expect((await GET(pedir('?dimension=otra'))).status).toBe(400)
    expect((await GET(pedir('?dias=1000'))).status).toBe(400)
  })
  it('sin configuración responde 200 con los NOMBRES de lo que falta, sin llamar a Google', async () => {
    const { GET } = await import('../src/app/api/admin/seo/gsc/route')
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    delete process.env.GSC_SITE_URL
    const r = await GET(pedir())
    expect(await r.json()).toEqual({ configurado: false, faltan: ['GSC_SITE_URL'] })
    expect(f).not.toHaveBeenCalled()
  })
  it('sin token de Vercel (ejecución local) avisa sin fallar', async () => {
    const { GET } = await import('../src/app/api/admin/seo/gsc/route')
    delete process.env.VERCEL_OIDC_TOKEN
    const j = await (await GET(pedir())).json()
    expect(j.configurado).toBe(false)
    expect(j.faltan[0]).toContain('token OIDC')
  })
  it('con todo configurado trae filas en vivo usando el token de la cabecera', async () => {
    const { GET } = await import('../src/app/api/admin/seo/gsc/route')
    const vistos: string[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      vistos.push(url)
      if (url.includes('sts.')) return json({ access_token: 'F' })
      if (url.includes('iamcredentials')) return json({ accessToken: 'A' })
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer A')
      return json({ rows: [{ keys: ['valuador'], clicks: 1, impressions: 16, ctr: 0.0625, position: 9.1 }] })
    })
    const r = await GET(pedir('?dimension=query&dias=28', { 'x-vercel-oidc-token': 'OIDC' }))
    const j = await r.json()
    expect(j).toMatchObject({ configurado: true, dimension: 'query', filas: [{ clave: 'valuador', clics: 1, impresiones: 16, ctr: 6.25, posicion: 9.1 }] })
    expect(vistos).toHaveLength(3)
    expect(JSON.stringify(j)).not.toContain('OIDC')
  })
  it('si Google falla responde 502 con un mensaje útil y sin detalles internos', async () => {
    const { GET } = await import('../src/app/api/admin/seo/gsc/route')
    vi.stubGlobal('fetch', async () => json({ error: 'x' }, 403))
    const r = await GET(pedir('', { 'x-vercel-oidc-token': 'OIDC' }))
    expect(r.status).toBe(502)
    const j = await r.json()
    expect(j.error).toContain('cuenta de servicio')
    expect(JSON.stringify(j)).not.toContain('403')
  })
})
