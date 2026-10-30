import type { Metadata } from 'next'
import { paginaSeo, migasJsonLd, grafo, jsonLdSeguro } from '@/lib/seo'
import PropiedadesPage from './page-client'
import { preload } from 'react-dom'

export const metadata: Metadata = paginaSeo({
  ruta: '/propiedades',
  imagen: '/og/propiedades.jpg',
  titulo: 'Propiedades en Venta y Renta en León, Guanajuato | Vive Bien',
  descripcion: 'Casas, departamentos, terrenos, naves industriales y locales en venta y renta en León, Guanajuato. Filtra por tipo, precio y zona con Vive Bien.',
})

export default function Pagina() {
  // R-07: el encabezado es el LCP y el HTML del servidor no trae su <img>. Ahora es la portada LOCAL del propietario (WebP): se precarga igual.
  // Dos portadas: la ancha (escritorio) y un recorte vertical propio para el teléfono (a resolución nativa: ampliar la ancha en un hero alto la dejaba borrosa).
  preload('/portadas/propiedades-movil.webp', { as: 'image', fetchPriority: 'high', media: '(max-width: 700px)' })
  preload('/portadas/propiedades.webp', { as: 'image', fetchPriority: 'high', media: '(min-width: 701px)' })
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(migasJsonLd([{ nombre: 'Propiedades' }]))) }}
      />
      <PropiedadesPage />
    </>
  )
}
