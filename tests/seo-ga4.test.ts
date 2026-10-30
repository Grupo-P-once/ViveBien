import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armarResumen, causaDelError, consultarGa4, ErrorGa4, fechaIso } from '../src/lib/seo/ga4'

/** Google Analytics en el panel (24-oct-2026): lectura de la API de datos de GA4, solo Super Admin, sin claves. `fetch` de mentira. */

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })
const fila = (dims: string[], mets: Array<number | string>) => ({ dimensionValues: dims.map((value) => ({ value })), metricValues: mets.map((value) => ({ value: String(value) })) })
const INFORMES = [
  { rows: [fila([], [120, 90, 150, 480, 0.6234, 74.4])] },
  { rows: [fila(['20261022'], [5, 6]), fila(['20261021'], [3, 4])] },
  { rows: [fila(['Organic Search'], [100, 80]), fila(['Direct'], [50, 40])] },
  { rows: [fila(['/'], [200, 90]), fila(['/propiedades'], [90, 50])] },
  { rows: [fila(['click_whatsapp'], [14, 9]), fila(['page_view'], [480, 120])] },
]

describe('armarResumen', () => {
  it('convierte los cinco informes: totales, días ordenados, canales, páginas y eventos', () => {
    const r = armarResumen(28, INFORMES)
    expect(r.totales).toEqual({ usuarios: 120, usuariosNuevos: 90, sesiones: 150, vistas: 480, interaccion: 62.3, duracionMedia: 74 })
    expect(r.porDia).toEqual([{ fecha: '2026-10-21', usuarios: 3, sesiones: 4 }, { fecha: '2026-10-22', usuarios: 5, sesiones: 6 }])
    expect(r.canales[0]).toEqual({ clave: 'Organic Search', a: 100, b: 80 })
    expect(r.paginas[1]).toEqual({ clave: '/propiedades', a: 90, b: 50 })
    expect(r.eventos[0]).toEqual({ clave: 'click_whatsapp', a: 14, b: 9 })
  })
  it('sin datos (propiedad nueva) devuelve ceros y listas vacías, no NaN ni errores', () => {
    const r = armarResumen(7, [{}, {}, {}, {}, {}])
    expect(r.totales).toEqual({ usuarios: 0, usuariosNuevos: 0, sesiones: 0, vistas: 0, interaccion: 0, duracionMedia: 0 })
    expect([r.porDia, r.canales, r.paginas, r.eventos]).toEqual([[], [], [], []])
    expect(armarResumen(7, []).totales.sesiones).toBe(0)
  })
  it('fechaIso solo transforma AAAAMMDD', () => { expect(fechaIso('20261022')).toBe('2026-10-22'); expect(fechaIso('hoy')).toBe('hoy') })
})

describe('consultarGa4', () => {
  it('pide los 5 informes en UNA llamada, con el periodo, solo lectura, y devuelve el resumen', async () => {
    let visto: { url: string; cuerpo: { requests: Array<{ dateRanges: Array<{ startDate: string }>; dimensions: Array<{ name: string }>; metrics: Array<{ name: string }> }> }; auth: string } | null = null
    const f = async (url: string, init?: RequestInit) => { visto = { url, cuerpo: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).authorization }; return json({ reports: INFORMES }) }
    const r = await consultarGa4('TOKEN', '531571829', 28, f)
    expect(visto!.url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/531571829:batchRunReports')
    expect(visto!.auth).toBe('Bearer TOKEN')
    expect(visto!.cuerpo.requests).toHaveLength(5)
    expect(visto!.cuerpo.requests.every((q) => q.dateRanges[0].startDate === '28daysAgo')).toBe(true)
    expect(visto!.cuerpo.requests.map((q) => q.dimensions[0]?.name ?? null)).toEqual([null, 'date', 'sessionDefaultChannelGroup', 'pagePath', 'eventName'])
    expect(r.totales.sesiones).toBe(150)
  })
  it('rechaza un número de propiedad raro SIN llamar a Google (no se arma una URL con texto del usuario)', async () => {
    const f = vi.fn()
    for (const p of ['../x', '123', 'properties/1', '']) await expect(consultarGa4('T', p, 7, f)).rejects.toThrow(/no válido/)
    expect(f).not.toHaveBeenCalled()
  })
  it('un error de Google lleva el estado y un mensaje corto, nunca el token', async () => {
    const e = await consultarGa4('SECRETO', '531571829', 7, async () => json({ error: { message: 'Google Analytics Data API has not been used in project 1 before or it is disabled.' } }, 403)).catch((x: Error) => x)
    expect(e).toBeInstanceOf(ErrorGa4)
    expect((e as Error).message).toContain('HTTP 403')
    expect((e as Error).message).not.toContain('SECRETO')
  })
})

