import { describe, expect, it } from 'vitest'
import { SIN_FILTROS, aplicarFiltros, hayFiltros, opcionesDe } from '../src/components/citas/filtros'
import { agruparPorDia, indicadores, requiereRespuesta } from '../src/components/citas/uiCitas'
import type { CitaVista } from '../src/lib/citas/vista'

const base = (o: Partial<CitaVista> & { id: string }): CitaVista => ({
  version: 1, estado: 'CONFIRMED', etiqueta: 'Confirmada', papel: 'asesor', tipo: 'solicitada', firme: true,
  inicio: '2026-11-10T17:00:00.000Z', fin: '2026-11-10T17:30:00.000Z', zona: 'America/Mexico_City', lugar: 'León',
  propiedad: { id: 'p1', titulo: 'Casa Álamos', tipo: 'casa', ruta: null, foto: null }, propuesta: null,
  cliente: { nombre: 'Ana Pérez' }, asesor: { nombre: 'Luis' }, notasCliente: null, motivoCancelacion: null,
  acciones: [], creadaEn: '2026-11-01T00:00:00Z', actualizadaEn: '2026-11-01T00:00:00Z', ...o,
})

const citas = [
  base({ id: 'a' }),
  base({ id: 'b', estado: 'REQUESTED', firme: false, etiqueta: 'Pendiente', acciones: ['confirmar'], propiedad: { id: 'p2', titulo: 'Depto Centro', tipo: null, ruta: null, foto: null }, asesor: { nombre: 'María' }, conflicto: true }),
  base({ id: 'c', estado: 'CANCELLED', firme: false, tipo: 'propia' }),
  base({ id: 'd', estado: 'RESCHEDULE_REQUESTED', acciones: ['aceptar_cambio', 'rechazar_cambio'], inicio: '2026-11-11T17:00:00.000Z', fin: '2026-11-11T17:30:00.000Z' }),
]
const ids = (xs: CitaVista[]) => xs.map((c) => c.id)

describe('filtros de citas (puros, sobre lo que el servidor ya recortó)', () => {
  it('sin filtros devuelve todo y no cuenta como filtrado', () => {
    expect(ids(aplicarFiltros(citas, SIN_FILTROS))).toEqual(['a', 'b', 'c', 'd'])
    expect(hayFiltros(SIN_FILTROS)).toBe(false)
  })
  it('por grupo de estado', () => {
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, estado: 'pendientes' }))).toEqual(['b'])
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, estado: 'confirmadas' }))).toEqual(['a'])
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, estado: 'por_responder' }))).toEqual(['d'])
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, estado: 'cerradas' }))).toEqual(['c'])
  })
  it('por tipo, propiedad y responsable', () => {
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, tipo: 'propia' }))).toEqual(['c'])
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, propiedad: 'Depto Centro' }))).toEqual(['b'])
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, responsable: 'María' }))).toEqual(['b'])
  })
  it('el texto ignora acentos y mayúsculas, y no inventa personas que el servidor no mandó', () => {
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, texto: 'ALAMOS' }))).toEqual(['a', 'c', 'd'])
    const sinNombre = [base({ id: 'x', cliente: { nombre: 'Interesado' } })]
    expect(aplicarFiltros(sinNombre, { ...SIN_FILTROS, texto: 'Ana' })).toHaveLength(0)
  })
  it('combinar filtros acota (Y, no O)', () => {
    expect(ids(aplicarFiltros(citas, { ...SIN_FILTROS, estado: 'confirmadas', propiedad: 'Depto Centro' }))).toEqual([])
  })
  it('opciones únicas y ordenadas a partir de lo que SÍ se ve', () => {
    expect(opcionesDe(citas)).toEqual({ propiedades: ['Casa Álamos', 'Depto Centro'], responsables: ['Luis', 'María'] })
  })
})

describe('ayudantes de la pantalla', () => {
  it('indicadores: pendientes, confirmadas, por responder y conflictos salen de las citas visibles', () => {
    expect(indicadores(citas)).toEqual({ pendientes: 1, confirmadas: 1, porResponder: 1, conflictos: 1 })
  })
  it('requiereRespuesta solo si el servidor ofrece confirmar o responder un cambio', () => {
    expect(requiereRespuesta(citas[1])).toBe(true)
    expect(requiereRespuesta(citas[3])).toBe(true)
    expect(requiereRespuesta(citas[0])).toBe(false)
  })
  it('agrupa por día de León y ordena (asc/desc)', () => {
    const asc = agruparPorDia(citas)
    expect(asc.map((g) => g.dia)).toEqual(['2026-11-10', '2026-11-11'])
    expect(asc[0].citas).toHaveLength(3)
    expect(agruparPorDia(citas, 'desc').map((g) => g.dia)).toEqual(['2026-11-11', '2026-11-10'])
  })
  it('una cita a las 23:30 de León cae en SU día aunque en UTC ya sea el siguiente', () => {
    const tarde = base({ id: 't', inicio: '2026-11-11T05:30:00.000Z', fin: '2026-11-11T06:00:00.000Z' })   // 23:30 del 10 en León (UTC-6)
    expect(agruparPorDia([tarde])[0].dia).toBe('2026-11-10')
  })
})
