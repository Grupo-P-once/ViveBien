import { diaSemana, diasEntre, esDia, sumarDias } from './zona'

/**
 * El calendario del mes de «Agenda una cita» (10-nov-2026). Todo es aritmética de DÍAS CIVILES («AAAA-MM-DD», zona de León): nada depende de la zona del navegador.
 * La semana empieza en lunes (igual que el calendario del panel de Citas, `firstDay = 1`).
 */
const RE_MES = /^(\d{4})-(\d{2})$/
const dos = (n: number) => String(n).padStart(2, '0')

export function esMes(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = RE_MES.exec(v)
  return !!m && +m[2] >= 1 && +m[2] <= 12
}

/** «2026-11-17» → «2026-11». */
export function mesDe(dia: string): string {
  if (!esDia(dia)) throw new Error(`Día inválido: ${dia}`)
  return dia.slice(0, 7)
}

/** Suma (o resta) meses a un «AAAA-MM». */
export function sumarMeses(mes: string, n: number): string {
  const m = RE_MES.exec(mes)
  if (!m) throw new Error(`Mes inválido: ${mes}`)
  const total = +m[1] * 12 + (+m[2] - 1) + n
  return `${Math.floor(total / 12)}-${dos((total % 12) + 1)}`
}

function diasDelMes(mes: string): number {
  const m = RE_MES.exec(mes)
  if (!m) throw new Error(`Mes inválido: ${mes}`)
  return new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate()
}

/**
 * Qué pedirle a `/api/citas/disponibilidad` para pintar ese mes: desde el primer día que todavía cuenta (hoy, si el mes es el actual) hasta el último del mes.
 * `null` si el mes ya pasó entero. Nunca más de 31 días (el tope de la ruta).
 */
export function rangoDeMes(mes: string, hoy: string): { desde: string; dias: number } | null {
  const ultimo = `${mes}-${dos(diasDelMes(mes))}`
  if (ultimo < hoy) return null
  const primero = `${mes}-01`
  const desde = primero < hoy ? hoy : primero
  return { desde, dias: Math.min(diasEntre(desde, ultimo) + 1, 31) }
}

export type CeldaMes = { dia: string; delMes: boolean }

/** Las semanas COMPLETAS (lunes a domingo) que cubren el mes; los días de relleno llevan `delMes: false`. */
export function semanasDelMes(mes: string): CeldaMes[][] {
  const primero = `${mes}-01`
  const ultimo = `${mes}-${dos(diasDelMes(mes))}`
  const atras = (diaSemana(primero) + 6) % 7            // lunes = 0 … domingo = 6
  const adelante = 6 - ((diaSemana(ultimo) + 6) % 7)
  const inicio = sumarDias(primero, -atras)
  const total = atras + diasDelMes(mes) + adelante
  const semanas: CeldaMes[][] = []
  for (let i = 0; i < total; i += 7) {
    semanas.push(Array.from({ length: 7 }, (_, k) => { const dia = sumarDias(inicio, i + k); return { dia, delMes: dia.startsWith(mes) } }))
  }
  return semanas
}

const etiquetaFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' })
/** «noviembre de 2026». */
export function etiquetaDeMes(mes: string): string {
  const m = RE_MES.exec(mes)
  if (!m) throw new Error(`Mes inválido: ${mes}`)
  return etiquetaFmt.format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)))
}

/** Los 7 días civiles de «esta semana» de reserva: hoy y los 6 siguientes. */
export function semanaDeReserva(hoy: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i))
}
