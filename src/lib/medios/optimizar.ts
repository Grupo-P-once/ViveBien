/**
 * Entrega de imágenes al tamaño que la pantalla realmente usa (TASK 20.01).
 *
 * El 30-sep-2026 se midió `/propiedades` en producción: **6,6 MB de página, de
 * los cuales 5,1 MB eran imágenes**. Siete de las nueve eran `<img>` crudas,
 * sin `srcset` y sin `loading`, y se servían al tamaño original — 1966×1108,
 * 1939×1430 — dentro de una tarjeta de **394×230**. La foto más grande pesaba
 * **1476 KB**; la misma, pedida a Cloudinary con `f_auto,q_auto,w_400`, pesa
 * **18 KB**. Un 98,8 % menos, por la misma CDN y sin coste añadido.
 *
 * Y lo peor no era el escritorio: **sin `srcset`, el teléfono bajaba
 * exactamente los mismos 5,1 MB**. Eso es el «las propiedades se cargan
 * demasiado lentas» que reportó el dueño el 22-sep. No era la consulta —el
 * TTFB medido es de 65-70 ms y la base tiene ocho propiedades—, eran los bytes.
 *
 * ## Por qué Cloudinary y no `next/image`
 *
 * Las fotos ya viven en Cloudinary (TASK 01.07), que transforma por URL: basta
 * insertar los parámetros tras `/image/upload/`. Es gratis, es su CDN, y no
 * hace falta declarar `images.remotePatterns` ni pagar las transformaciones de
 * Vercel, que se facturan por imagen optimizada. `next/image` seguiría siendo
 * lo correcto para lo que vive en `/public`.
 *
 * `f_auto` negocia el formato con el navegador (WebP o AVIF si los acepta, JPEG
 * si no) y `q_auto` elige la calidad según el contenido. Ninguno recorta ni
 * cambia el encuadre: la foto se ve igual, sólo pesa lo que debe.
 *
 * ## Lo que esto NO hace
 *
 * No toca URLs que no sean de Cloudinary. Un `data:`, un `/placeholder.jpg` o
 * una foto de Unsplash salen tal cual: es mejor devolver la original intacta
 * que construir una URL que dé 404. Unsplash tiene su propio parámetro `w`,
 * y quien lo necesite lo pide con `anchoUnsplash`.
 */

/** Los anchos que se ofrecen en un `srcset`. Cubren 1x y 2x de cada hueco. */
export const ANCHOS = [400, 600, 800, 1200, 1600, 1920] as const

/** Una URL de entrega de Cloudinary, que es la única que sabemos transformar. */
const CLOUDINARY = /^https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//

/**
 * `true` si la URL admite transformación por parámetros.
 *
 * Se comprueba que sea una URL de entrega de Cloudinary **y** que no traiga ya
 * transformaciones puestas: si alguien guardó una URL con `w_300` dentro, meter
 * otro `w_` delante encadenaría dos transformaciones y el resultado no sería el
 * pedido. En ese caso se devuelve la original.
 */
export function esTransformable(url: string): boolean {
  if (!CLOUDINARY.test(url)) return false
  const cola = url.replace(CLOUDINARY, '')
  // Tras `/upload/` lo normal es `v<timestamp>/carpeta/archivo.jpg`. Si el
  // primer segmento no es una versión ni una carpeta, ya hay transformaciones.
  const primero = cola.split('/')[0] ?? ''
  return !/(^|,)(w|h|c|f|q|e|a|b|bo|dpr)_/.test(primero)
}

/**
 * La misma foto, pedida al ancho que de verdad se va a pintar.
 *
 * @param url    la URL guardada en la base
 * @param ancho  el ancho en píxeles del hueco donde se pinta
 */
