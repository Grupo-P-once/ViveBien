/**
 * Cálculo de la comisión y su reparto (Etapa C del motor de comisiones, 24-oct-2026). Código puro: sin base, sin red, sin reloj.
 *
 * Reglas del propietario (propuesta comercial, NO contrato vigente hasta que lo apruebe un abogado y un contador, D-19 / D-18):
 *  · Venta: 3.5 % del precio final firmado. Renta: un mes de renta base.
 *  · Si participa un agente o inmobiliaria colaboradora ELEGIBLE, se reparte 50/50 la comisión total efectivamente cobrada (no es un 50 %
 *    adicional para el cliente).
 *  · Elegible = acreditación verificada y vigente + operación atribuible a VIVE BIEN. Sin eso, el reparto queda retenido: no se libera.
 *  · El cálculo es SIEMPRE antes de IVA y otros impuestos trasladados. Cómo se presentan, facturan o retienen lo decide el contador: aquí
 *    no se presume (por eso la regla lleva `tratamientoIva: 'pendiente_contador'`).
 *
 * Todo el dinero va en CENTAVOS ENTEROS (nunca decimales de punto flotante) y el reparto suma exactamente el total.
 * Las reglas son datos versionados (`REGLAS`): ningún componente repite el 3.5 o el 50.
 */

export type TipoOperacion = 'venta' | 'renta'

export type ReglaComision = {
  version: string
  /** Estado de la propia regla: una regla en borrador sirve para calcular y probar, nunca para cobrar. */
  estado: 'borrador' | 'vigente'
  /** Venta: puntos base sobre el precio final firmado (350 = 3.50 %). */
  ventaPuntosBase: number
  /** Renta: meses de renta base que se cobran. */
  rentaMeses: number
  /** Parte del colaborador elegible sobre la comisión total, en puntos base (5000 = 50 %). */
  colaboradorPuntosBase: number
  /** Lo que NO se decide aquí. */
  tratamientoIva: 'pendiente_contador'
}

export const REGLA_BORRADOR_2026_10_24: ReglaComision = Object.freeze({
  version: 'borrador-2026-10-24',
  estado: 'borrador',
  ventaPuntosBase: 350,
  rentaMeses: 1,
  colaboradorPuntosBase: 5000,
  tratamientoIva: 'pendiente_contador',
})

/**
 * Límites de lo que una persona del equipo puede AJUSTAR en una operación concreta (la regla es el punto de partida; el trato real se negocia).
 * Venta: de 3 % a 4 % (decisión del propietario con el abogado, 3-nov-2026; el valor predeterminado es 3.5 %). Renta: de un cuarto de mes a 3 meses. Reparto con el colaborador: de 0 % a 100 %. Hasta 10 gastos.
 * Cualquier ajuste distinto de la regla exige un motivo escrito (queda en la operación, que no se edita).
 */
export const LIMITES = Object.freeze({
  ventaPuntosBase: Object.freeze({ min: 300, max: 400 }),
  rentaMesesCent: Object.freeze({ min: 25, max: 300 }),
  colaboradorPuntosBase: Object.freeze({ min: 0, max: 10000 }),
  gastosMax: 10,
  conceptoMax: 80,
  motivo: Object.freeze({ min: 10, max: 300 }),
})

export type Gasto = { concepto: string; montoCentavos: number }
export type Ajustes = {
  /** Venta: puntos base sobre el precio (350 = 3.50 %). */
  ventaPuntosBase?: number
  /** Renta: centésimas de mes (100 = un mes, 150 = mes y medio). */
  rentaMesesCent?: number
  /** Parte del colaborador en puntos base (5000 = 50 %). */
  colaboradorPuntosBase?: number
  /** Gastos de la operación (publicidad, fotografía, gestoría…). Salen de la parte de VIVE BIEN, no de la del colaborador. */
  gastos?: Gasto[]
}

/** Registro de reglas por versión. Una versión no se edita: se agrega otra. */
export const REGLAS: Readonly<Record<string, ReglaComision>> = Object.freeze({ [REGLA_BORRADOR_2026_10_24.version]: REGLA_BORRADOR_2026_10_24 })

export type Colaborador = {
  /** ¿Hay un agente o inmobiliaria colaboradora en la operación? */
  participa: boolean
  /** Estado de la acreditación (ver `estadoAcreditacion`): solo `verificado` libera. */
  acreditacion: EstadoAcreditacion
  /** ¿La operación se puede vincular de forma verificable a VIVE BIEN (consulta, referencia o visita)? */
  atribuible: boolean
}

