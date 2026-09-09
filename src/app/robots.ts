import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/admin', '/publicador', '/mi-cuenta', '/api'],
      },
    ],
    sitemap: 'https://vive-bien.vercel.app/sitemap.xml',
  }
}
