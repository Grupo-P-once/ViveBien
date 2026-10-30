import { describe, expect, it } from 'vitest'
import { elegirPropiedades, leerPreferencias, motivoDe, resumenDe, valoresInicialesDeUrl } from '../src/lib/correo/recomendaciones'
import { leerFormulario } from '../src/lib/correo/suscripcion'
import type { FilaPropiedadPortal } from '../src/lib/portal/tarjeta'

/**
 * D-80 — filtros de las recomendaciones por correo: sólo lo que la persona pidió, sólo propiedades reales, vigentes y visibles.
 * Las reglas de coincidencia son las del catálogo (`coincide`); aquí se prueba la selección, la URL precargada y el formulario.
 */
const fila = (id: string, extra: Partial<FilaPropiedadPortal> = {}): FilaPropiedadPortal => ({
  id, titulo: `Propiedad ${id}`, tipo: 'casa', operacion: 'venta', precio: 3_000_000, precio_incluye_iva: false, moneda: 'MXN',
  ubicacion: 'Blvd. Campestre 100, León, Guanajuato', colonia: null, ciudad: null, metros: 180, recamaras: 3, banos: 2, altura_libre: null, andenes: null,
  estatus: 'disponible', estado_pub: 'publicada', slug: `propiedad-${id}`, fotos: ['https://res.cloudinary.com/demo/image/upload/v1/a.jpg'],
  publicada_en: `2026-10-0${id}T00:00:00Z`, created_at: `2026-10-0${id}T00:00:00Z`, ...extra,
} as FilaPropiedadPortal)
const elegir = (prefs: unknown, cat: FilaPropiedadPortal[], ya: string[] = [], max = 3) => elegirPropiedades(leerPreferencias(prefs), cat, new Set(ya), max).map((p) => p.id)

describe('selección según lo que la persona pidió', () => {
  const cat = [
    fila('1'), fila('2', { operacion: 'renta', precio: 20_000 }), fila('3', { tipo: 'nave', precio: 12_000_000, ubicacion: 'Puerto Interior, Silao' }),
    fila('4', { tipo: 'terreno', precio: 900_000 }), fila('5', { tipo: 'casa', precio: 7_700_000 }),
  ]
  it('cada preferencia por separado', () => {
    expect(elegir({ operacion: 'renta' }, cat)).toEqual(['2'])
    expect(elegir({ tipos: ['nave'] }, cat)).toEqual(['3'])
    expect(elegir({ zonas: ['silao'] }, cat)).toEqual(['3'])
    expect(elegir({ presupuestoMax: 1_000_000 }, cat)).toEqual(['4', '2']) // la más reciente primero
  })
  it('combinadas: se cumplen todas; varios tipos o zonas son «o» entre sí, y «y» con el resto', () => {
    expect(elegir({ operacion: 'venta', tipos: ['casa'], presupuestoMax: 5_000_000 }, cat)).toEqual(['1'])
    expect(elegir({ operacion: 'venta', tipos: ['nave', 'terreno'] }, cat)).toEqual(['4', '3'])
    expect(elegir({ operacion: 'venta', tipos: ['casa'], zonas: ['León', 'Silao'] }, cat)).toEqual(['5', '1'])
  })
  it('sin preferencias: lo publicado más reciente primero; con tope', () => {
    expect(elegir({}, cat)).toEqual(['5', '4', '3'])
    expect(elegir({}, cat, [], 2)).toEqual(['5', '4'])
  })
  it('sin coincidencias: lista vacía (la tarea no manda nada; nunca se rellena con propiedades que no encajan)', () => {
    expect(elegir({ tipos: ['oficina'] }, cat)).toEqual([])
    expect(elegir({ operacion: 'renta', presupuestoMax: 100 }, cat)).toEqual([])
  })
  it('no repite las que ya se mandaron', () => {
    expect(elegir({ operacion: 'venta', tipos: ['casa'] }, cat, ['5'])).toEqual(['1'])
    expect(elegir({ operacion: 'venta', tipos: ['casa'] }, cat, ['5', '1'])).toEqual([])
  })
  it('borradores, en revisión, pausadas, vendidas y eliminadas NUNCA se recomiendan', () => {
    const malas = [fila('1', { estado_pub: 'borrador' }), fila('2', { estado_pub: 'en_revision' }), fila('3', { estatus: 'pausada' }), fila('4', { estatus: 'vendida' }), fila('5', { estatus: 'eliminada' }), fila('6', { estado_pub: 'rechazada' })]
    expect(elegir({}, malas)).toEqual([])
  })
  it('una propiedad retirada del catálogo antes del envío ya no está en la lista que se le pasa (se relee justo antes)', () => {
    expect(elegir({}, [fila('1'), fila('2', { estatus: 'pausada' })])).toEqual(['1'])
  })
  it('con un rango de precio, una propiedad sin precio no entra', () => {
    expect(elegir({ presupuestoMax: 9_000_000 }, [fila('1', { precio: null as unknown as number })])).toEqual([])
  })
})

