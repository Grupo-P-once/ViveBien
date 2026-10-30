import type { MetadataRoute } from 'next'
import { urlDe } from '@/lib/sitio'
import { RUTAS_PRIVADAS } from '@/lib/rutas-privadas'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...RUTAS_PRIVADAS],
      },
    ],
    sitemap: urlDe('/sitemap.xml'),
  }
}
