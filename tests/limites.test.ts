import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlmacenUpstash, almacenActivo, memoria, reiniciarAlmacen } from '../src/lib/limites-almacen'
import { frenar, frenarAsync, permitir, permitirAlmacen, TOPES } from '../src/lib/limites'

/**
 * R-03 (QA-003) y R-04 (QA-004) de D-62: tope de peticiones con almacén intercambiable (memoria por defecto, Upstash si hay variables),
 * y `ayuda/feedback` ya NO acepta peticiones ilimitadas (antes: 400 de 400 válidas).
 */
let inserts = 0
vi.mock('../src/lib/supabase-servidor', () => ({
  // SEC-7: la ruta ahora hace una lectura previa (el artículo es público y publicado) antes de insertar; aquí el artículo SIEMPRE existe.
  clienteServidor: () => {
    const tabla: Record<string, unknown> = {
      insert: async () => { inserts++; return { error: null } },
      maybeSingle: async () => ({ data: { id: 'a' }, error: null }),
    }
    tabla.select = () => tabla
    tabla.eq = () => tabla
    return { from: () => tabla }
  },
}))

beforeEach(() => { memoria.vaciar(); reiniciarAlmacen(); inserts = 0 })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('contador en memoria (comportamiento de siempre)', () => {
  it('permite hasta el máximo y rechaza el siguiente con 429 y Retry-After', async () => {
    for (let i = 1; i <= 3; i++) expect(await frenarAsync('k', { maximo: 3, ventanaMs: 60_000 })).toBeNull()
    const r = await frenarAsync('k', { maximo: 3, ventanaMs: 60_000 })
    expect(r?.status).toBe(429)
    expect(Number(r?.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await r!.json()).error).toMatch(/Demasiadas peticiones/)
  })
  it('claves distintas no se afectan', async () => {
    for (let i = 0; i < 3; i++) await frenarAsync('a', { maximo: 3, ventanaMs: 60_000 })
    expect((await frenarAsync('a', { maximo: 3, ventanaMs: 60_000 }))?.status).toBe(429)
    expect(await frenarAsync('b', { maximo: 3, ventanaMs: 60_000 })).toBeNull()
  })
  it('la ventana se reinicia al terminar', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
    for (let i = 0; i < 2; i++) await frenarAsync('w', { maximo: 2, ventanaMs: 10_000 })
    expect((await frenarAsync('w', { maximo: 2, ventanaMs: 10_000 }))?.status).toBe(429)
    vi.setSystemTime(new Date('2026-10-07T12:00:10.001Z'))
    expect(await frenarAsync('w', { maximo: 2, ventanaMs: 10_000 })).toBeNull()
  })
  it('las versiones síncrona y asíncrona comparten contador (no hay dos topes distintos)', async () => {
    permitir('mix', 2, 60_000); permitir('mix', 2, 60_000)
    expect(frenar('mix', { maximo: 2, ventanaMs: 60_000 })?.status).toBe(429)
    expect((await permitirAlmacen('mix', 2, 60_000)).ok).toBe(false)
  })
})

