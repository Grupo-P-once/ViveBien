import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORIAS, citaCorta, ordenarReferencias, buscarArticulos, limpiarConsulta, anclaDe, categoriaDe, fechaLarga, indiceDe, minutosDeLectura, normalizar, palabras, slugValido, type Articulo, type Bloque } from '../src/lib/blog/modelo'
import { TODOS_LOS_ARTICULOS, articuloPorSlug, ordenar, pagina, paraInicio, relacionados, visibles } from '../src/lib/blog/articulos'
import { jsonLdArticulo, metadataArticulo } from '../src/lib/blog/seo'

/**
 * Guardia del blog (22-oct-2026): 18 artículos fijos (3 por categoría). Plan en Obsidian: «Investigación y plan — Blog inmobiliario para SEO»,
 * «Plan — Blog automático…» e «Investigación SEO y fuentes del blog». Estas reglas existen porque Google penaliza el contenido en masa sin valor
 * y porque un dato legal o fiscal inventado engaña: ningún artículo pasa sin fuente citada, enlaces que existen y la palabra clave bien puesta.
 */
const raiz = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')
const RUTAS_INTERNAS = ['/propiedades', '/valuador', '/contacto', '/nosotros', '/ayuda', '/blog']
const SLUGS = new Set(TODOS_LOS_ARTICULOS.map((a) => a.slug))

/** Todo el texto de un artículo (sin negritas), en minúsculas y sin acentos. */
function textoDe(a: Articulo): string {
  const trozos = (b: Bloque): string => {
    switch (b.tipo) {
      case 'h2': case 'h3': case 'p': return b.texto
      case 'aviso': return `${b.titulo ?? ''} ${b.texto}`
      case 'lista': case 'pasos': return b.items.join(' ')
      case 'preguntas': return b.items.map((i) => `${i.p} ${i.r}`).join(' ')
      case 'tabla': return `${b.titulo} ${b.encabezados.join(' ')} ${b.filas.map((f) => f.join(' ')).join(' ')}`
    }
  }
  return a.cuerpo.map(trozos).join(' ')
}
const plano = (s: string) => normalizar(s.replace(/\*\*/g, ''))

describe('blog · estructura', () => {
  it('seis categorías con slug válido y descripción', () => {
    expect(CATEGORIAS).toHaveLength(6)
    for (const c of CATEGORIAS) { expect(slugValido(c.slug)).toBe(true); expect(c.descripcion.length).toBeGreaterThan(30) }
  })
  it('18 artículos: tres por categoría, slugs únicos y válidos, un solo destacado y es el primero', () => {
    expect(TODOS_LOS_ARTICULOS).toHaveLength(18)
    for (const c of CATEGORIAS) expect(TODOS_LOS_ARTICULOS.filter((a) => a.categoria === c.slug), c.slug).toHaveLength(3)
    expect(SLUGS.size).toBe(18)
    for (const s of SLUGS) expect(slugValido(s)).toBe(true)
    expect(TODOS_LOS_ARTICULOS.filter((a) => a.destacado)).toHaveLength(1)
    expect(visibles('production')[0].destacado).toBe(true)
  })
  it('las palabras clave no se repiten entre artículos (cada uno responde una búsqueda distinta)', () => {
    const k = TODOS_LOS_ARTICULOS.map((a) => normalizar(a.palabraClave)); expect(new Set(k).size).toBe(k.length)
  })
})

