import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vive Bien – Grupo Inmobiliario | Naves Industriales y Casas en León, Gto',
  description: 'Vive Bien Grupo Inmobiliario: Especialistas en naves industriales, terrenos y casas en León, Guanajuato. Más de 15 años de experiencia y asesoría personalizada.',
  keywords: 'naves industriales León, bodegas León, terrenos León, inmobiliaria León Guanajuato, Vive Bien, Grupo P-ONCE',
  openGraph: {
    title: 'Vive Bien – Grupo Inmobiliario',
    description: 'Especialistas en naves industriales, terrenos y casas en León, Guanajuato.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Open+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-7TQQEQ97S2"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-7TQQEQ97S2');`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
