import { celdaCsv, type Linea, type Rango } from '@/lib/contabilidad'
import { grupoDeGasto } from '@/lib/contabilidad-panorama'

/**
 * Estados financieros de VIVE BIEN (26-oct-2026): Estado de Resultados y Balance General armados desde el libro contable, con el orden y los nombres de las NIF (B-3 «Estado de
 * resultado integral», B-6 «Estado de situación financiera»).
 *
 * LO QUE SON Y LO QUE NO. Son estados **gerenciales**: sirven para entender el negocio y para llevárselos a un contador o a un banco como punto de partida. NO son estados
 * dictaminados ni contabilidad fiscal: el sistema no lleva bancos reales, IVA, retenciones, activos fijos, capital social ni pagos a colaboradores, y no sabe en qué régimen fiscal
 * está VIVE BIEN. Cada estado dice sus límites y lista lo que le toca confirmar al contador. El ISR y la PTU NO se calculan aquí: los determina el contador.
 *
 * CRITERIO. Resultados por **devengado** (la comisión cuenta cuando se registra el cierre, esté cobrada o no; el gasto cuando ocurre). El balance se arma a la fecha de hoy con todo
 * lo vigente: lo anulado no cuenta. Dinero en centavos enteros.
 */

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const enRango = (l: Pick<Linea, 'fecha'>, r?: Rango) => (!r?.desde || l.fecha >= r.desde) && (!r?.hasta || l.fecha <= r.hasta)
const signo = (l: Pick<Linea, 'clase'>) => (l.clase === 'devolucion' ? -1 : 1)

export type EstadoDeResultados = {
  rango: Rango
  ingresosPorVentas: number
  ingresosPorRentas: number
  /** Comisiones externas (de propiedades que no están en el sitio): solo la parte de VIVE BIEN. */
  ingresosExternos: number
  /** Ingresos por comisiones (ventas + rentas), devengados. */
  ingresos: number
  /** Costo de servicios: la parte de las comisiones que se comparte con colaboradores. */
  costoColaboradores: number
  utilidadBruta: number
  /** Gastos de venta: promoción, comisiones a terceros y gastos propios de las operaciones. */
  gastosDeVenta: { promocion: number; comisionesATerceros: number; deLasOperaciones: number; total: number }
  gastosDeAdministracion: number
  utilidadDeOperacion: number
  /** Otros ingresos (ingresos extra, netos de devoluciones). */
  otrosIngresos: number
  /** Antes de ISR y PTU: esos los determina el contador. */
  resultadoAntesDeImpuestos: number
  margenBruto: number | null
  margenDeOperacion: number | null
  margenNeto: number | null
}

export function estadoDeResultados(lineas: Linea[], rango: Rango = {}): EstadoDeResultados {
  let venta = 0, renta = 0, externas = 0, colab = 0, promo = 0, terceros = 0, deOp = 0, admin = 0, otros = 0
  for (const l of lineas) {
    if (!l.vigente || !enRango(l, rango)) continue
    if (l.clase === 'comision') { if (l.tipoOp === 'renta') renta += l.monto; else venta += l.monto; continue }
    if (l.clase === 'comision_externa') { externas += l.monto; continue }
    if (l.clase === 'colaborador') { colab += l.monto; continue }
    if (l.clase === 'ingreso_extra') { otros += l.monto; continue }
    if (l.clase === 'devolucion' && l.categoria === 'ingreso_extra') { otros -= l.monto; continue }
    const g = grupoDeGasto(l)
    if (!g) continue
    const v = signo(l) * l.monto
    if (g === 'promocion') promo += v
    else if (g === 'comision_externa') terceros += v
    else if (g === 'otros_de_operacion') deOp += v
    else admin += v
  }
  const ingresos = venta + renta + externas
  const utilidadBruta = ingresos - colab
  const ventaTotal = promo + terceros + deOp
  const utilidadDeOperacion = utilidadBruta - ventaTotal - admin
  const antes = utilidadDeOperacion + otros
  const pct = (x: number) => (ingresos > 0 ? Math.round((x / ingresos) * 1000) / 10 : null)
  return {
    rango, ingresosPorVentas: venta, ingresosPorRentas: renta, ingresosExternos: externas, ingresos, costoColaboradores: colab, utilidadBruta,
    gastosDeVenta: { promocion: promo, comisionesATerceros: terceros, deLasOperaciones: deOp, total: ventaTotal }, gastosDeAdministracion: admin,
    utilidadDeOperacion, otrosIngresos: otros, resultadoAntesDeImpuestos: antes,
    margenBruto: pct(utilidadBruta), margenDeOperacion: pct(utilidadDeOperacion), margenNeto: pct(antes),
  }
}