describe('blog · cada artículo (SEO, contenido, fuentes)', () => {
  it.each(TODOS_LOS_ARTICULOS.map((a) => [a.slug, a] as const))('«%s»', (_s, a) => {
    const texto = plano(textoDe(a)), clave = normalizar(a.palabraClave)
    // — SEO de página
    expect(a.titulo.length, 'título ≤ 60').toBeLessThanOrEqual(60)
    expect(a.resumen.length, 'resumen 120–160').toBeGreaterThanOrEqual(120); expect(a.resumen.length).toBeLessThanOrEqual(160)
    expect(categoriaDe(a.categoria)).toBeTruthy()
    expect(a.publicado).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)          // ISO 8601 con zona (lo pide Google)
    // — palabra clave: en el título, en el primer párrafo, y sin relleno
    expect(normalizar(a.titulo), 'clave en el título').toContain(clave)
    const primero = a.cuerpo.find((b) => b.tipo === 'p') as { texto: string }
    expect(plano(primero.texto), 'clave en el primer párrafo').toContain(clave)
    const veces = `${normalizar(a.titulo)} ${texto}`.split(clave).length - 1
    expect(veces, 'la clave aparece, pero sin saturar').toBeGreaterThanOrEqual(2); expect(veces).toBeLessThanOrEqual(15)
    // — profundidad
    expect(palabras(a), 'palabras').toBeGreaterThanOrEqual(900)
    expect(a.cuerpo.filter((b) => b.tipo === 'h2').length, 'subtítulos h2').toBeGreaterThanOrEqual(6)
    expect(a.cuerpo.filter((b) => b.tipo === 'tabla' || b.tipo === 'pasos').length, 'tabla o pasos').toBeGreaterThanOrEqual(2)
    const faq = a.cuerpo.find((b) => b.tipo === 'preguntas') as { items: unknown[] } | undefined
    expect(faq?.items.length ?? 0, 'preguntas frecuentes').toBeGreaterThanOrEqual(3)
    // — portada
    const ruta = join(raiz, 'public', a.portada.src)
    expect(existsSync(ruta), a.portada.src).toBe(true); expect(statSync(ruta).size).toBeLessThan(120_000)
    expect(a.portada.alt.length).toBeGreaterThan(20); expect(a.portada.ancho / a.portada.alto).toBeCloseTo(1.6, 1)
    // — enlaces internos: solo a rutas o artículos que existen; con salida a propiedades/valuador/contacto y a otro artículo
    const enlaces = [...JSON.stringify(a.cuerpo).matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1])
    expect(enlaces.length, 'enlaces internos').toBeGreaterThanOrEqual(3)
    for (const e of enlaces) expect(RUTAS_INTERNAS.includes(e) || (e.startsWith('/blog/') && SLUGS.has(e.slice(6))), e).toBe(true)
    expect(enlaces.some((e) => ['/propiedades', '/valuador', '/contacto'].includes(e)), 'llamado a la acción').toBe(true)
    expect(enlaces.some((e) => e.startsWith('/blog/') && e !== `/blog/${a.slug}`), 'enlace a otro artículo').toBe(true)
    expect(enlaces).not.toContain(`/blog/${a.slug}`)
    // — sin HTML crudo
    expect(JSON.stringify(a.cuerpo)).not.toMatch(/<\/?[a-z][^>]*>/i)
    // — honestidad: nada de cifras con unidad (porcentajes, pesos, dólares): lo que no se pudo verificar no se afirma
    expect(textoDe(a)).not.toMatch(/\d[\d,.]*\s?(%|por ciento|pesos|mxn|usd|dólares)/i)
    expect(textoDe(a)).not.toMatch(/\$\s?\d/)
    // — temas legales, fiscales o de crédito llevan el aviso de orientación general
    if (/notario|impuesto|crédito|hipotec|escritur|arrendamiento|gravamen/i.test(textoDe(a))) expect(a.orientacionGeneral, 'orientación general').toBe(true)
  })
  it('referencias APA 7: autor, fecha (año o «s. f.»), título y URL https; sin repetirse; cada una CITADA en el texto', () => {
    for (const a of TODOS_LOS_ARTICULOS) {
      const refs = a.referencias ?? []
      expect(refs.length, `${a.slug}: referencias`).toBeGreaterThanOrEqual(1)
      expect(new Set(refs.map((r) => r.url)).size).toBe(refs.length)
      const t = textoDe(a)
      for (const r of refs) {
        expect(r.autor.trim().length).toBeGreaterThan(2); expect(r.autor).not.toMatch(/\.$/)      // el punto lo pone la plantilla
        expect(r.fecha).toMatch(/^(s\. f\.|\d{4}(, \d{1,2} de [a-záéíóú]+)?)$/)
        expect(r.titulo.trim().length).toBeGreaterThan(2)
        expect(r.url).toMatch(/^https:\/\//)
        expect(t, `${a.slug}: «${r.autor}» está en la lista pero no se cita en el texto`).toContain(r.autor)
      }
    }
  })
  it('las referencias solo salen de la lista verificada (fuentes.ts)', () => {
    const fuentes = leer('src/lib/blog/fuentes.ts'); const urls = [...fuentes.matchAll(/url: '(https:[^']+)'/g)].map((m) => m[1])
    for (const a of TODOS_LOS_ARTICULOS) for (const r of a.referencias ?? []) expect(urls, `${a.slug}: ${r.url}`).toContain(r.url)
  })
})

