import type { MetadataRoute } from 'next'
import { NEGOCIO } from '@/lib/seo'

/**
 * El manifiesto de la aplicación web.
 *
 * Existía la referencia y no el archivo: `/manifest.json` devolvía 404 en cada
 * visita. No hunde el SEO, pero es un error en todas las auditorías y lo que
 * permite que el sitio se guarde en la pantalla de inicio de un teléfono —que
 * es desde donde se ve casi todo aquí.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NEGOCIO.nombre,
    short_name: NEGOCIO.nombreCorto,
    description:
      'Casas, terrenos, naves industriales y locales comerciales en León, Guanajuato.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1B365D',
    lang: 'es-MX',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