/** El periodo inmediato anterior, de la misma duración (para el comparativo). `null` si el periodo es «todo» (no hay anterior). */
export function rangoAnterior(rango: Rango): Rango | null {
  if (!rango.desde || !rango.hasta) return null
  const dia = 86_400_000
  const d = Date.parse(`${rango.desde}T00:00:00Z`), h = Date.parse(`${rango.hasta}T00:00:00Z`)
  if (Number.isNaN(d) || Number.isNaN(h) || h < d) return null
  const dias = Math.round((h - d) / dia) + 1
  const finAnterior = d - dia
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  return { desde: iso(finAnterior - (dias - 1) * dia), hasta: iso(finAnterior) }
}

/** Variación porcentual entre dos periodos; `null` si el anterior es cero (no tiene sentido dividir). */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10
}

export type BalanceGeneral = {
  /** Fecha a la que se arma. */
  al: string
  activo: { efectivoEstimado: number; comisionesPorCobrar: number; total: number }
  pasivo: { comisionesPorPagarAColaboradores: number; total: number }
  capital: { resultadosAcumulados: number; /** Lo que otras empresas del grupo aportaron a VIVE BIEN menos lo que VIVE BIEN entregó a ellas. Lo entregado SALE y ya no se lleva como inversión (decisión del dueño). */ movimientosConElGrupo: number; total: number }
  /** Pasivo + capital. */
  pasivoMasCapital: number
  /** ¿El activo es igual a pasivo + capital? Se comprueba por dos caminos: el balance contra el estado de resultados de toda la historia. */
  cuadra: boolean
  diferencia: number
  /** El efectivo estimado salió negativo: faltan ingresos por registrar o sobran gastos. */
  efectivoNegativo: boolean
}

export function balanceGeneral(lineas: Linea[], al: string): BalanceGeneral {
  const vigentes = lineas.filter((l) => l.vigente && l.fecha <= al)
  const cobrado = suma(vigentes.filter((l) => (l.clase === 'comision' || l.clase === 'comision_externa') && l.estado === 'cobrado').map((l) => l.monto))
  const porCobrar = suma(vigentes.filter((l) => (l.clase === 'comision' || l.clase === 'comision_externa') && l.estado !== 'cobrado').map((l) => l.monto))
  const extra = suma(vigentes.filter((l) => l.clase === 'ingreso_extra').map((l) => l.monto)) - suma(vigentes.filter((l) => l.clase === 'devolucion' && l.categoria === 'ingreso_extra').map((l) => l.monto))
  const gastosPagados = suma(vigentes.map((l) => (grupoDeGasto(l) ? signo(l) * l.monto : 0)))
  const colaboradores = suma(vigentes.filter((l) => l.clase === 'colaborador').map((l) => l.monto))
  const aportaciones = suma(vigentes.filter((l) => l.clase === 'aportacion_grupo').map((l) => l.monto))
  const recibidas = suma(vigentes.filter((l) => l.clase === 'aportacion_recibida_grupo').map((l) => l.monto))
  const pagosAColaboradores = suma(vigentes.filter((l) => l.clase === 'pago_colaborador').map((l) => l.monto))

  // El efectivo baja con lo gastado, con lo entregado a otras empresas del grupo y con lo ya pagado a colaboradores, y sube con lo que el grupo aporta. Lo entregado al grupo NO queda como
  // inversión: ese dinero sale de VIVE BIEN y deja de contar; si el grupo lo regresa, entra como aportación. Ambos movimientos van al capital, no al estado de resultados.
  const efectivo = cobrado + extra - gastosPagados - aportaciones + recibidas - pagosAColaboradores
  const activo = efectivo + porCobrar
  const movimientosConElGrupo = recibidas - aportaciones
  const pasivo = colaboradores - pagosAColaboradores
  // El capital sale del estado de resultados de TODA la historia (otro camino distinto al de las cuentas del balance): si algo no cuadra, aquí se nota.
  const resultados = estadoDeResultados(lineas.filter((l) => l.fecha <= al)).resultadoAntesDeImpuestos
  const diferencia = activo - (pasivo + resultados + movimientosConElGrupo)
  return {
    al,
    activo: { efectivoEstimado: efectivo, comisionesPorCobrar: porCobrar, total: activo },
    pasivo: { comisionesPorPagarAColaboradores: pasivo, total: pasivo },
    capital: { resultadosAcumulados: resultados, movimientosConElGrupo, total: resultados + movimientosConElGrupo },
    pasivoMasCapital: pasivo + resultados + movimientosConElGrupo, cuadra: diferencia === 0, diferencia, efectivoNegativo: efectivo < 0,
  }
}

