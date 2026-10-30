import { describe, expect, it } from 'vitest'
import { construirLineas, totales, serieMensual, correccionesPosibles, type MovimientoContable } from '@/lib/contabilidad'
import { balanceGeneral, estadoDeResultados, estadosACsv, LIMITACIONES_DE_LOS_ESTADOS, rangoAnterior, variacion } from '@/lib/contabilidad-estados'
import type { OperacionComision } from '@/lib/comision-resumen'

/**
 * Estados financieros: caso calculado A MANO (en pesos), el mismo del panorama.
 *  Ingresos: ventas O1 $100,000 + O3 $60,000 = $160,000; renta O2 $30,000 → $190,000. Colaborador (O1): $30,000 → utilidad bruta $160,000.
 *  Gastos de venta: promoción = Publicidad 2,000 + Fotografía 1,000 + Meta Ads 5,000 + lonas 3,000 − devolución 1,000 + campaña 4,000 = $14,000 · de las operaciones (Notaría) $1,000.
 *  Administración: oficina $800. Utilidad de operación = 160,000 − 15,000 − 800 = $144,200.
 *  Balance (todo cobrado): efectivo = 190,000 − 15,800 = $174,200 · pasivo (colaborador) $30,000 · resultados acumulados $144,200 → activo = pasivo + capital.
 */
const op = (s: Partial<OperacionComision> & { id: string; propiedad_id: string }): OperacionComision => ({
  tipo: 'venta', base_centavos: 0, total_centavos: 0, vivebien_centavos: 0, colaborador_centavos: 0, colaborador_retenido_centavos: 0, reparto_estado: 'no_aplica', estado: 'confirmada',
  creado_en: '2026-09-01T10:00:00Z', fecha_cierre: '2026-09-01', propiedad_folio: null, propiedad_titulo: null, gastos: [], ...s,
})
const mov = (s: Partial<MovimientoContable> & { id: string }): MovimientoContable => ({
  fecha: '2026-09-02', sentido: 'sale', clase: 'gasto', monto_centavos: 0, categoria: 'otro', cuenta_id: null, propiedad_id: null, operacion_id: null, concepto: 'Gasto de prueba', referencia: null,
  reverso_de: null, motivo: null, creado_por: 'super@vb.mx', creado_en: '2026-09-02T10:00:00Z', ...s,
})
const OPERACIONES = [
  op({ id: 'o1', propiedad_id: 'p1', total_centavos: 10_000_000, colaborador_centavos: 3_000_000, reparto_estado: 'liberable', fecha_cierre: '2026-09-01', gastos: [{ concepto: 'Publicidad', monto_centavos: 200_000 }, { concepto: 'Notaría', monto_centavos: 100_000 }] }),
  op({ id: 'o2', propiedad_id: 'p2', tipo: 'renta', total_centavos: 3_000_000, fecha_cierre: '2026-09-05' }),
  op({ id: 'o3', propiedad_id: 'p3', total_centavos: 6_000_000, fecha_cierre: '2026-08-10', gastos: [{ concepto: 'Fotografía', monto_centavos: 100_000 }] }),
  op({ id: 'o4', propiedad_id: 'p4', total_centavos: 9_000_000, estado: 'anulada' }),
]
const MOVIMIENTOS = [
  mov({ id: 'g1', monto_centavos: 500_000, categoria: 'publicidad_digital', concepto: 'Meta Ads campaña' }),
  mov({ id: 'g2', monto_centavos: 300_000, categoria: 'publicidad_impresa', propiedad_id: 'p1', concepto: 'Lonas' }),
  mov({ id: 'd1', clase: 'devolucion', sentido: 'entra', monto_centavos: 100_000, categoria: 'publicidad_impresa', propiedad_id: 'p1', reverso_de: 'g2', motivo: 'Lona de mala calidad', concepto: 'Devolución de lonas' }),
  mov({ id: 'g3', monto_centavos: 80_000, categoria: 'oficina', concepto: 'Papelería' }),
  mov({ id: 'g4', monto_centavos: 400_000, categoria: 'publicidad_digital', propiedad_id: 'p9', concepto: 'Campaña terreno', fecha: '2026-09-10' }),
]
const lineas = construirLineas({ operaciones: OPERACIONES, movimientos: MOVIMIENTOS })
const pesos = (n: number) => n * 100

