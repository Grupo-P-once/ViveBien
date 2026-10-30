/**
 * La opinión del asesor sobre un trato por cerrar (26-oct-2026): el servidor le pide al modelo un formato fijo (veredicto + por qué + qué ajustar) y la pantalla lo lee aquí.
 * Vive aparte de `contabilidad-ia.ts` (solo servidor) porque lo usan los dos lados. Lo que escribe el modelo es texto no confiable: se parte en líneas de texto plano, nunca HTML,
 * y si no sigue el formato la pantalla muestra el texto tal cual (sin veredicto inventado).
 */

export const FORMATO_DE_OPINION = Object.freeze({
  veredicto: 'Veredicto: <opción>',
  opciones: ['Razonable', 'Conviene ajustar', 'Revisar con cuidado'] as const,
  porQue: 'Por qué:',
  ajustar: 'Qué ajustar:',
})

export type Veredicto = (typeof FORMATO_DE_OPINION.opciones)[number]
export type OpinionLeida = { veredicto: Veredicto | null; porQue: string[]; ajustar: string[]; resto: string[] }

const sinAdornos = (l: string) => l.replace(/^[\s*_#>]+|[\s*_]+$/g, '').trim()
const comoViñeta = (l: string) => l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim()
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Lee la opinión. El veredicto solo se acepta si es EXACTAMENTE una de las tres opciones; lo demás cae en `resto` y se muestra como texto. */
export function leerOpinion(texto: string): OpinionLeida {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const salida: OpinionLeida = { veredicto: null, porQue: [], ajustar: [], resto: [] }
  let seccion: 'porQue' | 'ajustar' | 'resto' = 'resto'
  for (const cruda of lineas) {
    const l = sinAdornos(cruda.replaceAll('**', ''))
    const n = norm(l)
    const v = /^veredicto\s*:\s*(.+)$/i.exec(l)
    if (v) {
      const op = FORMATO_DE_OPINION.opciones.find((o) => norm(o) === norm(v[1]).replace(/[.\s]+$/g, ''))
      if (op && !salida.veredicto) { salida.veredicto = op; continue }
    }
    if (/^por que\s*:?$/.test(n)) { seccion = 'porQue'; continue }
    if (/^que ajustar\s*:?$/.test(n)) { seccion = 'ajustar'; continue }
    const dentro = /^por que\s*:\s*(.+)$/.exec(n) ? 'porQue' : /^que ajustar\s*:\s*(.+)$/.exec(n) ? 'ajustar' : null
    if (dentro) { seccion = dentro; salida[dentro].push(comoViñeta(l.replace(/^[^:]+:\s*/, ''))); continue }
    salida[seccion].push(comoViñeta(cruda))
  }
  // Sin un veredicto válido no hay formato que mostrar: todo vuelve a ser texto.
  if (!salida.veredicto) return { veredicto: null, porQue: [], ajustar: [], resto: lineas.map(comoViñeta) }
  return salida
}