export type EstadoAcreditacion = 'sin_folio' | 'pendiente' | 'verificado' | 'no_coincide' | 'vencido'

export type MotivoRetencion =
  | 'sin_colaborador'
  | 'acreditacion_no_verificada'
  | 'operacion_no_atribuible'

export type ResultadoCalculo =
  | {
      ok: true
      regla: string
      operacion: TipoOperacion
      baseCentavos: number
      totalCentavos: number
      /** Lo que se queda VIVE BIEN (incluye el centavo sobrante si el total es impar). */
      viveBienCentavos: number
      /** Parte del colaborador que SÍ se puede liberar (0 si está retenida). */
      colaboradorCentavos: number
      /** Parte del colaborador que corresponde por la regla pero está retenida hasta que se cumplan las condiciones. */
      colaboradorRetenidoCentavos: number
      retencion: MotivoRetencion | null
      antesDeImpuestos: true
      /** Lo efectivamente aplicado: puntos base (venta), centésimas de mes (renta) y reparto (null si no hay colaborador). */
      comisionPuntosBase: number | null
      rentaMesesCent: number | null
      colaboradorPuntosBase: number | null
      /** Suma de los gastos y lo que le queda a VIVE BIEN después de ellos. */
      gastosCentavos: number
      netoViveBienCentavos: number
      /** ¿Algún valor se separa de la regla? Si sí, la operación necesita un motivo escrito. */
      ajustada: boolean
    }
  | { ok: false; error: string }

// 4 mil millones de pesos: tope de cordura que además mantiene todos los productos dentro de los enteros seguros de JavaScript.
const MAX_BASE_CENTAVOS = 4e11

/** Redondeo aritmético (mitad hacia arriba) de a*b/c con enteros: con a <= MAX_BASE_CENTAVOS y b <= 10000 no pierde precisión. */
function mulDiv(a: number, b: number, c: number): number {
  return Math.floor((a * b * 2 + c) / (2 * c))
}

/** a*b/10000 hacia abajo (el centavo impar se queda en VIVE BIEN). */
const mulDivAbajo = (a: number, b: number) => Math.floor((a * b) / 10000)

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0

