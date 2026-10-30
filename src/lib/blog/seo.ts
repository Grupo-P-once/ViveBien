import type { Metadata } from 'next'
import { NEGOCIO, migasJsonLd, paginaSeo } from '@/lib/seo'
import { SITIO, urlDe } from '@/lib/sitio'
import { categoriaDe, type Articulo } from './modelo'

/** Metadata de un artículo: la de siempre (canónica por página) con Open Graph de tipo `article` y sus fechas. Una maqueta nunca se indexa. */
export function metadataArticulo(a: Articulo): Metadata {
  const ruta = `/blog/${a.slug}`
  // Para compartir (WhatsApp, redes): la portada + el logotipo, en 1200×630. Las maquetas conservan su portada. El dato estructurado (JSON-LD) sí lleva la portada real.
  const og = a.muestra ? a.portada.src : `/og/blog-${a.slug}.jpg`
  const base = paginaSeo({ ruta, titulo: `${a.titulo} | Blog Vive Bien`, descripcion: a.resumen, imagen: og, noIndexar: a.muestra })
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article',
      publishedTime: a.publicado,
      modifiedTime: a.actualizado ?? a.publicado,
      authors: [NEGOCIO.nombre],
      section: categoriaDe(a.categoria)?.nombre,
      images: [{ url: og, width: a.muestra ? a.portada.ancho : 1200, height: a.muestra ? a.portada.alto : 630, alt: a.portada.alt }],
    },
  }
}

/** BlogPosting + BreadcrumbList. Autor = la organización (el equipo): ninguna persona inventada. Fechas ISO 8601 con zona. */
export function jsonLdArticulo(a: Articulo) {
  const cat = categoriaDe(a.categoria)
  return [
    {
      '@type': 'BlogPosting',
      '@id': `${urlDe(`/blog/${a.slug}`)}#articulo`,
      mainEntityOfPage: { '@type': 'WebPage', '@id': urlDe(`/blog/${a.slug}`) },
      headline: a.titulo,
      description: a.resumen,
      image: [urlDe(a.portada.src)],
      datePublished: a.publicado,
      dateModified: a.actualizado ?? a.publicado,
      inLanguage: 'es-MX',
      articleSection: cat?.nombre,
      ...(a.referencias?.length ? { citation: a.referencias.map((r) => ({ '@type': 'CreativeWork', name: r.titulo, url: r.url, author: { '@type': 'Organization', name: r.autor } })) } : {}),
      author: { '@type': 'Organization', name: NEGOCIO.nombre, url: SITIO },
      publisher: { '@id': `${SITIO}/#organizacion` },
    },
    migasJsonLd([{ nombre: 'Blog', ruta: '/blog' }, ...(cat ? [{ nombre: cat.nombre, ruta: `/blog/categoria/${cat.slug}` }] : []), { nombre: a.titulo }]),
  ]
}
