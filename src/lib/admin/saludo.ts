/** El saludo de la cabecera del panel, a la hora de León y no a la del servidor. */

const ZONA_HORARIA = 'America/Mexico_City'

export function horaLocal(ahora: Date): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_HORARIA, hour: 'numeric', hourCycle: 'h23' }).format(ahora)
  return Number(h) % 24
}

export function saludoPara(ahora: Date): string {
  const h = horaLocal(ahora)
  if (h >= 5 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/**
 * «Jose Emiliano Ponce Perez» → «Jose Emiliano». Dos palabras porque en México
 * el nombre de pila suele ser doble; sin nombre, lo que va antes de la @.
 */
export function nombreCorto(nombre: string | null | undefined, email: string | null | undefined): string {
  const limpio = (nombre ?? '').trim().replace(/\s+/g, ' ')
  if (limpio) {
    const palabras = limpio.split(' ')
    const corto = palabras.length >= 3 ? palabras.slice(0, 2).join(' ') : palabras[0]
    return corto.charAt(0).toUpperCase() + corto.slice(1).toLowerCase().replace(/\s(\p{L})/gu, (_, l: string) => ` ${l.toUpperCase()}`)
  }
  const usuario = (email ?? '').split('@')[0]
  return usuario || 'administrador'
}

/** «Jose Emiliano» → «JE». */
export function iniciales(nombre: string | null | undefined, email: string | null | undefined): string {
  const palabras = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase()
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase()
  return (email ?? '?').slice(0, 2).toUpperCase()
}
