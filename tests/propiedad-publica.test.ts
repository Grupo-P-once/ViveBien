import { describe, it, expect } from 'vitest'
import { nombreDe, nombreProvisional, rutaDe, tituloReal, SIN_NOMBRE } from '../src/lib/propiedad-publica'

describe('nombreDe — nunca se le enseña la clave interna a nadie', () => {
  it('usa el título escrito cuando es de verdad', () => {
    expect(nombreDe({ titulo: 'Nave industrial Mandujano' })).toBe('Nave industrial Mandujano')
  })

  it('el título de relleno no cuenta como título', () => {
    // Antes se enseñaba «Propiedad sin título» como si alguien lo hubiera
    // escrito a propósito, en el panel, el asistente y la vista previa.
    expect(nombreDe({ titulo: 'Propiedad sin título', tipo: 'nave', operacion: 'renta' }))
      .toBe('Nave industrial en renta')
    expect(nombreDe({ titulo: 'Borrador desde Telegram', tipo: 'casa', operacion: 'venta' }))
      .toBe('Casa en venta')
  })

  it('sin título ni tipo dice que es un borrador, no el id', () => {
    const n = nombreDe({ titulo: null })
    expect(n).toBe(SIN_NOMBRE)
    expect(n).not.toMatch(/sin-titulo|borrador-|tg-/)
  })

  it('nombreProvisional distingue lo escrito de lo armado', () => {
    expect(nombreProvisional({ titulo: 'Casa Tzula' })).toBe(false)
    expect(nombreProvisional({ titulo: 'Propiedad sin título' })).toBe(true)
    expect(nombreProvisional({ titulo: null })).toBe(true)
  })

  it('tituloReal devuelve null para el relleno, para que el asistente avise que falta', () => {
    expect(tituloReal({ titulo: 'Propiedad sin título' })).toBeNull()
    expect(tituloReal({ titulo: '   ' })).toBeNull()
    expect(tituloReal({ titulo: ' Casa Tzula ' })).toBe('Casa Tzula')
  })
})

describe('rutaDe', () => {
  it('usa el nombre público cuando lo hay', () => {
    expect(rutaDe({ id: 'propiedad-sin-titulo-d52n', slug: 'nave-industrial-en-venta-mandujano-leon-x7k2' }))
      .toBe('/propiedades/nave-industrial-en-venta-mandujano-leon-x7k2')
  })

  it('cae al id cuando todavía no hay nombre público', () => {
    expect(rutaDe({ id: 'sanjuan' })).toBe('/propiedades/sanjuan')
    expect(rutaDe({ id: 'sanjuan', slug: null })).toBe('/propiedades/sanjuan')
    expect(rutaDe({ id: 'sanjuan', slug: '  ' })).toBe('/propiedades/sanjuan')
  })
})
