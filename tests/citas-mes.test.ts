import { describe, expect, it } from 'vitest'
import { esMes, etiquetaDeMes, mesDe, rangoDeMes, semanaDeReserva, semanasDelMes, sumarMeses } from '../src/lib/citas/mes'

/** El calendario del mes de «Agenda una cita» (10-nov-2026): aritmética de días civiles, semana de lunes a domingo, sin depender de la zona del navegador. */
describe('mes · aritmética de meses', () => {
  it('sumar y restar meses cruza el cambio de año', () => {
    expect(sumarMeses('2026-11', 1)).toBe('2026-12')
    expect(sumarMeses('2026-11', 2)).toBe('2027-01')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(sumarMeses('2026-11', 14)).toBe('2028-01')
  })
  it('esMes y mesDe validan y recortan', () => {
    expect(esMes('2026-11')).toBe(true)
    for (const mal of ['2026-13', '2026-00', '26-11', '2026-1', 20261, null, undefined, '2026-11-01']) expect(esMes(mal as unknown), String(mal)).toBe(false)
    expect(mesDe('2026-11-17')).toBe('2026-11')
    expect(() => mesDe('2026-02-30')).toThrow()
  })
  it('la etiqueta va en español', () => {
    expect(etiquetaDeMes('2026-11')).toBe('noviembre de 2026')
    expect(etiquetaDeMes('2027-01')).toBe('enero de 2027')
  })
})

describe('mes · lo que se le pide a la API', () => {
  it('el mes actual empieza HOY (no en el día 1) y llega hasta el último día', () => {
    expect(rangoDeMes('2026-11', '2026-11-10')).toEqual({ desde: '2026-11-10', dias: 21 })        // 10 … 30 de noviembre
    expect(rangoDeMes('2026-11', '2026-11-30')).toEqual({ desde: '2026-11-30', dias: 1 })
  })
  it('un mes futuro se pide entero; uno pasado no se pide; y nunca más de 31 días', () => {
    expect(rangoDeMes('2026-12', '2026-11-10')).toEqual({ desde: '2026-12-01', dias: 31 })
    expect(rangoDeMes('2027-02', '2026-11-10')).toEqual({ desde: '2027-02-01', dias: 28 })
    expect(rangoDeMes('2028-02', '2026-11-10')).toEqual({ desde: '2028-02-01', dias: 29 })      // bisiesto
    expect(rangoDeMes('2026-10', '2026-11-10')).toBeNull()
  })
})

describe('mes · la cuadrícula (semanas de lunes a domingo)', () => {
  it('noviembre de 2026 empieza en domingo: la primera semana trae seis días de relleno', () => {
    const s = semanasDelMes('2026-11')
    expect(s[0][0]).toEqual({ dia: '2026-10-26', delMes: false })      // lunes
    expect(s[0][6]).toEqual({ dia: '2026-11-01', delMes: true })       // domingo = día 1
    expect(s.length).toBe(6)                                            // el 30 cae en lunes: hay una sexta fila
    expect(s.at(-2)?.[6]).toEqual({ dia: '2026-11-29', delMes: true })
    expect(s.at(-1)?.[0]).toEqual({ dia: '2026-11-30', delMes: true })
  })
  it('cada semana tiene 7 celdas, todas contiguas, y los días del mes aparecen UNA vez', () => {
    for (const mes of ['2026-02', '2026-11', '2026-12', '2027-02', '2028-02', '2026-08']) {
      const s = semanasDelMes(mes)
      const planas = s.flat()
      expect(s.every((w) => w.length === 7), mes).toBe(true)
      const delMes = planas.filter((c) => c.delMes).map((c) => c.dia)
      expect(new Set(delMes).size, mes).toBe(delMes.length)
      expect(delMes[0], mes).toBe(`${mes}-01`)
      expect(delMes.every((d) => d.startsWith(mes)), mes).toBe(true)
      for (let i = 1; i < planas.length; i++) expect(planas[i].dia > planas[i - 1].dia, mes).toBe(true)
    }
  })
  it('febrero de 2027 (28 días, empieza en lunes) cabe en cuatro semanas exactas', () => {
    expect(semanasDelMes('2027-02').length).toBe(4)
    expect(semanasDelMes('2027-02')[0][0]).toEqual({ dia: '2027-02-01', delMes: true })
  })
})

describe('mes · la semana de reserva', () => {
  it('son hoy y los 6 días siguientes, y cruza el fin de mes', () => {
    expect(semanaDeReserva('2026-11-28')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'])
    expect(semanaDeReserva('2026-11-10')).toHaveLength(7)
  })
})