/** Lo que el sistema NO sabe y le toca confirmar a la persona o a su contador. Se muestra siempre junto a los estados. */
export const LIMITACIONES_DE_LOS_ESTADOS: ReadonlyArray<string> = Object.freeze([
  'Son estados gerenciales armados con el libro del sistema, no estados dictaminados ni contabilidad fiscal.',
  'El efectivo es una ESTIMACIÓN (comisiones cobradas + ingresos extra − gastos): no se concilia con tus cuentas de banco reales.',
  'La parte del colaborador es pasivo («por pagar») hasta que se registre su pago en Gastos y cuentas ▸ «Pago al colaborador».',
  'Una aportación a otra empresa del grupo se muestra como inversión (activo), no como gasto; si legal o fiscalmente debe tratarse distinto (préstamo, retiro, pago de un servicio), lo decide el contador.',
  'No hay IVA, retenciones, ISR ni PTU: los importes son antes de impuestos y el contador debe determinarlos según el régimen fiscal de VIVE BIEN.',
  'No hay activos fijos, depreciación, capital social ni aportaciones/retiros de socios.',
])
export const PENDIENTES_PARA_EL_CONTADOR: ReadonlyArray<string> = Object.freeze([
  'Régimen fiscal y obligaciones (ISR, IVA, PTU, contabilidad electrónica) de VIVE BIEN.',
  'Saldos reales de bancos y conciliación contra el efectivo estimado.',
  'Facturación (CFDI) de las comisiones y deducibilidad de los gastos.',
  'Tratamiento de lo pagado a colaboradores (CFDI o retenciones) y de las comisiones por cobrar.',
  'Capital social, aportaciones, retiros y activos fijos, si los hay.',
])

/** CSV de los dos estados, para el contador. Una línea por renglón: «Estado, Concepto, Importe (MXN)». */
export function estadosACsv(er: EstadoDeResultados, bg: BalanceGeneral, etiquetaPeriodo: string): string {
  const m = (c: number) => (c / 100).toFixed(2)
  // El importe es un número generado aquí (no texto de una persona): no pasa por el guardia de fórmulas, que le pondría apóstrofo a los negativos y Excel no podría sumarlos.
  const f = (estado: string, concepto: string, c: number) => `${celdaCsv(estado)},${celdaCsv(concepto)},${m(c)}`
  const filas = [
    ['Estado', 'Concepto', 'Importe (MXN)'].map(celdaCsv).join(','),
    f(`Estado de resultados · ${etiquetaPeriodo}`, 'Ingresos por comisiones de venta', er.ingresosPorVentas),
    f('Estado de resultados', 'Ingresos por comisiones de renta', er.ingresosPorRentas),
    f('Estado de resultados', 'Ingresos por comisiones externas (su parte)', er.ingresosExternos),
    f('Estado de resultados', 'Total de ingresos', er.ingresos),
    f('Estado de resultados', '(−) Costo: parte de colaboradores', -er.costoColaboradores),
    f('Estado de resultados', 'Utilidad bruta', er.utilidadBruta),
    f('Estado de resultados', '(−) Gastos de venta · promoción', -er.gastosDeVenta.promocion),
    f('Estado de resultados', '(−) Gastos de venta · comisiones a terceros', -er.gastosDeVenta.comisionesATerceros),
    f('Estado de resultados', '(−) Gastos de venta · de las operaciones', -er.gastosDeVenta.deLasOperaciones),
    f('Estado de resultados', '(−) Gastos de administración', -er.gastosDeAdministracion),
    f('Estado de resultados', 'Utilidad de operación', er.utilidadDeOperacion),
    f('Estado de resultados', '(+) Otros ingresos', er.otrosIngresos),
    f('Estado de resultados', 'Resultado antes de impuestos (ISR y PTU los determina el contador)', er.resultadoAntesDeImpuestos),
    f(`Balance general · al ${bg.al}`, 'Efectivo (estimado)', bg.activo.efectivoEstimado),
    f('Balance general', 'Comisiones por cobrar', bg.activo.comisionesPorCobrar),
    f('Balance general', 'Total del activo', bg.activo.total),
    f('Balance general', 'Comisiones por pagar a colaboradores', bg.pasivo.comisionesPorPagarAColaboradores),
    f('Balance general', 'Total del pasivo', bg.pasivo.total),
    f('Balance general', 'Resultados acumulados', bg.capital.resultadosAcumulados),
    f('Balance general', 'Movimientos de capital con empresas del grupo (aportaciones recibidas menos entregadas)', bg.capital.movimientosConElGrupo),
    f('Balance general', 'Total pasivo + capital', bg.pasivoMasCapital),
  ]
  return `﻿${filas.join('\r\n')}\r\n`
}
