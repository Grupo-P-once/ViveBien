/**
 * Nombre de la nube de Cloudinary (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`), UNA sola vez.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE (15-oct-2026, E-48)
 *
 * El firmador (`lib/medios/firma.ts`) recortaba espacios y saltos de línea de
 * esa variable, pero el saneo del servidor (`lib/sanear-propiedad.ts`) comparaba
 * contra el valor SIN recortar. Con un salto de línea pegado en la variable, la
 * subida funcionaba (firma con el valor limpio) y el guardado de la URL se
 * rechazaba con «sólo imágenes subidas desde el asistente»… pero solo para quien
 * no es moderador. Dos sitios con dos criterios es la raíz del fallo: ahora los
 * dos usan esta función.
 *
 * Sin dependencias (ni `node:crypto`): el saneo y el firmador la importan por igual.
 * ─────────────────────────────────────────────────────────────
 */
export function normalizarNube(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio === '' ? null : limpio
}
