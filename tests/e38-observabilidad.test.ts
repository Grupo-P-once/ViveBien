import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { limpiarTexto, redactar, registrarError, rutaSinConsulta } from '../src/lib/registro-seguro'
import { conMetricas } from '../src/lib/http-metricas'
import { contar, instantanea, medir, reiniciarMetricas } from '../src/lib/metricas'
import { UMBRALES, evaluarUmbrales } from '../src/lib/umbrales'

/**
 * E-38 · OBSERVABILIDAD. Lo que se registra permite correlacionar una petición y no contiene nada sensible; las métricas dicen cuántos 5xx
 * y qué latencia hay; los umbrales dicen cuándo mirar. Son datos de la INSTANCIA (memoria), no un sistema de monitorización.
 */
const SECRETOS = [
  ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'].join('.'), // JWT de ejemplo, armado en tiempo de ejecución (el escáner de secretos no admite uno contiguo)
  'Bearer abcdefghijklmnop1234567890',
  '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw12', // token de bot
  'persona.privada@ejemplo.com',
  '+52 477 123 4567',
]

describe('registro seguro · limpieza de texto', () => {
  it('sustituye JWT, Bearer, token de bot, correos, teléfonos y parámetros secretos de URL', () => {
    const t = limpiarTexto(`fallo con ${SECRETOS.join(' | ')} en https://x.test/api?token=SUPERSECRETO&otro=1 y apikey=ZZZ`)
    for (const s of SECRETOS) expect(t).not.toContain(s)
    expect(t).not.toContain('SUPERSECRETO')
    expect(t).not.toContain('ZZZ')
    expect(t).toMatch(/\[jwt\]/); expect(t).toMatch(/\[correo\]/); expect(t).toMatch(/\[numero\]/); expect(t).toMatch(/\[token-bot\]/)
  })
  it('acota el largo y colapsa espacios', () => {
    expect(limpiarTexto('a'.repeat(5000)).length).toBeLessThanOrEqual(301)
    expect(limpiarTexto('a   \n\n  b')).toBe('a b')
  })
  it('no destruye texto inocente (códigos de error, rutas, números cortos)', () => {
    expect(limpiarTexto('PGRST116 en /api/catalogo tras 4000 ms (intento 2)')).toBe('PGRST116 en /api/catalogo tras 4000 ms (intento 2)')
  })
})

describe('registro seguro · redactar', () => {
  it('redacta por NOMBRE de clave (authorization, cookie, token, email, teléfono…) y por FORMA del valor', () => {
    const r = redactar({
      authorization: 'Bearer zzzzzzzzzzzz', cookie: 'a=b', token: 't', password: 'p', email: 'a@b.co', telefono: '4771234567', service_role: 'k',
      mensaje: `usuario ${SECRETOS[3]} falló`, ruta: '/api/x', n: 3, ok: true,
      anidado: { apiKey: 'k', texto: SECRETOS[0] },
    }) as Record<string, unknown>
    const j = JSON.stringify(r)
    for (const s of SECRETOS) expect(j).not.toContain(s)
    expect(r.authorization).toBe('[redactado]')
    expect(r.email).toBe('[redactado]')
    expect(r.ruta).toBe('/api/x'); expect(r.n).toBe(3); expect(r.ok).toBe(true)
    expect((r.anidado as Record<string, unknown>).apiKey).toBe('[redactado]')
  })
  it('limita profundidad, listas y número de claves', () => {
    const profundo = redactar({ a: { b: { c: { d: 'x' } } } }) as Record<string, any>
    expect(JSON.stringify(profundo)).toContain('[…]')
    expect((redactar(Array.from({ length: 50 }, (_, i) => i)) as unknown[]).length).toBe(10)
  })
  it('la ruta se registra SIN consulta ni fragmento', () => {
    expect(rutaSinConsulta('https://vivebienn.com/api/x?token=abc&correo=a@b.co#y')).toBe('/api/x')
  })
})

