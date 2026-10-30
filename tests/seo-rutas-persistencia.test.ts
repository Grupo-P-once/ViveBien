import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Rutas de la Fase C (tareas, prompts, historial): solo Super Admin, validadas en el servidor, con bitácora y falla cerrada sin la migración 37. Base de mentira en memoria. */

type Fila = Record<string, unknown>
const e = vi.hoisted(() => ({
  perfil: null as null | { uid: string; email: string; rol: string; superAdmin: boolean },
  tablas: {} as Record<string, Fila[]>,
  sinMigracion: false,
  bitacora: [] as Array<{ accion: string; entidadId?: string | null }>,
  n: 0,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  return {
    ...real,
    exigir: async (_r: Request, permiso: string) => (e.perfil && puede(e.perfil as never, permiso as never)
      ? { perfil: e.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: e.perfil ? 403 : 401 }) }),
    supabaseAdmin: () => ({ from: (t: string) => new Consulta(t) }),
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async (o: { accion: string; entidadId?: string | null }) => { e.bitacora.push({ accion: o.accion, entidadId: o.entidadId }) } }))
vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))

class Consulta {
  private filtros: Array<[string, unknown]> = []
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private datos: Fila = {}
  private uno: 'single' | 'maybe' | null = null
  constructor(private t: string) {}
  select() { return this }
  order() { return this }
  limit() { return this }
  eq(c: string, v: unknown) { this.filtros.push([c, v]); return this }
  insert(d: Fila) { this.op = 'insert'; this.datos = d; return this }
  update(d: Fila) { this.op = 'update'; this.datos = d; return this }
  delete() { this.op = 'delete'; return this }
  single() { this.uno = 'single'; return this }
  maybeSingle() { this.uno = 'maybe'; return this }
  then<T>(ok: (r: { data: unknown; error: unknown }) => T) { return Promise.resolve(this.ejecutar()).then(ok) }
  private ejecutar(): { data: unknown; error: unknown } {
    if (e.sinMigracion) return { data: null, error: { code: '42P01', message: `relation "public.${this.t}" does not exist` } }
    const tabla = (e.tablas[this.t] ??= [])
    const coincide = (f: Fila) => this.filtros.every(([c, v]) => f[c] === v)
    if (this.op === 'insert') { const f = { id: `00000000-0000-4000-8000-${String(++e.n).padStart(12, '0')}`, estado: 'pendiente', ...this.datos }; tabla.push(f); return { data: this.uno ? f : [f], error: null } }
    if (this.op === 'update') { const hit = tabla.filter(coincide); hit.forEach((f) => Object.assign(f, this.datos)); return { data: hit, error: null } }
    if (this.op === 'delete') { e.tablas[this.t] = tabla.filter((f) => !coincide(f)); return { data: null, error: null } }
    const hit = tabla.filter(coincide)
    return { data: this.uno ? (hit[0] ?? null) : hit, error: null }
  }
}

