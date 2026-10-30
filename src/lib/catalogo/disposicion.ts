/**
 * Disposición del catálogo por tipo de propiedad (22-oct-2026). Código puro: decide cuántas columnas, filas y páginas, para que el carrusel y
 * «Mostrar todas» se prueben sin navegador.
 *
 * La idea (pedida por el propietario): cada tipo de propiedad enseña COMO MÁXIMO 2 FILAS de 3 o 4 tarjetas. Si hay más, esas dos filas son un
 * carrusel (se desplaza de a una «pantalla» de columnas) y debajo hay «Mostrar todas»: al pulsarlo el carrusel desaparece y se ven todas en una
 * rejilla de varias filas. Tarjetas pequeñas y compactas, como la lámina «Premium Houses for Sale Carousel».
 */

export const FILAS_MAX = 2

/** Columnas visibles según el ancho DEL CONTENEDOR (no de la ventana): 4 en escritorio, 3 en portátil, 2 en tableta y 1 en teléfono. */
export function columnasPara(ancho: number): 1 | 2 | 3 | 4 {
  if (ancho >= 1100) return 4
  if (ancho >= 760) return 3
  if (ancho >= 520) return 2
  return 1
}

/** Cuántas caben sin carrusel: dos filas completas. */
export function capacidad(columnas: number): number {
  return Math.max(1, columnas) * FILAS_MAX
}

/** ¿Hay más tarjetas de las que caben en dos filas? Entonces hay carrusel y «Mostrar todas». */
export function necesitaCarrusel(total: number, columnas: number): boolean {
  return total > capacidad(columnas)
}

/** Una fila si todas caben en una; si no, dos. */
export function filasPara(total: number, columnas: number): number {
  return total > Math.max(1, columnas) ? FILAS_MAX : 1
}

/** Número de «pantallas» del carrusel (puntos de abajo). */
export function paginasDe(total: number, columnas: number): number {
  const cols = Math.max(1, columnas)
  const filas = filasPara(total, cols)
  const columnasTotales = Math.ceil(total / filas)
  return Math.max(1, Math.ceil(columnasTotales / cols))
}

/** Página actual a partir del desplazamiento. `paso` = ancho de una pantalla del carrusel (incluida la separación). */
export function paginaActual(scrollLeft: number, paso: number, paginas: number): number {
  if (paso <= 0 || paginas <= 1) return 0
  return Math.min(paginas - 1, Math.max(0, Math.round(scrollLeft / paso)))
}
