import {
  calcularComision, centavosDePesos, centesimasDeMeses, LIMITES, puntosBaseDePorcentaje, REGLA_BORRADOR_2026_10_24,
  type EstadoAcreditacion, type Gasto, type ResultadoCalculo,
} from './comision-calculo'

/**
 * Lo que la calculadora de cierres lee de las casillas (26-oct-2026). Código puro: el formulario guarda TEXTO tal como lo escribe la persona y aquí se convierte,
 * se valida y se calcula con el MISMO código que el servidor (`calcularComision`). El servidor vuelve a calcularlo todo al guardar: lo que se ve aquí es una
 * vista previa fiel, no la fuente de verdad.
 */

export type GastoEntrada = { id: string; concepto: string; monto: string }
export type EntradaCalculadora = {
  tipo: 'venta' | 'renta'
  /** Venta: precio total. Renta: renta mensual. En pesos, como se escribe. */
  base: string
  /** Venta: porcentaje pactado («3.5»). */
  pct: string
  /** Renta: meses de renta que se cobran («1», «1.5»). */
  meses: string
  /** ¿Se comparte la comisión con otro agente o inmobiliaria? */
  comparte: boolean
  /** Parte del colaborador en %. */
  colPct: string
  gastos: GastoEntrada[]
  motivo: string
}

export const PCT_VENTA_REGLA = String(REGLA_BORRADOR_2026_10_24.ventaPuntosBase / 100)
export const MESES_RENTA_REGLA = String(REGLA_BORRADOR_2026_10_24.rentaMeses)
export const PCT_COLABORADOR_REGLA = String(REGLA_BORRADOR_2026_10_24.colaboradorPuntosBase / 100)
/** Atajos de la pantalla: el rango aprobado (venta 3–4 %; renta de uno a dos meses; el reparto entre agentes se pacta caso por caso). */
export const ATAJOS = Object.freeze({ pctVenta: ['3', '3.5', '4'], mesesRenta: ['0.5', '1', '1.5', '2'], pctColaborador: ['30', '40', '50', '60'] })
export const CONCEPTOS_SUGERIDOS = Object.freeze(['Fotografía', 'Publicidad', 'Gestoría', 'Otro'])

export const entradaInicial = (tipo: 'venta' | 'renta', base: string, comparte: boolean): EntradaCalculadora => ({
  tipo, base, pct: PCT_VENTA_REGLA, meses: MESES_RENTA_REGLA, comparte, colPct: PCT_COLABORADOR_REGLA, gastos: [], motivo: '',
})

export type ContextoDeCalculo = {
  /** Lo que dice el origen declarado de la propiedad: ¿hay agente o inmobiliaria colaboradora? */
  participaEnOrigen: boolean
  acreditacion: EstadoAcreditacion
  atribuible: boolean
}

export type CalculoDeEntrada = {
  calculo: Extract<ResultadoCalculo, { ok: true }> | null
  /** Qué falta o está mal escrito, en una frase; null si todo se leyó bien (aunque falte el precio: eso es `incompleto`). */
  error: string | null
  incompleto: boolean
  /** Algún valor se separa de la regla, o se cambió si hay colaborador: pide motivo. */
  separaDeLaRegla: boolean
  motivoValido: boolean
  /** Se puede guardar (el resto de requisitos los comprueba el formulario). */
  listo: boolean
}

const vacio = (error: string | null, incompleto = false): CalculoDeEntrada => ({ calculo: null, error, incompleto, separaDeLaRegla: false, motivoValido: false, listo: false })

/** Gastos escritos → lista lista para calcular. Las filas totalmente vacías se ignoran; una a medias es un error. */
export function leerGastos(gastos: GastoEntrada[]): { ok: true; lista: Gasto[] } | { ok: false; error: string } {
  const lista: Gasto[] = []
  for (const g of gastos) {
    const concepto = g.concepto.trim()
    const monto = g.monto.trim()
    if (!concepto && !monto) continue
    if (!concepto) return { ok: false, error: 'A un gasto le falta el concepto.' }
    if (!monto) return { ok: false, error: `Al gasto «${concepto}» le falta el monto.` }
    const centavos = centavosDePesos(monto)
    if (centavos === null) return { ok: false, error: `El monto de «${concepto}» debe ser pesos con hasta 2 decimales.` }
    lista.push({ concepto, montoCentavos: centavos })
  }
  return { ok: true, lista }
}

