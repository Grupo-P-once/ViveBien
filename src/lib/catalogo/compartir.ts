/**
 * Enlace corto para compartir una propiedad (22-oct-2026).
 *
 * `https://vivebienn.com/p/VB-2026-00002` → redirige a la ficha (`/propiedades/VB-2026-00002` resuelve por folio y manda a la dirección canónica).
 * El folio es la identidad pública y permanente de la propiedad (D-52): no cambia si cambia el título. Sin folio se usa la dirección de la ficha.
 */
const FOLIO = /^[A-Za-z0-9][A-Za-z0-9-]{2,40}$/

export function enlaceCorto(p: { id: string; slug?: string | null; folio?: string | null }, origen: string): string {
  const base = origen.replace(/\/+$/, '')
  const folio = (p.folio ?? '').trim()
  if (FOLIO.test(folio)) return `${base}/p/${encodeURIComponent(folio)}`
  const nombre = (p.slug ?? '').trim() || p.id
  return `${base}/propiedades/${encodeURIComponent(nombre)}`
}
