/**
 * El archivo `.ics` que va con los correos de visita confirmada, cambiada o
 * cancelada, y el enlace «Agregar a Google Calendar».
 *
 * El `UID` es siempre el mismo para una cita y `SEQUENCE` es su versión: los
 * calendarios que lo respetan actualizan el evento en vez de duplicarlo.
 * `METHOD:PUBLISH` y sin invitados: no se piden respuestas «Sí / No» (una
 * respuesta así tampoco confirmaría nada).
 *
 * Sin datos personales: ni en el archivo ni en la URL de Google.
 */

export type DatosIcs = {
  id: string
  version: number
  inicio: Date
  fin: Date
  titulo: string
  lugar: string | null
  enlace: string
  cancelada?: boolean
  /** Momento de generación (DTSTAMP). */
  ahora?: Date
}

/** 20260922T170000Z */
export function fechaIcs(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escapa texto según RFC 5545 (\, ; , y saltos de línea). */
export function escaparIcs(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Líneas de más de 75 octetos se doblan con CRLF + espacio. */
function doblar(linea: string): string {
  const bytes = Buffer.from(linea, 'utf8')
  if (bytes.length <= 75) return linea
  const partes: string[] = []
  let actual = ''
  for (const ch of linea) {
    if (Buffer.byteLength(actual + ch, 'utf8') > (partes.length ? 74 : 75)) {
      partes.push(actual)
      actual = ch
    } else {
      actual += ch
    }
  }
  partes.push(actual)
  return partes.join('\r\n ')
}

export function generarIcs(c: DatosIcs): string {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vive Bien Grupo Inmobiliario//Visitas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${c.id}@vivebienn.com`,
    `SEQUENCE:${c.version}`,
    `DTSTAMP:${fechaIcs(c.ahora ?? new Date())}`,
    `DTSTART:${fechaIcs(c.inicio)}`,
    `DTEND:${fechaIcs(c.fin)}`,
    `SUMMARY:${escaparIcs(`${c.cancelada ? 'Cancelada · ' : ''}Visita · ${c.titulo}`)}`,
    ...(c.lugar ? [`LOCATION:${escaparIcs(c.lugar)}`] : []),
    `DESCRIPTION:${escaparIcs(`Visita con Vive Bien Grupo Inmobiliario.\nDetalles y cambios: ${c.enlace}`)}`,
    `URL:${c.enlace}`,
    `STATUS:${c.cancelada ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lineas.map(doblar).join('\r\n') + '\r\n'
}

/** Enlace de plantilla de Google Calendar: título, horario y lugar. Nada personal. */
export function enlaceGoogleCalendar(c: Pick<DatosIcs, 'inicio' | 'fin' | 'titulo' | 'lugar' | 'enlace'>): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Visita · ${c.titulo}`,
    dates: `${fechaIcs(c.inicio)}/${fechaIcs(c.fin)}`,
    details: `Visita con Vive Bien Grupo Inmobiliario. Detalles y cambios: ${c.enlace}`,
    ctz: 'America/Mexico_City',
  })
  if (c.lugar) p.set('location', c.lugar)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
