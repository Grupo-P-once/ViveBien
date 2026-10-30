import type { Metadata } from 'next'
import { paginaSeo, migasJsonLd, grafo, jsonLdSeguro } from '@/lib/seo'
import { visibles } from '@/lib/blog/articulos'
import { limpiarConsulta } from '@/lib/blog/modelo'
import Listado from '@/components/blog/Listado'

type Props = { searchParams: Promise<{ pagina?: string; q?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams
  const n = Number(sp.pagina) || 1
  // Una búsqueda no es una página de contenido: se deja fuera del índice y su canónica es el listado (una URL por cada cosa que alguien teclee sería basura).
  const buscando = limpiarConsulta(sp.q) !== ''
  return paginaSeo({
    ruta: n > 1 && !buscando ? `/blog?pagina=${n}` : '/blog',
    imagen: '/og/blog.jpg',
    titulo: n > 1 ? `Blog Inmobiliario · Página ${n} | Vive Bien León` : 'Blog Inmobiliario | Guías para comprar, vender y rentar en León',
    descripcion: 'Guías claras sobre comprar, vender y rentar casas, terrenos, naves industriales y locales en León, Guanajuato y el Bajío. Blog de Vive Bien Grupo Inmobiliario.',
    noIndexar: buscando,
  })
}

export default async function Pagina({ searchParams }: Props) {
  const sp = await searchParams
  const n = Number(sp.pagina) || 1
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(migasJsonLd([{ nombre: 'Blog' }]))) }} />
      <Listado articulos={visibles()} numero={n} base="/blog" consulta={limpiarConsulta(sp.q)} />
    </>
  )
}
