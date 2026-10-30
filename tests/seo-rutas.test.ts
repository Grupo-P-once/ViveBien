import { beforeEach, describe, expect, it, vi } from 'vitest'
import { puede } from '../src/lib/acceso/permisos'
import { NEGOCIO } from '../src/lib/config/negocio'
import { negocioJsonLd } from '../src/lib/seo'
import { compararNegocio } from '../src/lib/seo/negocio'
import { origenPropio, resolverOrigen } from '../src/lib/seo/origen'

/** Panel SEO (22-oct-2026): solo Super Admin; solo dos orígenes posibles; con tope de uso; solo lectura. */

const estado = vi.hoisted(() => ({ perfil: null as null | { uid: string; rol: string; superAdmin: boolean }, pedidos: [] as string[] }))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede: puedeReal } = await import('../src/lib/acceso/permisos')
  return {
    ...real,
    // El permiso se decide con la función REAL `puede`: si `seo.ver` dejara de ser solo de Super Admin, estas pruebas fallan.
    exigir: async (_req: Request, permiso: string) => (estado.perfil && puedeReal(estado.perfil as never, permiso as never)
      ? { perfil: estado.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: estado.perfil ? 403 : 401 }) }),
  }
})
vi.mock('@/lib/seo/rastreador', async (original) => {
  const real = await original<typeof import('../src/lib/seo/rastreador')>()
  const PAG = (ruta: string, extra: object = {}) => ({ url: 'https://x.test' + ruta, ruta, estado: 200, redireccion: null, ms: 100, hechos: null, jsonld: null, ogImagenOk: null, enSitemap: true, error: null, ...extra })
  return {
    ...real,
    rastrear: async (op: { origen: string; maxPaginas?: number }) => {
      estado.pedidos.push(`${op.origen} max=${op.maxPaginas}`)
      return { origen: op.origen, robots: { grupos: [{ agentes: ['*'], permite: ['/'], niega: ['/admin'], retraso: null }], sitemaps: ['https://x.test/sitemap.xml'] },
        sitemaps: [{ url: op.origen + '/sitemap.xml', estado: 200, tipo: 'urlset', urls: 2, conLastmod: 1 }],
        paginas: [PAG('/ok', { estado: 500 }), PAG('/rota', { estado: 404 }), PAG('/p/1', { estado: 200 })], omitidas: [], duracionMs: 1234 }
    },
  }
})

const SUPER = { uid: 'su', rol: 'admin', superAdmin: true }
const ADMIN = { uid: 'ad', rol: 'admin', superAdmin: false }
const pedir = (ruta: string, host = 'preview.vercel.app') => new Request(`https://${host}${ruta}`, { headers: { host } })
beforeEach(() => { estado.perfil = null; estado.pedidos = [] })

describe('permiso y límites', () => {
  it('seo.ver es solo de Super Admin (ni siquiera un admin normal)', () => {
    expect(puede({ rol: 'cliente', superAdmin: false } as never, 'seo.ver')).toBe(false)
    expect(puede({ rol: 'publicador', superAdmin: false } as never, 'seo.ver')).toBe(false)
    expect(puede(ADMIN as never, 'seo.ver')).toBe(false)
    expect(puede(SUPER as never, 'seo.ver')).toBe(true)
  })
  it('sin sesión 401, admin 403, super admin 200 — en las tres rutas', async () => {
    const { GET: aud } = await import('../src/app/api/admin/seo/auditoria/route')
    const { GET: rob } = await import('../src/app/api/admin/seo/robots/route')
    for (const GET of [aud, rob]) {
      estado.perfil = null; expect((await GET(pedir('/api/admin/seo/x'))).status).toBe(401)
      estado.perfil = ADMIN; expect((await GET(pedir('/api/admin/seo/x'))).status).toBe(403)
      estado.perfil = { ...SUPER, uid: 'su-' + Math.random() }; expect((await GET(pedir('/api/admin/seo/x'))).status).toBe(200)
    }
    expect(estado.pedidos.length).toBe(2)   // solo se rastreó cuando hubo permiso
  })
})

