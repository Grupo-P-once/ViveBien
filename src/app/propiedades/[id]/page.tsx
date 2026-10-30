import { lugarDe } from '@/lib/ubicacion'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import DetallePropiedad from './page-client'
import { SITIO, urlDe } from '@/lib/sitio'
import { migasJsonLd, grafo, jsonLdSeguro } from '@/lib/seo'
import { tituloDe, descripcionDe } from '@/lib/seo-propiedad'
import { fotoParaCompartir } from '@/lib/medios/optimizar'
import { resolverFicha } from '@/lib/ficha-servidor'
import { nombreDe, rutaDe } from '@/lib/propiedad-publica'

/**
 * La ficha de una propiedad: la página que de verdad tiene que posicionar.
 *
 *  · **Canónica propia.** Heredaba la del layout, que apuntaba a la portada:
 *    cada ficha se declaraba duplicado de la home (V-1.1.63).
 *
 *  · **404 de verdad**, pero sólo cuando la base contestó y dijo que no existe.
 *    Si la base falla se sirve la página: un 404 durante una caída sacaría el
 *    catálogo entero del índice. Ver `src/lib/ficha-servidor.ts`.
 *
 *  · **Los borradores no son públicos.** La lectura va con la clave anónima,
 *    y las políticas de lectura pública sólo dejan ver lo publicado: un
 *    borrador da 404 igual que una propiedad inexistente. Para revisarlo antes
 *    de publicar está el asistente, no la ficha.
 *
 *  · **Nombre público y enlaces de siempre.** La ficha se pide por `slug` o por
 *    id. Si llega por id y la propiedad ya tiene slug, redirige de forma
 *    permanente: los enlaces viejos —en Google, en el sitemap enviado, en
 *    mensajes de WhatsApp ya mandados— siguen llevando al sitio correcto y le
 *    pasan su señal a la dirección nueva.
 */

type Props = { params: Promise<{ id: string }> }

type Fila = {
  id: string
  slug?: string | null
  titulo?: string | null
  descripcion?: string | null
  tipo?: string | null
  operacion?: string | null
  precio?: number | null
  metros?: number | null
  ubicacion?: string | null
  ciudad?: string | null
  estado_dir?: string | null
  fotos?: string[] | null
  estado_pub?: string | null
  folio?: string | null
}

/** El nombre que llega en la URL, tal como lo escribió quien la pidió. */
async function nombreDeLaUrl(params: Props['params']): Promise<string> {
  const { id } = await params
  // Next entrega el segmento todavía codificado si trae caracteres especiales.
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await resolverFicha(await nombreDeLaUrl(params))

  if (r.estado === 'no-existe') {
    return { title: 'Propiedad no encontrada | Vive Bien', robots: { index: false, follow: false } }
  }
  if (r.estado === 'error') {
    // Sin datos no se puede describir, pero tampoco se declara nada que un
    // buscador pueda tomar por definitivo mientras dura el fallo.
    return { title: 'Propiedad | Vive Bien', robots: { index: false, follow: true } }
  }

  const data = r.prop as Fila
  const title = tituloDe(data)
  const description = descripcionDe(data)
  // La portada de la propiedad (su primera foto) en 1200×630 JPEG ligero; sin foto, la tarjeta de VIVE BIEN (nunca el logo suelto sobre transparente).
  const portada = fotoParaCompartir(data.fotos?.[0])
  const image = portada || '/og/inicio.jpg'
  const ruta = rutaDe(data)

  return {
    title,
    description,
    // Su propia URL —la del nombre público si lo tiene—, nunca la portada.
    alternates: { canonical: ruta },
    robots:
      data.estado_pub === 'publicada'
        ? { index: true, follow: true }
        : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: urlDe(ruta),
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: nombreDe(data), type: 'image/jpeg' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function Page({ params }: Props) {
  const nombre = await nombreDeLaUrl(params)
  const r = await resolverFicha(nombre)

  if (r.estado === 'no-existe') notFound()

  if (r.estado === 'error') {
    console.error('[ficha] no se pudo leer la propiedad:', nombre, r.mensaje)
  }

  const data = r.estado === 'encontrada' ? (r.prop as Fila) : null

  // Llegó por el id viejo y ya tiene nombre público: redirección permanente.
  // Se compara con el nombre pedido, no sólo con `por`, para no redirigir una
  // URL a sí misma si algún día slug e id coincidieran.
  if (data?.slug && r.estado === 'encontrada' && r.por === 'id' && data.slug !== nombre) {
    permanentRedirect(rutaDe(data))
  }
  // Llegó por folio: la dirección canónica es otra, así que se lleva allí. Sin
  // esto, cada folio sería una segunda URL con el mismo contenido.
  if (data && r.estado === 'encontrada' && r.por === 'folio') {
    permanentRedirect(rutaDe(data))
  }

  const schemaData = data
    ? {
        '@type': 'RealEstateListing',
        name: nombreDe(data),
        // El folio permanente: el mismo que ve la persona en la ficha.
        ...(data.folio ? { identifier: data.folio } : {}),
        description: data.descripcion || '',
        url: urlDe(rutaDe(data)),
        image: data.fotos?.[0] || '',
        offers: {
          '@type': 'Offer',
          price: data.precio,
          priceCurrency: 'MXN',
          availability: 'https://schema.org/InStock',
          priceValidUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        // La ciudad sale de la propiedad, no escrita a mano: decía siempre
        // 'León', y eso le dice a Google que una nave de Silao está en León.
        address: {
          '@type': 'PostalAddress',
          addressLocality: lugarDe(data).ciudad,
          addressRegion: lugarDe(data).estado,
          addressCountry: 'MX',
          streetAddress: data.ubicacion,
        },
        floorSize: data.metros ? { '@type': 'QuantitativeValue', value: data.metros, unitCode: 'MTK' } : undefined,
        // Una sola Vive Bien en la página: la del layout, por referencia.
        seller: { '@id': `${SITIO}/#organizacion` },
      }
    : null

  const migas = migasJsonLd([
    { nombre: 'Propiedades', ruta: '/propiedades' },
    { nombre: data ? nombreDe(data) : 'Propiedad' },
  ])

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdSeguro(schemaData ? grafo(schemaData, migas) : grafo(migas)),
        }}
      />
      {/* El cliente recibe el id interno ya resuelto: así busca por clave
          primaria y no depende de que la columna `slug` exista. */}
      <DetallePropiedad params={params} idInterno={data?.id} inicial={data as unknown as Record<string, unknown> | null} />
    </>
  )
}
