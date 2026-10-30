/**
 * Meta descripción de un artículo del Centro de Ayuda (SEO, 23-oct-2026).
 *
 * Search Console mostró que dos artículos del valuador aparecen en Google con descripciones de 37 y 45 caracteres («Entender la valuación y enviar
 * datos.»): demasiado cortas para ser un resumen útil en el resultado. Si el resumen ya es suficiente se respeta tal cual; si es corto se completa con
 * el inicio del artículo, sin Markdown. Nunca inventa texto: todo sale del propio artículo.
 */

const MINIMO = 70
const MAXIMO = 158

/** Quita **negritas** y [texto](enlace) del Markdown simple del visor, y colapsa espacios. */
function aTextoPlano(md: string): string {
  return md.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim()
}

/** Corta en el límite de palabra y cierra con «…» solo si hubo que cortar. */
function recortar(t: string, max: number): string {
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  return `${corte.slice(0, corte.lastIndexOf(' ') > 40 ? corte.lastIndexOf(' ') : corte.length).replace(/[\s,;:.]+$/, '')}…`
}

export function descripcionDeArticulo(titulo: string, resumen: string | null, cuerpo: string | null): string {
  const r = aTextoPlano(resumen ?? '')
  if (r.length >= MINIMO) return recortar(r, MAXIMO)

  const inicio = aTextoPlano((cuerpo ?? '').split(/\n+/).find((p) => aTextoPlano(p).length > 0) ?? '')
  const base = r ? (/[.!?]$/.test(r) ? r : `${r}.`) : ''
  const unida = [base, inicio].filter(Boolean).join(' ')
  if (unida.length >= MINIMO) return recortar(unida, MAXIMO)
  return recortar(unida || `${titulo} — Centro de Ayuda de VIVE BIEN.`, MAXIMO)
}
