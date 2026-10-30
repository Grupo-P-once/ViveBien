import { diaLocal } from '../analitica'

/**
 * Períodos del panel y comparación con el período anterior.
 *
 * ─────────────────────────────────────────────────────────────
 * TRES REGLAS, Y CADA UNA VIENE DE UN ERROR QUE OTRO PANEL YA PAGÓ
 *
 *  1. **Todo rango es semiabierto: `[desde, hasta)`.** Un panel que aplicaba el
 *     inicio y no el final enseñaba 880 leads donde había 44. Aquí no hay una
 *     sola consulta de rango sin su tope: la ventana siempre trae los dos.
 *
 *  2. **Si el período anterior es 0, no hay porcentaje.** «+100 %» o «∞» sobre
 *     cero no dicen nada. Se devuelve `sin-comparacion` y el panel lo explica.
 *
 *  3. **Si no hay datos del período anterior completo, tampoco.** Los eventos
 *     empiezan el 13-sep: comparar «últimos 30 días» contra un mes en el que no
 *     se medía nada daría una subida falsa. Se comprueba contra la fecha del
 *     primer dato de cada fuente.
 *
 * Las tasas se comparan en **puntos**, no en porcentaje de un porcentaje: pasar
 * de 2 % a 3 % es «+1 punto», no «+50 %».
 * ─────────────────────────────────────────────────────────────
 */

export type Periodo = '7d' | '30d' | '90d' | '12m'

export const PERIODOS: { clave: Periodo; etiqueta: string; dias: number }[] = [
  { clave: '7d', etiqueta: 'Últimos 7 días', dias: 7 },
  { clave: '30d', etiqueta: 'Últimos 30 días', dias: 30 },
  { clave: '90d', etiqueta: 'Últimos 90 días', dias: 90 },
  { clave: '12m', etiqueta: 'Últimos 12 meses', dias: 365 },
]

export const PERIODO_POR_DEFECTO: Periodo = '30d'

const DIA_MS = 86_400_000

export function periodoValido(valor: unknown): Periodo {
  return PERIODOS.some((p) => p.clave === valor) ? (valor as Periodo) : PERIODO_POR_DEFECTO
}

export function etiquetaPeriodo(periodo: Periodo): string {
  return PERIODOS.find((p) => p.clave === periodo)?.etiqueta ?? ''
}

export type Ventana = {
  periodo: Periodo
  dias: number
  desde: Date
  hasta: Date
  anteriorDesde: Date
  anteriorHasta: Date
}

/** La ventana actual termina ahora; la anterior, justo donde empieza la actual. */
export function ventanaDe(periodo: Periodo, ahora: Date = new Date()): Ventana {
  const dias = PERIODOS.find((p) => p.clave === periodo)?.dias ?? 30
  const hasta = new Date(ahora.getTime())
  const desde = new Date(hasta.getTime() - dias * DIA_MS)
  return {
    periodo,
    dias,
    desde,
    hasta,
    anteriorDesde: new Date(desde.getTime() - dias * DIA_MS),
    anteriorHasta: new Date(desde.getTime()),
  }
}

/** `[desde, hasta)`: el instante `hasta` ya es del período siguiente. */
export function enVentana(fechaIso: string | null | undefined, desde: Date, hasta: Date): boolean {
  if (!fechaIso) return false
  const t = Date.parse(fechaIso)
  if (!Number.isFinite(t)) return false
  return t >= desde.getTime() && t < hasta.getTime()
}

/** Cuenta las fechas que caen en la ventana. */
export function contarEn(fechas: (string | null | undefined)[], desde: Date, hasta: Date): number {
  let n = 0
  for (const f of fechas) if (enVentana(f, desde, hasta)) n++
  return n
}

/**
 * ¿Hay datos desde antes de que empiece el período anterior?
 *
 * `inicioDatos` es la fecha del primer registro de la fuente. Sin él (fuente
 * vacía) no hay historial con el que comparar.
 */
export function hayHistorial(inicioDatos: string | null | undefined, ventana: Ventana): boolean {
  if (!inicioDatos) return false
  const t = Date.parse(inicioDatos)
  return Number.isFinite(t) && t <= ventana.anteriorDesde.getTime()
}

export type Variacion =
  | { tipo: 'porcentaje'; valor: number }
  | { tipo: 'puntos'; valor: number }
  | { tipo: 'sin-comparacion'; motivo: 'sin-historial' | 'anterior-en-cero' }

