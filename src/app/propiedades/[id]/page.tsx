import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import DetallePropiedad from './page-client'

// Server-side Supabase client para metadata
const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const { data } = await supabaseServer
      .from('propiedades')
      .select('titulo,descripcion,tipo,operacion,precio,ubicacion,fotos')
      .eq('id', id)
      .single()

    if (!data) return { title: 'Propiedad no encontrada – Vive Bien' }

    const precio = data.precio
      ? `$${Number(data.precio).toLocaleString('es-MX')} MXN`
      : 'Consultar precio'
    const opStr = data.operacion === 'venta' ? 'en venta' : 'en renta'
    const title = `${data.titulo} – ${precio} | Vive Bien León`
    const description = data.descripcion
      || `${data.titulo} ${opStr} en ${data.ubicacion}. ${precio}. Vive Bien Inmobiliaria – León, Guanajuato.`
    const image = data.fotos?.[0] || '/logo_transparent.png'

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        images: [{ url: image, width: 1200, height: 630, alt: data.titulo }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image],
      },
    }
  } catch {
    return { title: 'Propiedad – Vive Bien León' }
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params

  // Fetch para Schema.org JSON-LD (SSR)
  let schemaData: Record<string, unknown> | null = null
  try {
    const { data } = await supabaseServer
      .from('propiedades')
      .select('titulo,descripcion,precio,ubicacion,fotos,tipo,operacion,metros')
      .eq('id', id)
      .single()

    if (data) {
      schemaData = {
        '@context': 'https://schema.org',
        '@type': 'RealEstateListing',
        name: data.titulo,
        description: data.descripcion || '',
        url: `https://vive-bien.vercel.app/propiedades/${id}`,
        image: data.fotos?.[0] || '',
        offers: {
          '@type': 'Offer',
          price: data.precio,
          priceCurrency: 'MXN',
          availability: 'https://schema.org/InStock',
          priceValidUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'León',
          addressRegion: 'Guanajuato',
          addressCountry: 'MX',
          streetAddress: data.ubicacion,
        },
        floorSize: data.metros ? { '@type': 'QuantitativeValue', value: data.metros, unitCode: 'MTK' } : undefined,
        seller: {
          '@type': 'RealEstateAgent',
          name: 'Vive Bien Inmobiliaria',
          url: 'https://vive-bien.vercel.app',
          telephone: `+${process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'}`,
        },
      }
    }
  } catch { /* no bloquea el render */ }

  return (
    <>
      {schemaData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
        />
      )}
      <DetallePropiedad params={params} />
    </>
  )
}
