/**
 * La hora de León, pase lo que pase con la del equipo que mira.
 *
 * Las citas se guardan como instantes (UTC) y se piensan en hora local de
 * León: «el martes a las 11:00» es 11:00 en León aunque el cliente abra el
 * portal desde otro país o el servidor corra en UTC. Por eso aquí nada usa
 * `getHours()` ni `new Date(año, mes, día)`, que dependen de la zona del
 * equipo, y nada supone un `-06:00` fijo: la zona se pide por nombre a `Intl`.
 *
 * Los días se manejan como texto `AAAA-MM-DD` (día civil en León).
 */

export const ZONA = 'America/Mexico_City'

const partesFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export type PartesLocales = { anio: number; mes: number; dia: number; hora: number; minuto: number }

/** Año, mes (1-12), día, hora y minuto de ese instante en León. */
export function partesLocales(d: Date): PartesLocales {
  const p: Record<string, number> = {}
  for (const { type, value } of partesFmt.formatToParts(d)) {
    if (type !== 'literal') p[type] = Number(value)
  }
  return { anio: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute }
}

const dos = (n: number) => String(n).padStart(2, '0')

/** El día civil en León de ese instante: `AAAA-MM-DD`. */
export function diaLocal(d: Date): string {
  const p = partesLocales(d)
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`
}

/** `HH:MM` en León. */
export function horaLocal24(d: Date): string {
  const p = partesLocales(d)
  return `${dos(p.hora)}:${dos(p.minuto)}`
}

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/
const RE_HORA = /^(\d{2}):(\d{2})(?::\d{2})?$/

export function esDia(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = RE_DIA.exec(v)
  if (!m) return false
  const f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return f.getUTCFullYear() === +m[1] && f.getUTCMonth() === +m[2] - 1 && f.getUTCDate() === +m[3]
}

/** Hora de León menos hora UTC, en minutos, en ese instante (hoy −360). */
function desfaseMin(d: Date): number {
  const p = partesLocales(d)
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto)
  return Math.round((comoUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000)
}

/**
 * El instante que corresponde a «ese día a esa hora» en León.
 *
 * Se estima con el desfase de ese momento y se corrige una vez: así también
 * sirve si algún día vuelve el horario de verano.
 */
export function instanteLocal(dia: string, hhmm: string): Date {
  const d = RE_DIA.exec(dia)
  const h = RE_HORA.exec(hhmm)
  if (!d || !h) throw new Error(`Fecha u hora inválida: ${dia} ${hhmm}`)
  const comoUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2])
  const primero = comoUtc - desfaseMin(new Date(comoUtc)) * 60000
  return new Date(comoUtc - desfaseMin(new Date(primero)) * 60000)
}

/** Suma días a un día civil (sin pasar por la zona del equipo). */
export function sumarDias(dia: string, n: number): string {
  const m = RE_DIA.exec(dia)
  if (!m) throw new Error(`Día inválido: ${dia}`)
  const f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n))
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`
}

/** 0 = domingo … 6 = sábado, del día civil. */
export function diaSemana(dia: string): number {
  const m = RE_DIA.exec(dia)
  if (!m) throw new Error(`Día inválido: ${dia}`)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()
}

/** Días completos entre dos días civiles (b − a). */
export function diasEntre(a: string, b: string): number {
  const ma = RE_DIA.exec(a)
  const mb = RE_DIA.exec(b)
  if (!ma || !mb) throw new Error('Día inválido')
  return Math.round((Date.UTC(+mb[1], +mb[2] - 1, +mb[3]) - Date.UTC(+ma[1], +ma[2] - 1, +ma[3])) / 86_400_000)
}

/** Minutos desde medianoche de un `HH:MM`. */
export function minutosDe(hhmm: string): number {
  const h = RE_HORA.exec(hhmm)
  if (!h) throw new Error(`Hora inválida: ${hhmm}`)
  return +h[1] * 60 + +h[2]
}

const fechaLargaFmt = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' })
const fechaConAnioFmt = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const horaFmt = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, hour: 'numeric', minute: '2-digit', hour12: true })

/** «martes 3 de septiembre» (con año si no es el año en curso). */
export function fechaLarga(d: Date, ahora: Date = new Date()): string {
  return partesLocales(d).anio === partesLocales(ahora).anio ? fechaLargaFmt.format(d) : fechaConAnioFmt.format(d)
}

/** «11:00 a. m.» */
export function horaCorta(d: Date): string {
  return horaFmt.format(d)
}
