import { describe, expect, it } from 'vitest'
import { aCsv, celdaCsv, diaRelativo, indicadores, proximas } from '../src/components/citas/uiCitas'
import { SIN_FILTROS, aplicarFiltros } from '../src/components/citas/filtros'
import { generarIcsVarios } from '../src/lib/citas/ics'
import type { CitaVista } from '../src/lib/citas/vista'

/** Rediseño del panel de citas (6-nov-2026): indicadores, «Próximas citas», exportar CSV, «Mis visitas» y el calendario .ics con varias citas. */
const AHORA = new Date('2026-11-10T20:00:00.000Z')   // 14:00 en León
const mas = (horas: number) => new Date(AHORA.getTime() + horas * 3_600_000)
const cita = (o: Partial<CitaVista> & { id: string; horas?: number }): CitaVista => {
  const ini = mas(o.horas ?? 24)
  return {
    version: 1, estado: 'CONFIRMED', etiqueta: 'Confirmada', papel: 'cliente', tipo: 'solicitada', firme: true,
    inicio: ini.toISOString(), fin: new Date(ini.getTime() + 3_600_000).toISOString(), zona: 'America/Mexico_City', lugar: 'León, Gto.',
    propiedad: { id: 'p', titulo: 'Casa Álamos', tipo: 'casa', ruta: null, foto: null }, propuesta: null,
    cliente: { nombre: 'Ana Pérez', telefono: '4771234567' }, asesor: { nombre: 'Luis' }, notasCliente: null, motivoCancelacion: null,
    acciones: [], creadaEn: '2026-11-01T00:00:00Z', actualizadaEn: '2026-11-01T00:00:00Z', ...o,
  }
}

describe('indicadores', () => {
  it('«programadas» cuenta las abiertas que todavía no pasan; las cerradas y las ya pasadas no', () => {
    const citas = [
      cita({ id: 'a', horas: 5 }),
      cita({ id: 'b', horas: 30, estado: 'REQUESTED', etiqueta: 'Pendiente', firme: false }),
      cita({ id: 'c', horas: 50, estado: 'RESCHEDULE_REQUESTED', acciones: ['aceptar_cambio'] }),
      cita({ id: 'd', horas: 10, estado: 'CANCELLED', firme: false }),
      cita({ id: 'e', horas: -48 }),                                       // ya pasó
      cita({ id: 'f', horas: 20, estado: 'COMPLETED', firme: false }),
    ]
    expect(indicadores(citas, AHORA)).toMatchObject({ programadas: 3, pendientes: 1, confirmadas: 2 })
  })
})

describe('próximas citas', () => {
  it('las siguientes abiertas, de la más cercana a la más lejana, hasta el máximo pedido', () => {
    const citas = [cita({ id: 'lejos', horas: 90 }), cita({ id: 'cerca', horas: 2 }), cita({ id: 'cerrada', horas: 1, estado: 'CANCELLED', firme: false }), cita({ id: 'medio', horas: 30 }), cita({ id: 'pasada', horas: -5 })]
    expect(proximas(citas, 2, AHORA).map((c) => c.id)).toEqual(['cerca', 'medio'])
    expect(proximas(citas, 10, AHORA).map((c) => c.id)).toEqual(['cerca', 'medio', 'lejos'])
  })
  it('«Hoy» y «Mañana» se calculan en hora de León, no en la del navegador', () => {
    expect(diaRelativo(mas(3).toISOString(), AHORA)).toBe('Hoy')
    expect(diaRelativo(mas(26).toISOString(), AHORA)).toBe('Mañana')
    expect(diaRelativo(mas(80).toISOString(), AHORA)).not.toMatch(/^(Hoy|Mañana)$/)
    // 23:30 de León del día 10 (05:30Z del 11) SIGUE siendo «hoy» para León
    expect(diaRelativo('2026-11-11T05:30:00.000Z', AHORA)).toBe('Hoy')
  })
})

describe('exportar a CSV', () => {
  it('una celda que empieza con = + - @ se neutraliza (inyección de fórmulas) y las comillas se duplican', () => {
    expect(celdaCsv('=HYPERLINK("http://x","click")')).toBe(`"'=HYPERLINK(""http://x"",""click"")"`)
    for (const peligro of ['+1', '-2', '@cmd', '\tx', '\rx']) expect(celdaCsv(peligro).startsWith(`"'`), peligro).toBe(true)
    expect(celdaCsv('Casa "Álamos", León')).toBe('"Casa ""Álamos"", León"')
    expect(celdaCsv(null)).toBe('""')
  })
  it('lleva BOM y CRLF, una fila por cita, y la columna «Tipo» solo para quien ve tipos', () => {
    const csv = aCsv([cita({ id: 'a' }), cita({ id: 'b', notasCliente: '=cmd|"/C calc"!A0' })], { conTipos: false })
    expect(csv.startsWith('﻿')).toBe(true)
    const lineas = csv.trimEnd().split('\r\n')
    expect(lineas).toHaveLength(3)
    expect(lineas[0]).not.toContain('Tipo')
    expect(aCsv([cita({ id: 'a' })], { conTipos: true }).split('\r\n')[0]).toContain('"Tipo"')
    expect(lineas[2]).toContain(`"'=cmd|""/C calc""!A0"`)           // la nota maliciosa quedó neutralizada
  })
  it('solo exporta lo que el servidor ya recortó: sin teléfono visible, la columna sale vacía y no inventa nada', () => {
    const csv = aCsv([cita({ id: 'a', papel: 'asesor', cliente: { nombre: 'Interesado' } })], { conTipos: true })
    expect(csv).not.toContain('4771234567')
    expect(csv).toContain('"Interesado"')
  })
})

describe('filtro «Mis visitas»', () => {
  it('deja solo las citas donde yo soy quien va', () => {
    const citas = [cita({ id: 'mia', mia: true }), cita({ id: 'ajena', mia: false }), cita({ id: 'sin-dato' })]
    expect(aplicarFiltros(citas, { ...SIN_FILTROS, mias: true }).map((c) => c.id)).toEqual(['mia'])
    expect(aplicarFiltros(citas, SIN_FILTROS)).toHaveLength(3)
  })
})

describe('calendario .ics con varias citas', () => {
  it('un VCALENDAR, un VEVENT por cita, mismo UID y SEQUENCE que el archivo de una sola cita, sin datos personales', () => {
    const base = { titulo: 'Casa Álamos', lugar: 'León, Gto.', enlace: 'https://vivebienn.com/portal/citas?cita=x', ahora: AHORA }
    const ics = generarIcsVarios([
      { id: '11111111-1111-4111-8111-111111111111', version: 3, inicio: mas(24), fin: mas(25), ...base },
      { id: '22222222-2222-4222-8222-222222222222', version: 1, inicio: mas(48), fin: mas(49), ...base },
    ])
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('UID:11111111-1111-4111-8111-111111111111@vivebienn.com')
    expect(ics).toContain('SEQUENCE:3')
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics).not.toMatch(/ATTENDEE|ORGANIZER|TEL|@ejemplo/)
  })
  it('sin citas es un calendario válido y vacío', () => {
    const ics = generarIcsVarios([])
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })
})