describe('estado de resultados (NIF B-3, devengado)', () => {
  const er = estadoDeResultados(lineas)
  it('ingresos, costo y utilidad bruta', () => {
    expect(er.ingresosPorVentas).toBe(pesos(160_000))
    expect(er.ingresosPorRentas).toBe(pesos(30_000))
    expect(er.ingresos).toBe(pesos(190_000))
    expect(er.costoColaboradores).toBe(pesos(30_000))
    expect(er.utilidadBruta).toBe(pesos(160_000))
  })
  it('gastos de venta (con la devolución restando), de administración y utilidad de operación', () => {
    expect(er.gastosDeVenta.promocion).toBe(pesos(14_000))
    expect(er.gastosDeVenta.deLasOperaciones).toBe(pesos(1_000))
    expect(er.gastosDeVenta.total).toBe(pesos(15_000))
    expect(er.gastosDeAdministracion).toBe(pesos(800))
    expect(er.utilidadDeOperacion).toBe(pesos(144_200))
    expect(er.resultadoAntesDeImpuestos).toBe(pesos(144_200))
  })
  it('márgenes sobre el ingreso', () => {
    expect(er.margenBruto).toBe(84.2)
    expect(er.margenDeOperacion).toBe(75.9)
  })
  it('la operación anulada no cuenta y un periodo acota por fecha', () => {
    expect(estadoDeResultados(lineas, { desde: '2026-09-01', hasta: '2026-09-30' }).ingresos).toBe(pesos(130_000))
    expect(estadoDeResultados(lineas, { desde: '2026-08-01', hasta: '2026-08-31' }).ingresos).toBe(pesos(60_000))
  })
  it('otros ingresos: el ingreso extra suma y su devolución resta', () => {
    const l = construirLineas({ operaciones: [], movimientos: [
      mov({ id: 'i1', clase: 'ingreso_extra', sentido: 'entra', monto_centavos: 100_000, categoria: 'ingreso_extra', concepto: 'Reembolso' }),
      mov({ id: 'i2', clase: 'devolucion', sentido: 'sale', monto_centavos: 30_000, categoria: 'ingreso_extra', reverso_de: 'i1', motivo: 'Se devolvió una parte', concepto: 'Devolución' }),
    ] })
    expect(estadoDeResultados(l).otrosIngresos).toBe(pesos(700))
    expect(estadoDeResultados(l).margenNeto).toBeNull()
  })
})

describe('balance general (NIF B-6, derivado)', () => {
  it('cuadra: activo = pasivo + capital, comprobado por dos caminos', () => {
    const b = balanceGeneral(lineas, '2026-10-25')
    expect(b.activo.efectivoEstimado).toBe(pesos(174_200))
    expect(b.activo.comisionesPorCobrar).toBe(0)
    expect(b.activo.total).toBe(pesos(174_200))
    expect(b.pasivo.total).toBe(pesos(30_000))
    expect(b.capital.resultadosAcumulados).toBe(pesos(144_200))
    expect(b.cuadra).toBe(true)
    expect(b.diferencia).toBe(0)
    expect(b.efectivoNegativo).toBe(false)
  })
  it('una comisión sin cobrar es «por cobrar» y no es efectivo, y sigue cuadrando', () => {
    const ops = OPERACIONES.map((o) => (o.id === 'o2' ? { ...o, estado: 'registrada' as const } : o))
    const b = balanceGeneral(construirLineas({ operaciones: ops, movimientos: MOVIMIENTOS }), '2026-10-25')
    expect(b.activo.comisionesPorCobrar).toBe(pesos(30_000))
    expect(b.activo.efectivoEstimado).toBe(pesos(144_200))
    expect(b.cuadra).toBe(true)
  })
  it('a una fecha anterior solo cuenta lo ocurrido hasta entonces', () => {
    const b = balanceGeneral(lineas, '2026-08-31')
    expect(b.activo.total).toBe(pesos(59_000))
    expect(b.cuadra).toBe(true)
  })
  it('avisa si el efectivo sale negativo (faltan ingresos o sobran gastos)', () => {
    const l = construirLineas({ operaciones: [], movimientos: [mov({ id: 'x', monto_centavos: 50_000, categoria: 'oficina' })] })
    const b = balanceGeneral(l, '2026-10-25')
    expect(b.efectivoNegativo).toBe(true)
    expect(b.cuadra).toBe(true)
  })
})