describe('blog · orden, visibilidad y maquetas', () => {
  it('en producción se ven los 18 reales; ninguno es maqueta', () => {
    expect(visibles('production')).toHaveLength(18)
    expect(visibles('production').every((a) => !a.muestra)).toBe(true)
  })
  it('una maqueta (si algún día se agrega) sale con noindex y no entra a producción', () => {
    const base = TODOS_LOS_ARTICULOS[0]
    const m: Articulo = { ...base, slug: 'maqueta-prueba', muestra: true }
    expect(metadataArticulo(m).robots).toMatchObject({ index: false })
    expect(metadataArticulo(base).robots).toMatchObject({ index: true })
  })
  it('el sitemap y el feed excluyen maquetas', () => {
    expect(leer('src/app/sitemap.ts')).toMatch(/filter\(\(a\) => !a\.muestra\)/)
    expect(leer('src/app/blog/feed.xml/route.ts')).toMatch(/filter\(\(a\) => !a\.muestra\)/)
  })
  it('ordenar: el destacado primero y luego la fecha más reciente', () => {
    const a = TODOS_LOS_ARTICULOS[1], b = TODOS_LOS_ARTICULOS[2]
    const o = ordenar([{ ...a, publicado: '2026-01-01T09:00:00-06:00' }, { ...b, publicado: '2026-06-01T09:00:00-06:00' }, { ...a, slug: 'x', destacado: true, publicado: '2025-01-01T09:00:00-06:00' }])
    expect(o.map((x) => x.slug)).toEqual(['x', b.slug, a.slug])
  })
})

describe('blog · utilidades', () => {
  it('ancla sin acentos y estable', () => { expect(anclaDe('Ubicación y accesos')).toBe('ubicacion-y-accesos') })
  it('índice = los h2, tiempo de lectura razonable', () => {
    for (const a of TODOS_LOS_ARTICULOS) {
      expect(indiceDe(a).length).toBe(a.cuerpo.filter((b) => b.tipo === 'h2').length)
      expect(minutosDeLectura(a)).toBeGreaterThanOrEqual(5)
    }
  })
  it('fecha larga en español, estable entre servidor y navegador', () => { expect(fechaLarga('2026-10-21T09:00:00-06:00')).toBe('21 de octubre de 2026') })
  it('paginación acotada', () => {
    expect(pagina([1, 2, 3], 99).actual).toBe(1)
    expect(pagina(Array.from({ length: 20 }, (_, i) => i), 3)).toMatchObject({ actual: 3, total: 3 })
    expect(pagina([], 1)).toMatchObject({ actual: 1, total: 1, items: [] })
    expect(pagina(visibles('production'), 1).total).toBe(2)         // 18 artículos, 9 por página
  })
  it('relacionados: no incluye el propio, respeta el tope y prefiere la misma categoría', () => {
    const a = visibles('production')[0]
    const r = relacionados(a, 3, 'production'); expect(r).toHaveLength(3); expect(r.find((x) => x.slug === a.slug)).toBeUndefined()
    expect(r.filter((x) => x.categoria === a.categoria)).toHaveLength(2)
  })
  it('JSON-LD: BlogPosting con autor organización, fechas, citas y migas', () => {
    const j = jsonLdArticulo(TODOS_LOS_ARTICULOS[0]) as Record<string, unknown>[]
    expect(j[0]['@type']).toBe('BlogPosting'); expect((j[0].author as Record<string, string>)['@type']).toBe('Organization')
    expect(j[0].datePublished).toBeTruthy(); expect(j[1]['@type']).toBe('BreadcrumbList')
    expect((j[0].citation as unknown[]).length).toBeGreaterThanOrEqual(2)
  })
  it('las referencias se ordenan alfabéticamente por autor y la cita corta es (Autor, Año)', () => {
    const r = [
      { autor: 'Zeta', fecha: '2024', titulo: 'T', url: 'https://z.mx/' }, { autor: 'Ángel y Cía', fecha: 's. f.', titulo: 'T', url: 'https://a.mx/' },
      { autor: 'Beta', fecha: '2025, 3 de mayo', titulo: 'T', url: 'https://b.mx/' },
    ]
    expect(ordenarReferencias(r).map((x) => x.autor)).toEqual(['Ángel y Cía', 'Beta', 'Zeta'])
    expect(citaCorta(r[2])).toBe('(Beta, 2025)'); expect(citaCorta(r[1])).toBe('(Ángel y Cía, s. f.)')
  })
  it('la página del artículo imprime «Referencias» con sangría francesa y enlaces seguros', () => {
    const p = leer('src/app/blog/[slug]/page.tsx'); expect(p).toContain('<h2 id="blog-fuentes-t">Referencias</h2>'); expect(p).toContain('ordenarReferencias(a.referencias)')
    expect(leer('src/components/blog/blog.css')).toMatch(/text-indent: -2rem/)
  })
})