/** Cambio de una cantidad, en porcentaje entero. */
export function variacionPorcentual(actual: number, anterior: number, conHistorial: boolean): Variacion {
  if (!conHistorial) return { tipo: 'sin-comparacion', motivo: 'sin-historial' }
  if (anterior === 0) return { tipo: 'sin-comparacion', motivo: 'anterior-en-cero' }
  return { tipo: 'porcentaje', valor: Math.round(((actual - anterior) / anterior) * 100) }
}

/** Cambio de una tasa, en puntos con un decimal. */
export function variacionEnPuntos(actual: number | null, anterior: number | null, conHistorial: boolean): Variacion {
  if (!conHistorial) return { tipo: 'sin-comparacion', motivo: 'sin-historial' }
  if (actual === null || anterior === null) return { tipo: 'sin-comparacion', motivo: 'anterior-en-cero' }
  return { tipo: 'puntos', valor: Math.round((actual - anterior) * 10) / 10 }
}

/** Tasa en porcentaje con un decimal, o null si no hay base. */
export function tasa(parte: number, base: number): number | null {
  if (base <= 0) return null
  return Math.round((parte / base) * 1000) / 10
}

/* ── Tramos para las líneas pequeñas de las tarjetas ─────────── */

/**
 * Parte una ventana en `n` tramos iguales y cuenta cuántas fechas caen en cada
 * uno. Con `acumulado`, cada tramo suma los anteriores.
 */
export function tramos(
  fechas: (string | null | undefined)[],
  desde: Date,
  hasta: Date,
  n = 12,
  acumulado = false,
): number[] {
  const inicio = desde.getTime()
  const ancho = (hasta.getTime() - inicio) / n
  const cuentas = new Array<number>(n).fill(0)
  for (const f of fechas) {
    if (!enVentana(f, desde, hasta)) continue
    const i = Math.min(n - 1, Math.floor((Date.parse(f as string) - inicio) / ancho))
    cuentas[i]++
  }
  if (!acumulado) return cuentas
  let suma = 0
  return cuentas.map((c) => (suma += c))
}

/* ── Agrupación de las series por día, semana o mes ─────────── */

export type Agrupacion = 'dia' | 'semana' | 'mes'

export function agrupacionDe(periodo: Periodo): Agrupacion {
  if (periodo === '90d') return 'semana'
  if (periodo === '12m') return 'mes'
  return 'dia'
}

/** Lunes de la semana local de un día «AAAA-MM-DD». */
function lunesDe(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  const fecha = new Date(Date.UTC(a, m - 1, d))
  const desplazamiento = (fecha.getUTCDay() + 6) % 7
  fecha.setUTCDate(fecha.getUTCDate() - desplazamiento)
  return fecha.toISOString().slice(0, 10)
}

/** Clave del grupo al que pertenece un instante, en hora de León. */
export function claveGrupo(fechaIso: string, agrupacion: Agrupacion): string {
  const dia = diaLocal(fechaIso)
  if (agrupacion === 'dia') return dia
  if (agrupacion === 'semana') return lunesDe(dia)
  return dia.slice(0, 7)
}

/** Todas las claves de grupo de la ventana, en orden, aunque estén vacías. */
export function clavesDeVentana(desde: Date, hasta: Date, agrupacion: Agrupacion): string[] {
  const claves: string[] = []
  const visto = new Set<string>()
  // Se avanza de día en día: con 365 días son 365 vueltas, nada.
  for (let t = desde.getTime(); t < hasta.getTime(); t += DIA_MS) {
    const clave = claveGrupo(new Date(t).toISOString(), agrupacion)
    if (!visto.has(clave)) {
      visto.add(clave)
      claves.push(clave)
    }
  }
  const ultima = claveGrupo(new Date(hasta.getTime() - 1).toISOString(), agrupacion)
  if (!visto.has(ultima)) claves.push(ultima)
  return claves
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «2026-09-16» → «16 sep»; «2026-09» → «sep 26». */
export function etiquetaGrupo(clave: string, agrupacion: Agrupacion): string {
  const [a, m, d] = clave.split('-')
  const mes = MESES[Number(m) - 1] ?? m
  if (agrupacion === 'mes') return `${mes} ${a.slice(2)}`
  return `${Number(d)} ${mes}`
}
