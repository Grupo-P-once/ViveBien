import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leerUsoDeResend, URL_USO_RESEND } from '../src/lib/correo/resend'
import { ACTOR_USO, conciliarUsoDeResend, NOTA_USO } from '../src/lib/correo/cuota-resend'
import { claveDeUsoResend } from '../src/lib/correo/config'
import type { DbCorreo } from '../src/lib/correo/enviar'

/**
 * Lectura automática del consumo con GET /usage (D-83). NINGUNA prueba sale a la red: `fetch` es un doble y la llave es inventada.
 */
const LLAVE = 're_llave_de_uso_inventada'
const PRODUCCION = { VERCEL_ENV: 'production' }
const uso = (dia: unknown, mes: unknown) => ({ object: 'usage', emails: { daily: { used: dia, limit: 100, sent: 1, received: 0, resets_at: 'x' }, monthly: { used: mes, limit: 3000, sent: 1, received: 0, resets_at: 'x' } }, contacts: { used: 0, limit: 1000 } })
const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } })
const doble = (r: Response | Error) => vi.fn<typeof fetch>(async () => { if (r instanceof Error) throw r; return r.clone() })

describe('leerUsoDeResend', () => {
  it('sin llave no llama al proveedor', async () => {
    const f = doble(json(uso(1, 2)))
    expect(await leerUsoDeResend({ apiKey: '  ', fetch: f })).toEqual({ ok: false, motivo: 'sin_llave' })
    expect(await leerUsoDeResend({ fetch: f })).toEqual({ ok: false, motivo: 'sin_llave' })
    expect(f).not.toHaveBeenCalled()
  })

  it('lee emails.daily.used y emails.monthly.used con UN solo GET a /usage, sin cuerpo, sin seguir redirecciones y con tope de tiempo', async () => {
    const f = doble(json(uso(3, 32)))
    expect(await leerUsoDeResend({ apiKey: LLAVE, fetch: f })).toEqual({ ok: true, dia: 3, mes: 32 })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe(URL_USO_RESEND)
    expect(init?.method).toBe('GET')
    expect(init?.body).toBeUndefined()
    expect(init?.redirect).toBe('error')
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${LLAVE}`)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('acepta cero (cuenta nueva)', async () => {
    expect(await leerUsoDeResend({ apiKey: LLAVE, fetch: doble(json(uso(0, 0))) })).toEqual({ ok: true, dia: 0, mes: 0 })
  })

  it.each([[null, 5], [5, null], ['3', 5], [3.5, 5], [-1, 5], [5, 1e12], [undefined, undefined]])('un valor que no es un entero limpio (%j, %j) no se guarda', async (dia, mes) => {
    expect(await leerUsoDeResend({ apiKey: LLAVE, fetch: doble(json(uso(dia, mes))) })).toMatchObject({ ok: false, motivo: 'respuesta_invalida' })
  })

  it('un cuerpo que no es JSON o sin la sección de correos no inventa nada', async () => {
    expect(await leerUsoDeResend({ apiKey: LLAVE, fetch: doble(new Response('<html>', { status: 200 })) })).toMatchObject({ ok: false, motivo: 'respuesta_invalida' })
    expect(await leerUsoDeResend({ apiKey: LLAVE, fetch: doble(json({ object: 'usage' })) })).toMatchObject({ ok: false, motivo: 'respuesta_invalida' })
  })

  it('un error HTTP (llave sin permiso, caducada…) devuelve «http» con el código y sin el cuerpo; un fallo de red, «red»', async () => {
    const r = await leerUsoDeResend({ apiKey: LLAVE, fetch: doble(json({ name: 'restricted_api_key', message: 'This API key is restricted' }, 401)) })
    expect(r).toEqual({ ok: false, motivo: 'http', estado: 401 })
    expect(await leerUsoDeResend({ apiKey: LLAVE, fetch: doble(new Error('boom')) })).toEqual({ ok: false, motivo: 'red' })
  })

  it('el resultado nunca contiene la llave', async () => {
    for (const r of [json({ x: LLAVE }, 500), json(uso('x', 1)), new Response(LLAVE, { status: 200 })]) {
      expect(JSON.stringify(await leerUsoDeResend({ apiKey: LLAVE, fetch: doble(r) }))).not.toContain(LLAVE)
    }
  })
})

const enVuelo = (count: number | null) => () => { const c = { select: () => c, eq: () => c, gte: async () => ({ count, error: null }) }; return c }
const bd = (rpc: DbCorreo['rpc'], pendientes: number | null = 0): DbCorreo => ({ rpc, from: enVuelo(pendientes) as unknown as DbCorreo['from'] })

describe('conciliarUsoDeResend', () => {
  it('guarda por la MISMA función SQL que el panel, con actor y nota automáticos', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 5 }, error: null }))
    const r = await conciliarUsoDeResend(bd(rpc as unknown as DbCorreo['rpc']), { apiKey: LLAVE, fetch: doble(json(uso(3, 32))), env: PRODUCCION })
    expect(r).toEqual({ ok: true, dia: 3, mes: 32 })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('correo_conciliar', { p_dia: 3, p_mes: 32, p_actor: ACTOR_USO, p_nota: NOTA_USO })
    expect(ACTOR_USO).toMatch(/^automatico:/) // jamás se confunde con el uid de una persona
  })

  it('suma los envíos en vuelo (reservados que Resend aún no cuenta), nunca resta', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 5 }, error: null }))
    await conciliarUsoDeResend(bd(rpc as unknown as DbCorreo['rpc'], 2), { apiKey: LLAVE, fetch: doble(json(uso(3, 32))), env: PRODUCCION })
    expect(rpc).toHaveBeenCalledWith('correo_conciliar', expect.objectContaining({ p_dia: 5, p_mes: 34 }))
  })

  it('fuera de producción NO toca la red ni la base; sin llave tampoco', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 1 }, error: null }))
    const f = doble(json(uso(1, 1)))
    for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) {
      expect(await conciliarUsoDeResend(bd(rpc as unknown as DbCorreo['rpc']), { apiKey: LLAVE, fetch: f, env })).toEqual({ ok: false, motivo: 'fuera_de_produccion' })
    }
    expect(await conciliarUsoDeResend(bd(rpc as unknown as DbCorreo['rpc']), { apiKey: '', fetch: f, env: PRODUCCION })).toMatchObject({ ok: false, motivo: 'sin_llave' })
    expect(f).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('si no se pudo leer, NO escribe nada; si la base falla dice «no_se_guardo» y no lanza', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 1 }, error: null }))
    expect(await conciliarUsoDeResend(bd(rpc as unknown as DbCorreo['rpc']), { apiKey: LLAVE, fetch: doble(json({}, 401)), env: PRODUCCION })).toMatchObject({ ok: false, motivo: 'http', estado: 401 })
    expect(rpc).not.toHaveBeenCalled()
    for (const falla of [async () => ({ data: null, error: { message: 'x' } }), async () => ({ data: null, error: null }), async () => { throw new Error('caída') }]) {
      expect(await conciliarUsoDeResend(bd(falla as unknown as DbCorreo['rpc']), { apiKey: LLAVE, fetch: doble(json(uso(1, 1))), env: PRODUCCION })).toEqual({ ok: false, motivo: 'no_se_guardo' })
    }
  })

  it('claveDeUsoResend lee RESEND_USAGE_KEY recortada y NO cae en RESEND_API_KEY (la del emisor)', () => {
    expect(claveDeUsoResend({ RESEND_USAGE_KEY: `  ${LLAVE}\n` })).toBe(LLAVE)
    expect(claveDeUsoResend({ RESEND_API_KEY: 're_del_emisor' })).toBe('')
    expect(claveDeUsoResend({})).toBe('')
  })
})

const estado = vi.hoisted(() => ({ rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>, rpcResp: { data: { id: 1 } as unknown, error: null as null | { message: string } }, avisos: [] as unknown[] }))
vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  return { ...real, supabaseAdmin: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpc.push({ fn, args }); return estado.rpcResp }, from: () => { const c = { select: () => c, eq: () => c, gte: async () => ({ count: 0, error: null }) }; return c } }) }
})
vi.mock('@/lib/alertas', () => ({ avisar: async (a: unknown) => { estado.avisos.push(a); return true } }))

const cron = (autorizacion?: string) => new Request('https://vb.test/api/alertas/uso-resend', { headers: autorizacion ? { authorization: autorizacion } : {} })
const original = { ...process.env }

describe('ruta /api/alertas/uso-resend', () => {
  beforeEach(() => {
    estado.rpc = []; estado.avisos = []; estado.rpcResp = { data: { id: 1 }, error: null }
    process.env.CRON_SECRET = 'secreto-de-prueba'
    process.env.RESEND_USAGE_KEY = LLAVE
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Una prueba intentó salir a la red') }))
  })
  afterEach(() => { process.env = { ...original }; vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('sin el secreto, con uno equivocado o sin CRON_SECRET configurado: 401 y no hace nada (falla cerrado)', async () => {
    const { GET } = await import('../src/app/api/alertas/uso-resend/route')
    expect((await GET(cron())).status).toBe(401)
    expect((await GET(cron('Bearer otro'))).status).toBe(401)
    expect((await GET(cron('Bearer secreto-de-prueb'))).status).toBe(401)
    expect((await GET(cron('bearer secreto-de-prueba'))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await GET(cron('Bearer undefined'))).status).toBe(401)
    expect((await GET(cron('Bearer '))).status).toBe(401)
    expect(estado.rpc).toHaveLength(0); expect(estado.avisos).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fuera de producción o sin llave responde 200, no llama a Resend, no guarda y no alerta', async () => {
    const { GET } = await import('../src/app/api/alertas/uso-resend/route')
    delete process.env.VERCEL_ENV
    expect(await (await GET(cron('Bearer secreto-de-prueba'))).json()).toMatchObject({ ok: false, motivo: 'fuera_de_produccion' })
    process.env.VERCEL_ENV = 'production'; delete process.env.RESEND_USAGE_KEY
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: false, motivo: 'sin_llave' })
    expect(fetch).not.toHaveBeenCalled(); expect(estado.rpc).toHaveLength(0); expect(estado.avisos).toHaveLength(0)
  })

  it('en producción, con uso válido: registra UNA lectura automática y devuelve los números', async () => {
    const { GET } = await import('../src/app/api/alertas/uso-resend/route')
    process.env.VERCEL_ENV = 'production'
    vi.stubGlobal('fetch', vi.fn(async () => json(uso(4, 33))))
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, dia: 4, mes: 33 })
    expect(estado.rpc).toEqual([{ fn: 'correo_conciliar', args: { p_dia: 4, p_mes: 33, p_actor: ACTOR_USO, p_nota: NOTA_USO } }])
    expect(estado.avisos).toHaveLength(0)
  })

  it('si Resend rechaza la llave: 502, NO guarda y avisa al grupo sin la llave ni el secreto', async () => {
    const { GET } = await import('../src/app/api/alertas/uso-resend/route')
    process.env.VERCEL_ENV = 'production'
    vi.stubGlobal('fetch', vi.fn(async () => json({ name: 'restricted_api_key' }, 401)))
    const registro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(r.status).toBe(502)
    expect(await r.json()).toEqual({ ok: false, motivo: 'http', estado: 401 })
    expect(estado.rpc).toHaveLength(0)
    expect(estado.avisos).toHaveLength(1)
    const todo = JSON.stringify([estado.avisos, registro.mock.calls])
    expect(todo).not.toContain(LLAVE); expect(todo).not.toContain('secreto-de-prueba')
  })

  it('si la base no guarda: 503 y avisa', async () => {
    const { GET } = await import('../src/app/api/alertas/uso-resend/route')
    process.env.VERCEL_ENV = 'production'
    estado.rpcResp = { data: null, error: { message: 'falta la función' } }
    vi.stubGlobal('fetch', vi.fn(async () => json(uso(1, 1))))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await GET(cron('Bearer secreto-de-prueba'))).status).toBe(503)
    expect(estado.avisos).toHaveLength(1)
  })
})

describe('aislamiento de la llave de acceso completo (barrera estática)', () => {
  const RAIZ = join(__dirname, '..')
  const recorrer = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? recorrer(p) : /\.(ts|tsx)$/.test(n) ? [p] : [] })
  const TODOS = recorrer(join(RAIZ, 'src'))
  const rel = (f: string) => relative(RAIZ, f).replace(/\\/g, '/')
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('RESEND_USAGE_KEY sólo se nombra en el módulo de configuración', () => {
    expect(TODOS.filter((f) => /RESEND_USAGE_KEY/.test(sinComentarios(readFileSync(f, 'utf8')))).map(rel)).toEqual(['src/lib/correo/config.ts'])
  })

  it('sólo la lectura de consumo pide la llave: ni emisores, ni libro, ni rutas distintas de la de consumo', () => {
    const usan = TODOS.filter((f) => /claveDeUsoResend/.test(sinComentarios(readFileSync(f, 'utf8')))).map(rel).sort()
    expect(usan).toEqual(['src/lib/correo/config.ts', 'src/lib/correo/cuota-resend.ts'])
  })

  it('EntornoCorreo (lo que ven los emisores) no contiene la llave de acceso completo', () => {
    const c = sinComentarios(readFileSync(join(RAIZ, 'src/lib/correo/config.ts'), 'utf8'))
    const tipo = c.slice(c.indexOf('export type EntornoCorreo'), c.indexOf('export function entornoCorreo'))
    expect(tipo).not.toMatch(/usage|uso/i)
    const fn = c.slice(c.indexOf('export function entornoCorreo'), c.indexOf('export function claveDeUsoResend'))
    expect(fn).not.toMatch(/USAGE/)
  })

  it('ninguna variable NEXT_PUBLIC lleva una llave de Resend (el nombre sin prefijo no llega al navegador)', () => {
    expect(TODOS.filter((f) => /NEXT_PUBLIC_RESEND/.test(readFileSync(f, 'utf8'))).map(rel)).toEqual([])
  })
})
