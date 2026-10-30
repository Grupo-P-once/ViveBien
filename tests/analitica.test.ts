import { describe, it, expect } from 'vitest'
import {
  serieDiaria, composicionInventario, interesPorTipo, zonasFrenteAInventario,
  preciosBuscados, diasEnMercado, topFavoritosContactos, diaLocal,
  type FilaEvento, type FilaPropiedad,
} from '../src/lib/analitica'

const PROPS: FilaPropiedad[] = [
  { id: 'sanjuan', folio: 'VB-2026-00001', titulo: 'Bodega San Juan Bosco', tipo: 'nave', operacion: 'renta', precio: 89000, ubicacion: 'Blvd. San Juan Bosco, León, Gto.', estado_pub: 'publicada', publicada_en: '2026-09-01T12:00:00Z' },
  { id: 'tzula', folio: 'VB-2026-00002', titulo: 'Quinta Tzula', tipo: 'casa', operacion: 'venta', precio: 5000000, ubicacion: 'Tzula Los Castillos, Leon, Gto.', estado_pub: 'publicada', publicada_en: '2026-08-17T12:00:00Z' },
  { id: 'panam-a', folio: 'VB-2026-00013', titulo: 'Terreno (A)', tipo: 'terreno', operacion: 'venta', precio: 2280000, ubicacion: '36293 Silao de la Victoria, Gto.', estado_pub: 'publicada', publicada_en: '2026-09-14T20:00:00Z' },
  { id: 'borrador', folio: 'VB-2026-00004', titulo: null, tipo: null, estado_pub: 'borrador' },
]

const ev = (nombre: string, extra: Partial<FilaEvento> = {}): FilaEvento => ({
  nombre, propiedad_id: null, datos: null, creado_en: '2026-09-16T15:00:00Z', sesion: 's1', ...extra,
})

describe('diaLocal', () => {
  it('una visita a las 22:00 de León es de ese día, no del siguiente en UTC', () => {
    // 04:00 UTC del 17 = 22:00 del 16 en León.
    expect(diaLocal('2026-09-17T04:00:00Z')).toBe('2026-09-16')
  })
})

describe('serieDiaria', () => {
  const hoy = new Date('2026-09-16T18:00:00Z')

  it('trae todos los días, también los vacíos, como ceros', () => {
    const s = serieDiaria([], [], hoy, 30)
    expect(s).toHaveLength(30)
    expect(s.every((p) => p.vistas === 0 && p.leads === 0)).toBe(true)
    expect(s[s.length - 1].dia).toBe('2026-09-16')
  })

  it('cuenta vistas y leads en su día local', () => {
    const s = serieDiaria(
      [ev('property_view'), ev('property_view'), ev('search_performed')],
      [{ fecha: '2026-09-16T10:00:00Z', propiedad_id: null }],
      hoy,
    )
    expect(s.at(-1)).toEqual({ dia: '2026-09-16', vistas: 2, leads: 1 })
  })
})

describe('composición', () => {
  it('el inventario cuenta sólo lo publicado', () => {
    const c = composicionInventario(PROPS)
    expect(c.reduce((s, p) => s + p.n, 0)).toBe(3)
    expect(c.map((p) => p.etiqueta)).toEqual(['Naves industriales', 'Casas', 'Terrenos'])
  })

  it('el orden es por tipo, no por tamaño: el mismo tipo, el mismo lugar en las dos donas', () => {
    const inv = composicionInventario(PROPS).map((p) => p.clave)
    const vistas = [
      ev('property_view', { propiedad_id: 'panam-a' }), ev('property_view', { propiedad_id: 'panam-a' }),
      ev('property_view', { propiedad_id: 'sanjuan' }),
    ]
    const int = interesPorTipo(vistas, PROPS).map((p) => p.clave)
    expect(int).toEqual(['nave', 'terreno'])
    expect(inv.indexOf('nave')).toBeLessThan(inv.indexOf('terreno'))
  })

  it('más de 4 tipos se agrupan en «Otros»', () => {
    const muchos: FilaPropiedad[] = ['casa', 'nave', 'terreno', 'departamento', 'oficina', 'bodega'].map((t, i) => ({
      id: `p${i}`, tipo: t, estado_pub: 'publicada',
    }))
    const c = composicionInventario(muchos)
    expect(c).toHaveLength(5)
    expect(c.at(-1)).toMatchObject({ etiqueta: 'Otros', n: 2 })
  })

  it('una vista de una propiedad que ya no existe no se inventa un tipo', () => {
    expect(interesPorTipo([ev('property_view', { propiedad_id: 'borrada' })], PROPS)).toEqual([])
  })
})

