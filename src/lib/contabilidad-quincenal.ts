import { gastosHormiga, porCategoria, type Linea } from '@/lib/contabilidad'
import { estadoDeResultados } from '@/lib/contabilidad-estados'

/**
 * Reporte quincenal de contabilidad (26-oct-2026), para el grupo de avisos de Telegram. Pura: arma las cifras y el texto; no envía nada (eso lo hace la ruta, con `avisar`).
 *
 * LA QUINCENA. Se reporta la que ya terminó: del día 1 al 15 se reporta en cuanto llega el 16; del 16 al fin de mes, en cuanto llega el día 1 del siguiente. Si el cron de hoy
 * cae en día 1–15, la quincena a reportar es la 16–fin del mes anterior; si cae del 16 en adelante, la 1–15 de este mes.
 *
 * LA PRIVACIDAD. El grupo de Telegram es un canal de alertas: el reporte lleva SOLO cifras agregadas y nombres de categorías. Nunca conceptos de gastos, referencias, correos, teléfonos,
 * nombres de personas ni de propiedades.
 */

export type Quincena = { desde: string; hasta: string; etiqueta: string }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const dos = (n: number) => String(n).padStart(2, '0')
const finDeMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()

function armar(a: number, m: number, mitad: 1 | 2): Quincena {
  const fin = mitad === 1 ? 15 : finDeMes(a, m)
  const ini = mitad === 1 ? 1 : 16
  return { desde: `${a}-${dos(m)}-${dos(ini)}`, hasta: `${a}-${dos(m)}-${dos(fin)}`, etiqueta: `${ini}–${fin} de ${MESES[m - 1]} de ${a}` }
}

/** La quincena que ya terminó y toca reportar, vista desde `hoy` (AAAA-MM-DD). */
export function quincenaACerrar(hoy: string): Quincena {
  const [a, m, d] = hoy.split('-').map(Number)
  if (d >= 16) return armar(a, m, 1)
  return m === 1 ? armar(a - 1, 12, 2) : armar(a, m - 1, 2)
}

/** La quincena inmediata anterior a otra (para comparar). */
export function quincenaAnterior(q: Quincena): Quincena {
  const [a, m, d] = q.desde.split('-').map(Number)
  if (d === 16) return armar(a, m, 1)
  return m === 1 ? armar(a - 1, 12, 2) : armar(a, m - 1, 2)
}

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
const pesos = (centavos: number) => (centavos / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const variacion = (actual: number, previo: number) => (previo === 0 ? null : Math.round(((actual - previo) / Math.abs(previo)) * 100))
const textoVariacion = (v: number | null) => (v === null ? 'sin quincena anterior con la que comparar' : `${v > 0 ? '+' : ''}${v} % contra la quincena anterior`)

export type ReporteQuincenal = {
  quincena: Quincena
  hayMovimientos: boolean
  cierres: number
  ingresos: number
  gastos: number
  utilidadDeOperacion: number
  ingresosPrevios: number
  utilidadPrevia: number
  mayorGasto: { etiqueta: string; monto: number; parte: number } | null
  porCobrarVencido: { n: number; monto: number }
  hormigas: number
  nivel: 'ok' | 'aviso'
  accion: string | null
}

export function construirReporteQuincenal(lineas: Linea[], quincena: Quincena, hoy: string): ReporteQuincenal {
  const er = estadoDeResultados(lineas, quincena)
  const previa = estadoDeResultados(lineas, quincenaAnterior(quincena))
  const cierres = lineas.filter((l) => l.vigente && (l.clase === 'comision' || l.clase === 'comision_externa') && l.fecha >= quincena.desde && l.fecha <= quincena.hasta).length
  const gastos = er.gastosDeVenta.total + er.gastosDeAdministracion
  const top = porCategoria(lineas, quincena)[0]
  const vencidas = lineas.filter((l) => l.vigente && (l.clase === 'comision' || l.clase === 'comision_externa') && l.estado !== 'cobrado' && dias(l.fecha, hoy) > 30)
  const vencido = { n: vencidas.length, monto: vencidas.reduce((s, l) => s + l.monto, 0) }
  const hormigas = gastosHormiga(lineas, hoy).length
  const hayMovimientos = cierres > 0 || gastos !== 0 || er.otrosIngresos !== 0
  const acciones: string[] = []
  if (vencido.n > 0) acciones.push(`Cobrar ${vencido.n} ${vencido.n === 1 ? 'comisión' : 'comisiones'} con más de 30 días (${pesos(vencido.monto)}).`)
  if (er.utilidadDeOperacion < 0) acciones.push('La utilidad de operación salió negativa: revisa en qué se fue el gasto.')
  if (hormigas > 0) acciones.push(`Revisa ${hormigas} ${hormigas === 1 ? 'gasto hormiga' : 'gastos hormiga'} recurrentes.`)
  return {
    quincena, hayMovimientos, cierres, ingresos: er.ingresos, gastos, utilidadDeOperacion: er.utilidadDeOperacion, ingresosPrevios: previa.ingresos, utilidadPrevia: previa.utilidadDeOperacion,
    mayorGasto: top && top.neto > 0 ? { etiqueta: top.etiqueta, monto: top.neto, parte: top.parte } : null,
    porCobrarVencido: vencido, hormigas, nivel: acciones.length ? 'aviso' : 'ok', accion: acciones[0] ?? null,
  }
}

/** Lo que se manda a `avisar()`: título, datos «etiqueta: valor» y la acción. Sin PII (solo cifras agregadas y nombres de categoría). */
export function alertaDelReporte(r: ReporteQuincenal) {
  const datos: Record<string, string> = {}
  if (!r.hayMovimientos) {
    datos['Movimientos'] = 'Ninguno en la quincena'
  } else {
    datos['Cierres'] = String(r.cierres)
    datos['Ingresos'] = `${pesos(r.ingresos)} (${textoVariacion(variacion(r.ingresos, r.ingresosPrevios))})`
    datos['Gastos'] = pesos(r.gastos)
    datos['Utilidad de operación'] = `${pesos(r.utilidadDeOperacion)} (${textoVariacion(variacion(r.utilidadDeOperacion, r.utilidadPrevia))})`
    if (r.mayorGasto) datos['Mayor gasto'] = `${r.mayorGasto.etiqueta}: ${pesos(r.mayorGasto.monto)} (${r.mayorGasto.parte} % del gasto)`
  }
  if (r.porCobrarVencido.n > 0) datos['Por cobrar con más de 30 días'] = `${r.porCobrarVencido.n} · ${pesos(r.porCobrarVencido.monto)}`
  return {
    nivel: r.nivel as 'ok' | 'aviso',
    titulo: `Contabilidad VIVE BIEN · quincena del ${r.quincena.etiqueta}`,
    datos,
    ...(r.accion ? { accion: r.accion } : {}),
    clave: `contab-quincenal-${r.quincena.desde}-${r.quincena.hasta}`,
  }
}
