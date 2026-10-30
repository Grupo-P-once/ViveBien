/**
 * Marcadores del mapa del catálogo, según la lámina «Propuesta de marcadores para mapa» del propietario (22-oct-2026): un PIN rojo con la casa del
 * logotipo dentro de un círculo blanco, y una PASTILLA con el precio (blanca con borde rojo; roja y llena cuando está seleccionada). Todo es HTML/SVG
 * en línea: sin imágenes externas ni dependencias, y el texto que viene de los anuncios SIEMPRE se escapa.
 */

export const ROJO = '#A30D12'
export const NEGRO = '#1A1A1A'

/** El techo con chimenea del logotipo de VIVE BIEN, como línea (viewBox 32×22). */
/** Solo los trazos, para poder meterlos dentro de otro SVG. */
export const TECHO_G = (color: string) =>
  `<g fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18L14 6.5L25 18"/><path d="M17.5 9.5L24 4L30 10.5"/><path d="M8.5 12.5V6.5H12V9.2"/></g>`

export const TECHO_SVG = (color: string, tam = 18) =>
  `<svg viewBox="0 0 32 22" width="${tam}" height="${Math.round(tam * 22 / 32)}" aria-hidden="true" focusable="false">${TECHO_G(color)}</svg>`

/** Escapa lo que viene de un anuncio antes de ponerlo en HTML (título, colonia…). */
export function escapar(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** «$6,300,000». */
export function precioLargo(n: number): string {
  return `$${Math.round(n).toLocaleString('es-MX')}`
}

/** «$9.9M», «$850K». Se TRUNCA (no se redondea hacia arriba): nunca se enseña un precio mayor al real. */
export function precioCorto(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1_000_000) {
    const m = Math.floor(n / 100_000) / 10
    return `$${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (n >= 1_000) return `$${Math.floor(n / 1_000)}K`
  return `$${Math.round(n)}`
}

/** Pastilla con precio. `estado`: normal (blanca), seleccionada (roja y llena, con el precio corto debajo). */
export function htmlPastilla(precio: number | null, estado: 'normal' | 'seleccionada', etiqueta: string): string {
  const sel = estado === 'seleccionada'
  const texto = precio && precio > 0 ? precioLargo(precio) : 'Consultar'
  const corto = sel && precio && precio > 0 ? `<small>${escapar(precioCorto(precio))}</small>` : ''
  return `<div class="mk-pastilla${sel ? ' mk-sel' : ''}" role="img" aria-label="${escapar(etiqueta)}">`
    + `<span class="mk-ico">${TECHO_SVG(sel ? ROJO : ROJO, sel ? 17 : 16)}</span>`
    + `<span class="mk-txt"><b>${escapar(texto)}</b>${corto}</span></div>`
}

/** Pin simple (sin precio): gota roja con la casa en un círculo blanco; negra cuando está activa. */
export function htmlPin(activo: boolean, etiqueta: string): string {
  const c = activo ? NEGRO : ROJO
  return `<div class="mk-pin${activo ? ' mk-sel' : ''}" role="img" aria-label="${escapar(etiqueta)}">`
    + `<svg viewBox="0 0 48 64" width="36" height="48" aria-hidden="true" focusable="false"><path d="M24 62C24 62 4 38 4 22A20 20 0 0 1 44 22C44 38 24 62 24 62Z" fill="${c}"/><circle cx="24" cy="22" r="13.5" fill="#fff"/>`
    + `<g transform="translate(14.2 16.2) scale(.62)">${TECHO_G(c)}</g></svg></div>`
}
