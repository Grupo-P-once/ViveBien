import { visibles } from '@/lib/blog/articulos'
import { NEGOCIO } from '@/lib/seo'
import { urlDe } from '@/lib/sitio'

export const revalidate = 3600

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** RSS del blog. Las maquetas no existen para el feed (solo `visibles`, que en producción excluye maquetas). */
export function GET() {
  const items = visibles().filter((a) => !a.muestra).slice(0, 20)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${esc(`Blog · ${NEGOCIO.nombre}`)}</title>
<link>${urlDe('/blog')}</link>
<atom:link href="${urlDe('/blog/feed.xml')}" rel="self" type="application/rss+xml"/>
<description>Guías para comprar, vender y rentar casas, terrenos, naves y locales en León y el Bajío.</description>
<language>es-MX</language>
${items.map((a) => `<item><title>${esc(a.titulo)}</title><link>${urlDe(`/blog/${a.slug}`)}</link><guid isPermaLink="true">${urlDe(`/blog/${a.slug}`)}</guid><pubDate>${new Date(a.publicado).toUTCString()}</pubDate><description>${esc(a.resumen)}</description></item>`).join('\n')}
</channel></rss>`
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
}
