import { describe, expect, it } from 'vitest'
import { auditarPagina, auditarSitio, esInterna, resumir, type PaginaRastreada } from '../src/lib/seo/auditoria'
import { extraerHechos } from '../src/lib/seo/html'
import { analizarJsonLd } from '../src/lib/seo/jsonld'
import { alOrigen, origenValido, rastrear, SEMILLAS } from '../src/lib/seo/rastreador'

const BUENA = `<!doctype html><html lang="es-MX"><head><title>Casas en León</title><meta name="description" content="Resumen único."/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="canonical" href="https://x.test/propiedades"/>
<meta property="og:image" content="https://x.test/og/propiedades.jpg"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script></head><body><h1>Casas</h1><img src="/a.jpg" alt="casa"></body></html>`

function pagina(ruta: string, html: string | null, extra: Partial<PaginaRastreada> = {}): PaginaRastreada {
  const hechos = html ? extraerHechos(html) : null
  return { url: 'https://x.test' + ruta, ruta, estado: 200, redireccion: null, ms: 120, hechos, jsonld: hechos ? analizarJsonLd(hechos.jsonld) : null, ogImagenOk: true, enSitemap: true, error: null, ...extra }
}
const ids = (hs: Array<{ id: string }>) => hs.map((x) => x.id).sort()

describe('auditarPagina', () => {
  it('una página sana no tiene hallazgos', () => {
    expect(auditarPagina(pagina('/propiedades', BUENA))).toEqual([])
  })
  it('sin respuesta y errores 5xx son críticos', () => {
    expect(auditarPagina(pagina('/x', null, { estado: null, error: 'timeout' }))[0]).toMatchObject({ id: 'sin-respuesta', gravedad: 'critica' })
    expect(auditarPagina(pagina('/x', null, { estado: 503 }))[0]).toMatchObject({ id: 'http-5xx', gravedad: 'critica' })
  })
  it('404 y redirección dentro del sitemap se señalan; fuera del sitemap no', () => {
    expect(ids(auditarPagina(pagina('/viejo', null, { estado: 404 })))).toEqual(['sitemap-404'])
    expect(ids(auditarPagina(pagina('/viejo', null, { estado: 404, enSitemap: false })))).toEqual([])
    expect(ids(auditarPagina(pagina('/a', null, { estado: 308, redireccion: '/b' })))).toEqual(['sitemap-redirige'])
  })
  it('falta de título, descripción, H1, canónica, viewport, lang y og:image', () => {
    const hs = auditarPagina(pagina('/vacia', '<html><head></head><body><p>hola</p></body></html>'))
    expect(ids(hs)).toEqual(['sin-canonica', 'sin-descripcion', 'sin-h1', 'sin-lang', 'sin-og-imagen', 'sin-titulo', 'sin-viewport'])
  })
  it('noindex en una página del sitemap es crítico; fuera del sitemap solo media', () => {
    const html = BUENA.replace('<title>', '<meta name="robots" content="noindex"/><title>')
    expect(auditarPagina(pagina('/propiedades', html))[0]).toMatchObject({ id: 'noindex-en-sitemap', gravedad: 'critica' })
    expect(auditarPagina(pagina('/propiedades', html, { enSitemap: false }))[0]).toMatchObject({ id: 'noindex', gravedad: 'media' })
  })
  it('canónica a otra URL, imágenes sin alt, og:image rota y JSON-LD inválido', () => {
    const html = BUENA.replace('https://x.test/propiedades"', 'https://x.test/otra"').replace('alt="casa"', '').replace('{"@context":"https://schema.org","@type":"WebPage"}', '{roto')
    expect(ids(auditarPagina(pagina('/propiedades', html, { ogImagenOk: false })))).toEqual(['canonica-distinta', 'imagenes-sin-alt', 'jsonld-invalido', 'og-imagen-rota'])
  })
  it('varios H1 NO es un hallazgo (Google lo admite) y un título normal tampoco', () => {
    expect(auditarPagina(pagina('/propiedades', BUENA.replace('<h1>Casas</h1>', '<h1>A</h1><h1>B</h1>')))).toEqual([])
  })
  it('las rutas internas no se juzgan por indexación', () => {
    expect(auditarPagina(pagina('/admin/seo', '<html><body>x</body></html>'))).toEqual([])
    for (const r of ['/admin', '/portal/x', '/api/clima', '/p/VB-2026-00001', '/comparar', '/entrar']) expect(esInterna(r), r).toBe(true)
    for (const r of ['/', '/propiedades', '/blog/guia', '/ayuda']) expect(esInterna(r), r).toBe(false)
  })
  it('respuesta lenta: baja pasando 2,5 s y media pasando 5 s', () => {
    expect(auditarPagina(pagina('/propiedades', BUENA, { ms: 3000 }))[0]).toMatchObject({ id: 'lenta', gravedad: 'baja' })
    expect(auditarPagina(pagina('/propiedades', BUENA, { ms: 6000 }))[0]).toMatchObject({ id: 'lenta', gravedad: 'media' })
  })
  it('poco texto en un artículo es solo una nota orientativa', () => {
    expect(auditarPagina(pagina('/blog/guia', BUENA)).find((x) => x.id === 'contenido-escaso')).toMatchObject({ gravedad: 'baja' })
  })
})

