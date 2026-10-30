import { describe, it, expect } from 'vitest'
import {
  normalizarFiltros, filtrosDeUrl, aHref, describir, coincide, contar, mismaBusqueda,
} from '../src/lib/busquedas'

describe('normalizarFiltros', () => {
  it('se queda sólo con lo válido', () => {
    expect(normalizarFiltros({ op: 'venta', tipo: 'Casa', zona: '  Campestre  ', pmin: '1000000' }))
      .toEqual({ op: 'venta', tipo: 'casa', zona: 'Campestre', pmin: 1000000 })
  })
  it('sin filtros devuelve null: guardar «todo» no sirve', () => {
    expect(normalizarFiltros({})).toBeNull()
    expect(normalizarFiltros({ op: 'regalo', zona: 'a', pmin: '-5' })).toBeNull()
  })
  it('rechaza un tipo con caracteres raros', () => {
    expect(normalizarFiltros({ tipo: "casa'; drop table" })).toBeNull()
  })
  it('depto se guarda como departamento', () => {
    expect(normalizarFiltros({ tipo: 'depto' })?.tipo).toBe('departamento')
  })
  it('mínimo mayor que máximo: se intercambian en vez de dar cero resultados', () => {
    expect(normalizarFiltros({ pmin: '5000000', pmax: '2000000' })).toEqual({ pmin: 2000000, pmax: 5000000 })
  })
  it('acepta los nombres del estado del listado (precioMin/precioMax)', () => {
    expect(normalizarFiltros({ precioMin: '100', precioMax: '200' })).toEqual({ pmin: 100, pmax: 200 })
  })
  it('recorta una zona enorme', () => {
    expect(normalizarFiltros({ zona: 'x'.repeat(500) })?.zona).toHaveLength(60)
  })
})

describe('ida y vuelta por la URL', () => {
  it('aHref y filtrosDeUrl son inversos', () => {
    const f = { op: 'renta' as const, tipo: 'nave', zona: 'Puerto Interior', pmax: 90000 }
    const url = aHref(f)
    expect(url.startsWith('/propiedades?')).toBe(true)
    expect(filtrosDeUrl(new URLSearchParams(url.split('?')[1]))).toEqual(f)
  })
  it('sin filtros, el listado entero', () => {
    expect(aHref({})).toBe('/propiedades')
  })
})

describe('describir', () => {
  it('se lee de corrido', () => {
    expect(describir({ op: 'venta', tipo: 'casa', zona: 'Campestre', pmax: 3000000 }))
      .toBe('Casas en venta · Campestre · hasta $3 M')
  })
  it('rango completo y cifras con decimal', () => {
    expect(describir({ tipo: 'nave', pmin: 1500000, pmax: 12000000 }))
      .toBe('Naves industriales · $1.5 M – $12 M')
  })
  it('sólo operación', () => {
    expect(describir({ op: 'renta', pmin: 15000 })).toBe('Inmuebles en renta · desde $15 mil')
  })
})

describe('coincide', () => {
  const casa = { operacion: 'venta', tipo: 'casa', ubicacion: 'Tzula Los Castillos, León, Gto.', precio: 5000000, estatus: 'disponible' }

  it('coincide con filtros compatibles', () => {
    expect(coincide(casa, { op: 'venta', tipo: 'casa', zona: 'tzula', pmax: 6000000 })).toBe(true)
  })
  it('la zona ignora acentos y mayúsculas', () => {
    expect(coincide(casa, { zona: 'LEON' })).toBe(true)
  })
  it('busca la zona también en colonia y ciudad (migración 07)', () => {
    expect(coincide({ ...casa, ubicacion: 'Blvd. X 123', colonia: 'Jardines del Moral' }, { zona: 'moral' })).toBe(true)
  })
  it('fuera de rango, otra operación u otro tipo: no', () => {
    expect(coincide(casa, { pmax: 4000000 })).toBe(false)
    expect(coincide(casa, { op: 'renta' })).toBe(false)
    expect(coincide(casa, { tipo: 'nave' })).toBe(false)
  })
  it('vendida o pausada no sale', () => {
    expect(coincide({ ...casa, estatus: 'vendida' }, {})).toBe(false)
    expect(coincide({ ...casa, estatus: 'pausada' }, {})).toBe(false)
  })
  it('sin precio no entra en un rango de precio', () => {
    expect(coincide({ ...casa, precio: null }, { pmin: 1 })).toBe(false)
    expect(coincide({ ...casa, precio: null }, { tipo: 'casa' })).toBe(true)
  })
})

describe('contar', () => {
  const base = { operacion: 'venta', tipo: 'casa', ubicacion: 'León', precio: 1000000 }
  const lista = [
    { ...base, publicada_en: '2026-09-01T00:00:00Z' },
    { ...base, publicada_en: '2026-09-10T00:00:00Z' },
    // Creada antes, publicada después: es nueva para quien busca.
    { ...base, created_at: '2026-08-01T00:00:00Z', publicada_en: '2026-09-11T00:00:00Z' },
    { ...base, tipo: 'nave', publicada_en: '2026-09-11T00:00:00Z' },
  ]
  it('total y nuevas desde que se guardó', () => {
    expect(contar(lista, { tipo: 'casa' }, '2026-09-05T00:00:00Z')).toEqual({ total: 3, nuevas: 2 })
  })
  it('sin fecha de referencia, ninguna es «nueva»', () => {
    expect(contar(lista, { tipo: 'casa' }, null)).toEqual({ total: 3, nuevas: 0 })
  })
})

describe('mismaBusqueda', () => {
  it('iguales aunque cambie el acento de la zona', () => {
    expect(mismaBusqueda({ zona: 'León', tipo: 'casa' }, { tipo: 'casa', zona: 'leon' })).toBe(true)
  })
  it('distintas si cambia un precio', () => {
    expect(mismaBusqueda({ pmax: 1 }, { pmax: 2 })).toBe(false)
  })
})