const SUPER = { uid: 'su', email: 'super@vivebien.test', rol: 'admin', superAdmin: true }
const ADMIN = { uid: 'ad', email: 'admin@vivebien.test', rol: 'admin', superAdmin: false }
const pedir = (m: string, cuerpo?: unknown, q = '') => new Request(`https://x.test/api/admin/seo/x${q}`, { method: m, headers: { 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })

beforeEach(() => { e.perfil = SUPER; e.tablas = {}; e.sinMigracion = false; e.bitacora = []; e.n = 0 })

describe('permisos: solo Super Admin, en las tres rutas y todos los métodos', () => {
  it('un admin normal recibe 403 y sin sesión 401', async () => {
    const t = await import('../src/app/api/admin/seo/tareas/route')
    const p = await import('../src/app/api/admin/seo/prompts/route')
    const h = await import('../src/app/api/admin/seo/historial/route')
    const llamadas: Array<() => Promise<Response>> = [() => t.GET(pedir('GET')), () => t.POST(pedir('POST', { titulo: 'una tarea' })), () => t.PATCH(pedir('PATCH', {})), () => p.GET(pedir('GET')), () => p.POST(pedir('POST', {})), () => p.DELETE(pedir('DELETE')), () => h.GET(pedir('GET')), () => h.POST(pedir('POST', {}))]
    for (const [perfil, estado] of [[ADMIN, 403], [null, 401]] as const) {
      e.perfil = perfil as never
      for (const l of llamadas) expect((await l()).status).toBe(estado)
    }
    expect(e.tablas).toEqual({}); expect(e.bitacora).toEqual([])
  })
})

describe('tareas', () => {
  it('crear → listar → cambiar estado, con quién la creó y bitácora', async () => {
    const { GET, POST, PATCH } = await import('../src/app/api/admin/seo/tareas/route')
    const c = await POST(pedir('POST', { titulo: 'Agregar h1 al catálogo', area: 'tecnico', prioridad: 'alta', evidencia: 'Revisión del 23-oct', estado: 'hecha', creada_por: 'otro@x.com' }))
    expect(c.status).toBe(201)
    const { tarea } = await c.json()
    expect(tarea).toMatchObject({ titulo: 'Agregar h1 al catálogo', prioridad: 'alta', creada_por: 'super@vivebien.test', estado: 'pendiente' })   // el cuerpo no puede fijar estado ni autor
    expect((await (await GET(pedir('GET'))).json()).tareas).toHaveLength(1)
    const p = await PATCH(pedir('PATCH', { id: tarea.id, estado: 'hecha' }))
    expect(p.status).toBe(200)
    expect((await p.json()).tarea).toMatchObject({ estado: 'hecha' })
    expect(e.tablas.seo_tareas[0].resuelta_en).toBeTruthy()
    await PATCH(pedir('PATCH', { id: tarea.id, estado: 'en_curso' }))
    expect(e.tablas.seo_tareas[0].resuelta_en).toBeNull()      // reabrir limpia la fecha de cierre
    expect(e.bitacora.map((b) => b.accion)).toEqual(['seo.tarea.crear', 'seo.tarea.estado', 'seo.tarea.estado'])
  })
  it('datos inválidos → 400 sin tocar la base; tarea inexistente → 404', async () => {
    const { POST, PATCH } = await import('../src/app/api/admin/seo/tareas/route')
    expect((await POST(pedir('POST', { titulo: 'ab' }))).status).toBe(400)
    expect((await POST(pedir('POST', { titulo: 'titulo valido', area: 'magia' }))).status).toBe(400)
    expect((await PATCH(pedir('PATCH', { id: 'no-uuid', estado: 'hecha' }))).status).toBe(400)
    expect((await PATCH(pedir('PATCH', { id: '3f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6', estado: 'hecha' }))).status).toBe(404)
    expect(e.tablas.seo_tareas ?? []).toHaveLength(0)
  })
})

describe('prompts de IA', () => {
  it('registrar, listar y borrar (404 si ya no existe)', async () => {
    const { GET, POST, DELETE } = await import('../src/app/api/admin/seo/prompts/route')
    const c = await POST(pedir('POST', { prompt: 'mejores naves industriales en León', motor: 'chatgpt', aparece: false, nota: 'No salió', creado_por: 'otro@x.com' }))
    expect(c.status).toBe(201)
    const { prompt } = await c.json()
    expect(prompt).toMatchObject({ motor: 'chatgpt', aparece: false, creado_por: 'super@vivebien.test' })
    expect((await (await GET(pedir('GET'))).json()).prompts).toHaveLength(1)
    expect((await DELETE(pedir('DELETE', undefined, `?id=${prompt.id}`))).status).toBe(200)
    expect((await DELETE(pedir('DELETE', undefined, `?id=${prompt.id}`))).status).toBe(404)
    expect((await DELETE(pedir('DELETE', undefined, '?id=1%27%20or%20true'))).status).toBe(400)
    expect(e.bitacora.map((b) => b.accion)).toEqual(['seo.prompt.crear', 'seo.prompt.borrar'])
  })
  it('rechaza motor inventado, URL http y «aparece» que no es booleano', async () => {
    const { POST } = await import('../src/app/api/admin/seo/prompts/route')
    for (const m of [{ motor: 'bing' }, { cita_url: 'http://x.com' }, { aparece: 'si' }]) {
      expect((await POST(pedir('POST', { prompt: 'una pregunta válida', motor: 'gemini', aparece: true, ...m }))).status).toBe(400)
    }
    expect(e.tablas.seo_prompts_ia ?? []).toHaveLength(0)
  })
})

describe('historial', () => {
  it('sin configuración de Google responde 409 con los nombres que faltan, sin guardar nada', async () => {
    const { POST } = await import('../src/app/api/admin/seo/historial/route')
    for (const k of ['GCP_PROJECT_NUMBER', 'GCP_SERVICE_ACCOUNT_EMAIL', 'GCP_WORKLOAD_IDENTITY_POOL_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', 'GSC_SITE_URL']) delete process.env[k]
    const r = await POST(pedir('POST', { dias: 28 }))
    expect(r.status).toBe(409)
    expect((await r.json()).faltan).toContain('GSC_SITE_URL')
    expect(e.tablas.seo_historial ?? []).toHaveLength(0)
  })
  it('periodo no válido → 400', async () => {
    const { POST } = await import('../src/app/api/admin/seo/historial/route')
    expect((await POST(pedir('POST', { dias: 30 }))).status).toBe(400)
  })
  it('con todo configurado guarda UNA foto con cifras calculadas por el servidor (el cuerpo no puede mandar números)', async () => {
    const { POST, GET } = await import('../src/app/api/admin/seo/historial/route')
    Object.assign(process.env, { GCP_PROJECT_NUMBER: '820817523792', GCP_SERVICE_ACCOUNT_EMAIL: 'lector@proyecto.iam.gserviceaccount.com', GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel', GSC_SITE_URL: 'sc-domain:vivebienn.com' })
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.includes('sts.')) return new Response(JSON.stringify({ access_token: 'F' }))
      if (url.includes('iamcredentials')) return new Response(JSON.stringify({ accessToken: 'A' }))
      const dim = JSON.parse(String(init?.body)).dimensions[0]
      const rows = dim === 'date' ? [{ keys: ['2026-10-19'], clicks: 3, impressions: 100, ctr: 0.03, position: 10 }, { keys: ['2026-10-20'], clicks: 1, impressions: 100, ctr: 0.01, position: 20 }]
        : [{ keys: [dim === 'page' ? 'https://vivebienn.com/' : 'valuador'], clicks: 2, impressions: 50, ctr: 0.04, position: 8 }]
      return new Response(JSON.stringify({ rows }))
    })
    const r = await POST(new Request('https://x.test/api/admin/seo/historial', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-oidc-token': 'OIDC' }, body: JSON.stringify({ dias: 28, clics: 99999, impresiones: 1 }) }))
    vi.unstubAllGlobals()
    expect(r.status).toBe(201)
    const { foto } = await r.json()
    expect(foto).toMatchObject({ periodo_dias: 28, clics: 4, impresiones: 200, ctr: 2, posicion: 15, creado_por: 'super@vivebien.test' })
    expect(e.tablas.seo_historial).toHaveLength(1)
    expect((await (await GET(pedir('GET'))).json()).fotos).toHaveLength(1)
    expect(e.bitacora.map((b) => b.accion)).toEqual(['seo.historial.foto'])
  })
})

describe('migración 37 pendiente', () => {
  it('todas las rutas responden 503 con un mensaje claro y código «migracion_pendiente»', async () => {
    e.sinMigracion = true
    const t = await import('../src/app/api/admin/seo/tareas/route')
    const p = await import('../src/app/api/admin/seo/prompts/route')
    const h = await import('../src/app/api/admin/seo/historial/route')
    for (const r of [await t.GET(pedir('GET')), await t.POST(pedir('POST', { titulo: 'una tarea' })), await p.GET(pedir('GET')), await p.POST(pedir('POST', { prompt: 'una pregunta válida', motor: 'gemini', aparece: true })), await h.GET(pedir('GET'))]) {
      expect(r.status).toBe(503)
      expect((await r.json()).codigo).toBe('migracion_pendiente')
    }
  })
})
