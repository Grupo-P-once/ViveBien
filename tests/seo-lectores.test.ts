import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { atributos, extraerHechos } from '../src/lib/seo/html'
import { analizarJsonLd } from '../src/lib/seo/jsonld'
import { estadoRastreadores, leerRobots, leerSitemap, puedeRastrear } from '../src/lib/seo/robots'

const PAGINA = `<!doctype html><html lang="es-MX"><head>
<title>Propiedades en León &amp; el Bajío | Vive Bien</title>
<meta name="description" content="Casas, terrenos y naves."/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name='robots' content="index, follow"/>
<link rel="canonical" href="https://vivebienn.com/propiedades"/>
<meta property="og:title" content="Propiedades"/><meta property="og:image" content="https://vivebienn.com/og/propiedades.jpg"/>
<meta name="twitter:image" content="https://vivebienn.com/og/propiedades.jpg"/>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"RealEstateAgent","name":"Vive Bien"},{"@type":"BreadcrumbList"}]}</script>
<script>var x = "<h1>no</h1>"</script></head>
<body><h1>Propiedades <span>en León</span></h1><p>Hola   mundo</p>
<img src="/a.jpg" alt="una casa"><img src="/b.jpg" alt=""><img src="/c.jpg">
<a href="/blog">Blog</a><a href="#arriba">x</a><a href="mailto:a@b.c">m</a><a href="https://externo.com/x">e</a></body></html>`

describe('extraerHechos', () => {
  const h = extraerHechos(PAGINA)
  it('título, descripción, canónica, idioma y viewport', () => {
    expect(h.titulo).toBe('Propiedades en León & el Bajío | Vive Bien')
    expect(h.descripcion).toBe('Casas, terrenos y naves.')
    expect(h.canonica).toBe('https://vivebienn.com/propiedades')
    expect(h.lang).toBe('es-MX'); expect(h.viewport).toBe(true)
  })
  it('un solo H1 real (no el que está dentro de un script) y sin etiquetas', () => {
    expect(h.h1).toEqual(['Propiedades en León'])
  })
  it('robots: index no es noindex; noindex y none sí', () => {
    expect(h.noindex).toBe(false)
    expect(extraerHechos('<meta name="robots" content="noindex, follow">').noindex).toBe(true)
    expect(extraerHechos('<meta name="robots" content="none">').noindex).toBe(true)
    expect(extraerHechos('<meta name="robots" content="index,follow">').noindex).toBe(false)
  })
  it('imágenes: alt vacío es válido (decorativa); sin atributo alt es un problema', () => {
    expect(h.imagenes).toEqual({ total: 3, sinAlt: 1 })
  })
  it('enlaces: ignora anclas, mailto y tel', () => {
    expect(h.enlaces).toEqual(['/blog', 'https://externo.com/x'])
  })
  it('og/twitter/json-ld y conteo de palabras sin script', () => {
    expect([h.ogImagen, h.twitterImagen, h.jsonld.length]).toEqual(['https://vivebienn.com/og/propiedades.jpg', 'https://vivebienn.com/og/propiedades.jpg', 1])
    expect(h.palabras).toBeGreaterThan(3); expect(h.palabras).toBeLessThan(15)
  })
  it('atributos con comillas simples, dobles o sin comillas', () => {
    expect(atributos(`<a href='/x' class=btn data-k="v w">`)).toMatchObject({ href: '/x', class: 'btn', 'data-k': 'v w' })
  })
  it('una página vacía no rompe nada', () => {
    const v = extraerHechos('')
    expect([v.titulo, v.canonica, v.h1.length, v.palabras, v.noindex]).toEqual([null, null, 0, 0, false])
  })
})

describe('analizarJsonLd', () => {
  it('tipos de un @graph y bloques válidos', () => {
    const r = analizarJsonLd([JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'RealEstateAgent' }, { '@type': ['BreadcrumbList', 'Thing'] }] })])
    expect(r).toMatchObject({ bloques: 1, validos: 1, invalidos: 0, tipos: ['BreadcrumbList', 'RealEstateAgent', 'Thing'], avisos: [] })
  })
  it('JSON roto y sin @context se avisan', () => {
    const r = analizarJsonLd(['{no es json', JSON.stringify({ '@type': 'Thing' })])
    expect(r.invalidos).toBe(1)
    expect(r.avisos.join(' ')).toMatch(/no es JSON válido/); expect(r.avisos.join(' ')).toMatch(/@context/)
  })
  it('avisa de aggregateRating/review inventables y de FAQPage (rich result retirado)', () => {
    const r = analizarJsonLd([JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', aggregateRating: { ratingValue: 5 } })])
    expect(r.avisos.join(' ')).toMatch(/aggregateRating/); expect(r.avisos.join(' ')).toMatch(/FAQPage/)
  })
})

