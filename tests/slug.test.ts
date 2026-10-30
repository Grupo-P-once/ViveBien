import { describe, it, expect } from 'vitest'
import { slugDe, slugUnico, esRelleno, normalizar, idPresentable } from '../src/lib/slug'

describe('esRelleno', () => {
  it('reconoce los títulos que el propio sistema se inventa', () => {
    for (const t of ['Propiedad sin título', 'propiedad sin titulo', 'Borrador desde Telegram', 'Sin título', '']) {
      expect(esRelleno(t)).toBe(true)
    }
  })

  it('no confunde un título real con relleno', () => {
    for (const t of ['Nave industrial Mandujano', 'TERRENO LAGOS - LEON', 'Quinta en Venta - Tzula Los Castillos']) {
      expect(esRelleno(t)).toBe(false)
    }
  })
})

describe('normalizar', () => {
  it('quita acentos y la eñe', () => {
    expect(normalizar('Cañada del Refugio')).toBe('canada-del-refugio')
  })

  it('no deja guiones sueltos en los extremos ni dobles', () => {
    expect(normalizar('  TERRENO LAGOS - LEON  ')).toBe('terreno-lagos-leon')
  })
})

describe('slugDe', () => {
  it('arma tipo, operación, título y ciudad en el orden en que se busca', () => {
    expect(slugDe({ tipo: 'nave', operacion: 'renta', titulo: 'Bodega Mandujano', ciudad: 'León' }))
      .toBe('nave-industrial-en-renta-bodega-mandujano-leon')
  })

  it('ignora el título de relleno en vez de sellarlo en la URL', () => {
    // Éste es el fallo entero: el slug nacía de «Propiedad sin título».
    const s = slugDe({ tipo: 'casa', operacion: 'venta', titulo: 'Propiedad sin título', ciudad: 'León' })
    expect(s).toBe('casa-en-venta-leon')
    expect(s).not.toContain('sin-titulo')
  })

  it('no repite palabras que el título ya dice', () => {
    const s = slugDe({ tipo: 'terreno', operacion: 'venta', titulo: 'TERRENO LAGOS - LEON', ciudad: 'León' })
    expect(s).toBe('terreno-en-venta-lagos-leon')
  })

  it('devuelve null cuando no hay nada real', () => {
    // Un borrador recién abierto: sin tipo, sin operación, sin título.
    expect(slugDe({ titulo: 'Propiedad sin título' })).toBeNull()
    expect(slugDe({})).toBeNull()
  })

  it('no pasa de 70 caracteres y no corta a media palabra', () => {
    const s = slugDe({
      tipo: 'casa', operacion: 'venta', ciudad: 'León',
      titulo: 'CASA CAÑADA DE MARICHES CAÑADA DEL REFUGIO SUR SEGUNDA SECCION RESIDENCIAL',
    })!
    expect(s.length).toBeLessThanOrEqual(70)
    expect(s.endsWith('-')).toBe(false)
  })

  it('funciona aunque falte la ciudad', () => {
    expect(slugDe({ tipo: 'casa', operacion: 'venta' })).toBe('casa-en-venta')
  })
})

describe('slugUnico', () => {
  it('distingue dos propiedades que producen el mismo nombre', () => {
    const comun = { tipo: 'terreno', operacion: 'venta', ciudad: 'Silao' }
    const a = slugUnico(comun, 'propiedad-sin-titulo-wljv')
    const b = slugUnico(comun, 'propiedad-sin-titulo-qzsl')
    expect(a).not.toBe(b)
  })

  it('el sufijo es estable: el mismo id da siempre el mismo nombre', () => {
    // Si dependiera de la hora, cada recálculo cambiaría la URL.
    const p = { tipo: 'casa', operacion: 'venta', ciudad: 'León' }
    expect(slugUnico(p, 'abc123')).toBe(slugUnico(p, 'abc123'))
  })

  it('sigue siendo null si no hay con qué construirlo', () => {
    expect(slugUnico({ titulo: 'Propiedad sin título' }, 'abc')).toBeNull()
  })
})

describe('idPresentable', () => {
  it('los ids con relleno o claves internas necesitan nombre público', () => {
    for (const id of ['propiedad-sin-titulo-d52n', 'borrador-mf3k8x2p', 'tg-n1003782780222-mu07yy0t', 'prop-1726000000000']) {
      expect(idPresentable(id)).toBe(false)
    }
  })

  it('los ids que ya son un buen nombre se quedan como están', () => {
    // Darles slug nuevo sería redirigir URLs que ya funcionan y ya están indexadas.
    for (const id of ['sanjuan', 'tzula-castillos', 'nave-industrial-leon-x7k2']) {
      expect(idPresentable(id)).toBe(true)
    }
  })
})
