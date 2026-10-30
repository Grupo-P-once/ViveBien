/**
 * Superficie y precio por m² (24-oct-2026).
 *
 * Antes el precio por m² se redondeaba a entero en cada pantalla (`Math.round(precio / metros)`): $5,000,000 entre 140 m² salía «$35,714 / m²»
 * y 35,714 × 140 = $4,999,960, que no es el precio del anuncio. Ahora hay UNA sola cuenta, con hasta 2 decimales, y todas las pantallas
 * la comparten. La superficie también admite hasta 2 decimales (140.50 m²).
 */

export const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Precio por m² con 2 decimales, o null si falta el precio o la superficie (nunca divide entre cero). */
export function precioPorM2(precio: unknown, metros: unknown): number | null {
  const p = Number(precio)
  const m = Number(metros)
  if (!Number.isFinite(p) || !Number.isFinite(m) || p <= 0 || m <= 0) return null
  return redondear2(p / m)
}

const dosDecimales = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const dosDecimalesFijos = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `$35,714.29`: el precio por m² siempre con centavos, para que cuadre con el total. */
export const pesosPorM2 = (n: number) => `$${dosDecimalesFijos.format(n)}`

/** `140.5`, `1,244`: la superficie sin ceros de relleno, con hasta 2 decimales. */
export const formatoMetros = (n: number) => dosDecimales.format(n)
