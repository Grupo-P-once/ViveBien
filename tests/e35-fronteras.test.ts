import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { puede } from '../src/lib/acceso/permisos'

/**
 * E-35 · SEGURIDAD Y FRONTERAS (D-62/D-63 → QA-011/012/013 + feedback). Cada prueba nació ROJA contra E-34 (producción) y quedó VERDE con el arreglo.
 *  · E35-02  GET /api/admin/propiedades: 401 sin sesión, 403 cliente/publicador, 200 admin/super admin (antes: lista pública a cualquiera).
 *  · E35-03  el diagnóstico de Telegram deja de ser público: vive en /api/admin/telegram/diagnostico, protegido, y el webhook ya no responde GET.
 *  · E35-04  las respuestas autenticadas llevan `Cache-Control: private, no-store` (cabecera central en next.config) y las rutas que antes
 *            las consumían sin sesión ahora usan /api/catalogo.
 *  · E35-05  /api/ayuda/feedback: tope de tamaño (413), forma del id (400), tope por origen y por artículo (429 + Retry-After), no-store.
 */
const RAIZ = path.join(__dirname, '..')
const leer = (rel: string) => readFileSync(path.join(RAIZ, ...rel.split('/')), 'utf8')

const mundo = vi.hoisted(() => ({
  filas: [] as Array<Record<string, unknown>>,
  clientes: [] as string[], // con qué clave se pidió cada cliente de Supabase
  inserts: [] as Array<Record<string, unknown>>,
  articulo: { id: 'art' } as Record<string, unknown> | null, // lo que devuelve la lectura previa del feedback (null = no es público/publicado)
}))

// Auth: misma regla que el servidor real (`panel.admin` = admin | super_admin), con el token «Bearer <rol>» como identidad.
vi.mock('@/lib/auth-server', () => {
  const chequear = async (req: Request) => {
    const h = req.headers.get('authorization') ?? ''
    if (!h.startsWith('Bearer ')) return { error: NextResponse.json({ error: 'Falta la sesión.' }, { status: 401 }) }
    const rol = h.slice(7)
    const quien = rol === 'super_admin' ? { rol: 'admin', superAdmin: true } : { rol, superAdmin: false }
    if (!puede(quien as Parameters<typeof puede>[0], 'panel.admin')) return { error: NextResponse.json({ error: 'Sin permiso.' }, { status: 403 }) }
    return { perfil: { uid: 'u-' + rol, email: rol + '@x.test', rol: quien.rol, superAdmin: quien.superAdmin, estado: 'activo', nombre: rol, emailVerified: true } }
  }
  return { requireAdmin: chequear, exigir: chequear, requireRole: chequear }
})
vi.mock('@/lib/supabase-servidor', () => ({
  clienteServidor: (_url: string, clave: string) => {
    mundo.clientes.push(clave)
    const c: Record<string, unknown> = {}
    c.select = () => c
    c.order = () => c
    c.eq = () => c
    c.insert = (f: Record<string, unknown>) => { mundo.inserts.push(f); return Promise.resolve({ error: null }) }
    c.from = () => c
    c.maybeSingle = () => Promise.resolve({ data: mundo.articulo, error: null })
    c.then = (r: (v: unknown) => unknown) => r({ data: mundo.filas, error: null })
    return c
  },
}))
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))

const FILAS = [
  { id: 'pub', estado_pub: 'publicada', estatus: 'disponible', titulo: 'Pública', owner_email: 'dueno@privado.test' },
  { id: 'bor', estado_pub: 'borrador', estatus: 'disponible', titulo: 'Borrador', owner_email: 'otro@privado.test' },
  { id: 'pau', estado_pub: 'publicada', estatus: 'pausada', titulo: 'Pausada', owner_email: 'x@privado.test' },
]

const ENTORNO = { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:1', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test' }
beforeEach(() => {
  mundo.filas = FILAS.map((f) => ({ ...f })); mundo.clientes = []; mundo.inserts = []; mundo.articulo = { id: 'art' }
  for (const [k, v] of Object.entries(ENTORNO)) vi.stubEnv(k, v)
})

const get = (url: string, token?: string) => new Request('https://vivebienn.com' + url, { headers: token ? { authorization: 'Bearer ' + token } : {} })