export function calcularComision(entrada: {
  operacion: TipoOperacion
  /** Venta: precio final firmado. Renta: renta mensual base. En centavos enteros, antes de impuestos. */
  baseCentavos: number
  regla?: ReglaComision
  colaborador?: Colaborador
  ajustes?: Ajustes
}): ResultadoCalculo {
  const regla = entrada.regla ?? REGLA_BORRADOR_2026_10_24
  if (entrada.operacion !== 'venta' && entrada.operacion !== 'renta') return { ok: false, error: 'La operación debe ser venta o renta.' }
  if (!entero(entrada.baseCentavos)) return { ok: false, error: 'La base debe ser un monto positivo en centavos enteros.' }
  if (entrada.baseCentavos > MAX_BASE_CENTAVOS) return { ok: false, error: 'La base es demasiado grande.' }

  const base = entrada.baseCentavos
  const aj = entrada.ajustes ?? {}
  const ventaBp = aj.ventaPuntosBase ?? regla.ventaPuntosBase
  const mesesCent = aj.rentaMesesCent ?? regla.rentaMeses * 100
  const colBp = aj.colaboradorPuntosBase ?? regla.colaboradorPuntosBase
  const enRango = (v: number, l: { min: number; max: number }) => Number.isSafeInteger(v) && v >= l.min && v <= l.max
  if (entrada.operacion === 'venta' && !enRango(ventaBp, LIMITES.ventaPuntosBase)) return { ok: false, error: 'El porcentaje de la venta debe estar entre 3 % y 4 %.' }
  if (entrada.operacion === 'renta' && !enRango(mesesCent, LIMITES.rentaMesesCent)) return { ok: false, error: 'Los meses de renta deben estar entre 0.25 y 3.' }
  if (!enRango(colBp, LIMITES.colaboradorPuntosBase)) return { ok: false, error: 'El reparto del colaborador debe estar entre 0 % y 100 %.' }
  const gastos = aj.gastos ?? []
  if (gastos.length > LIMITES.gastosMax) return { ok: false, error: `Máximo ${LIMITES.gastosMax} gastos por operación.` }
  for (const g of gastos) {
    if (typeof g.concepto !== 'string' || !g.concepto.trim() || g.concepto.trim().length > LIMITES.conceptoMax) return { ok: false, error: `Cada gasto lleva un concepto de hasta ${LIMITES.conceptoMax} caracteres.` }
    if (/@|\d{7,}/.test(g.concepto)) return { ok: false, error: 'El concepto del gasto no lleva correos ni teléfonos: solo qué fue (por ejemplo, «fotografía»).' }
    if (!entero(g.montoCentavos)) return { ok: false, error: 'Cada gasto lleva un monto positivo en pesos.' }
  }
  const gastosCentavos = gastos.reduce((a, g) => a + g.montoCentavos, 0)
  const total = entrada.operacion === 'venta' ? mulDiv(base, ventaBp, 10000) : mulDiv(base, mesesCent, 100)
  if (!Number.isSafeInteger(total) || total < 1) return { ok: false, error: 'La comisión calculada es menor a un centavo.' }

  const c = entrada.colaborador ?? { participa: false, acreditacion: 'sin_folio' as const, atribuible: false }
  const correspondeAlColaborador = c.participa ? Math.floor(mulDivAbajo(total, colBp)) : 0 // el centavo impar se queda en VIVE BIEN

  let retencion: MotivoRetencion | null = null
  if (!c.participa) retencion = 'sin_colaborador'
  else if (c.acreditacion !== 'verificado') retencion = 'acreditacion_no_verificada'
  else if (!c.atribuible) retencion = 'operacion_no_atribuible'

  const libera = c.participa && retencion === null
  const colaboradorLibre = libera ? correspondeAlColaborador : 0
  const retenido = c.participa && !libera ? correspondeAlColaborador : 0
  const viveBien = total - colaboradorLibre - retenido
  if (gastosCentavos > viveBien) return { ok: false, error: 'Los gastos no pueden ser mayores que la parte de VIVE BIEN.' }

  return {
    ok: true,
    regla: regla.version,
    operacion: entrada.operacion,
    baseCentavos: entrada.baseCentavos,
    totalCentavos: total,
    viveBienCentavos: viveBien,
    colaboradorCentavos: colaboradorLibre,
    colaboradorRetenidoCentavos: retenido,
    retencion,
    antesDeImpuestos: true,
    comisionPuntosBase: entrada.operacion === 'venta' ? ventaBp : null,
    rentaMesesCent: entrada.operacion === 'renta' ? mesesCent : null,
    colaboradorPuntosBase: c.participa ? colBp : null,
    gastosCentavos,
    netoViveBienCentavos: viveBien - gastosCentavos,
    ajustada: (entrada.operacion === 'venta' && ventaBp !== regla.ventaPuntosBase) || (entrada.operacion === 'renta' && mesesCent !== regla.rentaMeses * 100) || (c.participa && colBp !== regla.colaboradorPuntosBase),
  }
}

/** Centavos → pesos con dos decimales, solo para mostrar. */
export const pesosDeCentavos = (centavos: number) => (centavos / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

/** Pesos escritos por una persona → centavos enteros, o null si no es un monto válido (sin notación científica ni más de 2 decimales). */
export function centavosDePesos(entrada: unknown): number | null {
  const t = typeof entrada === 'number' ? String(entrada) : typeof entrada === 'string' ? entrada.trim().replace(/[,\s$]/g, '') : ''
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const [p, d = ''] = t.split('.')
  const n = Number(p) * 100 + Number(d.padEnd(2, '0'))
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_BASE_CENTAVOS ? n : null
}

/** «3.5», «3,5» o «3.50» → 350 puntos base. Hasta 2 decimales; null si no es un número válido. */
export function puntosBaseDePorcentaje(entrada: unknown): number | null {
  const t = typeof entrada === 'number' ? String(entrada) : typeof entrada === 'string' ? entrada.trim().replace(',', '.').replace(/\s*%$/, '') : ''
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

/** «1», «1.5» o «0.25» meses → centésimas de mes. Hasta 2 decimales; null si no es válido. */
export const centesimasDeMeses = (entrada: unknown): number | null => puntosBaseDePorcentaje(entrada)

/** 350 → «3.5» (para mostrar en un campo). */
export const porcentajeDePuntosBase = (bp: number) => String(bp / 100)
