import { describe, expect, it } from 'vitest'
import { coincidePatron, leerSitemap } from '../src/lib/seo/robots'

/**
 * Semgrep (detect-non-literal-regexp) marcaba `aRegex` y `etiqueta` en `lib/seo/robots.ts`. Se sustituyeron por una comparación sin regex y por dos expresiones fijas.
 * Aquí se comprueba que el comportamiento es el MISMO que el de la expresión regular original (la referencia vive sólo en la prueba) y que ya no hay retroceso.
 */
function referencia(patron: string, ruta: string): boolean {
  const fin = patron.endsWith('$')
  const cuerpo = (fin ? patron.slice(0, -1) : patron).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + cuerpo + (fin ? '$' : '')).test(ruta)
}

describe('coincidePatron (robots.txt) equivale a la expresión regular original', () => {
  const ALFABETO = ['a', 'b', '/', '*', '$', '.', '?']
  const generar = (semilla: number, largo: number) => {
    let s = semilla
    let t = ''
    for (let i = 0; i < largo; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; t += ALFABETO[s % ALFABETO.length] }
    return t
  }

  it('casos conocidos del estándar', () => {
    const casos: Array<[string, string, boolean]> = [
      ['/', '/cualquier', true], ['/admin', '/admin/x', true], ['/admin', '/administrador', true], ['/admin/', '/admin', false],
      ['/*.pdf$', '/a/b.pdf', true], ['/*.pdf$', '/a/b.pdf?x=1', false], ['/*?utm=', '/p?utm=1', true], ['/a*b*c', '/aXbYc', true], ['/a*b*c', '/aXcYb', false],
      ['/fin$', '/fin', true], ['/fin$', '/fin/', false], ['*', '/x', true], ['/*$', '/x', true], ['/a*a$', '/a', false], ['/a*a$', '/aa', true],
    ]
    for (const [p, r, esperado] of casos) expect(coincidePatron(p, r), `${p} ~ ${r}`).toBe(esperado)
  })

  it('3 000 pares generados dan el mismo resultado que la regex original', () => {
    for (let i = 0; i < 3000; i++) {
      const patron = '/' + generar(i + 1, 1 + (i % 7))
      const ruta = '/' + generar(i * 7 + 3, i % 9)
      expect(coincidePatron(patron, ruta), `${patron} ~ ${ruta}`).toBe(referencia(patron, ruta))
    }
  })

  it('un patrón con muchos «*» contra una ruta larga NO se cuelga (la regex original sí retrocede)', () => {
    const patron = '/' + '*a'.repeat(40) + 'b'
    const ruta = '/' + 'a'.repeat(20_000)
    const t0 = Date.now()
    expect(coincidePatron(patron, ruta)).toBe(false)
    expect(Date.now() - t0).toBeLessThan(500)
  })
})

describe('leerSitemap con las expresiones fijas', () => {
  it('sigue leyendo loc y lastmod (con espacios, CDATA y entidades) igual que antes', () => {
    const xml = '<urlset><url><loc> https://x.test/a?b=1&amp;c=2 </loc><lastmod>2026-11-05</lastmod></url><url><loc><![CDATA[https://x.test/b]]></loc></url></urlset>'
    expect(leerSitemap(xml)).toEqual({ tipo: 'urlset', urls: [{ loc: 'https://x.test/a?b=1&c=2', lastmod: '2026-11-05' }, { loc: 'https://x.test/b', lastmod: null }], hijos: [] })
    expect(leerSitemap('<sitemapindex><sitemap><loc>https://x.test/s1.xml</loc></sitemap></sitemapindex>')).toMatchObject({ tipo: 'index', hijos: ['https://x.test/s1.xml'] })
  })
})
