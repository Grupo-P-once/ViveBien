import { describe, expect, it } from 'vitest'
import { construirLineas, type MovimientoContable } from '@/lib/contabilidad'
import { alertaDelReporte, construirReporteQuincenal, quincenaACerrar, quincenaAnterior } from '@/lib/contabilidad-quincenal'
import type { OperacionComision } from '@/lib/comision-resumen'

/**
 * Reporte quincenal. Mismo caso del estado de resultados, calculado a mano para la quincena del 1 al 15 de septiembre de 2026 (se reporta el 16):
 *  ingresos = O1 $100,000 + O2 $30,000 = $130,000 · cierres 2 · colaborador $30,000 · gastos = promoción 13,000 (2,000 + 5,000 + 3,000 − 1,000 + 4,000) + operación 1,000 + oficina 800 = $14,800
 *  utilidad de operación = 130,000 − 30,000 − 14,800 = $85,200 · mayor gasto: publicidad digital $9,000 (60.8 % de $14,800).
 */
const op = (s: Partial<OperacionComision> & { id: string; propiedad_id: string }): OperacionComision => ({
  tipo: 'venta', base_centavos: 0, total_centavos: 0, vivebien_centavos: 0, colaborador_centavos: 0, colaborador_retenido_centavos: 0, reparto_estado: 'no_aplica', estado: 'confirmada',
  creado_en: '2026-09-01T10:00:00Z', fecha_cierre: '2026-09-01', propiedad_folio: null, propiedad_titulo: 'Casa Cañada Secreta', gastos: [], ...s,
})
const mov = (s: Partial<MovimientoContable> & { id: string }): MovimientoContable => ({
  fecha: '2026-09-02', sentido: 'sale', clase: 'gasto', monto_centavos: 0, categoria: 'otro', cuenta_id: null, propiedad_id: null, operacion_id: null, concepto: 'Gasto de prueba', referencia: null,
  reverso_de: null, motivo: null, creado_por: 'super@vb.mx', creado_en: '2026-09-02T10:00:00Z', ...s,
})
const OPERACIONES = [
  op({ id: 'o1', propiedad_id: 'p1', total_centavos: 10_000_000, colaborador_centavos: 3_000_000, reparto_estado: 'liberable', fecha_cierre: '2026-09-01', gastos: [{ concepto: 'Publicidad', monto_centavos: 200_000 }, { concepto: 'Notaría', monto_centavos: 100_000 }] }),
  op({ id: 'o2', propiedad_id: 'p2', tipo: 'renta', total_centavos: 3_000_000, fecha_cierre: '2026-09-05' }),
]
const MOVIMIENTOS = [
  mov({ id: 'g1', monto_centavos: 500_000, categoria: 'publicidad_digital', concepto: 'Meta Ads campaña Cañada Secreta' }),
  mov({ id: 'g2', monto_centavos: 300_000, categoria: 'publicidad_impresa', propiedad_id: 'p1', concepto: 'Lonas Secretas' }),
  mov({ id: 'd1', clase: 'devolucion', sentido: 'entra', monto_centavos: 100_000, categoria: 'publicidad_impresa', propiedad_id: 'p1', reverso_de: 'g2', motivo: 'Lona de mala calidad', concepto: 'Devolución de lonas' }),
  mov({ id: 'g3', monto_centavos: 80_000, categoria: 'oficina', concepto: 'Papelería' }),
  mov({ id: 'g4', monto_centavos: 400_000, categoria: 'publicidad_digital', concepto: 'Campaña terreno', fecha: '2026-09-10' }),
]
const lineas = construirLineas({ operaciones: OPERACIONES, movimientos: MOVIMIENTOS })
const pesos = (n: number) => n * 100

