import { describe, it, expect } from 'vitest'
import { extraerDeTexto } from '../src/lib/telegram'

describe('extraer datos de un mensaje de Telegram', () => {
  it('un mensaje vacio no da nada', () => {
    expect(extraerDeTexto('')).toEqual({})
    expect(extraerDeTexto('   ')).toEqual({})
  })

  it('siempre conserva el texto completo en la descripcion', () => {
    const t = 'Algo que no entiende nadie xyz'
    expect(extraerDeTexto(t).descripcion).toBe(t)
  })

  it('lee un caso tipico completo', () => {
    const d = extraerDeTexto('Casa en Las Trojes con jardin\nVenta, 180 m2, 2.5 millones, 3 recamaras, 2 banos')
    expect(d.tipo).toBe('casa')
    expect(d.operacion).toBe('venta')
    expect(d.metros).toBe(180)
    expect(d.precio).toBe(2500000)
    expect(d.recamaras).toBe(3)
    expect(d.banos).toBe(2)
  })

  it('distingue nave de bodega', () => {
    expect(extraerDeTexto('Nave industrial en renta').tipo).toBe('nave')
    expect(extraerDeTexto('Bodega en San Juan').tipo).toBe('bodega')
  })

  it('entiende renta y venta', () => {
    expect(extraerDeTexto('Se renta local').operacion).toBe('renta')
    expect(extraerDeTexto('Se vende terreno').operacion).toBe('venta')
  })

  it('acepta el precio con simbolo y separadores', () => {
    expect(extraerDeTexto('Terreno grande $2,500,000').precio).toBe(2500000)
  })

  it('no confunde un numero pequenio con un precio', () => {
    expect(extraerDeTexto('Casa con $500 de mantenimiento').precio).toBeUndefined()
  })

  it('acepta m2 y m con superindice', () => {
    expect(extraerDeTexto('Terreno de 450 m2').metros).toBe(450)
    expect(extraerDeTexto('Terreno de 450 m²').metros).toBe(450)
  })

  it('el titulo sale de la primera linea, si es suficientemente larga', () => {
    expect(extraerDeTexto('Casa en Jardines del Moral\nmas detalles').titulo)
      .toBe('Casa en Jardines del Moral')
  })

  it('una primera linea muy corta no sirve de titulo', () => {
    expect(extraerDeTexto('Hola\nCasa grande en venta').titulo).toBeUndefined()
  })

  it('no inventa lo que no esta', () => {
    const d = extraerDeTexto('Propiedad disponible para mostrar')
    expect(d.precio).toBeUndefined()
    expect(d.metros).toBeUndefined()
    expect(d.operacion).toBeUndefined()
  })
})
