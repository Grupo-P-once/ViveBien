import type { Metadata } from 'next'
import { paginaSeo, migasJsonLd, grafo, jsonLdSeguro } from '@/lib/seo'
import ValuadorPage from './page-client'

export const metadata: Metadata = paginaSeo({
  ruta: '/valuador',
  imagen: '/og/valuador.jpg',
  titulo: 'Valuación de Inmuebles en León, Guanajuato | Vive Bien',
  descripcion: 'Calcula el valor estimado de tu casa, terreno o nave industrial en León, Guanajuato. Valuación orientativa gratuita y asesoría de Vive Bien Grupo Inmobiliario.',
})

export default function Pagina() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(migasJsonLd([{ nombre: 'Valuador' }]))) }}
      />
      <ValuadorPage />
    </>
  )
}
