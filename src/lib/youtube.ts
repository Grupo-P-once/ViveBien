/**
 * Enlaces de YouTube. Sin dependencias a propósito: lo usa la ficha pública,
 * y traerse el esquema de la propiedad (y con él zod) sólo para reconocer un
 * enlace sería cargar decenas de KB en el teléfono de cada visitante.
 */

/**
 * El id de un video de YouTube, o null.
 *
 * Acepta las formas que la gente pega de verdad: `watch?v=`, `youtu.be/`,
 * `shorts/`, `embed/` y la app móvil (`m.youtube.com`). Cualquier otra URL
 * se rechaza: un «video» que apunta a otro sitio es un enlace sin revisar
 * dentro de la ficha pública.
 */
export function idYoutube(texto: string): string | null {
  let url: URL
  try {
    url = new URL(texto.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  let id: string | null = null

  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0] || null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const m = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
      id = m?.[2] ?? null
    }
  }

  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

/** URL canónica para guardar: una sola forma, sin parámetros de rastreo. */
export function urlYoutube(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}
