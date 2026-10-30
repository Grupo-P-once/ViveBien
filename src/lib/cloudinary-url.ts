/**
 * Pedirle a Cloudinary una versión pequeña de una foto, sin subir nada.
 *
 * Cloudinary transforma al vuelo si se meten parámetros en la URL, justo
 * después de `/upload/`:
 *
 *     …/image/upload/v1789322868/vivebien/nave/sanjuan/foto.jpg
 *     …/image/upload/c_fill,w_48,h_48,dpr_2,f_auto,q_auto/v1789322868/vivebien/nave/sanjuan/foto.jpg
 *
 * Medido con una foto real de la cuenta: la original pesa 495 KB y la miniatura
 * de 48 px, 1,7 KB. Una tabla con quince fotos originales descargaría 7 MB para
 * enseñar quince cuadritos.
 *
 * `dpr_2`: en pantallas de alta densidad un cuadro de 48 px se pinta con 96
 * píxeles reales; sin esto la miniatura se ve borrosa en un teléfono.
 */

type Opciones = {
  /** Lado del cuadro en píxeles CSS. */
  lado?: number
}

const RE_UPLOAD = /\/image\/upload\//

/** Si la URL es de Cloudinary y admite transformaciones en la ruta. */
export function esDeCloudinary(url: string | null | undefined): boolean {
  return typeof url === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(url) && RE_UPLOAD.test(url)
}

/**
 * La URL de una miniatura cuadrada.
 *
 * Si la foto no es de Cloudinary se devuelve tal cual: se verá más pesada, pero
 * se verá. Una miniatura rota por una transformación que no aplica es peor que
 * una imagen grande.
 */
export function miniaturaCloudinary(url: string | null | undefined, { lado = 48 }: Opciones = {}): string | null {
  if (!url) return null
  if (!esDeCloudinary(url)) return url

  const [antes, despues] = url.split('/image/upload/', 2)
  const primerSegmento = despues.split('/')[0]

  // Si ya trae una transformación (p. ej. `c_limit,w_1600`), se encadena la
  // nuestra delante en vez de duplicarla o mezclarla con la suya.
  const pedido = `c_fill,w_${lado},h_${lado},dpr_2,f_auto,q_auto`
  if (primerSegmento === pedido) return url

  return `${antes}/image/upload/${pedido}/${despues}`
}