describe('origen: solo el propio despliegue o producción', () => {
  it('por defecto el host de la petición; con «produccion», el sitio oficial; cualquier otra cosa se rechaza', () => {
    expect(origenPropio(pedir('/x', 'preview.vercel.app'))).toBe('https://preview.vercel.app')
    expect(resolverOrigen(pedir('/x'), null, 'https://vivebienn.com')).toEqual({ origen: 'https://preview.vercel.app', cual: 'propio' })
    expect(resolverOrigen(pedir('/x'), 'produccion', 'https://vivebienn.com')).toEqual({ origen: 'https://vivebienn.com', cual: 'produccion' })
    expect(resolverOrigen(pedir('/x'), 'https://evil.example.com', 'https://vivebienn.com')).toEqual({ error: expect.stringMatching(/no permitido/i) })
    expect(resolverOrigen(pedir('/x'), 'http://169.254.169.254', 'https://vivebienn.com')).toEqual({ error: expect.stringMatching(/no permitido/i) })
  })
  it('la API rechaza un origen arbitrario con 400 y nunca rastrea', async () => {
    const { GET } = await import('../src/app/api/admin/seo/auditoria/route')
    estado.perfil = { ...SUPER, uid: 'su-origen' }
    const r = await GET(pedir('/api/admin/seo/auditoria?origen=https://evil.example.com'))
    expect(r.status).toBe(400); expect(estado.pedidos).toEqual([])
  })
  it('origen=produccion rastrea vivebienn.com; alcance=rapida limita a 25 páginas y completa a 80', async () => {
    const { GET } = await import('../src/app/api/admin/seo/auditoria/route')
    estado.perfil = { ...SUPER, uid: 'su-alcance' }
    await GET(pedir('/api/admin/seo/auditoria?origen=produccion&alcance=rapida'))
    await GET(pedir('/api/admin/seo/auditoria'))
    expect(estado.pedidos).toEqual(['https://vivebienn.com max=25', 'https://preview.vercel.app max=80'])
  })
})

describe('respuesta de la auditoría', () => {
  it('hallazgos ordenados por gravedad (crítica primero), con resumen e índice, y sin rutas internas juzgadas', async () => {
    const { GET } = await import('../src/app/api/admin/seo/auditoria/route')
    estado.perfil = { ...SUPER, uid: 'su-forma' }
    const j = await (await GET(pedir('/api/admin/seo/auditoria'))).json()
    expect(j.cual).toBe('propio'); expect(j.resumen.paginas).toBe(3); expect(j.resumen.porGravedad.critica).toBe(1)
    expect(j.hallazgos[0]).toMatchObject({ id: 'http-5xx', gravedad: 'critica', ruta: '/ok' })
    expect(j.hallazgos.map((h: { id: string }) => h.id)).toContain('sitemap-404')
    expect(j.hallazgos.some((h: { ruta: string }) => h.ruta === '/p/1')).toBe(false)   // enlace corto: interna
    expect(j.indice ?? j.resumen.indice).toBeLessThan(100)
  })
  it('el tope de uso corta el rastreo a la quinta petición en diez minutos', async () => {
    const { GET } = await import('../src/app/api/admin/seo/auditoria/route')
    estado.perfil = { ...SUPER, uid: 'su-tope' }
    const estados: number[] = []
    for (let i = 0; i < 5; i++) estados.push((await GET(pedir('/api/admin/seo/auditoria'))).status)
    expect(estados).toEqual([200, 200, 200, 200, 429])
  })
})

describe('datos del negocio (NAP)', () => {
  const bloques = [JSON.stringify({ '@context': 'https://schema.org', '@graph': [negocioJsonLd()] })]
  const texto = `Llámanos al ${NEGOCIO.telefonoVisible}. Visítanos en ${NEGOCIO.calleCorta}, ${NEGOCIO.colonia}.`
  it('lo que declara el sitio coincide consigo mismo: nombre, teléfono, calle, ciudad y código postal', () => {
    const c = compararNegocio(NEGOCIO, bloques, texto)
    for (const campo of ['Nombre (datos estructurados)', 'Teléfono (datos estructurados)', 'Calle y número (datos estructurados)', 'Ciudad (datos estructurados)', 'Código postal (datos estructurados)', 'Teléfono visible en la página', 'Dirección visible en la página']) {
      expect(c.find((x) => x.campo === campo), campo).toMatchObject({ estado: 'ok' })
    }
  })
  it('horario y coordenadas NO se declaran a propósito (hasta confirmarlos): salen como «falta» con su nota', () => {
    const c = compararNegocio(NEGOCIO, bloques, texto)
    expect(c.find((x) => x.campo.startsWith('Horario'))).toMatchObject({ estado: 'falta' })
    expect(c.find((x) => x.campo.startsWith('Coordenadas'))).toMatchObject({ estado: 'falta' })
  })
  it('detecta un teléfono distinto y una dirección que falta', () => {
    const roto = [JSON.stringify({ '@context': 'https://schema.org', '@type': 'RealEstateAgent', name: NEGOCIO.nombre, telephone: '+524771112233', address: { streetAddress: 'Otra calle 1', addressLocality: 'León', postalCode: '37000' } })]
    const c = compararNegocio(NEGOCIO, roto, 'sin datos')
    expect(c.find((x) => x.campo === 'Teléfono (datos estructurados)')).toMatchObject({ estado: 'diferente' })
    expect(c.find((x) => x.campo === 'Calle y número (datos estructurados)')).toMatchObject({ estado: 'diferente' })
    expect(c.find((x) => x.campo === 'Teléfono visible en la página')).toMatchObject({ estado: 'falta' })
  })
  it('sin datos estructurados todo lo estructurado «falta»', () => {
    const c = compararNegocio(NEGOCIO, [], texto)
    expect(c.filter((x) => x.campo.includes('datos estructurados')).every((x) => x.estado === 'falta')).toBe(true)
  })
})
