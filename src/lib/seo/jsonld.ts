/**
 * Revisión de los datos estructurados (JSON-LD) de una página. Solo mira lo comprobable: que el JSON sea válido, qué tipos declara y avisa de lo que
 * la guía del proyecto prohíbe afirmar sin respaldo (calificaciones, reseñas) o que Google ya no premia (FAQ).
 */

export type ResultadoJsonLd = {
  bloques: number
  validos: number
  invalidos: number
  tipos: string[]
  avisos: string[]
}

function tiposDe(nodo: unknown, acumulado: Set<string>) {
  if (Array.isArray(nodo)) { for (const n of nodo) tiposDe(n, acumulado); return }
  if (!nodo || typeof nodo !== 'object') return
  const o = nodo as Record<string, unknown>
  const t = o['@type']
  if (typeof t === 'string') acumulado.add(t)
  else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') acumulado.add(x)
  if (o['@graph']) tiposDe(o['@graph'], acumulado)
  for (const v of Object.values(o)) if (v && typeof v === 'object') tiposDe(v, acumulado)
}

function claves(nodo: unknown, acumulado: Set<string>) {
  if (Array.isArray(nodo)) { for (const n of nodo) claves(n, acumulado); return }
  if (!nodo || typeof nodo !== 'object') return
  for (const [k, v] of Object.entries(nodo as Record<string, unknown>)) { acumulado.add(k); claves(v, acumulado) }
}

export function analizarJsonLd(bloques: string[]): ResultadoJsonLd {
  const tipos = new Set<string>(), todasLasClaves = new Set<string>(), avisos: string[] = []
  let validos = 0, invalidos = 0
  for (const b of bloques) {
    try {
      const j = JSON.parse(b)
      validos++
      tiposDe(j, tipos); claves(j, todasLasClaves)
      if (!(j && typeof j === 'object' && ('@context' in j || (Array.isArray(j) && j.some((x: unknown) => x && typeof x === 'object' && '@context' in (x as object)))))) avisos.push('Un bloque JSON-LD no declara «@context».')
    } catch {
      invalidos++
      avisos.push('Un bloque JSON-LD no es JSON válido: Google lo ignora.')
    }
  }
  for (const prohibida of ['aggregateRating', 'review']) {
    if (todasLasClaves.has(prohibida)) avisos.push(`Declara «${prohibida}»: solo es válido con datos reales y visibles en la página (nunca inventados).`)
  }
  if (tipos.has('FAQPage')) avisos.push('Declara «FAQPage»: Google retiró el rich result de FAQ (7-may-2026); no aporta aparición especial.')
  return { bloques: bloques.length, validos, invalidos, tipos: [...tipos].sort(), avisos: [...new Set(avisos)] }
}
