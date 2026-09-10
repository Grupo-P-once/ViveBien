/**
 * De dónde es una propiedad, sin inventárselo.
 *
 * La ciudad estaba escrita a mano como «León, Guanajuato» en tres sitios de la
 * ficha, incluidos:
 *
 *   · El **mapa**, que hacía `ubicacion + ', León, Guanajuato'`. Una propiedad
 *     en Silao mostraba un mapa de León.
 *   · Los **datos estructurados** de Google (`addressLocality: 'León'`), que
 *     indexan cada ficha. Eso no es cosmético: le dice al buscador que la nave
 *     está en una ciudad donde no está.
 *
 * Y la propia página «Nosotros» dice que la casa opera **también en Silao**. La
 * contradicción ya estaba en el sitio; sólo que nadie la había mirado.
 *
 * Mientras `07-ubicacion-y-fotos.sql` no esté aplicado no hay columna `ciudad`,
 * así que esto la deduce del texto libre. Cuando la migración entre, la columna
 * manda y esto deja de adivinar.
 */

/** Dónde opera la casa por defecto. No es una verdad sobre cada propiedad. */
export const CIUDAD_BASE = 'León'
export const ESTADO_BASE = 'Guanajuato'

/** Estados mexicanos que aparecen escritos en las ubicaciones del catálogo. */
const ESTADOS = [
  'Guanajuato', 'Jalisco', 'Michoacán', 'Querétaro', 'Aguascalientes',
  'San Luis Potosí', 'Zacatecas', 'Ciudad de México', 'Estado de México',
  'Nuevo León', 'Colima', 'Nayarit',
]

type Fuente = {
  ciudad?: string | null
  estado_dir?: string | null
  ubicacion?: string | null
}

export type Lugar = {
  ciudad: string
  estado: string
  /** `Colonia, Ciudad, Estado`, listo para enseñar o para buscar en el mapa. */
  completo: string
  /** True si salió de una columna real; false si se dedujo del texto. */
  fiable: boolean
}

/**
 * Resuelve la ubicación de una propiedad.
 *
 * Orden: columnas reales → texto libre → valor por defecto de la casa.
 */
export function lugarDe(p: Fuente): Lugar {
  const ciudadCol = p.ciudad?.trim()
  const estadoCol = p.estado_dir?.trim()

  if (ciudadCol) {
    const estado = estadoCol || ESTADO_BASE
    return {
      ciudad: ciudadCol,
      estado,
      completo: [p.ubicacion?.trim(), ciudadCol, estado].filter(Boolean).join(', '),
      fiable: true,
    }
  }

  const texto = (p.ubicacion ?? '').trim()
  if (!texto) {
    return {
      ciudad: CIUDAD_BASE,
      estado: ESTADO_BASE,
      completo: `${CIUDAD_BASE}, ${ESTADO_BASE}`,
      fiable: false,
    }
  }

  const partes = texto.split(',').map((x) => x.trim()).filter(Boolean)

  // ¿La última parte es un estado conocido? Entonces la anterior es la ciudad.
  const ultima = partes[partes.length - 1] ?? ''
  const estadoEncontrado = ESTADOS.find(
    (e) => e.toLowerCase() === ultima.toLowerCase(),
  )

  if (estadoEncontrado && partes.length >= 2) {
    return {
      ciudad: partes[partes.length - 2],
      estado: estadoEncontrado,
      completo: texto,
      fiable: true,
    }
  }

  // Sin estado escrito: se asume la ciudad de la casa, pero se marca como no
  // fiable para que quien lo use pueda decidir si lo enseña o no.
  return {
    ciudad: CIUDAD_BASE,
    estado: ESTADO_BASE,
    completo: `${texto}, ${CIUDAD_BASE}, ${ESTADO_BASE}`,
    fiable: false,
  }
}