describe('preferencias guardadas y su lectura', () => {
  it('basura → forma segura; topes y recortes', () => {
    expect(leerPreferencias(null)).toEqual({ operacion: null, tipos: [], zonas: [], presupuestoMax: null })
    expect(leerPreferencias({ operacion: 'permuta', tipos: 'casa', zonas: [1, '', '  León  '], presupuestoMax: -5 })).toEqual({ operacion: null, tipos: [], zonas: ['León'], presupuestoMax: null })
    expect(leerPreferencias({ tipos: Array.from({ length: 20 }, (_, i) => `t${i}`) }).tipos).toHaveLength(8)
  })
  it('el motivo del correo dice sólo lo que la persona eligió', () => {
    expect(motivoDe({ tipos: ['casa'], operacion: 'venta', zonas: ['León'], presupuestoMax: 5_000_000 })).toBe('Elegimos estas propiedades publicadas según lo que pediste: casa, en venta, en León, hasta $5,000,000.')
    expect(resumenDe({})).toBe('')
  })
})

describe('formulario y URL precargada', () => {
  it('un enlace con parámetros llena el formulario; lo desconocido se descarta', () => {
    expect(valoresInicialesDeUrl({ operacion: 'renta', tipo: 'casa,nave', zona: 'Centro', presupuesto: '25000' })).toEqual({ operacion: 'renta', tipos: ['casa', 'nave'], zona: 'Centro', presupuesto: '25000' })
    expect(valoresInicialesDeUrl({ operacion: 'permuta', tipo: 'yate,CASA,depto', zona: 'x'.repeat(500), presupuesto: 'mucho' })).toEqual({ operacion: '', tipos: ['casa', 'departamento'], zona: 'x'.repeat(60), presupuesto: '' })
    expect(valoresInicialesDeUrl({})).toEqual({ operacion: '', tipos: [], zona: '', presupuesto: '' })
  })
  it('parámetros repetidos: cuenta el primero; sin script ni HTML en lo que se pinta (React lo escapa y aquí no se interpreta)', () => {
    expect(valoresInicialesDeUrl({ operacion: ['venta', 'renta'] }).operacion).toBe('venta')
    expect(valoresInicialesDeUrl({ zona: '<img src=x onerror=alert(1)>' }).zona).toBe('<img src=x onerror=alert(1)>') // texto, no HTML: va a un `value` controlado
  })
  it('el cuerpo del formulario sólo admite los tipos que ofrece la pantalla', () => {
    const r = leerFormulario({ correo: 'a@ejemplo.test', tipos: ['casa', 'yate', ' NAVE '], operacion: 'venta', zona: 'León', presupuesto: '3000000', acepto: true })
    expect(r.prefs).toEqual({ operacion: 'venta', tipos: ['casa', 'nave'], zonas: ['León'], presupuestoMax: 3_000_000 })
    expect(leerFormulario({ correo: 'a@ejemplo.test', tipos: 'casa,oficina,moto' }).prefs.tipos).toEqual(['casa', 'oficina'])
  })
})
