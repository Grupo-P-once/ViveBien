import { redirect } from 'next/navigation'

// «Mi búsqueda» ya no es una entrada aparte: vive dentro de «Mis búsquedas». La ruta se queda para
// los enlaces viejos (correos, favoritos) y manda a la sección que ahora la contiene.
export default function Pagina() {
  redirect('/portal/busquedas#lo-que-busco')
}
