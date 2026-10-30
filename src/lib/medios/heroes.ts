import { preload } from 'react-dom'
import { ANCHOS_FONDO, anchoUnsplash, srcSetUnsplash } from './optimizar'

/**
 * Las fotos de encabezado de la portada y del listado y su PRECARGA (R-07 / QA-007, D-62).
 *
 * Las dos páginas son componentes de cliente (con `Suspense`/`useSearchParams`), así que el HTML del servidor NO trae la `<img>` del encabezado:
 * el navegador la descubría solo después de descargar y ejecutar el JS (medido con red 4G lenta: LCP 5,6 s en la portada y 11,4 s en el listado).
 * `precargarHero` la anuncia desde el servidor (`<link rel="preload" as="image" imagesrcset … fetchpriority="high">`), con EXACTAMENTE el mismo
 * `src`/`srcset`/`sizes` que usa la `<img>` del cliente —por eso ambos salen de este archivo—; si difirieran, se bajaría dos veces.
 */
export const HERO_PORTADA = 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&auto=format&fit=crop&q=80'
export const HERO_CATALOGO = 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&auto=format&fit=crop&q=80'

/** Calidad y anchos con que se pintan los fondos: igual en el servidor (precarga) y en el cliente (`<img>`). */
export const HERO_SRC = (url: string) => anchoUnsplash(url, 1280, 60)
export const HERO_SRCSET = (url: string) => srcSetUnsplash(url, ANCHOS_FONDO, 60)

/** Llamar desde un componente de SERVIDOR. */
export function precargarHero(url: string): void {
  preload(HERO_SRC(url), { as: 'image', imageSrcSet: HERO_SRCSET(url), imageSizes: '100vw', fetchPriority: 'high' })
}
