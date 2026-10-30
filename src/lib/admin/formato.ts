/** Formatos del panel: números, precios y fechas en español de México, a la hora de León. */

const ZONA_HORARIA = 'America/Mexico_City'

const ENTERO = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const DECIMAL = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const PRECIO = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

export function entero(n: number): string {
  return ENTERO.format(n)
}

export function decimal(n: number): string {
  return DECIMAL.format(n)
}

/** «100 %», «15 %», «5.8 %»: el decimal sólo cuando aporta. */
export function porcentaje(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${Number.isInteger(n) ? ENTERO.format(n) : DECIMAL.format(n)} %`
}

export function precio(n: number | string | null | undefined): string | null {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) && v > 0 ? PRECIO.format(v) : null
}

/** «16 sep 26». */
export function fechaCorta(fechaIso: string | null | undefined): string {
  if (!fechaIso) return '—'
  const t = Date.parse(fechaIso)
  if (!Number.isFinite(t)) return '—'
  return new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA, day: '2-digit', month: 'short', year: '2-digit' })
    .format(t)
    .replace(/\./g, '')
}

/** «10:24». */
export function hora(fechaIso: string | null | undefined): string {
  if (!fechaIso) return ''
  const t = Date.parse(fechaIso)
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t)
}

/** «hace 5 min», «hace 3 h», «ayer», «hace 4 días»; lo más viejo, con fecha. */
export function haceCuanto(fechaIso: string | null | undefined, ahora: Date = new Date()): string {
  if (!fechaIso) return ''
  const t = Date.parse(fechaIso)
  if (!Number.isFinite(t)) return ''
  const minutos = Math.floor((ahora.getTime() - t) / 60_000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  return fechaCorta(fechaIso)
}
