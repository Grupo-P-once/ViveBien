import { describe, it, expect } from 'vitest'

/**
 * Contraste (WCAG 2.x) de los pares de color que usan la portada, «Nosotros» y «Contacto» tras el rediseño del 21-oct-2026.
 * Texto normal ≥ 4,5:1; texto grande (titulares) e iconos ≥ 3:1. Si alguien cambia un color de `nosotros.css`, `contacto.css` o `inicio.css`,
 * debe cambiar aquí el par correspondiente: la prueba obliga a mirarlo.
 */
const lin = (hex: string) => hex.replace('#', '').match(/../g)!.map((v) => parseInt(v, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
const lum = (hex: string) => { const [r, g, b] = lin(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const TEXTO: [string, string, string][] = [
  ['gris sobre papel', '#4b5563', '#fbfaf8'], ['azul sobre papel', '#0f2747', '#fbfaf8'], ['rojo de marca sobre papel', '#C8102E', '#fbfaf8'],
  ['crédito/pie gris sobre blanco', '#6b7280', '#ffffff'], ['sector de la tarjeta de empresa', '#6b7280', '#fbfaf8'],
  ['comentario de reseña', '#3c4043', '#ffffff'], ['rol en la reseña', '#5f6368', '#ffffff'], ['etiquetas del formulario', '#4b5563', '#ffffff'],
  ['marcador de posición', '#6b7280', '#ffffff'], ['botón verde con texto oscuro', '#0b1a10', '#25d366'], ['botón rojo con texto blanco', '#ffffff', '#a80d24'],
  ['cursiva rosa del cierre de la portada', '#ff5470', '#0f2747'],
]
const GRANDE_O_ICONO: [string, string, string][] = [
  ['cursiva roja de los titulares sobre azul noche', '#e11d3c', '#0b1d3a'], ['icono blanco sobre verde', '#ffffff', '#17803d'],
  ['icono blanco sobre naranja', '#ffffff', '#b45f06'], ['icono blanco sobre morado', '#ffffff', '#5b4fcf'],
]
describe('contraste de la portada, Nosotros y Contacto', () => {
  it.each(TEXTO)('texto: %s ≥ 4,5:1', (_n, fg, bg) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5) })
  it.each(GRANDE_O_ICONO)('titular grande o icono: %s ≥ 3:1', (_n, fg, bg) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3) })
})
