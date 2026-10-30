import { describe, expect, it } from 'vitest'
import { aHref, coincide, contar, describir, mismaBusqueda, normalizarFiltros } from '@/lib/busquedas'

/** Filtros de características del catálogo (recámaras, baños, estacionamientos, superficie, renta) y su acuerdo con las búsquedas guardadas. */

const car = (c: Record<string, unknown>) => ({ caracteristicas: { v: 1, ...c } })
const casaRenta = { tipo: 'casa', operacion: 'renta', precio: 15000, recamaras: 3, banos: 2.5, metros: 140, extras: car({ estacionamientos: 2, amueblado: 'semi', mascotas: 'con_restricciones' }) }
const deptoVenta = { tipo: 'departamento', operacion: 'venta', precio: 2_000_000, recamaras: 2, banos: 2, metros: 80, extras: car({ estacionamientos: 1 }) }
const oficinaRenta = { tipo: 'oficina', operacion: 'renta', precio: 18000, banos: 1, metros: 95, extras: car({ estacionamientos: 4, amueblado: 'si' }) }
const sinDatos = { tipo: 'casa', operacion: 'venta', precio: 3_000_000 }
const lista = [casaRenta, deptoVenta, oficinaRenta, sinDatos]
const buscar = (f: Record<string, unknown>) => lista.filter((p) => coincide(p, normalizarFiltros(f) ?? {}))

describe('normalizarFiltros · características', () => {
  it('acepta mínimos y superficies, y los acomoda', () => {
    expect(normalizarFiltros({ rec: '2', ban: 2, est: '1', smin: '200', smax: '100' })).toEqual({ rec: 2, ban: 2, est: 1, smin: 100, smax: 200 })
  })
  it('descarta basura y valores fuera de tope', () => {
    expect(normalizarFiltros({ rec: 'abc', ban: -1, est: 999, smin: '0' })).toBeNull()
    expect(normalizarFiltros({ rec: '<script>' })).toBeNull()
  })
  it('«amueblado» y «mascotas» sólo existen con renta', () => {
    expect(normalizarFiltros({ amu: '1', masc: '1' })).toBeNull()
    expect(normalizarFiltros({ op: 'venta', amu: '1' })).toEqual({ op: 'venta' })
    expect(normalizarFiltros({ op: 'renta', amu: '1', masc: 1 })).toEqual({ op: 'renta', amu: 1, masc: 1 })
  })
})

describe('coincide · combinaciones', () => {
  it('recámaras y baños son mínimos; sin el dato no entra', () => {
    expect(buscar({ rec: 3 })).toEqual([casaRenta])
    expect(buscar({ rec: 2 })).toEqual([casaRenta, deptoVenta])
    expect(buscar({ ban: 2 })).toEqual([casaRenta, deptoVenta])           // 2.5 y 2; el medio baño cuenta como 0.5
    expect(buscar({ ban: 3 })).toEqual([])
  })
  it('estacionamientos viene de extras y exige el dato', () => {
    expect(buscar({ est: 2 })).toEqual([casaRenta, oficinaRenta])
    expect(buscar({ est: 4 })).toEqual([oficinaRenta])
  })
  it('superficie entre mínimo y máximo', () => {
    expect(buscar({ smin: 90, smax: 150 })).toEqual([casaRenta, oficinaRenta])
    expect(buscar({ smax: 80 })).toEqual([deptoVenta])
  })
  it('renta: amueblado (sí o semi) y mascotas (permitidas o con restricciones)', () => {
    expect(buscar({ op: 'renta', amu: 1 })).toEqual([casaRenta, oficinaRenta])
    expect(buscar({ op: 'renta', masc: 1 })).toEqual([casaRenta])
    expect(buscar({ op: 'renta', amu: 1, masc: 1 })).toEqual([casaRenta])
  })
  it('se combinan con tipo, operación y precio sin resultados incorrectos', () => {
    expect(buscar({ tipo: 'oficina', op: 'renta', est: 2, pmax: 20000 })).toEqual([oficinaRenta])
    expect(buscar({ tipo: 'oficina', op: 'renta', est: 5 })).toEqual([])
    expect(buscar({ tipo: 'casa', rec: 3, op: 'renta', amu: 1, smin: 100, pmax: 16000 })).toEqual([casaRenta])
    expect(buscar({ tipo: 'departamento', op: 'renta' })).toEqual([])
  })
  it('un dato de renta de un anuncio que ya es de venta no cuenta', () => {
    const ahoraVenta = { ...casaRenta, operacion: 'venta' }
    expect(coincide(ahoraVenta, { amu: 1 })).toBe(false)
  })
})

describe('búsquedas guardadas', () => {
  it('describir, aHref y mismaBusqueda reconocen los filtros nuevos', () => {
    const f = normalizarFiltros({ op: 'renta', tipo: 'oficina', est: 2, smin: 80, amu: 1 })!
    expect(describir(f)).toBe('Oficinas en renta · 2+ estacionamientos · desde 80 m² · amueblado')
    expect(aHref(f)).toBe('/propiedades?op=renta&tipo=oficina&est=2&smin=80&amu=1')
    expect(mismaBusqueda(f, normalizarFiltros({ amu: '1', smin: '80', est: '2', tipo: 'oficina', op: 'renta' })!)).toBe(true)
    expect(mismaBusqueda(f, normalizarFiltros({ op: 'renta', tipo: 'oficina', est: 3, smin: 80, amu: 1 })!)).toBe(false)
  })
  it('el contador del panel usa la misma regla que el listado', () => {
    const f = normalizarFiltros({ op: 'renta', est: 2 })!
    expect(contar(lista, f).total).toBe(buscar({ op: 'renta', est: 2 }).length)
  })
})
