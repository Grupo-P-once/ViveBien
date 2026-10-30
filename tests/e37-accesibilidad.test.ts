import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * E-37 · ACCESIBILIDAD (axe `color-contrast` serious + `region` moderate), medida en E-35/E-36 con 4 anchos × 6 rutas.
 * Estas pruebas nacieron ROJAS contra E-35 (producción). `E37_RAIZ` permite apuntarlas a otro árbol (así se demostró el rojo).
 * Alcance: solo textos de contacto, 404, aviso de consentimiento y botón de la portada. Los nodos del catálogo (`PropertyCard`, `propiedades/page-client`,
 * `select` sin nombre) viven en archivos de V-1.1.95 y NO se tocan aquí (ver docs/QA/E37_CALIDAD_UX.md).
 */
const RAIZ = process.env.E37_RAIZ ?? path.join(__dirname, '..')
const leer = (rel: string) => readFileSync(path.join(RAIZ, ...rel.split('/')), 'utf8')

const luz = (hex: string) => {
  const c = hex.replace('#', '').match(/../g)!.map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contraste = (a: string, b: string) => { const [x, y] = [luz(a), luz(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const token = (nombre: string) => leer('src/app/globals.css').match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`))![1]

describe('E-37 · pares de color con contraste WCAG AA (≥ 4,5:1 en texto normal)', () => {
  const HUESO = '#f1efec', GRIS = '#edeae5', BLANCO = '#ffffff'
  it('gris de texto #5F6672: contacto (hueso) y 404 (blanco)', () => {
    expect(contraste('#5F6672', HUESO)).toBeGreaterThanOrEqual(4.5)
    expect(contraste('#5F6672', GRIS)).toBeGreaterThanOrEqual(4.5)
    expect(contraste('#5F6672', BLANCO)).toBeGreaterThanOrEqual(4.5)
  })
  it('aviso de consentimiento #6B7280 sobre blanco', () => expect(contraste('#6B7280', BLANCO)).toBeGreaterThanOrEqual(4.5))
  it('texto del botón de la portada: blanco sobre --rojo-marca', () => expect(contraste('#ffffff', token('rojo-marca'))).toBeGreaterThanOrEqual(4.5))
  it('botón de WhatsApp de la 404: #1A1A1A sobre --whatsapp', () => expect(contraste('#1A1A1A', token('whatsapp'))).toBeGreaterThanOrEqual(4.5))
  it('enlace de WhatsApp en contacto: #0B6B3A sobre hueso', () => expect(contraste('#0B6B3A', HUESO)).toBeGreaterThanOrEqual(4.5))
})

describe('E-37 · los archivos usan esos pares (y ya no los que fallaban)', () => {
  it('contacto: etiquetas #5F6672 (no #888) y el enlace de WhatsApp con texto oscuro', () => {
    // El rediseño de «Contacto» (21-oct-2026) pasó los estilos a `contacto.css` / `nosotros.css`: se comprueban los mismos pares allí.
    const s = leer('src/app/contacto/page-client.tsx')
    const c = leer('src/components/contacto/contacto.css')
    const n = leer('src/components/nosotros/nosotros.css')
    expect(s + c).not.toMatch(/#888\b/)
    expect(c).toContain('color: #4b5563')                               // etiquetas: gris 7,5:1 sobre hueso (antes #888)
    expect(c).toContain('.nos .cto-ico-verde { background: #17803d; }') // icono blanco sobre verde oscurecido
    expect(c).toContain('.nos .cto-ico-naranja { background: #b45f06; }')
    // ningún botón verde de WhatsApp con texto blanco (antes blanco sobre verde: 1,98:1): texto oscuro
    expect(n).toMatch(/a\.nos-boton-verde \{[^}]*color: #0b1a10/)
    expect(n).not.toMatch(/a\.nos-boton-verde \{[^}]*color: #fff/)
  })
  it('404: gris accesible y botón de WhatsApp con texto #1A1A1A (no blanco sobre verde)', () => {
    const s = leer('src/app/not-found.tsx')
    expect(s).not.toMatch(/color: '#888'/)
    expect(s).toMatch(/background: 'var\(--whatsapp\)', color: '#1A1A1A'/)
  })
  it('consentimiento: #6B7280 (no #8B95A3)', () => {
    const s = leer('src/components/Consentimiento.tsx')
    expect(s).not.toContain('#8B95A3')
    expect(s).toContain("color: '#6B7280'")
  })
  it('portada: botón con texto blanco (no #0a0e1a sobre rojo) y contenido dentro de <main>', () => {
    const s = leer('src/app/page-client.tsx')
    expect(s).not.toContain("color: '#0a0e1a', border: 'none', borderRadius: '8px'")
    expect(s).toMatch(/<Header \/>[\s\S]*<main>[\s\S]*<\/main>\s*<Footer \/>/)
  })
})
