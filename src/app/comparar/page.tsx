import type { Metadata } from 'next'
import { paginaSeo } from '@/lib/seo'
import Comparar from './page-client'

/*
 * El comparador sirve a quien ya está mirando propiedades, y su contenido
 * depende por completo de lo que esa persona haya elegido. Para un buscador no
 * hay nada estable que indexar, así que se marca `noindex` — pero `follow`, para
 * que los enlaces a las fichas sí se sigan.
 */

export const metadata: Metadata = paginaSeo({
  ruta: '/comparar',
  imagen: '/og/propiedades.jpg',
  titulo: 'Comparar propiedades | Vive Bien',
  descripcion: 'Compara lado a lado las propiedades que te interesan de Vive Bien Grupo Inmobiliario.',
  noIndexar: true,
})

export default function Pagina() {
  return <Comparar />
}