describe('blog · llamado a la acción', () => {
  it('el cierre manda a «Contáctanos» (/contacto), no a WhatsApp; Propiedades queda aparte', () => {
    const l = leer('src/components/blog/Listado.tsx')
    expect(l).toContain('href="/contacto"'); expect(l).toContain('Contáctanos'); expect(l).not.toMatch(/WhatsApp|wa\.me|enlaceWhatsApp/)
    expect(l).toContain('href="/propiedades"')
  })
})

describe('blog · buscador', () => {
  const lista = visibles('production')
  it('encuentra sin importar acentos ni mayúsculas, y exige todas las palabras', () => {
    expect(buscarArticulos(lista, 'LEON').length).toBeGreaterThan(5)
    expect(buscarArticulos(lista, 'nave industrial').map((a) => a.slug)).toContain('como-rentar-una-nave-industrial-en-leon')
    expect(buscarArticulos(lista, 'escrituracion').map((a) => a.slug)).toContain('gastos-de-escrituracion-al-comprar-una-propiedad')
    expect(buscarArticulos(lista, 'nave xyzinexistente')).toHaveLength(0)
  })
  it('consulta vacía devuelve todo; se recorta y se limita a 80 caracteres', () => {
    expect(buscarArticulos(lista, '   ')).toHaveLength(lista.length)
    expect(limpiarConsulta('  a   b  ')).toBe('a b')
    expect(limpiarConsulta('x'.repeat(200))).toHaveLength(80)
    expect(limpiarConsulta(undefined)).toBe('')
  })
  it('el formulario es un GET accesible y las búsquedas no se indexan ni cambian la canónica', () => {
    const p = leer('src/components/blog/Piezas.tsx')
    expect(p).toMatch(/role="search" action=\{accion\} method="get"/); expect(p).toContain('name="q"'); expect(p).toContain('Buscar en el blog')
    for (const f of ['src/app/blog/page.tsx', 'src/app/blog/categoria/[slug]/page.tsx']) {
      const t = leer(f); expect(t).toMatch(/noIndexar: buscando/); expect(t).toContain('limpiarConsulta')
    }
  })
})

describe('blog · integración', () => {
  it('«Blog» está en el header, entre Valuador y Contacto', () => {
    const h = leer('src/components/Header.tsx')
    const iV = h.indexOf("label: 'Valuador'"), iB = h.indexOf("label: 'Blog'"), iC = h.indexOf("label: 'Contacto'")
    expect(iV).toBeGreaterThan(0); expect(iB).toBeGreaterThan(iV); expect(iC).toBeGreaterThan(iB)
  })
  it('el texto de los artículos no puede inyectar marcado: sin dangerouslySetInnerHTML en los componentes del blog', () => {
    expect(leer('src/components/blog/Piezas.tsx')).not.toMatch(/dangerouslySetInnerHTML/)
    expect(leer('src/components/blog/Compartir.tsx')).not.toMatch(/dangerouslySetInnerHTML|<script/)
  })
  it('enlaces externos seguros y compartir sin scripts de terceros', () => {
    for (const f of ['Piezas', 'Compartir', 'Listado']) for (const m of leer(`src/components/blog/${f}.tsx`).match(/target="_blank"[^>]*/g) ?? []) expect(m).toContain('rel="noopener noreferrer"')
  })
  it('no se usa FAQPage: Google retiró ese resultado enriquecido en mayo de 2026 (las preguntas se quedan como contenido)', () => {
    expect(leer('src/lib/blog/seo.ts')).not.toMatch(/FAQPage/)
  })
})

