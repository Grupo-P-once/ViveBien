/**
 * La dirección pública del sitio, en un solo lugar.
 *
 * Antes vivía escrita a mano en siete sitios, y con tres valores distintos
 * conviviendo: `vive-bien.vercel.app`, `vive-bien-grupo-p-once.vercel.app` y
 * el que tocara. Eso hace que las etiquetas canónicas, el sitemap y las
 * tarjetas de Open Graph apunten a URLs que no coinciden entre sí, y los
 * buscadores lo leen como contenido duplicado.
 *
 * Para cambiar de dominio basta con la variable de entorno.
 */
export const SITIO = (
  process.env.NEXT_PUBLIC_APP_URL || 'https://vivebienn.com'
).replace(/\/+$/, '')

/** Construye una URL absoluta del sitio a partir de una ruta. */
export function urlDe(ruta: string): string {
  return `${SITIO}${ruta.startsWith('/') ? ruta : `/${ruta}`}`
}