describe('causaDelError — dice QUÉ hay que hacer', () => {
  it('API apagada', () => expect(causaDelError(new ErrorGa4(403, 'Google Analytics Data API has not been used in project 1 before or it is disabled')).codigo).toBe('api_apagada'))
  it('sin acceso a la propiedad', () => expect(causaDelError(new ErrorGa4(403, 'User does not have sufficient permissions for this property.')).codigo).toBe('sin_acceso'))
  it('propiedad inexistente', () => expect(causaDelError(new ErrorGa4(404, 'Requested entity was not found')).codigo).toBe('propiedad'))
  it('un fallo de autenticación (no de Analytics) NO culpa a los permisos de Analytics', () => {
    const c = causaDelError(new Error('Token de la cuenta de servicio: HTTP 403 — Permission denied'))
    expect(c.codigo).toBe('identidad')
    expect(c.ayuda).not.toMatch(/Lector/)
  })
})

// ---- La ruta ----
const estado = vi.hoisted(() => ({ perfil: null as null | { uid: string; rol: string; superAdmin: boolean } }))
vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  return { ...real, exigir: async (_r: Request, p: string) => (estado.perfil && puede(estado.perfil as never, p as never) ? { perfil: estado.perfil } : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: estado.perfil ? 403 : 401 }) }) }
})
vi.mock('@/lib/limites', async (o) => ({ ...(await o<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))

describe('GET /api/admin/analitica/ga', () => {
  const pedir = (q = '', cab: Record<string, string> = {}) => new Request(`https://x.test/api/admin/analitica/ga${q}`, { headers: cab })
  const ENT = { GCP_PROJECT_NUMBER: '820817523792', GCP_SERVICE_ACCOUNT_EMAIL: 'lector@p.iam.gserviceaccount.com', GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel', GSC_SITE_URL: 'sc-domain:vivebienn.com' }
  const guardado = { ...process.env }
  beforeEach(() => { estado.perfil = { uid: 'su', rol: 'admin', superAdmin: true }; Object.assign(process.env, ENT); delete process.env.GA4_PROPERTY_ID })
  afterEach(() => { process.env = { ...guardado }; vi.unstubAllGlobals() })

  it('solo Super Admin: un admin normal recibe 403 y sin sesión 401', async () => {
    const { GET } = await import('../src/app/api/admin/analitica/ga/route')
    estado.perfil = { uid: 'ad', rol: 'admin', superAdmin: false }; expect((await GET(pedir())).status).toBe(403)
    estado.perfil = null; expect((await GET(pedir())).status).toBe(401)
  })
  it('valida el rango y, sin configuración, responde qué falta sin llamar a Google', async () => {
    const { GET } = await import('../src/app/api/admin/analitica/ga/route')
    expect((await GET(pedir('?dias=1000'))).status).toBe(400)
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    delete process.env.GSC_SITE_URL
    expect(await (await GET(pedir())).json()).toEqual({ configurado: false, faltan: ['GSC_SITE_URL'] })
    expect(f).not.toHaveBeenCalled()
  })
  it('con todo configurado pide el token con alcance de SOLO LECTURA de Analytics y lee la propiedad del código', async () => {
    const { GET } = await import('../src/app/api/admin/analitica/ga/route')
    const vistos: Array<{ url: string; cuerpo?: string }> = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      vistos.push({ url, cuerpo: init?.body as string })
      if (url.includes('sts.')) return json({ access_token: 'F' })
      if (url.includes('iamcredentials')) return json({ accessToken: 'A' })
      return json({ reports: INFORMES })
    })
    const r = await GET(pedir('?dias=7', { 'x-vercel-oidc-token': 'OIDC' }))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toMatchObject({ configurado: true, propiedad: '531571829', dias: 7, totales: { sesiones: 150 } })
    expect(JSON.parse(vistos.find((v) => v.url.includes('iamcredentials'))!.cuerpo!).scope).toEqual(['https://www.googleapis.com/auth/analytics.readonly'])
    expect(vistos.at(-1)!.url).toContain('/properties/531571829:batchRunReports')
    expect(JSON.stringify(j)).not.toContain('OIDC')
  })
  it('si Google dice que falta dar acceso, responde 502 con la instrucción (sin detalles internos)', async () => {
    const { GET } = await import('../src/app/api/admin/analitica/ga/route')
    vi.stubGlobal('fetch', async (url: string) => (url.includes('sts.') ? json({ access_token: 'F' }) : url.includes('iamcredentials') ? json({ accessToken: 'A' }) : json({ error: { message: 'User does not have sufficient permissions for this property.' } }, 403)))
    const r = await GET(pedir('', { 'x-vercel-oidc-token': 'OIDC' }))
    expect(r.status).toBe(502)
    const j = await r.json()
    expect(j.codigo).toBe('sin_acceso'); expect(j.error).toMatch(/Lector/)
  })
})