describe('blog · en el inicio', () => {
  it('el servidor elige 4 artículos de 4 categorías distintas, empezando por el destacado; sin artículos no se pinta la sección', () => {
    const p = paraInicio('production')
    expect(p).toHaveLength(4); expect(new Set(p.map((x) => x.categoria)).size).toBe(4)
    expect(p[0].slug).toBe(visibles('production')[0].slug)
    expect(leer('src/app/page.tsx')).toContain('paraInicio()')
    expect(leer('src/components/inicio/BlogInicio.tsx')).toMatch(/articulos\.length === 0\) return null/)
    expect(leer('src/components/inicio/BlogInicio.tsx')).not.toMatch(/VERCEL_ENV|visibles\(/)
  })
  it('va entre las publicaciones de redes y «Contáctanos», y enlaza al blog', () => {
    const t = leer('src/app/page-client.tsx')
    expect(t.indexOf('<RedesSociales />')).toBeLessThan(t.indexOf('<BlogInicio'))
    expect(t.indexOf('<BlogInicio')).toBeLessThan(t.indexOf('<ContactoInicio />'))
    const c = leer('src/components/inicio/BlogInicio.tsx'); expect(c).toContain('href="/blog"'); expect(c).toContain('/blog/${a.slug}')
  })
})

describe('blog · artículo único', () => {
  it('articuloPorSlug encuentra uno real y no uno inventado', () => {
    expect(articuloPorSlug('como-leer-el-cat-y-comparar-creditos-hipotecarios', 'production')).toBeTruthy()
    expect(articuloPorSlug('no-existe', 'production')).toBeUndefined()
  })
})

describe('fotografías de terceros en las portadas', () => {
  const LICENCIAS_COMERCIALES = /^(CC0|Public domain|CC BY(-SA)? [0-9.]+|Licencia de Pexels)$/
  const ORIGEN = /^https:\/\/(commons\.wikimedia\.org\/wiki\/File:|www\.pexels\.com\/photo\/\d+\/)/
  it('toda portada con crédito trae autor, título, enlace de origen, licencia que permite uso comercial y nota de adaptación', () => {
    const conCredito = TODOS_LOS_ARTICULOS.filter((a) => a.portada.credito)
    expect(conCredito.length, 'los 18 artículos llevan foto con crédito').toBe(18)
    for (const a of conCredito) {
      const c = a.portada.credito!
      expect(c.autor.trim().length, a.slug).toBeGreaterThan(2)
      expect(c.titulo.trim().length, a.slug).toBeGreaterThan(2)
      expect(c.fuenteUrl, a.slug).toMatch(ORIGEN)
      expect(c.licencia, a.slug).toMatch(LICENCIAS_COMERCIALES)
      if (/^CC BY/.test(c.licencia)) expect(c.licenciaUrl, a.slug).toMatch(/^https:\/\/creativecommons\.org\/licenses\//)
      if (c.sitio === 'Pexels') {
        expect(c.licenciaUrl, a.slug).toBe('https://www.pexels.com/license/')
        expect(c.nota, a.slug).toMatch(/ilustrativa/)
      }
      expect(c.adaptacion, a.slug).toMatch(/Recortada|recortada/)
    }
  })
  it('las fotos existen en public/ y no se hace pasar otra ciudad por local: la de Pexels se declara ilustrativa; la de Commons nombra su lugar', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    for (const a of TODOS_LOS_ARTICULOS.filter((x) => x.portada.credito)) {
      const c = a.portada.credito!
      expect(fs.existsSync('public' + a.portada.src), a.slug).toBe(true)
      expect(a.portada.alt.length, a.slug).toBeGreaterThan(30)
      if (c.sitio === 'Pexels') expect(a.portada.alt, a.slug).toMatch(/ilustrativa/)
      else if (c.sitio === 'Wikimedia Commons' && /León|Silao|Puerto Interior/.test(c.titulo)) expect(a.portada.alt, a.slug).toMatch(/León|Silao|Puerto Interior|Guanajuato/)
    }
  })
})
