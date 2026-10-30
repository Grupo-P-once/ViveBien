import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import sharp from 'sharp'

/**
 * Portada de Propiedades (22-oct-2026). La anterior (2488×670) se veía borrosa en el teléfono: el hero alto la ampliaba por su poca altura.
 * Ahora: la imagen nueva a resolución NATIVA para escritorio y un recorte vertical propio para el teléfono.
 */
describe('portada de Propiedades', () => {
  it('escritorio: 2055×765 a resolución nativa, WebP ligero', async () => {
    const m = await sharp('public/portadas/propiedades.webp').metadata()
    expect([m.width, m.height, m.format]).toEqual([2055, 765, 'webp'])
    expect(statSync('public/portadas/propiedades.webp').size).toBeLessThan(400 * 1024)
  })
  it('teléfono: recorte 880×765 (casi cuadrado), sin ampliar, WebP ligero', async () => {
    const m = await sharp('public/portadas/propiedades-movil.webp').metadata()
    expect([m.width, m.height, m.format]).toEqual([880, 765, 'webp'])
    expect(statSync('public/portadas/propiedades-movil.webp').size).toBeLessThan(200 * 1024)
  })
  it('la página usa <picture> con el recorte para teléfono y precarga cada portada solo en su ancho', () => {
    const c = readFileSync('src/app/propiedades/page-client.tsx', 'utf8')
    expect(c).toContain('<picture>')
    expect(c).toMatch(/<source media="\(max-width: 700px\)" srcSet="\/portadas\/propiedades-movil\.webp"/)
    expect(c).toContain('src="/portadas/propiedades.webp"')
    const p = readFileSync('src/app/propiedades/page.tsx', 'utf8')
    expect(p).toMatch(/propiedades-movil\.webp[^)]*media: '\(max-width: 700px\)'/)
    expect(p).toMatch(/propiedades\.webp[^)]*media: '\(min-width: 701px\)'/)
  })
  it('en el teléfono el hero es más bajo, para no ampliar la imagen', () => {
    const css = readFileSync('src/components/catalogo/catalogo.css', 'utf8')
    expect(css).toMatch(/@media \(max-width: 700px\) \{ \.prop-hero \{ min-height: min\(52vh, 400px\); \} \}/)
  })
})