describe('almacén compartido (Upstash por REST), sin dependencias nuevas', () => {
  const U = 'https://ejemplo.upstash.io'
  const T = 'token-de-prueba-secreto'
  it('NO se activa sin las dos variables (comportamiento actual intacto)', () => {
    expect(almacenActivo({})).toBe(memoria)
    reiniciarAlmacen()
    expect(almacenActivo({ UPSTASH_REDIS_REST_URL: U })).toBe(memoria)
    reiniciarAlmacen()
    expect(almacenActivo({ UPSTASH_REDIS_REST_TOKEN: T })).toBe(memoria)
  })
  it('se activa con ambas', () => {
    expect(almacenActivo({ UPSTASH_REDIS_REST_URL: U, UPSTASH_REDIS_REST_TOKEN: T })).toBeInstanceOf(AlmacenUpstash)
  })
  it('manda INCR + PEXPIRE NX + PTTL con Bearer y devuelve conteo y espera', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ result: 4 }, { result: 0 }, { result: 8000 }]), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const a = new AlmacenUpstash(U, T, memoria)
    expect(await a.contar('clave', 10_000)).toEqual({ conteo: 4, esperaMs: 8000 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(U + '/pipeline')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ' + T)
    expect(JSON.parse(init.body as string)).toEqual([['INCR', 'vb:rl:clave'], ['PEXPIRE', 'vb:rl:clave', '10000', 'NX'], ['PTTL', 'vb:rl:clave']])
  })
  it('aplica el tope con el conteo compartido (de TODAS las instancias)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ result: 7 }, { result: 0 }, { result: 5000 }]), { status: 200 })))
    process.env.UPSTASH_REDIS_REST_URL = U; process.env.UPSTASH_REDIS_REST_TOKEN = T
    try {
      const r = await frenarAsync('z', { maximo: 5, ventanaMs: 10_000 })
      expect(r?.status).toBe(429)
      expect(r?.headers.get('retry-after')).toBe('5')
    } finally { delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN }
  })
  it('si Upstash falla (red, 500, respuesta rara) cae al contador local y NUNCA filtra el token en el log', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const falla of [
      () => Promise.reject(new Error('ECONNRESET ' + T)),
      async () => new Response('no', { status: 500 }),
      async () => new Response(JSON.stringify([{ error: 'x' }]), { status: 200 }),
    ]) {
      vi.stubGlobal('fetch', vi.fn(falla))
      memoria.vaciar()
      const a = new AlmacenUpstash(U, T, memoria)
      expect((await a.contar('q', 1000)).conteo).toBe(1) // contó en memoria
      expect((await a.contar('q', 1000)).conteo).toBe(2)
    }
    expect(aviso).toHaveBeenCalled()
    expect(JSON.stringify(aviso.mock.calls)).not.toContain(T)
  })
})

describe('R-03 · POST /api/ayuda/feedback tiene tope', () => {
  const req = (cuerpo: unknown, ip = '203.0.113.7') => new Request('http://x/api/ayuda/feedback', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(cuerpo),
  })
  const valido = { articuloId: 'a1', util: true, comentario: 'ok' }

  it('ANTES: ilimitado. AHORA: 20 por 10 min por origen y el 21.º es 429 sin escribir', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    const codigos: number[] = []
    // E-35: artículos DISTINTOS (el mismo artículo tiene además su propio tope de 3, probado en e35-fronteras.test.ts)
    for (let i = 0; i < 25; i++) codigos.push((await POST(req({ ...valido, articuloId: 'a' + i }))).status)
    expect(codigos.slice(0, 20).every((c) => c === 200)).toBe(true)
    expect(codigos.slice(20).every((c) => c === 429)).toBe(true)
    expect(inserts).toBe(20) // el 429 llega ANTES de escribir
    expect(TOPES.feedback).toEqual({ maximo: 20, ventanaMs: 600_000 })
  })
  it('abuso: 300 peticiones seguidas desde un origen → solo 20 llegan a la base', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    await Promise.all(Array.from({ length: 300 }, (_, i) => POST(req({ ...valido, articuloId: 'a' + i }, '198.51.100.1'))))
    expect(inserts).toBe(20)
  })
  it('un origen bloqueado no afecta a otro (uso legítimo normal intacto)', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    for (let i = 0; i < 25; i++) await POST(req({ ...valido, articuloId: 'a' + i }, '192.0.2.1'))
    expect((await POST(req(valido, '192.0.2.2'))).status).toBe(200)
  })
  it('las peticiones inválidas también cuentan (no se puede inundar con basura) y siguen dando 400 mientras no se pase el tope', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    expect((await POST(req({}, '192.0.2.9'))).status).toBe(400)
    for (let i = 0; i < 19; i++) await POST(req({}, '192.0.2.9'))
    expect((await POST(req({}, '192.0.2.9'))).status).toBe(429)
  })
  it('error de la base: sigue agradeciendo (200) — el contrato de antes se conserva', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    expect(await (await POST(req(valido, '192.0.2.50'))).json()).toEqual({ guardado: true })
  })
})
