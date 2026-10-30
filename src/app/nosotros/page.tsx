import type { Metadata } from 'next'
import { paginaSeo, migasJsonLd, grafo, jsonLdSeguro } from '@/lib/seo'
import NosotrosPage from './page-client'

export const metadata: Metadata = paginaSeo({
  ruta: '/nosotros',
  imagen: '/og/nosotros.jpg',
  titulo: 'Nosotros | Vive Bien Grupo Inmobiliario en León, Gto',
  descripcion: 'Más de 15 años asesorando en compra, venta y renta de inmuebles en León y el Bajío. Conoce cómo trabaja Vive Bien Grupo Inmobiliario y con quién vas a tratar.',
})

export default function Pagina() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(migasJsonLd([{ nombre: 'Nosotros' }]))) }}
      />
      <NosotrosPage />
    </>
  )
}