describe('auditarSitio y resumir', () => {
  it('títulos y descripciones duplicados entre páginas indexables', () => {
    const a = pagina('/a', BUENA), b = pagina('/b', BUENA), c = pagina('/c', BUENA.replace('Casas en León', 'Otra').replace('Resumen único.', 'Otro resumen.'))
    expect(ids(auditarSitio([a, b, c]))).toEqual(['descripcion-duplicada', 'titulo-duplicado'])
  })
  it('una página indexable fuera del sitemap se avisa (menos las búsquedas)', () => {
    expect(ids(auditarSitio([pagina('/nueva', BUENA, { enSitemap: false })]))).toEqual(['fuera-del-sitemap'])
    expect(ids(auditarSitio([pagina('/blog?q=casa', BUENA, { enSitemap: false })]))).toEqual([])
  })
  it('el resumen cuenta gravedades y el índice baja con los hallazgos', () => {
    const ps = [pagina('/propiedades', BUENA), pagina('/vacia', '<html><body>x</body></html>')]
    const hs = [...ps.flatMap(auditarPagina), ...auditarSitio(ps)]
    const r = resumir(hs, ps)
    expect(r.paginas).toBe(2); expect(r.porGravedad.alta).toBeGreaterThan(0); expect(r.indice).toBeLessThan(100); expect(r.msMedio).toBe(120)
    expect(resumir([], [pagina('/propiedades', BUENA)]).indice).toBe(100)
  })
})

/** Un sitio de mentira: responde según la ruta y anota TODO lo que se le pidió. */
function sitioFalso(origen: string, rutas: Record<string, { estado?: number; tipo?: string; cuerpo?: string; location?: string }>) {
  const pedidas: string[] = []
  const fetchFn = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    pedidas.push(`${init?.method ?? 'GET'} ${url}`)
    const ruta = url.startsWith(origen) ? url.slice(origen.length) : null
    if (ruta === null) throw new Error('petición fuera del origen: ' + url)
    const r = rutas[ruta] ?? { estado: 404, cuerpo: 'no existe' }
    return new Response(r.cuerpo ?? '', { status: r.estado ?? 200, headers: { 'content-type': r.tipo ?? 'text/html; charset=utf-8', ...(r.location ? { location: r.location } : {}) } })
  }) as typeof fetch
  return { fetchFn, pedidas }
}
const ORIGEN = 'https://x.test'
const SITEMAP = `<urlset><url><loc>https://vivebienn.com/propiedades</loc><lastmod>2026-10-22</lastmod></url><url><loc>https://vivebienn.com/blog/guia</loc></url><url><loc>https://vivebienn.com/admin/secreto</loc></url><url><loc>https://vivebienn.com/viejo</loc></url></urlset>`

