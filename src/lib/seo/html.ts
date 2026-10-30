/**
 * Datos de SEO que se pueden leer de una página YA renderizada (el HTML que sirve el sitio). Código puro y sin dependencias: se prueba con HTML de ejemplo.
 * No es un analizador HTML completo: lee lo que importa para buscadores (título, descripción, canónica, robots, encabezados, imágenes, enlaces, JSON-LD).
 */

export type HechosPagina = {
  lang: string | null
  titulo: string | null
  descripcion: string | null
  canonica: string | null
  robotsMeta: string | null
  noindex: boolean
  viewport: boolean
  h1: string[]
  ogTitulo: string | null
  ogImagen: string | null
  twitterImagen: string | null
  jsonld: string[]
  imagenes: { total: number; sinAlt: number }
  enlaces: string[]
  palabras: number
}

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&nbsp;': ' ' }
const decodificar = (s: string) => s.replace(/&(amp|lt|gt|quot|nbsp|#x27|#39);/g, (m) => ENTIDADES[m] ?? m)
const sinEtiquetas = (s: string) => decodificar(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Atributos de una etiqueta: `name="x" content='y'` → { name: 'x', content: 'y' } (nombres en minúsculas). */
export function atributos(etiqueta: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of etiqueta.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = decodificar(m[2] ?? m[3] ?? m[4] ?? '')
  return out
}

export function extraerHechos(html: string): HechosPagina {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => atributos(m[0]))
  const meta = (clave: 'name' | 'property', valor: string) => metas.find((a) => (a[clave] ?? '').toLowerCase() === valor)?.content?.trim() ?? null
  const enlaces_link = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => atributos(m[0]))
  const canonica = enlaces_link.find((a) => (a.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'))?.href?.trim() ?? null
  const robotsMeta = meta('name', 'robots')
  const tituloM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const htmlTag = /<html\b[^>]*>/i.exec(html)
  // Lo que ve la persona: sin scripts ni estilos (un «<h1>» dentro de un script no es un encabezado)
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const body = /<body\b[\s\S]*<\/body>/i.exec(visible)?.[0] ?? visible
  const imgs = [...visible.matchAll(/<img\b[^>]*>/gi)].map((m) => atributos(m[0]))
  const sinAlt = imgs.filter((a) => !('alt' in a)).length
  const jsonld = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim())
  const h1 = [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => sinEtiquetas(m[1])).filter(Boolean)
  const enlaces = [...visible.matchAll(/<a\b[^>]*>/gi)].map((m) => atributos(m[0]).href).filter((h): h is string => !!h && !h.startsWith('#') && !/^(mailto|tel|javascript):/i.test(h))
  const texto = sinEtiquetas(body)
  return {
    lang: htmlTag ? atributos(htmlTag[0]).lang ?? null : null,
    titulo: tituloM ? sinEtiquetas(tituloM[1]) || null : null,
    descripcion: meta('name', 'description'),
    canonica,
    robotsMeta,
    noindex: !!robotsMeta && /(^|[\s,])(noindex|none)([\s,]|$)/i.test(robotsMeta),
    viewport: meta('name', 'viewport') != null,
    h1,
    ogTitulo: meta('property', 'og:title'),
    ogImagen: meta('property', 'og:image'),
    twitterImagen: meta('name', 'twitter:image'),
    jsonld,
    imagenes: { total: imgs.length, sinAlt },
    enlaces,
    palabras: texto ? texto.split(' ').length : 0,
  }
}
