import { describe, it, expect } from 'vitest'
import { prefijoDe, pasoDe, faltaParaPublicar } from '../src/lib/telegram'

describe('prefijoDe — el chat vive en el id, no en `extras`', () => {
  it('un grupo (id negativo) da un prefijo usable como URL', () => {
    const p = prefijoDe('-1003782780222')
    expect(p).toBe('tg-n1003782780222-')
    expect(p).toMatch(/^[a-z0-9-]+$/)
  })
  it('un chat personal', () => {
    expect(prefijoDe('123456789')).toBe('tg-123456789-')
  })
  it('dos chats distintos no se pisan', () => {
    expect(prefijoDe('-100123')).not.toBe(prefijoDe('100123'))
  })
})

describe('pasoDe', () => {
  it('lee el paso guardado', () => {
    expect(pasoDe({ nota_moderacion: 'tg:fotos' })).toBe('fotos')
  })
  it('sin nota, empieza de cero', () => {
    expect(pasoDe({})).toBe('inicio')
    expect(pasoDe(null)).toBe('inicio')
  })
  it('una nota de moderación escrita por una persona no se toma por un paso', () => {
    expect(pasoDe({ nota_moderacion: 'Falta el precio, revisar' })).toBe('inicio')
    expect(pasoDe({ nota_moderacion: 'tg: algo raro' })).toBe('inicio')
  })
})

describe('faltaParaPublicar', () => {
  const completa = {
    titulo: 'Quinta con salón de eventos',
    precio: 5000000,
    ubicacion: 'Tzula Los Castillos, León, Gto.',
    tipo: 'casa',
    operacion: 'venta',
    fotos: ['a.jpg'],
  }

  it('con lo imprescindible, se publica', () => {
    expect(faltaParaPublicar(completa)).toEqual([])
  })
  it('una sola foto basta para publicar: el mínimo de 5 es para el catálogo, no un muro', () => {
    expect(faltaParaPublicar({ ...completa, fotos: ['a.jpg'] })).toEqual([])
  })
  it('sin fotos no se publica', () => {
    expect(faltaParaPublicar({ ...completa, fotos: [] })).toEqual(['al menos una foto'])
  })
  it('el título de relleno del bot no cuenta como título', () => {
    expect(faltaParaPublicar({ ...completa, titulo: 'Borrador desde Telegram' })).toEqual(['el título'])
  })
  it('un borrador recién creado enumera todo lo que falta', () => {
    expect(faltaParaPublicar({})).toEqual([
      'el título', 'el precio', 'la ubicación', 'el tipo', 'la operación', 'al menos una foto',
    ])
  })
})
