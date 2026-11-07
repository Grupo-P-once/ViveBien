import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Regresiones de la auditoría de seguridad del 7-nov-2026 (H-8 búsqueda de ayuda sin tope, H-10 secreto de cron, H-11 enlaces `//host`). */

describe('H-10 · secreto de cron en tiempo constante', () => {
  const original = process.env.CRON_SECRET
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original })
  const pedir = (auth?: string) => new Request('https://vivebienn.com/api/alertas/resumen', { headers: auth ? { authorization: auth } : {} })

  it('acepta solo la cabecera exacta y falla cerrado sin secreto', async () => {
    const { autorizadoPorCron } = await import('../src/lib/cron-secreto')
    process.env.CRON_SECRET = '  secreto-de-prueba  '
    expect(autorizadoPorCron(pedir('Bearer secreto-de-prueba'))).toBe(true)
    for (const mala of [undefined, '', 'Bearer', 'Bearer otro', 'bearer secreto-de-prueba', 'secreto-de-prueba', 'Bearer secreto-de-prueba-largo']) {
      expect(autorizadoPorCron(pedir(mala)), String(mala)).toBe(false)
    }
    delete process.env.CRON_SECRET
    expect(autorizadoPorCron(pedir('Bearer undefined'))).toBe(false)
    expect(autorizadoPorCron(pedir('Bearer '))).toBe(false)
    process.env.CRON_SECRET = '   '
    expect(autorizadoPorCron(pedir('Bearer '))).toBe(false)
  })

  it('las dos rutas de tareas usan ese helper y ninguna compara el secreto con ===/!==', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['src/app/api/alertas/resumen/route.ts', 'src/app/api/alertas/contabilidad-quincenal/route.ts']) {
      const t = readFileSync(f, 'utf8')
      expect(t, f).toContain('autorizadoPorCron(req)')
      expect(t, f).not.toMatch(/Bearer \$\{/)
    }
  })
})

describe('H-11 · enlaces del Centro de Ayuda', () => {
  it('solo rutas del propio sitio', async () => {
    const { esRutaInterna } = await import('../src/lib/ayuda/enlace')
    for (const ok of ['/', '/propiedades', '/ayuda/citas/agendar?x=1#y']) expect(esRutaInterna(ok), ok).toBe(true)
    for (const mal of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', 'propiedades', '\\\\evil.com']) expect(esRutaInterna(mal), mal).toBe(false)
  })
})

describe('H-8 · /api/ayuda/buscar sin sesión tiene tope', () => {
  beforeEach(() => { vi.resetModules() })
  it('si el tope se agotó responde 429 y NO llega a la base', async () => {
    const buscar = vi.fn(async () => ({ datos: [], desactualizado: false }))
    vi.doMock('@/lib/ayuda/consultas', () => ({ buscar }))
    vi.doMock('@/lib/limites', async (orig) => ({
      ...(await orig<typeof import('../src/lib/limites')>()),
      frenarAsync: async () => new Response(JSON.stringify({ error: 'Demasiadas solicitudes.' }), { status: 429 }),
    }))
    const { GET } = await import('../src/app/api/ayuda/buscar/route')
    const r = await GET(new Request('https://vivebienn.com/api/ayuda/buscar?q=citas'))
    expect(r.status).toBe(429)
    expect(buscar).not.toHaveBeenCalled()
  })
  it('con cupo busca normalmente', async () => {
    const buscar = vi.fn(async () => ({ datos: [{ id: 1 }], desactualizado: false }))
    vi.doMock('@/lib/ayuda/consultas', () => ({ buscar }))
    vi.doMock('@/lib/limites', async (orig) => ({ ...(await orig<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))
    const { GET } = await import('../src/app/api/ayuda/buscar/route')
    const r = await GET(new Request('https://vivebienn.com/api/ayuda/buscar?q=citas'))
    expect(r.status).toBe(200)
    expect(buscar).toHaveBeenCalledTimes(1)
  })
})