describe('registrarError · una línea JSON, correlacionable y saneada', () => {
  let espia: ReturnType<typeof vi.spyOn>
  beforeEach(() => { espia = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => espia.mockRestore())

  it('incluye id de petición, despliegue, método y ruta limpia; NO la pila ni cabeceras ni la consulta', () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_PRUEBA')
    const req = new Request('https://vivebienn.com/api/usuarios/me?token=SUPERSECRETO', {
      method: 'GET', headers: { 'x-vercel-id': 'iad1::abc-123', authorization: 'Bearer abcdefghijklmnop1234567890', cookie: 'sesion=zzz' },
    })
    const e = new Error(`falló para ${SECRETOS[3]} con ${SECRETOS[0]}`)
    registrarError('prueba.error', e, { req, extra: { token: 'TTT', detalle: 'ok' } })
    expect(espia).toHaveBeenCalledTimes(1)
    const linea = String(espia.mock.calls[0][0])
    const o = JSON.parse(linea)
    expect(o).toMatchObject({ nivel: 'error', evento: 'prueba.error', despliegue: 'dpl_PRUEBA', id: 'iad1::abc-123', metodo: 'GET', ruta: '/api/usuarios/me' })
    expect(o.error.nombre).toBe('Error')
    for (const prohibido of [...SECRETOS, 'SUPERSECRETO', 'sesion=zzz', 'TTT', 'authorization', 'stack', 'at Object']) expect(linea).not.toContain(prohibido)
    expect(o.extra.token).toBe('[redactado]')
    expect(o.extra.detalle).toBe('ok')
  })
  it('nunca lanza, ni con errores raros', () => {
    expect(() => registrarError('x', { circular: (() => { const a: any = {}; a.a = a; return a })() })).not.toThrow()
    expect(() => registrarError('x', undefined)).not.toThrow()
  })
})

