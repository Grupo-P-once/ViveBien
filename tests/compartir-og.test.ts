import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import sharp from 'sharp'
import { TODOS_LOS_ARTICULOS } from '../src/lib/blog/articulos'

/**
 * Imágenes para compartir (22-oct-2026). Antes todas las páginas mostraban solo el logotipo sobre fondo blanco en WhatsApp. Ahora cada página
 * tiene su portada + el logotipo oficial (1200×630). Las fichas de propiedad siguen con la foto de la propiedad.
 */
const PAGINAS: Array<[string, string]> = [
  ['src/app/page.tsx', 'inicio'], ['src/app/propiedades/page.tsx', 'propiedades'], ['src/app/nosotros/page.tsx', 'nosotros'],
  ['src/app/contacto/page.tsx', 'contacto'], ['src/app/valuador/page.tsx', 'valuador'], ['src/app/blog/page.tsx', 'blog'],
  ['src/app/blog/categoria/[slug]/page.tsx', 'blog'], ['src/app/ayuda/page.tsx', 'ayuda'], ['src/app/comparar/page.tsx', 'propiedades'],
]
describe('imágenes para compartir (Open Graph)', () => {
  it.each(PAGINAS)('%s declara su imagen /og/%s.jpg', (archivo, og) => {
    expect(readFileSync(archivo, 'utf8')).toContain(`imagen: '/og/${og}.jpg'`)
  })
  it('el respaldo general ya no es el logotipo solo', () => {
    expect(readFileSync('src/lib/seo.ts', 'utf8')).toContain("IMAGEN_POR_DEFECTO = '/og/inicio.jpg'")
    expect(readFileSync('src/app/layout.tsx', 'utf8')).not.toContain("images: ['/logo_transparent.png']")
  })
  it('cada imagen existe, mide 1200×630 y pesa menos de 200 KB (WhatsApp recorta lo pesado)', async () => {
    const nombres = [...new Set(PAGINAS.map(([, o]) => o)), 'inicio', ...TODOS_LOS_ARTICULOS.filter((a) => !a.muestra).map((a) => `blog-${a.slug}`)]
    for (const n of nombres) {
      const p = `public/og/${n}.jpg`
      expect(existsSync(p), p).toBe(true)
      const m = await sharp(p).metadata()
      expect([m.width, m.height, m.format], p).toEqual([1200, 630, 'jpeg'])
      expect(statSync(p).size, p).toBeLessThan(200 * 1024)
    }
  })
  it('cada artículo del blog comparte su propia imagen', () => {
    expect(readFileSync('src/lib/blog/seo.ts', 'utf8')).toContain('`/og/blog-${a.slug}.jpg`')
  })
})

describe('metadatos de un artículo del blog', () => {
  it('Open Graph y Twitter comparten la imagen con logotipo (1200×630); el JSON-LD conserva la portada real', async () => {
    const { metadataArticulo, jsonLdArticulo } = await import('../src/lib/blog/seo')
    const a = TODOS_LOS_ARTICULOS.find((x) => !x.muestra)!
    const m = metadataArticulo(a)
    const og = (m.openGraph as { images: Array<{ url: string; width: number; height: number }> }).images[0]
    expect([og.url, og.width, og.height]).toEqual([`/og/blog-${a.slug}.jpg`, 1200, 630])
    expect(JSON.stringify(m.twitter)).toContain(`/og/blog-${a.slug}.jpg`)
    expect(JSON.stringify(jsonLdArticulo(a))).toContain(a.portada.src)
  })
})