describe('rastrear', () => {
  const sitio = () => sitioFalso(ORIGEN, {
    '/robots.txt': { tipo: 'text/plain', cuerpo: 'User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://vivebienn.com/sitemap.xml' },
    '/sitemap.xml': { tipo: 'application/xml', cuerpo: SITEMAP },
    '/propiedades': { cuerpo: BUENA }, '/blog/guia': { cuerpo: BUENA }, '/': { cuerpo: BUENA }, '/viejo': { estado: 308, location: '/propiedades', cuerpo: '' },
    '/og/propiedades.jpg': { tipo: 'image/jpeg', cuerpo: 'x' },
  })
  it('SOLO pide URL del origen (el sitemap menciona otro dominio y se reescribe), respeta robots.txt y anota lo omitido', async () => {
    const s = sitio(); const dormidas: number[] = []
    const r = await rastrear({ origen: ORIGEN, fetchFn: s.fetchFn, dormir: async (ms) => { dormidas.push(ms) }, ahora: () => 0 })
    expect(s.pedidas.every((p) => p.includes(ORIGEN))).toBe(true)
    expect(s.pedidas.some((p) => p.includes('vivebienn.com'))).toBe(false)
    expect(s.pedidas.some((p) => p.includes('/admin'))).toBe(false)
    expect(r.omitidas.join(' ')).toMatch(/\/admin\/secreto \(robots\.txt\)/)
    expect(r.robots?.sitemaps).toEqual(['https://vivebienn.com/sitemap.xml'])
    expect(r.sitemaps[0]).toMatchObject({ estado: 200, tipo: 'urlset', urls: 4, conLastmod: 1 })
    expect(dormidas.length).toBeGreaterThan(5); expect(dormidas.every((ms) => ms === 500)).toBe(true)   // 2 por segundo
  })
  it('marca lo que está en el sitemap, detecta la redirección sin seguirla y comprueba la imagen para compartir', async () => {
    const s = sitio()
    const r = await rastrear({ origen: ORIGEN, fetchFn: s.fetchFn, dormir: async () => {}, ahora: () => 0 })
    const viejo = r.paginas.find((p) => p.ruta === '/viejo')!
    expect(viejo).toMatchObject({ estado: 308, redireccion: '/propiedades', enSitemap: true })
    const prop = r.paginas.find((p) => p.ruta === '/propiedades')!
    expect(prop).toMatchObject({ estado: 200, enSitemap: true, ogImagenOk: true })
    expect(s.pedidas).toContain(`HEAD ${ORIGEN}/og/propiedades.jpg`)
    expect(r.paginas.find((p) => p.ruta === '/nosotros')?.enSitemap).toBe(false)   // semilla fuera del sitemap
    expect(SEMILLAS.length).toBeGreaterThan(5)
  })
  it('respeta el tope de páginas y no pasa del tope duro', async () => {
    const s = sitio()
    const r = await rastrear({ origen: ORIGEN, fetchFn: s.fetchFn, dormir: async () => {}, ahora: () => 0, maxPaginas: 3 })
    expect(r.paginas).toHaveLength(3)
    expect(r.omitidas.some((o) => /tope de 3/.test(o))).toBe(true)
  })
  it('un fallo de red en una página se anota y el rastreo sigue', async () => {
    const base = sitio()
    const fetchFn = (async (u: RequestInfo | URL, i?: RequestInit) => { if (String(u).endsWith('/propiedades')) throw new Error('boom'); return base.fetchFn(u, i) }) as typeof fetch
    const r = await rastrear({ origen: ORIGEN, fetchFn, dormir: async () => {}, ahora: () => 0 })
    expect(r.paginas.find((p) => p.ruta === '/propiedades')).toMatchObject({ estado: null, error: 'boom' })
    expect(r.paginas.length).toBeGreaterThan(3)
  })
  it('sin robots.txt se informa (robots = null) y el origen no válido se rechaza', async () => {
    const s = sitioFalso(ORIGEN, { '/': { cuerpo: BUENA } })
    const r = await rastrear({ origen: ORIGEN, fetchFn: s.fetchFn, dormir: async () => {}, ahora: () => 0, maxPaginas: 2 })
    expect(r.robots).toBeNull()
    await expect(rastrear({ origen: 'ftp://x.test', fetchFn: s.fetchFn })).rejects.toThrow(/Origen no válido/)
    expect(origenValido('http://evil.example.com')).toBeNull(); expect(origenValido('http://localhost:3000')).toBe('http://localhost:3000')
    expect(origenValido('https://vivebienn.com/ruta?x=1')).toBe('https://vivebienn.com')
  })
  it('alOrigen reescribe el dominio y conserva ruta y consulta', () => {
    expect(alOrigen('https://vivebienn.com/blog/a?x=1', 'https://prev.vercel.app')).toBe('https://prev.vercel.app/blog/a?x=1')
    expect(alOrigen('/propiedades', 'https://prev.vercel.app')).toBe('https://prev.vercel.app/propiedades')
  })
})
