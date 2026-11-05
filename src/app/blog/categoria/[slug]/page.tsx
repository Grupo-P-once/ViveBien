import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { paginaSeo, migasJsonLd, grafo, jsonLdSeguro } from '@/lib/seo'
import { categoriaDe, CATEGORIAS, limpiarConsulta } from '@/lib/blog/modelo'
import { deCategoria } from '@/lib/blog/articulos'
import Listado from '@/components/blog/Listado'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pagina?: string; q?: string }> }

export function generateStaticParams() {
  return CATEGORIAS.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const cat = categoriaDe(slug)
  if (!cat) return paginaSeo({ ruta: `/blog/categoria/${slug}`, titulo: 'Blog | Vive Bien', descripcion: '', noIndexar: true })
  const sp = await searchParams
  const n = Number(sp.pagina) || 1
  const buscando = limpiarConsulta(sp.q) !== ''
  return paginaSeo({
    ruta: n > 1 && !buscando ? `/blog/categoria/${slug}?pagina=${n}` : `/blog/categoria/${slug}`,
    imagen: '/og/blog.jpg',
    titulo: `${cat.nombre}: guías y consejos${n > 1 ? ` · Página ${n}` : ''} | Blog Vive Bien`,
    descripcion: cat.descripcion,
    // Una categoría sin artículos, o una búsqueda, no aportan nada a un buscador: fuera del índice.
    noIndexar: buscando || deCategoria(cat.slug).length === 0,
  })
}

export default async function Pagina({ params, searchParams }: Props) {
  const { slug } = await params
  const cat = categoriaDe(slug)
  if (!cat) notFound()
  const sp = await searchParams
  const n = Number(sp.pagina) || 1
  return (
    <>
      {/* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON-LD de datos propios; `jsonLdSeguro` escapa < > & y U+2028/9 (prueba en tests/seo.test.ts). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(migasJsonLd([{ nombre: 'Blog', ruta: '/blog' }, { nombre: cat.nombre }]))) }} />
      <Listado articulos={deCategoria(cat.slug)} categoria={cat.slug} numero={n} base={`/blog/categoria/${cat.slug}`} consulta={limpiarConsulta(sp.q)} />
    </>
  )
}
