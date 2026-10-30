import type { Metadata } from 'next'
import { paginaSeo, migasJsonLd, grafo, jsonLdSeguro } from '@/lib/seo'
import ContactoPage from './page-client'
import { NEGOCIO } from '@/lib/config/negocio'

export const metadata: Metadata = paginaSeo({
  ruta: '/contacto',
  imagen: '/og/contacto.jpg',
  titulo: 'Contacto | Vive Bien Grupo Inmobiliario, León Gto',
  descripcion: `Habla con Vive Bien Grupo Inmobiliario en León, Guanajuato. Teléfono ${NEGOCIO.telefonoVisible}, WhatsApp y oficina en ${NEGOCIO.calleCorta}, ${NEGOCIO.colonia}.`,
})

export default function Pagina() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(migasJsonLd([{ nombre: 'Contacto' }]))) }}
      />
      <ContactoPage />
    </>
  )
}