describe('comparativo y exportación', () => {
  it('el periodo anterior tiene la misma duración y termina el día antes', () => {
    expect(rangoAnterior({ desde: '2026-10-01', hasta: '2026-10-25' })).toEqual({ desde: '2026-09-06', hasta: '2026-09-30' })
    expect(rangoAnterior({})).toBeNull()
  })
  it('la variación no divide entre cero', () => {
    expect(variacion(150, 100)).toBe(50)
    expect(variacion(50, 100)).toBe(-50)
    expect(variacion(10, 0)).toBeNull()
  })
  it('el CSV trae ambos estados con importes en pesos y no incluye ISR calculado', () => {
    const csv = estadosACsv(estadoDeResultados(lineas), balanceGeneral(lineas, '2026-10-25'), 'Todo')
    expect(csv).toContain('Utilidad de operación')
    expect(csv).toContain('144200.00'); expect(csv).toContain(',-30000.00')
    expect(csv).toContain('Total del activo')
    expect(csv).toMatch(/determina el contador/)
  })
  it('las limitaciones dicen que no hay impuestos ni bancos', () => {
    const t = LIMITACIONES_DE_LOS_ESTADOS.join(' ')
    expect(t).toMatch(/banco/i); expect(t).toMatch(/ISR/); expect(t).toMatch(/ESTIMACIÓN/)
  })
})

/**
 * El caso REAL de la bodega (26-oct-2026): renta cobrada de $80,000, la mitad del colaborador ($40,000, retenida por acreditación sin verificar) que ya se le pagó en efectivo,
 * y $40,000 entregados a otra empresa del grupo como aportación de capital. VIVE BIEN se quedó sin efectivo, pero su utilidad es $40,000.
 */
