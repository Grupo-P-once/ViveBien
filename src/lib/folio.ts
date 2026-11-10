/**
 * El folio de una propiedad: `VB-2026-00125`.
 *
 * Lo asigna la base al insertar y no cambia nunca (migración 12). Es lo que se
 * dicta por teléfono o se escribe en un WhatsApp: «me interesa la VB-2026-00006».
 * Por eso tiene que poder escribirse sin cuidado —en minúsculas, con espacios—
 * y seguir funcionando.
 */

const RE_FOLIO = /^VB-\d{4}-\d{5}$/

/** Mayúsculas, sin espacios y con guiones: «vb 2026 00006» → «VB-2026-00006». */
export function normalizarFolio(texto: string): string {
  const limpio = (texto || '').trim().toUpperCase().replace(/[\s_]+/g, '-')
  const m = limpio.match(/^VB-?(\d{4})-?(\d{1,5})$/)
  return m ? `VB-${m[1]}-${m[2].padStart(5, '0')}` : limpio
}

/** Si un texto es un folio de propiedad, escrito como sea. */
export function esFolio(texto: string): boolean {
  return RE_FOLIO.test(normalizarFolio(texto))
}

/**
 * El folio COMPLETO tal como se escribe en un buscador (`VB-AAAA-NNNNN`, con o sin guiones, en cualquier caso): devuelve el folio normalizado, o `null`.
 * Exige los 5 dígitos A PROPÓSITO: `normalizarFolio` rellena con ceros («VB-2026-1» → «VB-2026-00001»), y saltar a la ficha mientras la persona todavía escribe («VB-2026-1» de
 * camino a «VB-2026-10») la sacaría del buscador a medias. Auditoría del rol cliente, 28-oct-2026 (A12): escribir un folio daba 0 resultados.
 */
export function folioCompleto(texto: string): string | null {
  const m = (texto || '').trim().toUpperCase().match(/^VB-?(\d{4})-?(\d{5})$/)
  return m ? `VB-${m[1]}-${m[2]}` : null
}