export function fotoOptimizada(url: string, ancho: number): string {
  if (!url || !esTransformable(url)) return url
  const w = Math.max(1, Math.round(ancho))
  return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,w_${w}/`)
}

/**
 * La foto de portada lista para COMPARTIR (vista previa de WhatsApp, Facebook, Telegram, X): JPEG de 1200×630 recortado al centro de interés, ligero.
 *
 * POR QUÉ: la vista previa de una propiedad usaba la foto ORIGINAL de Cloudinary (1.5 MB en JPG, 2.5 MB en PNG) declarando 1200×630: WhatsApp y otros descartan
 * las imágenes pesadas y el enlace salía SIN imagen. `f_jpg` (no `f_auto`: un rastreador puede recibir WebP/AVIF que no entiende), `c_fill,g_auto` (recorte inteligente a 1.91:1)
 * y `q_auto:good` la dejan en ~100–200 KB. Si la URL no es de Cloudinary o ya trae transformaciones, se devuelve tal cual.
 */
export function fotoParaCompartir(url: string | null | undefined): string | null {
  if (!url) return null
  if (!esTransformable(url)) return url
  return url.replace('/image/upload/', '/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto:good/')
}

/**
 * El `srcset` completo, para que el navegador elija según pantalla y densidad.
 *
 * Devuelve cadena vacía cuando la URL no es transformable: un `srcset` vacío se
 * ignora y el `src` normal sigue mandando, que es justo lo que queremos.
 */
export function srcSetDe(
  url: string,
  anchos: readonly number[] = ANCHOS,
): string {
  if (!url || !esTransformable(url)) return ''
  return anchos.map((w) => `${fotoOptimizada(url, w)} ${w}w`).join(', ')
}

/**
 * Todo lo que necesita un `<img>` responsivo, en un solo objeto para esparcir.
 *
 * `sizes` describe el hueco **en CSS**, no el archivo: es lo que permite al
 * navegador escoger del `srcset` antes de saber nada del layout. Sin él,
 * asumiría el ancho de la ventana y volvería a bajar la foto más grande.
 *
 * @param anchoBase  el ancho al que se pide el `src` de reserva (navegadores
 *                   sin `srcset`, y lo que se usa para el `onError`)
 */
export function imgResponsiva(
  url: string,
  sizes: string,
  anchoBase = 800,
): { src: string; srcSet?: string; sizes?: string } {
  const src = fotoOptimizada(url, anchoBase)
  const srcSet = srcSetDe(url)
  return srcSet ? { src, srcSet, sizes } : { src }
}

/**
 * Anchos para una foto **decorativa de fondo** (el hero de un encabezado).
 *
 * Se corta en 1600 a propósito. Al medir el «después» en una pantalla retina
 * (dpr 2, ventana de 1280) el navegador elegía `1920w` y el hero pasaba de
 * 342 KB a **476 KB**: más que antes del arreglo. Para una foto que se ve
 * bajo un degradado que llega al 97 % de opacidad, esa nitidez no la percibe
 * nadie y los bytes sí.
 */
export const ANCHOS_FONDO = [640, 960, 1280, 1600] as const

/**
 * El mismo truco para Unsplash, que usa `w` en la cadena de consulta.
 *
 * @param calidad  si se pasa, sustituye la `q` de la URL. Para un fondo bajo
 *                 un degradado, 60 es indistinguible de 80 y pesa la mitad.
 */
export function anchoUnsplash(
  url: string,
  ancho: number,
  calidad?: number,
): string {
  if (!/^https?:\/\/images\.unsplash\.com\//.test(url)) return url
  const u = new URL(url)
  u.searchParams.set('w', String(Math.round(ancho)))
  u.searchParams.set('auto', 'format')
  if (calidad != null) u.searchParams.set('q', String(calidad))
  return u.toString()
}

/** `srcset` para una foto de Unsplash. */
export function srcSetUnsplash(
  url: string,
  anchos: readonly number[] = ANCHOS,
  calidad?: number,
): string {
  if (!/^https?:\/\/images\.unsplash\.com\//.test(url)) return ''
  return anchos
    .map((w) => `${anchoUnsplash(url, w, calidad)} ${w}w`)
    .join(', ')
}
