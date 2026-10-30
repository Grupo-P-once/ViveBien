import { describe, it, expect } from 'vitest'
import { agregar, quitar, incluye, normalizar, sugerenciasDe, MAXIMO_AMENIDADES } from '../src/lib/amenidades'

describe('agregar', () => {
  it('EL FALLO: varias separadas por comas, que es lo que no se podía', () => {
    expect(agregar([], 'trifásica, patio de maniobras, cisterna'))
      .toEqual(['trifásica', 'patio de maniobras', 'cisterna'])
  })

  it('acepta saltos de línea: es lo que sale al copiar de una ficha', () => {
    expect(agregar([], 'Alberca\nJardín\nCochera')).toEqual(['Alberca', 'Jardín', 'Cochera'])
  })

  it('no repite, aunque cambien acentos o mayúsculas', () => {
    const lista = agregar(['Trifásica'], 'TRIFASICA')
    expect(lista).toEqual(['Trifásica'])
  })

  it('guarda el texto como lo escribió la persona, no en minúsculas', () => {
    expect(agregar([], 'Patio de Maniobras')).toEqual(['Patio de Maniobras'])
  })

  it('ignora comas sueltas y espacios de más', () => {
    expect(agregar([], ' , alberca ,,  jardín , ')).toEqual(['alberca', 'jardín'])
  })

  it('respeta el tope', () => {
    const muchas = Array.from({ length: MAXIMO_AMENIDADES }, (_, i) => `a${i}`)
    expect(agregar(muchas, 'una más')).toHaveLength(MAXIMO_AMENIDADES)
  })

  it('recorta una amenidad kilométrica', () => {
    expect(agregar([], 'x'.repeat(200))[0]).toHaveLength(40)
  })

  it('con texto vacío no añade nada', () => {
    expect(agregar(['alberca'], '   ')).toEqual(['alberca'])
  })
})

describe('quitar e incluye', () => {
  it('quita sin importar acentos', () => {
    expect(quitar(['Trifásica', 'Cisterna'], 'trifasica')).toEqual(['Cisterna'])
  })
  it('incluye compara igual', () => {
    expect(incluye(['Roof garden'], 'ROOF GARDEN')).toBe(true)
    expect(incluye(['Roof garden'], 'Alberca')).toBe(false)
  })
})

describe('normalizar', () => {
  it('colapsa espacios', () => {
    expect(normalizar('  patio   de    maniobras ')).toBe('patio de maniobras')
  })
})

describe('sugerenciasDe', () => {
  it('una nave no tiene alberca; una casa no tiene andén', () => {
    expect(sugerenciasDe('nave')).toContain('Andén de carga')
    expect(sugerenciasDe('nave')).not.toContain('Alberca')
    expect(sugerenciasDe('casa')).toContain('Alberca')
    expect(sugerenciasDe('casa')).not.toContain('Andén de carga')
  })
  it('sin tipo, algo razonable en vez de nada', () => {
    expect(sugerenciasDe(null).length).toBeGreaterThan(0)
    expect(sugerenciasDe('inventado').length).toBeGreaterThan(0)
  })
})