describe('aportación a una empresa del grupo y pago al colaborador', () => {
  const OP = op({ id: 'bodega', propiedad_id: 'p1', tipo: 'renta', total_centavos: 8_000_000, colaborador_centavos: 0, colaborador_retenido_centavos: 4_000_000, reparto_estado: 'retenido', fecha_cierre: '2026-09-25' })
  const APORTACION = mov({ id: 'ap1', clase: 'aportacion_grupo', categoria: 'aportacion_grupo', monto_centavos: 4_000_000, fecha: '2026-10-26', concepto: 'Aportación de capital a ANDAX' })
  const PAGO = mov({ id: 'pg1', clase: 'pago_colaborador', categoria: 'pago_colaborador', monto_centavos: 4_000_000, fecha: '2026-10-26', concepto: 'Pago en efectivo al colaborador', operacion_id: 'bodega', propiedad_id: 'p1' })
  const lineas = construirLineas({ operaciones: [OP], movimientos: [APORTACION, PAGO] })

  it('el estado de resultados NO se ensucia: la utilidad de VIVE BIEN sigue siendo $40,000 (ni la aportación ni el pago son gasto)', () => {
    const er = estadoDeResultados(lineas)
    expect(er.ingresos).toBe(pesos(80_000))
    expect(er.costoColaboradores).toBe(pesos(40_000))
    expect(er.gastosDeVenta.total + er.gastosDeAdministracion).toBe(0)
    expect(er.utilidadDeOperacion).toBe(pesos(40_000))
  })
  it('el balance: sin efectivo, lo entregado al grupo ya no cuenta (no es inversión), nada que pagar al colaborador, y cuadra', () => {
    const b = balanceGeneral(lineas, '2026-10-26')
    expect(b.activo).toEqual({ efectivoEstimado: 0, comisionesPorCobrar: 0, total: 0 })
    expect(b.capital).toEqual({ resultadosAcumulados: pesos(40_000), movimientosConElGrupo: -pesos(40_000), total: 0 })
    expect(b.pasivo.comisionesPorPagarAColaboradores).toBe(0)
    expect(b.capital.resultadosAcumulados).toBe(pesos(40_000))
    expect(b.cuadra).toBe(true)
    expect(b.efectivoNegativo).toBe(false)
  })
  it('sin el pago al colaborador, esos $40,000 siguen siendo pasivo y el efectivo sale negativo (avisa)', () => {
    const b = balanceGeneral(construirLineas({ operaciones: [OP], movimientos: [APORTACION] }), '2026-10-26')
    expect(b.pasivo.comisionesPorPagarAColaboradores).toBe(pesos(40_000))
    expect(b.activo.efectivoEstimado).toBe(pesos(40_000))
    expect(b.cuadra).toBe(true)
  })
  it('los totales no cuentan dos veces al colaborador: salió $80,000 (su parte + la aportación), queda $0 y se ve cuánto se pagó', () => {
    const t = totales(lineas)
    expect(t).toMatchObject({ entra: pesos(80_000), sale: pesos(80_000), neto: 0, colaboradores: pesos(40_000), aportacionesAlGrupo: pesos(40_000), pagosAColaboradores: pesos(40_000), gastosExternos: 0 })
    const serie = serieMensual(lineas, '2026-10-26')
    expect(serie.find((m) => m.mes === '2026-09')!.sale).toBe(pesos(40_000)) // la parte del colaborador, en el mes del cierre
    expect(serie.find((m) => m.mes === '2026-10')!.sale).toBe(pesos(40_000)) // solo la aportación: el pago de octubre NO se suma otra vez
  })
  it('se pueden anular (una devolución no aplica) y anulada deja de contar', () => {
    const l = lineas.find((x) => x.clase === 'aportacion_grupo')!
    expect(correccionesPosibles(l, lineas)).toMatchObject({ devolver: false, anular: true, restante: pesos(40_000) })
    const anulada = construirLineas({ operaciones: [OP], movimientos: [APORTACION, mov({ id: 'an1', clase: 'anulacion', categoria: 'aportacion_grupo', sentido: 'entra', monto_centavos: 4_000_000, reverso_de: 'ap1', motivo: 'Se reclasificó con el contador', concepto: 'Anulación' })] })
    expect(balanceGeneral(anulada, '2026-10-26').capital.movimientosConElGrupo).toBe(0)
  })
  it('si una empresa del grupo regresa dinero entra como aportación: sube el efectivo y el capital, NO es ingreso y el estado de resultados no cambia', () => {
    const RECIBIDA = mov({ id: 'ar1', fecha: '2026-10-26', clase: 'aportacion_recibida_grupo', categoria: 'aportacion_recibida_grupo', sentido: 'entra', monto_centavos: 1_500_000, concepto: 'Aportación de ANDAX' })
    const con = construirLineas({ operaciones: [OP], movimientos: [APORTACION, PAGO, RECIBIDA] })
    const sin = construirLineas({ operaciones: [OP], movimientos: [APORTACION, PAGO] })
    expect(estadoDeResultados(con)).toEqual(estadoDeResultados(sin))
    const b = balanceGeneral(con, '2026-10-26')
    expect(b.activo.efectivoEstimado).toBe(pesos(15_000))
    expect(b.capital.movimientosConElGrupo).toBe(-pesos(25_000))
    expect(b.cuadra).toBe(true)
    expect(totales(con)).toMatchObject({ aportacionesDelGrupo: pesos(15_000), aportacionesAlGrupo: pesos(40_000) })
    const l = con.find((x) => x.clase === 'aportacion_recibida_grupo')!
    expect(correccionesPosibles(l, con)).toMatchObject({ devolver: false, anular: true, restante: pesos(15_000) })
  })
  it('el CSV trae la inversión y el balance sigue cuadrando', () => {
    const csv = estadosACsv(estadoDeResultados(lineas), balanceGeneral(lineas, '2026-10-26'), 'Todo')
    expect(csv).toContain('Movimientos de capital con empresas del grupo')
    expect(csv).toContain('40000.00')
  })
})