describe('conMetricas · contadores, latencias y fallos', () => {
  let espiaE: ReturnType<typeof vi.spyOn>, espiaW: ReturnType<typeof vi.spyOn>
  beforeEach(() => { reiniciarMetricas(); espiaE = vi.spyOn(console, 'error').mockImplementation(() => {}); espiaW = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { espiaE.mockRestore(); espiaW.mockRestore() })
  const req = new Request('https://vivebienn.com/api/prueba?x=1')

  it('cuenta 2xx/4xx/5xx por grupo y guarda latencia con p50/p95/p99', async () => {
    const h = conMetricas('prueba', async (r: Request) => new Response(null, { status: new URL(r.url).searchParams.get('s') ? Number(new URL(r.url).searchParams.get('s')) : 200 }))
    await h(req); await h(new Request('https://x.test/api/prueba?s=404')); await h(new Request('https://x.test/api/prueba?s=503'))
    const m = instantanea()
    expect(m.contadores['http.prueba.2xx']).toBe(1)
    expect(m.contadores['http.prueba.4xx']).toBe(1)
    expect(m.contadores['http.prueba.5xx']).toBe(1)
    expect(m.latencias['http.prueba']).toMatchObject({ n: 3 })
    expect(m.latencias['http.prueba']).toHaveProperty('p99')
    expect(espiaW).toHaveBeenCalledTimes(1) // el 503 deja UNA línea de aviso
  })
  it('una excepción se cuenta como 5xx, deja una línea saneada y se relanza intacta', async () => {
    const h = conMetricas('boom', async () => { throw new Error(`rotura con ${SECRETOS[0]}`) })
    await expect(h(req)).rejects.toThrow(/rotura/)
    expect(instantanea().contadores['http.boom.5xx']).toBe(1)
    const linea = String(espiaE.mock.calls[0][0])
    expect(linea).not.toContain(SECRETOS[0])
    expect(JSON.parse(linea).evento).toBe('http.excepcion')
  })
  it('acepta llamarse sin petición (las pruebas llaman a GET())', async () => {
    const h = conMetricas('sinreq', () => new Response('ok'))
    expect((await h()).status).toBe(200)
  })
})

describe('umbrales · cuándo mirar', () => {
  const base = { memoria: { heapUsadoMB: 60, rssMB: 570 }, contadores: {} as Record<string, number>, latencias: {} as Record<string, { n: number; p50: number | null; p95: number | null; p99?: number | null }> }
  it('estado ok con el comportamiento medido de E-34 (RSS ~570 MB, p95 ~40 ms, sin 5xx)', () => {
    const r = evaluarUmbrales({ ...base, contadores: { 'http.catalogo.2xx': 500 }, latencias: { 'http.catalogo': { n: 200, p50: 4, p95: 40, p99: 85 } } })
    expect(r).toMatchObject({ estado: 'ok', alertas: [] })
  })
  it('alerta por 5xx > 1 % (con al menos 20 muestras), p95, RSS y heap', () => {
    const r = evaluarUmbrales({
      memoria: { heapUsadoMB: UMBRALES.heapMB + 1, rssMB: UMBRALES.rssMB + 1 },
      contadores: { 'http.catalogo.2xx': 90, 'http.catalogo.5xx': 10 },
      latencias: { 'http.catalogo': { n: 100, p50: 100, p95: UMBRALES.p95ApiMs + 1, p99: 900 } },
    })
    expect(r.estado).toBe('atencion')
    expect(r.alertas.join(' | ')).toMatch(/RSS/); expect(r.alertas.join(' | ')).toMatch(/heap/)
    expect(r.alertas.join(' | ')).toMatch(/5xx/); expect(r.alertas.join(' | ')).toMatch(/p95/)
  })
  it('NO alerta con pocas muestras (1 fallo de 3 peticiones es ruido)', () => {
    const r = evaluarUmbrales({ ...base, contadores: { 'http.catalogo.2xx': 2, 'http.catalogo.5xx': 1 }, latencias: { 'http.catalogo': { n: 3, p50: 9000, p95: 9000, p99: 9000 } } })
    expect(r.estado).toBe('ok')
  })
  it('la página SSR tolera más (1000 ms) que la API (500 ms)', () => {
    const lat = { n: 50, p50: 100, p95: 800, p99: 900 }
    expect(evaluarUmbrales({ ...base, contadores: { 'http.ficha.2xx': 50 }, latencias: { 'http.ficha': lat } }).estado).toBe('ok')
    expect(evaluarUmbrales({ ...base, contadores: { 'http.catalogo.2xx': 50 }, latencias: { 'http.catalogo': lat } }).estado).toBe('atencion')
  })
})

vi.mock('@/lib/auth-server', () => ({ requireAdmin: async () => ({ error: new Response('no', { status: 401 }) }) }))
vi.mock('@/lib/salud-diagnostico', () => ({ diagnosticoDetallado: async () => ({ configuracion: { ok: true } }) }))

describe('salud · pública mínima, detalle protegido y con umbrales', () => {
  beforeEach(() => reiniciarMetricas())
  it('/api/salud pública sigue siendo EXACTAMENTE {"ok":true} y no se cachea', async () => {
    const { GET } = await import('../src/app/api/salud/route')
    const r = await GET()
    expect(await r.json()).toEqual({ ok: true })
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('/api/admin/salud: sin sesión ni secreto → 401; con secreto → métricas y umbrales, sin valores de entorno', async () => {
    vi.stubEnv('SALUD_SECRETO', 'secreto-de-monitor-12345'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'valor-que-no-debe-salir-98765')
    const { GET } = await import('../src/app/api/admin/salud/route')
    expect((await GET(new Request('https://x.test/api/admin/salud'))).status).toBe(401)
    contar('http.catalogo.2xx', 3); medir('http.catalogo', 12)
    const r = await GET(new Request('https://x.test/api/admin/salud', { headers: { 'x-salud-secreto': 'secreto-de-monitor-12345' } }))
    expect(r.status).toBe(200)
    const texto = JSON.stringify(await r.json())
    expect(texto).toContain('"umbrales"'); expect(texto).toContain('"estado":"ok"'); expect(texto).toContain('"p99"')
    expect(texto).not.toContain('secreto-de-monitor-12345'); expect(texto).not.toContain('valor-que-no-debe-salir-98765')
    expect(r.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('cableado: las rutas medidas siguen envueltas', () => {
  const leer = (rel: string) => readFileSync(path.join(__dirname, '..', ...rel.split('/')), 'utf8')
  it.each([
    ['src/app/api/catalogo/route.ts', "export const GET = conMetricas('catalogo'"],
    ['src/app/api/salud/route.ts', "export const GET = conMetricas('salud'"],
    ['src/app/api/ayuda/feedback/route.ts', "export const POST = conMetricas('feedback'"],
    ['src/app/api/usuarios/me/route.ts', "export const GET = conMetricas('usuarios_me'"],
  ])('%s', (rel, texto) => expect(leer(rel)).toContain(texto))
})
