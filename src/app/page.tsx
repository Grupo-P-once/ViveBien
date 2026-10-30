import type { Metadata } from 'next'
import { paginaSeo } from '@/lib/seo'
import HomePage from './page-client'
import { paraInicio } from '@/lib/blog/articulos'

/*
 * La portada, envuelta en un componente de servidor.
 *
 * El contenido sigue siendo exactamente el mismo: vive en `page-client.tsx`,
 * intacto. Lo único que se añade es la capa que un componente de cliente NO
 * PUEDE tener — `metadata` y `generateMetadata` sólo existen en el servidor—,
 * y que por eso faltaba en las seis páginas públicas del sitio.
 */

export const metadata: Metadata = paginaSeo({
  ruta: '/',
  imagen: '/og/inicio.jpg',
  titulo: 'Vive Bien Grupo Inmobiliario | Casas, Terrenos y Naves en León',
  descripcion:
    'Casas, terrenos, naves industriales y locales comerciales en León, Guanajuato. Más de 15 años en compra, venta y renta de inmuebles en el Bajío.',
})

export default function Pagina() {
  // El LCP es ahora la portada local del video (`/inicio/portada-*.webp`), que va en el HTML del servidor como `<img fetchPriority=high>`:
  // ya no se precarga una foto remota (antes: `precargarHero`, R-07).
  // La empresa y el sitio ya los emite el layout una sola vez para todo el
  // sitio; repetirlos aquí sería declarar dos veces la misma entidad.
  // Los artículos del blog se eligen AQUÍ, en el servidor: `VERCEL_ENV` no existe en el navegador y de allí las maquetas se colarían a producción.
  return <HomePage articulosBlog={paraInicio()} />
}