export function calcularDesdeEntrada(e: EntradaCalculadora, ctx: ContextoDeCalculo): CalculoDeEntrada {
  if (!e.base.trim()) return vacio(null, true)
  const base = centavosDePesos(e.base)
  if (base === null) return vacio(e.tipo === 'venta' ? 'El precio debe ser pesos con hasta 2 decimales.' : 'La renta debe ser pesos con hasta 2 decimales.')

  const ajustes: Parameters<typeof calcularComision>[0]['ajustes'] = {}
  if (e.tipo === 'venta') {
    const bp = puntosBaseDePorcentaje(e.pct)
    if (bp === null) return vacio('El porcentaje debe ser un número con hasta 2 decimales (por ejemplo 3.5).')
    ajustes.ventaPuntosBase = bp
  } else {
    const m = centesimasDeMeses(e.meses)
    if (m === null) return vacio('Los meses de renta deben ser un número con hasta 2 decimales (por ejemplo 1 o 1.5).')
    ajustes.rentaMesesCent = m
  }
  if (e.comparte) {
    const bp = puntosBaseDePorcentaje(e.colPct)
    if (bp === null) return vacio('El reparto del colaborador debe ser un porcentaje con hasta 2 decimales (por ejemplo 50).')
    ajustes.colaboradorPuntosBase = bp
  }
  const g = leerGastos(e.gastos)
  if (!g.ok) return vacio(g.error)
  ajustes.gastos = g.lista

  const r = calcularComision({ operacion: e.tipo, baseCentavos: base, ajustes, colaborador: { participa: e.comparte, acreditacion: ctx.acreditacion, atribuible: ctx.atribuible } })
  if (!r.ok) return vacio(r.error)

  const separaDeLaRegla = r.ajustada || e.comparte !== ctx.participaEnOrigen
  const motivo = e.motivo.trim()
  const motivoValido = !separaDeLaRegla || (motivo.length >= LIMITES.motivo.min && motivo.length <= LIMITES.motivo.max)
  return { calculo: r, error: null, incompleto: false, separaDeLaRegla, motivoValido, listo: motivoValido }
}

/** Lo que se manda al servidor: términos del trato, nunca importes calculados. */
export function cuerpoDeAjustes(e: EntradaCalculadora, separaDeLaRegla: boolean) {
  const g = leerGastos(e.gastos)
  return {
    ...(e.tipo === 'venta' ? { comision_pct: e.pct.trim() } : { renta_meses: e.meses.trim() }),
    comparte: e.comparte,
    ...(e.comparte ? { colaborador_pct: e.colPct.trim() } : {}),
    gastos: (g.ok ? g.lista : []).map((x) => ({ concepto: x.concepto, monto_pesos: (x.montoCentavos / 100).toFixed(2) })),
    ...(separaDeLaRegla ? { ajuste_motivo: e.motivo.trim() } : {}),
  }
}

/** Texto corto de cómo se llegó a la comisión: «3.5 % de $3,000,000» o «1.5 meses de renta». */
export function descripcionDeComision(c: Extract<ResultadoCalculo, { ok: true }>, pesosTexto: (centavos: number) => string): string {
  if (c.operacion === 'venta') return `${(c.comisionPuntosBase ?? 0) / 100} % de ${pesosTexto(c.baseCentavos)}`
  const m = (c.rentaMesesCent ?? 0) / 100
  return `${m} ${m === 1 ? 'mes' : 'meses'} de renta (${pesosTexto(c.baseCentavos)} al mes)`
}

/** Escalas de la pantalla: dónde cae lo escrito frente a lo habitual en México (venta 3–4 %, el rango aprobado; renta de 1 a 2 meses). `max` es solo el largo de la regleta. */
export const ESCALAS = Object.freeze({
  venta: Object.freeze({ min: 0, max: 6, habitualDesde: 3, habitualHasta: 4, regla: 3.5, unidad: '%' }),
  renta: Object.freeze({ min: 0, max: 3, habitualDesde: 1, habitualHasta: 2, regla: 1, unidad: 'meses' }),
})

export type PosicionEnEscala = 'debajo' | 'habitual' | 'encima'
export function posicionEnEscala(valor: number, e: { habitualDesde: number; habitualHasta: number }): PosicionEnEscala {
  return valor < e.habitualDesde ? 'debajo' : valor > e.habitualHasta ? 'encima' : 'habitual'
}
