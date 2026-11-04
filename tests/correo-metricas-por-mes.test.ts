import { describe, expect, it } from 'vitest'
import { agruparPorMes, type DiaDeSerie } from '../src/lib/correo/metricas'

const dia = (d: string, enviados: number, entregados: number | null = enviados, fallos = 0, omitidos = 0): DiaDeSerie => ({ dia: d, enviados, entregados, rebotes: 0, quejas: 0, fallos, omitidos })

describe('agruparPorMes: correos enviados por mes a partir de la serie diaria', () => {
  it('suma cada mes calendario por separado y cuenta los días que entran', () => {
    const r = agruparPorMes([dia('2026-10-30', 3), dia('2026-10-31', 2, 1, 1, 0), dia('2026-11-01', 4, 4, 0, 2), dia('2026-11-02', 0)])
    expect(r).toEqual([
      { mes: '2026-10', enviados: 5, entregados: 4, fallos: 1, omitidos: 0, dias: 2 },
      { mes: '2026-11', enviados: 4, entregados: 4, fallos: 0, omitidos: 2, dias: 2 },
    ])
  })

  it('entregados queda en null (no en cero) si algún día no lo tiene', () => {
    const r = agruparPorMes([dia('2026-11-01', 2, null), dia('2026-11-02', 3, 3)])
    expect(r[0].entregados).toBeNull()
    expect(r[0].enviados).toBe(5)
  })

  it('devuelve los meses en orden y una serie vacía no inventa meses', () => {
    expect(agruparPorMes([])).toEqual([])
    expect(agruparPorMes([dia('2026-12-01', 1), dia('2026-11-30', 1)]).map((m) => m.mes)).toEqual(['2026-11', '2026-12'])
  })
})