describe('zonasFrenteAInventario', () => {
  it('compara búsquedas con propiedades publicadas en esa zona, sin acentos', () => {
    const r = zonasFrenteAInventario(
      [ev('search_performed', { datos: { zona: 'León' }, sesion: 'a' }), ev('search_performed', { datos: { zona: 'Silao' }, sesion: 'b' })],
      PROPS,
    )
    // «Leon, Gto.» sin acento cuenta para «León»; el borrador no cuenta.
    expect(r).toEqual(expect.arrayContaining([
      { zona: 'León', busquedas: 1, activas: 2 },
      { zona: 'Silao', busquedas: 1, activas: 1 },
    ]))
  })

  it('una zona buscada sin inventario queda con 0 activas: es lo que falta', () => {
    const r = zonasFrenteAInventario([ev('search_performed', { datos: { zona: 'Irapuato' } })], PROPS)
    expect(r).toEqual([{ zona: 'Irapuato', busquedas: 1, activas: 0 }])
  })
})

describe('preciosBuscados', () => {
  it('sin búsquedas con precio no inventa barras', () => {
    const r = preciosBuscados([ev('search_performed', { datos: { zona: 'León' } })])
    expect(r.total).toBe(0)
    expect(r.renta.every((x) => x.n === 0) && r.venta.every((x) => x.n === 0)).toBe(true)
  })

  it('usa el máximo como presupuesto y separa renta de venta', () => {
    const r = preciosBuscados([
      ev('search_performed', { datos: { op: 'renta', precioMax: '15000' } }),
      ev('search_performed', { datos: { op: 'venta', precioMin: '1000000', precioMax: '4000000' } }),
    ])
    expect(r.renta.find((x) => x.rango === '$10k–$20k')?.n).toBe(1)
    expect(r.venta.find((x) => x.rango === '$3M–$5M')?.n).toBe(1)
    expect(r.total).toBe(2)
  })

  it('sin operación elegida, la asigna por magnitud', () => {
    const r = preciosBuscados([
      ev('search_performed', { datos: { precioMax: '25000' } }),
      ev('search_performed', { datos: { precioMax: '7000000' } }),
    ])
    expect(r.renta.find((x) => x.rango === '$20k–$50k')?.n).toBe(1)
    expect(r.venta.find((x) => x.rango === '$5M–$10M')?.n).toBe(1)
  })
})

describe('diasEnMercado', () => {
  it('días desde la publicación, sólo publicadas con precio y operación', () => {
    const r = diasEnMercado(PROPS, new Date('2026-09-16T12:00:00Z'))
    expect(r).toHaveLength(3)
    expect(r.find((p) => p.folio === 'VB-2026-00001')).toMatchObject({ dias: 15, operacion: 'renta', precio: 89000 })
  })

  it('nunca enseña la clave interna como nombre', () => {
    const r = diasEnMercado([{ id: 'propiedad-sin-titulo-d52n', titulo: 'Propiedad sin título', tipo: 'nave', operacion: 'venta', precio: 1, estado_pub: 'publicada', publicada_en: '2026-09-10T00:00:00Z' }], new Date('2026-09-16T00:00:00Z'))
    expect(r[0].nombre).toBe('Nave industrial en venta')
  })
})

describe('topFavoritosContactos', () => {
  it('ordena por contactos y descarta lo que no tiene interés', () => {
    const r = topFavoritosContactos(
      PROPS,
      [{ propiedad_id: 'sanjuan' }, { propiedad_id: 'sanjuan' }, { propiedad_id: 'tzula' }],
      [{ fecha: null, propiedad_id: 'tzula' }],
    )
    expect(r.map((x) => x.folio)).toEqual(['VB-2026-00002', 'VB-2026-00001'])
    expect(r[0]).toMatchObject({ favoritos: 1, contactos: 1 })
  })

  it('sin favoritos ni contactos, vacío', () => {
    expect(topFavoritosContactos(PROPS, [], [])).toEqual([])
  })
})
