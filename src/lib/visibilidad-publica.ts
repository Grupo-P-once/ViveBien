/**
 * Regla ÚNICA de qué propiedad ve el público (catálogo, ficha, sitemap y la lectura anónima de la API).
 *
 * Son dos ejes distintos y no se confunden:
 *  - `estado_pub` (moderación): sólo `publicada` sale del equipo. Ausente (filas viejas) se trata como publicada.
 *  - `estatus` (comercial): `pausada`, `eliminada` (la «archivada» del panel), `vendida` y `rentada` se esconden. Solo `disponible` se ve. Desde el 26-oct-2026 lo vendido o rentado
 *    sale del sitio por decisión del dueño (antes seguían visibles con una insignia) y vive en la pestaña «Rentadas / Vendidas» del panel de propiedades.
 *
 * `estatus` nulo cuenta como visible: un filtro SQL `not in` excluiría los NULL sin querer, por eso se decide aquí, en JS.
 * Ojo: es la segunda barrera. La política RLS de la base sólo mira `estado_pub`; ver docs/DECISIONS.md (D-59).
 */
export const ESTATUS_OCULTOS_AL_PUBLICO = ['pausada', 'eliminada', 'vendida', 'rentada'] as const

export function esVisibleAlPublico(p: { estado_pub?: string | null; estatus?: string | null } | null | undefined): boolean {
  if (!p) return false
  if (p.estado_pub && p.estado_pub !== 'publicada') return false
  if (p.estatus && (ESTATUS_OCULTOS_AL_PUBLICO as readonly string[]).includes(p.estatus)) return false
  return true
}
