import { describe, it, expect } from 'vitest'
import { lugarDe, ciudadesDe } from '../src/lib/ubicacion'

describe('lugarDe — el fallo de la dirección duplicada', () => {
  it('Tzula: «Gto.» se reconoce y no se añade «León, Guanajuato» otra vez', () => {
    const l = lugarDe({ ubicacion: 'Tzula Los Castillos, Leon, Gto.' })
    expect(l.completo).toBe('Tzula Los Castillos, Leon, Gto.')
    expect(l.ciudad).toBe('León')
    expect(l.estado).toBe('Guanajuato')
    expect(l.fiable).toBe(true)
  })

  it('San Juan Bosco con acento y «Gto.»', () => {
    const l = lugarDe({ ubicacion: 'Blvd. San Juan Bosco, León, Gto.' })
    expect(l).toMatchObject({ ciudad: 'León', estado: 'Guanajuato', completo: 'Blvd. San Juan Bosco, León, Gto.' })
  })

  it('nombre completo del estado, sin acento', () => {
    expect(lugarDe({ ubicacion: 'Centro, Queretaro, Queretaro' })).toMatchObject({ ciudad: 'Querétaro', estado: 'Querétaro' })
  })

  it('el país al final no se confunde con el Estado de México', () => {
    const l = lugarDe({ ubicacion: 'Centro, León, Gto., México' })
    expect(l).toMatchObject({ ciudad: 'León', estado: 'Guanajuato' })
    expect(l.completo).toBe('Centro, León, Gto., México')
  })

  it('abreviaturas de otros estados', () => {
    expect(lugarDe({ ubicacion: 'Zona Centro, Lagos de Moreno, Jal.' }).estado).toBe('Jalisco')
    expect(lugarDe({ ubicacion: 'Roma Norte, Cuauhtémoc, CDMX' }).estado).toBe('Ciudad de México')
  })
})

describe('lugarDe — sin estado escrito', () => {
  it('Silao sin estado: se sabe que es Guanajuato, no se manda a León', () => {
    const l = lugarDe({ ubicacion: 'Puerto Interior, Silao' })
    expect(l).toMatchObject({ ciudad: 'Silao', estado: 'Guanajuato', fiable: true })
    expect(l.completo).toBe('Puerto Interior, Silao, Guanajuato')
  })

  it('«Leon» sin acento se escribe bien y no se repite', () => {
    const l = lugarDe({ ubicacion: 'Jardines del Moral, Leon' })
    expect(l.ciudad).toBe('León')
    expect(l.completo).toBe('Jardines del Moral, Leon, Guanajuato')
  })

  it('nada reconocible: se supone León, marcado como no fiable', () => {
    const l = lugarDe({ ubicacion: 'Blvd. Campestre 2910' })
    expect(l).toMatchObject({ ciudad: 'León', fiable: false, completo: 'Blvd. Campestre 2910, León, Guanajuato' })
  })

  it('vacío', () => {
    expect(lugarDe({ ubicacion: '' })).toMatchObject({ ciudad: 'León', completo: 'León, Guanajuato', fiable: false })
  })
})

describe('lugarDe — con columnas (migración 07)', () => {
  it('la columna manda sobre el texto', () => {
    expect(lugarDe({ ciudad: 'Silao', ubicacion: 'Calle 1, León' }).ciudad).toBe('Silao')
  })
  it('sin estado_dir, el estado sale de la ciudad, no de la casa', () => {
    expect(lugarDe({ ciudad: 'Lagos de Moreno', ubicacion: 'Centro' }).estado).toBe('Jalisco')
  })
  it('no duplica si el texto ya trae la ciudad', () => {
    expect(lugarDe({ ciudad: 'León', estado_dir: 'Guanajuato', ubicacion: 'Tzula, Leon, Gto.' }).completo)
      .toBe('Tzula, Leon, Gto.')
  })
})

describe('ciudadesDe — el «2 ciudades» con las dos en León', () => {
  it('«Leon» y «León» cuentan como una, bien escrita', () => {
    expect(ciudadesDe([
      { ubicacion: 'Tzula Los Castillos, Leon, Gto.' },
      { ubicacion: 'Blvd. San Juan Bosco, León, Gto.' },
    ])).toEqual(['León'])
  })
  it('dos ciudades de verdad son dos', () => {
    expect(ciudadesDe([{ ubicacion: 'A, León, Gto.' }, { ubicacion: 'B, Silao' }])).toEqual(['León', 'Silao'])
  })
  it('ignora las que no tienen ubicación', () => {
    expect(ciudadesDe([{ ubicacion: '' }, { ubicacion: null }])).toEqual([])
  })
})
