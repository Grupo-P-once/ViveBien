/**
 * Qué se acepta como comprobante (26-oct-2026). Código puro: el tipo de un archivo se decide por sus PRIMEROS BYTES, no por su nombre ni por el tipo que declare el navegador
 * (un «recibo.pdf» que en realidad es un ejecutable o un HTML no pasa). Solo PDF, JPG, PNG y WEBP, de hasta 4 MB (el límite de una petición en Vercel es 4.5 MB).
 */
export const TOPE_DE_ADJUNTO = 4 * 1024 * 1024
export type TipoDeArchivo = { mime: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'; extension: 'pdf' | 'jpg' | 'png' | 'webp' }

const empieza = (b: Uint8Array, firma: number[], desde = 0) => firma.every((x, i) => b[desde + i] === x)

export function tipoDeArchivo(b: Uint8Array): TipoDeArchivo | null {
  if (b.length < 12) return null
  if (empieza(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', extension: 'pdf' } // %PDF-
  if (empieza(b, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extension: 'jpg' }
  if (empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', extension: 'png' }
  if (empieza(b, [0x52, 0x49, 0x46, 0x46]) && empieza(b, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: 'image/webp', extension: 'webp' } // RIFF....WEBP
  return null
}