describe('qué quincena se reporta', () => {
  it('del 16 en adelante se reporta la 1–15 de este mes; del 1 al 15, la 16–fin del mes anterior', () => {
    expect(quincenaACerrar('2026-10-26')).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-15' })
    expect(quincenaACerrar('2026-10-16')).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-15' })
    expect(quincenaACerrar('2026-10-15')).toMatchObject({ desde: '2026-09-16', hasta: '2026-09-30' })
    expect(quincenaACerrar('2026-10-01')).toMatchObject({ desde: '2026-09-16', hasta: '2026-09-30' })
  })
  it('cruza el año y respeta febrero (y el bisiesto)', () => {
    expect(quincenaACerrar('2026-01-02')).toMatchObject({ desde: '2025-12-16', hasta: '2025-12-31' })
    expect(quincenaACerrar('2026-03-02')).toMatchObject({ desde: '2026-02-16', hasta: '2026-02-28' })
    expect(quincenaACerrar('2028-03-01')).toMatchObject({ desde: '2028-02-16', hasta: '2028-02-29' })
  })
  it('la etiqueta se lee en español y la anterior encadena sin huecos', () => {
    expect(quincenaACerrar('2026-10-26').etiqueta).toBe('1–15 de octubre de 2026')
    expect(quincenaAnterior(quincenaACerrar('2026-10-26'))).toMatchObject({ desde: '2026-09-16', hasta: '2026-09-30' })
    expect(quincenaAnterior({ desde: '2026-01-01', hasta: '2026-01-15', etiqueta: '' })).toMatchObject({ desde: '2025-12-16', hasta: '2025-12-31' })
    expect(quincenaAnterior({ desde: '2026-03-16', hasta: '2026-03-31', etiqueta: '' })).toMatchObject({ desde: '2026-03-01', hasta: '2026-03-15' })
  })
})

describe('el reporte', () => {
  const r = construirReporteQuincenal(lineas, quincenaACerrar('2026-09-16'), '2026-09-16')
  it('cifras calculadas a mano', () => {
    expect(r.quincena).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-15' })
    expect(r.cierres).toBe(2)
    expect(r.ingresos).toBe(pesos(130_000))
    expect(r.gastos).toBe(pesos(14_800))
    expect(r.utilidadDeOperacion).toBe(pesos(85_200))
    expect(r.mayorGasto).toEqual({ etiqueta: 'Publicidad digital', monto: pesos(9_000), parte: 60.8 })
    expect(r.porCobrarVencido).toEqual({ n: 0, monto: 0 })
    expect(r.nivel).toBe('ok')
    expect(r.accion).toBeNull()
  })
  it('una comisión sin cobrar con más de 30 días lo vuelve aviso y dice qué hacer', () => {
    const ops = OPERACIONES.map((o) => (o.id === 'o2' ? { ...o, estado: 'registrada' as const } : o))
    const x = construirReporteQuincenal(construirLineas({ operaciones: ops, movimientos: MOVIMIENTOS }), quincenaACerrar('2026-10-26'), '2026-10-26')
    expect(x.porCobrarVencido).toEqual({ n: 1, monto: pesos(30_000) })
    expect(x.nivel).toBe('aviso')
    expect(x.accion).toMatch(/Cobrar 1 comisión/)
  })
  it('una quincena sin nada lo dice, sin inventar cifras', () => {
    const x = construirReporteQuincenal(lineas, quincenaACerrar('2026-06-20'), '2026-06-20')
    expect(x.hayMovimientos).toBe(false)
    expect(alertaDelReporte(x).datos).toEqual({ Movimientos: 'Ninguno en la quincena' })
  })
  it('una utilidad negativa pide revisar el gasto', () => {
    const solo = construirLineas({ operaciones: [], movimientos: [mov({ id: 'x', monto_centavos: 900_000, categoria: 'oficina', fecha: '2026-09-03' })] })
    const x = construirReporteQuincenal(solo, quincenaACerrar('2026-09-16'), '2026-09-16')
    expect(x.utilidadDeOperacion).toBe(-pesos(9_000))
    expect(x.accion).toMatch(/negativa/)
  })
})

describe('el mensaje a Telegram', () => {
  const a = alertaDelReporte(construirReporteQuincenal(lineas, quincenaACerrar('2026-09-16'), '2026-09-16'))
  it('trae título, datos y una clave estable por quincena', () => {
    expect(a.titulo).toBe('Contabilidad VIVE BIEN · quincena del 1–15 de septiembre de 2026')
    expect(a.clave).toBe('contab-quincenal-2026-09-01-2026-09-15')
    expect(a.datos['Cierres']).toBe('2')
    expect(a.datos['Mayor gasto']).toContain('Publicidad digital')
    expect(a.datos['Utilidad de operación']).toContain('sin quincena anterior')
  })
  it('solo cifras agregadas: ningún concepto, referencia, propiedad ni persona', () => {
    const texto = JSON.stringify(a)
    for (const prohibido of ['Meta Ads', 'Lonas', 'Secreta', 'Cañada', 'Papelería', 'super@vb.mx', '@']) expect(texto, prohibido).not.toContain(prohibido)
  })
})
