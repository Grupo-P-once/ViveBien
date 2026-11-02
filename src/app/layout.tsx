import './fuentes.css' // Montserrat, Open Sans y Playfair Display alojadas en /fuentes (LINT-2): mismas familias, pesos y display=swap que antes de Google
import type { Metadata } from 'next'
import './globals.css'
import WAFloat from '@/components/WAFloat'
import MedicionGa from '@/components/MedicionGa'
import { configuracionGtag, guardiaInicial } from '@/lib/ga'
import { grafo, negocioJsonLd, sitioJsonLd, jsonLdSeguro } from '@/lib/seo'
import { SITIO } from '@/lib/sitio'
import { NEGOCIO } from '@/lib/config/negocio'

/**
 * Quién es esta empresa, en el formato que lee Google.
 *
 * La ficha de cada propiedad ya llevaba sus datos estructurados; faltaban los
 * del negocio. Son los que alimentan el panel lateral al buscar «Vive Bien
 * León»: dirección, teléfono, horario y redes. Sin esto, Google los deduce —o
 * no los enseña.
 */

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: 'Vive Bien – Grupo Inmobiliario | Naves Industriales y Casas en León, Gto',
  description: 'Vive Bien Grupo Inmobiliario: Especialistas en naves industriales, terrenos y casas en León, Guanajuato. Más de 15 años de experiencia y asesoría personalizada.',
  keywords: 'naves industriales León, bodegas León, terrenos León, inmobiliaria León Guanajuato, Vive Bien, Grupo P-ONCE',
  // AQUÍ NO VA LA CANÓNICA. Estuvo aquí, y fue el fallo de SEO más caro del
  // sitio: la metadata del layout se hereda, así que las seis páginas públicas
  // y todas las fichas de propiedad salían diciendo «soy un duplicado de la
  // portada, no me indexes». Google hizo exactamente eso.
  //
  // Cada página declara la suya con `paginaSeo()` (src/lib/seo.ts). El title y
  // la description que quedan aquí son sólo el respaldo para una ruta nueva que
  // se olvide de declararlos: sirven de red, no de norma.
  openGraph: {
    title: 'Vive Bien – Grupo Inmobiliario',
    description: 'Especialistas en naves industriales, terrenos y casas en León, Guanajuato.',
    type: 'website',
    locale: 'es_MX',
    siteName: 'Vive Bien Grupo Inmobiliario',
    url: SITIO,
    images: ['/og/inicio.jpg'],
  },
  // Lo que se ve al compartir por WhatsApp, que es por donde se comparte aquí.
  twitter: {
    card: 'summary_large_image',
    title: 'Vive Bien – Grupo Inmobiliario',
    description: 'Naves industriales, terrenos y casas en León, Guanajuato.',
    images: ['/og/inicio.jpg'],
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
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${NEGOCIO.ga4}`}
        />
        <script
          dangerouslySetInnerHTML={{
            // `guardiaInicial`: si la primera página ya es un área privada (panel, cuenta, portal…), GA nace apagado. El resto lo cubre `MedicionGa` al navegar.
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}${guardiaInicial([NEGOCIO.ga4, NEGOCIO.ga4Adicional])}gtag('js',new Date());${configuracionGtag([NEGOCIO.ga4, NEGOCIO.ga4Adicional])}`,
          }}
        />
        <script
          type="application/ld+json"
          // La empresa y el sitio, emitidos UNA vez para todo el sitio desde
          // `src/lib/seo.ts`. Las páginas ya no repiten la entidad: la
          // referencian por `@id`, así que en cada página hay una sola Vive
          // Bien y no dos descripciones compitiendo.
          dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(negocioJsonLd(), sitioJsonLd())) }}
        />
      </head>
      <body>{children}<WAFloat /><MedicionGa /></body>
    </html>
  )
}
