import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * R-02 / QA-002 (D-62): `/api/salud` público devuelve SOLO `{ ok: true }`; el detalle vive en `/api/admin/salud` (sesión de administrador
 * o secreto de monitorización) y nunca incluye longitudes de secretos ni el nombre de la nube.
 * ANTES: `puedeAdministrar`, `telegramTokenCaracteres: 46`, `cloudinaryNube`, migraciones… visibles para cualquiera.
 */
const SRC = path.join(__dirname, '..', 'src')
const leer = (r: string) => readFileSync(path.join(SRC, r), 'utf8')

let exito = false
vi.mock('@/lib/auth-server', () => ({
  requireAdmin: vi.fn(async () => (exito ? { perfil: { uid: 'a', rol: 'admin' } } : { error: new Response(JSON.stringify({ error: 'Inicia sesión para continuar.' }), { status: 401 }) })),
  supabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ count: 1, error: null }) }) }) }) }),
}))

const ENV_COPIA = { ...process.env }
beforeEach(() => {
  exito = false
  process.env.TELEGRAM_BOT_TOKEN = '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  process.env.TELEGRAM_WEBHOOK_SECRET = 'x'
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'nube-secreta-de-prueba'
  process.env.CLOUDINARY_API_KEY = 'k'
  process.env.CLOUDINARY_API_SECRET = 's'
  delete process.env.NEXT_PUBLIC_SUPABASE_URL // sin URL: el diagnóstico no hace red
  delete process.env.SALUD_SECRETO
})
afterEach(() => { process.env = { ...ENV_COPIA }; vi.restoreAllMocks() })

describe('GET /api/salud (público)', () => {
  it('devuelve exactamente { ok: true } y no se cachea', async () => {
    const { GET } = await import('../src/app/api/salud/route')
    const r = await GET()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('no lee variables de entorno ni toca la base: no puede filtrar nada', () => {
    const src = leer('app/api/salud/route.ts').split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n')
    expect(src).not.toMatch(/process\.env|supabase|cloudinary|telegram|auth-server/i)
  })
})

describe('GET /api/admin/salud (detalle)', () => {
  it('sin sesión ni secreto → 401, sin datos', async () => {
    const { GET } = await import('../src/app/api/admin/salud/route')
    const r = await GET(new Request('http://x/api/admin/salud'))
    expect(r.status).toBe(401)
    expect(JSON.stringify(await r.json())).not.toMatch(/telegram|cloudinary|migracion/i)
  })
  it('con sesión de administrador → detalle booleano, SIN longitudes ni nombre de la nube', async () => {
    exito = true
    const { GET } = await import('../src/app/api/admin/salud/route')
    const r = await GET(new Request('http://x/api/admin/salud'))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    const j = await r.json()
    expect(j).toMatchObject({ telegram: true, telegramTokenBienFormado: true, cloudinary: true, puedeAdministrar: true })
    const texto = JSON.stringify(j)
    expect(texto).not.toMatch(/telegramTokenCaracteres|cloudinaryNube|nube-secreta|123456789|AAAA/)
    for (const [k, v] of Object.entries(j)) {
      if (k === 'pendiente' || k === 'opcional') expect(Array.isArray(v)).toBe(true)
      else expect(['boolean', 'object']).toContain(typeof v) // boolean | null
    }
  })
  it('secreto de monitorización: solo existe si SALUD_SECRETO está configurada y coincide (falla cerrado)', async () => {
    const { GET } = await import('../src/app/api/admin/salud/route')
    const con = (s?: string) => GET(new Request('http://x/api/admin/salud', { headers: s ? { 'x-salud-secreto': s } : {} }))
    // sin SALUD_SECRETO configurada: la cabecera no abre nada
    expect((await con('lo-que-sea')).status).toBe(401)
    process.env.SALUD_SECRETO = 'secreto-de-monitoreo'
    expect((await con('otro')).status).toBe(401)
    expect((await con('secreto-de-monitore')).status).toBe(401) // largo distinto: sin excepción
    expect((await con()).status).toBe(401)
    expect((await con('secreto-de-monitoreo')).status).toBe(200)
  })
})

describe('el aviso del panel usa la ruta con sesión', () => {
  it('AvisoConfiguracion pide /api/admin/salud con Bearer y ya no /api/salud', () => {
    const c = leer('components/AvisoConfiguracion.tsx')
    expect(c).toContain("'/api/admin/salud'")
    expect(c).toMatch(/Authorization: `Bearer \$\{token\}`/)
    expect(c).toContain('onAuthStateChanged') // espera al usuario de Firebase (currentUser puede ser null al montar)
    expect(c).toMatch(/auth\.currentUser\?\.uid === u\.uid/) // regla de cambio de cuenta (E-31)
    expect(c).not.toMatch(/fetch\('\/api\/salud'\)/)
  })
})

describe('R-11 · métricas de instancia en el diagnóstico de administrador', () => {
  it('incluye contadores/latencias/memoria/deployment y NINGÚN dato de persona ni secreto', async () => {
    exito = true
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_PRUEBA'
    const { contar, medir, reiniciarMetricas } = await import('../src/lib/metricas')
    reiniciarMetricas(); contar('limite.429'); contar('supabase.timeout.publico', 2); for (const ms of [10, 20, 30, 40, 1000]) medir('ficha.lectura_ms', ms)
    const { GET } = await import('../src/app/api/admin/salud/route')
    const j = await (await GET(new Request('http://x/api/admin/salud'))).json()
    expect(j.metricas.deploymentId).toBe('dpl_PRUEBA')
    expect(j.metricas.contadores).toEqual({ 'limite.429': 1, 'supabase.timeout.publico': 2 })
    expect(j.metricas.latencias['ficha.lectura_ms']).toMatchObject({ n: 5, p50: 30 })
    expect(j.metricas.memoria.heapUsadoMB).toBeGreaterThan(0)
    expect(JSON.stringify(j.metricas)).not.toMatch(/token|secret|authorization|@|123456789/i)
  })
  it('la ventana de latencias está acotada (200 muestras): no crece sin fin', async () => {
    const { medir, instantanea, reiniciarMetricas } = await import('../src/lib/metricas')
    reiniciarMetricas()
    for (let i = 0; i < 1000; i++) medir('x', i)
    expect(instantanea().latencias.x.n).toBe(200)
  })
})
