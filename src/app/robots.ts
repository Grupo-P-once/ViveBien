import type { MetadataRoute } from 'next'
import { urlDe } from '@/lib/sitio'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/admin', '/publicador', '/mi-cuenta', '/api'],
      },
    ],
    sitemap: urlDe('/sitemap.xml'),
  }
}
