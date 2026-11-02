import type { ImageLoaderProps } from 'next/image'
import { ANCHOS, fotoOptimizada } from './optimizar'

/** Mismo techo que el `srcset` de `optimizar.ts` (`ANCHOS`): `next/image` ofrece hasta 3840 px y pedirlo a Cloudinary sería más pesado que antes. */
const TECHO = ANCHOS[ANCHOS.length - 1]

/**
 * Cargador de `next/image` para las fotos de propiedades (LINT-1, 2-nov-2026).
 *
 * `optimizar.ts` explica por qué las fotos NO pasan por el optimizador de Vercel: Cloudinary ya transforma por URL (gratis, su CDN, sin `remotePatterns`).
 * Con un cargador propio `next/image` genera el `srcset` pero cada URL sale de `fotoOptimizada` (mismo `f_auto,q_auto,w_<ancho>`): el navegador no
 * habla nunca con `/_next/image`. Una URL que no sea de Cloudinary se devuelve intacta (mismo comportamiento que antes).
 */
export const cargadorCloudinary = ({ src, width }: ImageLoaderProps): string => fotoOptimizada(src, Math.min(width, TECHO))