describe('robots.txt', () => {
  const real = leerRobots(readFileSync('tests/fixtures/seo/robots-vivebienn.txt', 'utf8'))
  it('el de producción: un grupo, sitemap declarado', () => {
    expect(real.grupos).toHaveLength(1); expect(real.sitemaps).toEqual(['https://vivebienn.com/sitemap.xml'])
  })
  it('permite lo público y bloquea lo interno', () => {
    for (const ruta of ['/', '/propiedades', '/blog/x', '/og/inicio.jpg', '/p/VB-2026-00001']) expect(puedeRastrear(real, 'Googlebot', ruta), ruta).toBe(true)
    for (const ruta of ['/admin', '/admin/seo', '/api/catalogo', '/portal/x', '/citas', '/mi-cuenta']) expect(puedeRastrear(real, 'Googlebot', ruta), ruta).toBe(false)
  })
  it('gana la regla más larga y, a igual largo, Allow', () => {
    const r = leerRobots('User-agent: *\nDisallow: /a/\nAllow: /a/b\nDisallow: /c\nAllow: /c')
    expect(puedeRastrear(r, 'x', '/a/z')).toBe(false); expect(puedeRastrear(r, 'x', '/a/b/c')).toBe(true); expect(puedeRastrear(r, 'x', '/c')).toBe(true)
  })
  it('comodines y fin de URL', () => {
    const r = leerRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*')
    expect(puedeRastrear(r, 'x', '/a/b.pdf')).toBe(false); expect(puedeRastrear(r, 'x', '/a/b.pdfx')).toBe(true); expect(puedeRastrear(r, 'x', '/tmpfoo')).toBe(false)
  })
  it('un grupo específico manda sobre «*»; Disallow vacío permite todo', () => {
    const r = leerRobots('User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nDisallow:')
    expect(puedeRastrear(r, 'GPTBot', '/x')).toBe(true); expect(puedeRastrear(r, 'Googlebot', '/x')).toBe(false)
  })
  it('estado de rastreadores: en producción todos permitidos en las rutas públicas', () => {
    const e = estadoRastreadores(real)
    expect(e.every((x) => x.estado === 'permitido')).toBe(true)
    expect(e.map((x) => x.agente)).toContain('GPTBot')
    const bloqueado = estadoRastreadores(leerRobots('User-agent: GPTBot\nDisallow: /'))
    expect(bloqueado.find((x) => x.agente === 'GPTBot')?.estado).toBe('bloqueado')
  })
})

describe('sitemap', () => {
  const s = leerSitemap(readFileSync('tests/fixtures/seo/sitemap-vivebienn.xml', 'utf8'))
  it('el de producción (22-oct-2026): 72 URL del dominio; 28 con «lastmod» (artículos y fichas) y 44 sin él (inicio, páginas fijas, ayuda, categorías)', () => {
    expect(s.tipo).toBe('urlset'); expect(s.urls).toHaveLength(72)
    expect(s.urls.every((u) => u.loc.startsWith('https://vivebienn.com'))).toBe(true)
    expect(s.urls.filter((u) => u.lastmod).length).toBe(28)
    expect(s.urls.filter((u) => !u.lastmod).length).toBe(44)
  })
  it('índice de sitemaps, entidades y CDATA', () => {
    const i = leerSitemap('<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>')
    expect(i).toEqual({ tipo: 'index', urls: [], hijos: ['https://a.com/s1.xml'] })
    const u = leerSitemap('<urlset><url><loc>https://a.com/x?a=1&amp;b=2</loc><lastmod>2026-10-22</lastmod></url></urlset>')
    expect(u.urls).toEqual([{ loc: 'https://a.com/x?a=1&b=2', lastmod: '2026-10-22' }])
    expect(leerSitemap('<html></html>').tipo).toBe('desconocido')
  })
})