describe('E35-02 · GET /api/admin/propiedades exige administrador', () => {
  it('sin sesión: 401 y NO se consulta la base', async () => {
    const { GET } = await import('../src/app/api/admin/propiedades/route')
    const r = await GET(get('/api/admin/propiedades'))
    expect(r.status).toBe(401)
    expect(mundo.clientes).toHaveLength(0)
  })
  for (const rol of ['cliente', 'publicador']) {
    it(`${rol}: 403 y NO se consulta la base`, async () => {
      const { GET } = await import('../src/app/api/admin/propiedades/route')
      const r = await GET(get('/api/admin/propiedades', rol))
      expect(r.status).toBe(403)
      expect(mundo.clientes).toHaveLength(0)
    })
  }
  for (const rol of ['admin', 'super_admin']) {
    it(`${rol}: 200 con TODO el inventario (borradores y pausadas incluidos) y respuesta privada`, async () => {
      const { GET } = await import('../src/app/api/admin/propiedades/route')
      const r = await GET(get('/api/admin/propiedades', rol))
      expect(r.status).toBe(200)
      expect((await r.json()).map((p: { id: string }) => p.id)).toEqual(['pub', 'bor', 'pau'])
      expect(mundo.clientes).toEqual(['service-test'])
      expect(r.headers.get('cache-control')).toMatch(/private/)
      expect(r.headers.get('cache-control')).toMatch(/no-store/)
    })
  }
  it('la lectura pública sigue en /api/catalogo (D-59) y nada del portal consume ya la ruta de administración sin sesión', () => {
    for (const rel of ['src/components/MetricasCliente.tsx', 'src/components/MisFavoritos.tsx']) {
      const s = leer(rel)
      expect(s, rel).not.toContain('/api/admin/propiedades')
      expect(s, rel).toContain('/api/catalogo')
    }
    // el panel de administración sí la usa, pero SIEMPRE con la sesión
    const dash = leer('src/app/dashboard/page.tsx')
    expect(dash).toMatch(/fetch\('\/api\/admin\/propiedades', \{ headers: await authHeaders\(\) \}\)/)
  })
})

describe('E35-03 · diagnóstico de Telegram', () => {
  it('el webhook ya no responde GET (no hay diagnóstico público)', async () => {
    const m = await import('../src/app/api/telegram/webhook/route')
    expect((m as Record<string, unknown>).GET).toBeUndefined()
    expect(typeof m.POST).toBe('function')
  })
  it('/api/admin/telegram/diagnostico: 401 / 403 / 200 y sin secretos', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'secreto-super-largo-123')
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:ABC-token-real')
    const { GET } = await import('../src/app/api/admin/telegram/diagnostico/route')
    expect((await GET(get('/api/admin/telegram/diagnostico'))).status).toBe(401)
    expect((await GET(get('/api/admin/telegram/diagnostico', 'cliente'))).status).toBe(403)
    expect((await GET(get('/api/admin/telegram/diagnostico', 'publicador'))).status).toBe(403)
    for (const rol of ['admin', 'super_admin']) {
      const r = await GET(get('/api/admin/telegram/diagnostico', rol))
      expect(r.status).toBe(200)
      const texto = JSON.stringify(await r.json())
      expect(texto).toMatch(/configurado/)
      expect(texto).not.toContain('secreto-super-largo-123')
      expect(texto).not.toContain('ABC-token-real')
      expect(texto).not.toMatch(/\blongitud|length\b/i) // ni siquiera el largo del secreto
      expect(r.headers.get('cache-control')).toMatch(/no-store/)
    }
  })
})

describe('E35-04 · las respuestas autenticadas no se cachean', () => {
  it('next.config pone `Cache-Control: private, no-store` y `Vary` a identidad, citas, publicador y administración', async () => {
    const cfg = (await import('../next.config')).default
    const reglas = await cfg.headers!()
    for (const ruta of ['/api/usuarios/me', '/api/citas', '/api/citas/x', '/api/publicador/propiedades', '/api/admin/usuarios', '/api/admin/salud']) {
      const hechas = reglas.filter((r) => new RegExp('^' + r.source.replace(/\/:path\*/g, '(/.*)?') + '$').test(ruta))
      const cab = Object.fromEntries(hechas.flatMap((r) => r.headers).map((h) => [h.key.toLowerCase(), h.value]))
      expect(cab['cache-control'], ruta).toBe('private, no-store')
      expect(cab['vary'], ruta).toMatch(/Cookie/)
      expect(cab['vary'], ruta).toMatch(/Authorization/)
    }
  })
  it('las páginas y las APIs públicas NO reciben esa cabecera (el catálogo sigue cacheable)', async () => {
    const cfg = (await import('../next.config')).default
    const reglas = await cfg.headers!()
    for (const ruta of ['/', '/propiedades', '/api/catalogo', '/api/salud', '/api/ayuda/feedback']) {
      const hechas = reglas.filter((r) => new RegExp('^' + r.source.replace(/\/:path\*/g, '(/.*)?') + '$').test(ruta))
      const cab = hechas.flatMap((r) => r.headers).map((h) => h.key.toLowerCase())
      expect(cab, ruta).not.toContain('cache-control')
    }
  })
})

