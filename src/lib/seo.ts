import { NEGOCIO as DATOS_NEGOCIO } from './config/negocio'
import type { Metadata } from 'next'
import { SITIO, urlDe } from './sitio'

/**
 * Metadata y datos del negocio, en un solo sitio.
 *
 * ─────────────────────────────────────────────────────────────
 * EL FALLO QUE ESTE ARCHIVO EXISTE PARA NO REPETIR
 *
 * `layout.tsx` declaraba `alternates: { canonical: '/' }`. En el App Router la
 * metadata se hereda, así que **todas** las páginas —incluidas las fichas de
 * propiedad— salían a producción diciendo:
 *
 *     <link rel="canonical" href="https://vivebienn.com">
 *
 * Una canónica no es una sugerencia decorativa: significa «esta página es un
 * duplicado de aquella, indexa aquella». El sitio llevaba semanas pidiéndole a
 * Google que no indexara nada salvo la portada. Y Google obedeció: portada
 * indexada, el resto «descubierta, actualmente sin indexar».
 *
 * La intención original era buena —unificar vivebienn.com, www y vercel.app—
 * pero se aplicó al layout en vez de a la portada.
 *
 * De ahí la regla de este archivo: **la canónica se declara por página, y se
 * declara siempre**. `paginaSeo()` la escribe sola a partir de la ruta, para
 * que no dependa de que alguien se acuerde.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * NAP: el mismo nombre, teléfono y dirección en la web, en el JSON-LD y en
 * Google. Desde V-1.1.77 los datos salen de `config/negocio` (una sola fuente);
 * aquí sólo se añaden la URL y el logo del sitio.
 */
export const NEGOCIO = {
  ...DATOS_NEGOCIO,
  url: SITIO,
  logo: urlDe('/logo_transparent.png'),
} as const

/** La imagen que se ve al compartir cuando la página no tiene una propia. */
const IMAGEN_POR_DEFECTO = '/og/inicio.jpg'

type Entrada = {
  /** Ruta absoluta del sitio, con barra inicial. Es la canónica. */
  ruta: string
  titulo: string
  descripcion: string
  imagen?: string
  /** Para páginas útiles a las personas pero que no aportan nada en un buscador. */
  noIndexar?: boolean
}

/**
 * La metadata completa de una página pública.
 *
 * Title, description, canónica, Open Graph y tarjeta de Twitter salen de una
 * sola llamada, y la canónica sale de la ruta. No hay forma de declarar media
 * página: o se describe entera, o no se describe.
 */
export function paginaSeo({ ruta, titulo, descripcion, imagen, noIndexar }: Entrada): Metadata {
  const url = urlDe(ruta)
  const img = imagen || IMAGEN_POR_DEFECTO

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: ruta },
    robots: noIndexar
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title: titulo,
      description: descripcion,
      url,
      siteName: NEGOCIO.nombre,
      locale: 'es_MX',
      type: 'website',
      images: [{ url: img, width: 1200, height: 630, alt: titulo }],
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descripcion,
      images: [img],
    },
  }
}

/**
 * La empresa, en el vocabulario que entienden los buscadores.
 *
 * `RealEstateAgent` es el subtipo más específico de `LocalBusiness` que le
 * corresponde, y usar el más específico es lo que recomienda Google.
 *
 * Sólo lleva datos que existen y son verificables. Sin `geo`, sin horarios,
 * sin `aggregateRating`: inventar cualquiera de los tres es exactamente lo que
 * convierte unos datos estructurados en un problema en vez de en una ayuda.
 */
export function negocioJsonLd() {
  return {
    '@type': 'RealEstateAgent',
    '@id': `${SITIO}/#organizacion`,
    name: NEGOCIO.nombre,
    alternateName: NEGOCIO.nombreCorto,
    url: SITIO,
    logo: NEGOCIO.logo,
    image: NEGOCIO.logo,
    telephone: NEGOCIO.telefono,
    email: NEGOCIO.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${NEGOCIO.calle}, ${NEGOCIO.colonia}`,
      addressLocality: NEGOCIO.ciudad,
      addressRegion: NEGOCIO.estado,
      postalCode: NEGOCIO.cp,
      addressCountry: NEGOCIO.pais,
    },
    // Donde de verdad opera. Declarar «México» entero sería más grande y más falso.
    areaServed: [
      { '@type': 'City', name: 'León' },
      { '@type': 'City', name: 'Silao' },
      { '@type': 'State', name: 'Guanajuato' },
    ],
    // Perfiles que existen. Un `sameAs` a una cuenta inventada no añade
    // autoridad: resta credibilidad al resto del grafo.
    sameAs: [
      NEGOCIO.facebook,
      NEGOCIO.instagram,
      'https://gp-once.com',
    ],
    parentOrganization: {
      '@type': 'Organization',
      name: 'Grupo P-ONCE',
      url: 'https://gp-once.com',
    },
  }
}

/** El sitio como entidad, para que la marca y el dominio queden unidos. */
export function sitioJsonLd() {
  return {
    '@type': 'WebSite',
    '@id': `${SITIO}/#sitio`,
    url: SITIO,
    name: NEGOCIO.nombre,
    inLanguage: 'es-MX',
    publisher: { '@id': `${SITIO}/#organizacion` },
  }
}

/**
 * Las migas de pan de una página, para datos estructurados.
 *
 * `migas([{nombre:'Propiedades', ruta:'/propiedades'}, {nombre:'Casa …'}])`
 * — el último elemento es la página actual y puede ir sin ruta.
 */
export function migasJsonLd(pasos: { nombre: string; ruta?: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { nombre: 'Inicio', ruta: '/' },
      ...pasos,
    ].map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.nombre,
      ...(p.ruta ? { item: urlDe(p.ruta) } : {}),
    })),
  }
}

/**
 * JSON listo para meter dentro de `<script type="application/ld+json">`.
 *
 * `JSON.stringify` a secas NO sirve aquí, y no es un detalle: no escapa `<`.
 * Los datos estructurados de la ficha llevan el título y la descripción que
 * escribió quien publicó, así que una descripción con
 *
 *     </script><script>…</script>
 *
 * cerraba el bloque de datos y ejecutaba lo que viniera detrás, en la página
 * pública, para cualquier visitante. El navegador corta un `<script>` en el
 * primer `</script>` que encuentra, esté donde esté.
 *
 * Escapando `<`, `>` y `&` como secuencias `\u003c`… el contenido sigue siendo
 * exactamente el mismo JSON para quien lo lee —buscadores incluidos— y deja de
 * poder cerrar la etiqueta. U+2028 y U+2029 se escapan también: son saltos de
 * línea válidos en JSON e inválidos en JavaScript.
 */
export function jsonLdSeguro(datos: unknown): string {
  return JSON.stringify(datos)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Envuelve varias entidades en un solo grafo: un `<script>` por página, no cinco. */
export function grafo(...entidades: object[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': entidades.filter(Boolean),
  }
}
