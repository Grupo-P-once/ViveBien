import { describe, expect, it } from 'vitest'
import { descripcionDeArticulo } from '../src/lib/ayuda/descripcion'

/** Descripciones reales que Search Console mostró el 23-oct-2026 (37 y 45 caracteres). */
describe('descripcionDeArticulo', () => {
  const cuerpo = 'El valuador da una **estimación orientativa** con los datos que escribes de tu propiedad. No es un avalúo oficial.\n\nSegundo párrafo que no entra.'

  it('un resumen corto se completa con el inicio del artículo, sin Markdown', () => {
    const d = descripcionDeArticulo('¿Cómo funciona el valuador?', 'Una estimación con los datos de tu propiedad.', cuerpo)
    expect(d.startsWith('Una estimación con los datos de tu propiedad.')).toBe(true)
    expect(d).toContain('estimación orientativa')
    expect(d).not.toContain('**')
    expect(d).not.toContain('Segundo párrafo')
    expect(d.length).toBeGreaterThanOrEqual(70)
    expect(d.length).toBeLessThanOrEqual(158)
  })
  it('un resumen que ya es suficiente se respeta', () => {
    const largo = 'Aquí está la explicación completa de cómo solicitar una cita para visitar una propiedad desde tu portal.'
    expect(descripcionDeArticulo('t', largo, cuerpo)).toBe(largo)
  })
  it('quita enlaces Markdown y deja solo su texto', () => {
    const d = descripcionDeArticulo('t', 'Corto.', 'Revisa el [Aviso de Privacidad](/privacidad) para saber cómo se tratan tus datos y cuánto tiempo se conservan.')
    expect(d).toContain('Aviso de Privacidad')
    expect(d).not.toContain('](')
  })
  it('sin resumen ni cuerpo cae al título, sin inventar nada', () => {
    expect(descripcionDeArticulo('Entender la valuación', null, null)).toBe('Entender la valuación — Centro de Ayuda de VIVE BIEN.')
  })
  it('nunca pasa de 158 caracteres y corta en límite de palabra', () => {
    const d = descripcionDeArticulo('t', 'Resumen.', 'palabra '.repeat(80))
    expect(d.length).toBeLessThanOrEqual(158)
    expect(d.endsWith('…')).toBe(true)
    expect(d).not.toMatch(/palab…$/)
  })
})