describe('E35-05 · POST /api/ayuda/feedback contra abuso', () => {
  const post = (cuerpo: unknown, ip = '203.0.113.7', extra: Record<string, string> = {}) =>
    new Request('https://vivebienn.com/api/ayuda/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...extra },
      body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    })

  beforeEach(async () => { const a = await import('../src/lib/limites-almacen'); a.memoria.vaciar(); a.reiniciarAlmacen() })

  it('un cuerpo enorme se rechaza con 413 SIN leerlo ni escribir', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    const r = await POST(post({ articuloId: 'a', util: true, comentario: 'x'.repeat(50_000) }))
    expect(r.status).toBe(413)
    expect(mundo.inserts).toHaveLength(0)
  })
  it('un id con forma rara (largo o con símbolos) es 400 y no se escribe', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    for (const id of ['a'.repeat(200), "x'; drop table--", '<script>', '']) {
      const r = await POST(post({ articuloId: id, util: true }))
      expect(r.status, id.slice(0, 20)).toBe(400)
    }
    expect(mundo.inserts).toHaveLength(0)
  })
  it('el comentario se recorta a 500 y la respuesta no se cachea', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    const r = await POST(post({ articuloId: 'art-1', util: false, comentario: 'y'.repeat(900) }))
    expect(r.status).toBe(200)
    expect((mundo.inserts[0].comentario as string).length).toBe(500)
    expect(r.headers.get('cache-control')).toMatch(/no-store/)
  })
  it('SEC-7 · escribe con la clave de SERVICIO, nunca con la anónima (la migración 61 quita el INSERT a anon)', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    const r = await POST(post({ articuloId: 'art-s7', util: true }))
    expect(r.status).toBe(200)
    expect(mundo.clientes).toEqual(['service-test'])
    expect(mundo.clientes).not.toContain('anon-test')
    expect(leer('src/app/api/ayuda/feedback/route.ts')).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })
  it('SEC-7 · un artículo inexistente o que no es público y publicado NO se guarda y no se distingue de uno bueno', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    mundo.articulo = null // la lectura previa (ambito = publica, estado = PUBLICADO) no encontró nada
    const r = await POST(post({ articuloId: 'art-borrador', util: true, comentario: 'x' }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ guardado: false })
    expect(mundo.inserts).toHaveLength(0)
  })
  it('el mismo origen no puede inflar UN artículo: a la 4.ª opinión en la ventana, 429 con Retry-After', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    for (let i = 0; i < 3; i++) expect((await POST(post({ articuloId: 'art-1', util: true }))).status).toBe(200)
    const r = await POST(post({ articuloId: 'art-1', util: true }))
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
    // otro artículo del mismo origen todavía pasa; otro origen también
    expect((await POST(post({ articuloId: 'art-2', util: true }))).status).toBe(200)
    expect((await POST(post({ articuloId: 'art-1', util: true }, '198.51.100.9'))).status).toBe(200)
  })
  it('Codex E-35 P3: AMBOS 429 (por artículo y por origen) llevan Retry-After Y Cache-Control: no-store', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    for (let i = 0; i < 3; i++) await POST(post({ articuloId: 'art-p3', util: true }))
    const porArticulo = await POST(post({ articuloId: 'art-p3', util: true }))
    expect(porArticulo.status).toBe(429)
    expect(Number(porArticulo.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(porArticulo.headers.get('cache-control')).toBe('no-store')
    let ultima = porArticulo
    for (let i = 0; i < 25; i++) ultima = await POST(post({ articuloId: 'otro-' + i, util: true }, '198.51.100.77'))
    expect(ultima.status).toBe(429)
    expect(Number(ultima.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(ultima.headers.get('cache-control')).toBe('no-store')
  })
  it('el helper compartido NO cambia: el 429 de frenarAsync sigue llevando solo Retry-After (las demás rutas no se tocan)', async () => {
    const { frenarAsync } = await import('../src/lib/limites')
    const tope = { maximo: 1, ventanaMs: 60_000 }
    await frenarAsync('otra-ruta:x', tope)
    const r = await frenarAsync('otra-ruta:x', tope)
    expect(r?.status).toBe(429)
    expect(r?.headers.get('retry-after')).toBeTruthy()
    expect(r?.headers.get('cache-control')).toBeNull()
  })
  it('y por origen en total: a la 21.ª petición, 429 aunque cambie de artículo', async () => {
    const { POST } = await import('../src/app/api/ayuda/feedback/route')
    let ultimo = 200
    for (let i = 0; i < 25; i++) ultimo = (await POST(post({ articuloId: 'art-' + i, util: true }))).status
    expect(ultimo).toBe(429)
  })
})
