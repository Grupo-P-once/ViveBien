'use client'
import Link from 'next/link'
import Image from 'next/image'

/**
 * El mosaico de categorías de la lámina de esencia de marca.
 *
 * Cinco bloques a todo lo ancho: foto oscurecida, icono de trazo fino,
 * etiqueta en versales muy espaciadas y una bajada corta. Es el elemento más
 * reconocible de la lámina y el sitio no lo tenía.
 *
 * Los iconos van en SVG de trazo, no en Font Awesome: los de la lámina son
 * claramente de contorno fino, y los de Font Awesome son macizos. Un icono
 * relleno al lado de una tipografía tan ligera se ve como de otra marca.
 *
 * Las fotos son de stock libre de derechos (Unsplash), descargadas a
 * `public/categorias/`. **No son propiedades del catálogo**: enseñar una nave
 * concreta —con su letrero de «EN RENTA» y todo— como si fuera la categoría
 * entera confunde el ejemplo con la oferta, y esa nave puede venderse mañana.
 *
 * Se sirven desde nuestro dominio y no enlazadas: si Unsplash cambia una URL,
 * la portada no se queda con huecos.
 *
 * Cada una se eligió mirándola, no por el nombre del archivo. La primera
 * candidata para «locales» era un supermercado de París con el rótulo de la
 * calle en francés — correcta en el buscador y absurda en un portal de León.
 */

const TRAZO = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const IconoCasa = () => (
  <svg viewBox="0 0 32 32" width="34" height="34" {...TRAZO}>
    <path d="M4 14 16 5l12 9" />
    <path d="M7 12.5V26h18V12.5" />
    <path d="M13 26v-7h6v7" />
  </svg>
)

const IconoDepartamento = () => (
  <svg viewBox="0 0 32 32" width="34" height="34" {...TRAZO}>
    <path d="M7 27V7h11v20" />
    <path d="M18 27V13h7v14" />
    <path d="M10 11h2M14 11h1M10 15h2M14 15h1M10 19h2M14 19h1M21 17h1M21 21h1" />
  </svg>
)

const IconoNave = () => (
  <svg viewBox="0 0 32 32" width="34" height="34" {...TRAZO}>
    <path d="M4 27V14l7-4v4l7-4v4l7-4v17" />
    <path d="M4 27h24" />
    <path d="M12 27v-6h5v6" />
  </svg>
)

const IconoLocal = () => (
  <svg viewBox="0 0 32 32" width="34" height="34" {...TRAZO}>
    <path d="M5 12h22l-1.5-5h-19L5 12Z" />
    <path d="M7 12v14h18V12" />
    <path d="M12 26v-8h5v8" />
    <path d="M5 12a3.2 3.2 0 0 0 5.5 0 3.2 3.2 0 0 0 5.5 0 3.2 3.2 0 0 0 5.5 0 3.2 3.2 0 0 0 5.5 0" />
  </svg>
)

const IconoTerreno = () => (
  <svg viewBox="0 0 32 32" width="34" height="34" {...TRAZO}>
    <path d="M16 28s8-7.6 8-13.5A8 8 0 0 0 8 14.5C8 20.4 16 28 16 28Z" />
    <circle cx="16" cy="14" r="3" />
  </svg>
)

const IconoOficina = () => (
  <svg viewBox="0 0 32 32" width="34" height="34" {...TRAZO}>
    <path d="M6 27V6h14v21" />
    <path d="M20 12h6v15" />
    <path d="M10 10h2M14 10h2M10 14h2M14 14h2M10 18h2M14 18h2M23 16h1M23 20h1" />
    <path d="M5 27h22" />
  </svg>
)

type Categoria = {
  clave: string
  titulo: string
  bajada: string
  href: string
  foto?: string
  Icono: () => React.ReactElement
}

const CATEGORIAS: Categoria[] = [
  {
    clave: 'casa', titulo: 'Casas', bajada: 'Hogares\npara tu historia',
    href: '/propiedades?tipo=casa', Icono: IconoCasa,
    foto: '/categorias/casa.jpg',
  },
  {
    clave: 'departamento', titulo: 'Departamentos', bajada: 'Comodidad\ny ubicación',
    href: '/propiedades?tipo=departamento', Icono: IconoDepartamento,
    foto: '/categorias/departamento.jpg',
  },
  {
    clave: 'nave', titulo: 'Naves industriales', bajada: 'Espacios para hacer\ncrecer tu negocio',
    href: '/propiedades?tipo=nave', Icono: IconoNave,
    foto: '/categorias/nave.jpg',
  },
  {
    clave: 'comercial', titulo: 'Locales comerciales', bajada: 'Oportunidades\nen el lugar correcto',
    href: '/propiedades?tipo=comercial', Icono: IconoLocal,
    foto: '/categorias/comercial.jpg',
  },
  {
    clave: 'oficina', titulo: 'Oficinas', bajada: 'Espacios para\ntrabajar y crecer',
    href: '/propiedades?tipo=oficina', Icono: IconoOficina,
    // Imagen conceptual (recorte de la lámina de marca), NO una oficina del catálogo: ver el comentario de arriba sobre las fotos de categoría.
    foto: '/categorias/oficina.webp',
  },
  {
    clave: 'terreno', titulo: 'Terrenos', bajada: 'Invierte hoy\nen el futuro',
    href: '/propiedades?tipo=terreno', Icono: IconoTerreno,
    foto: '/categorias/terreno.jpg',
  },
]

export default function MosaicoCategorias() {
  return (
    <section aria-label="Categorías de inmuebles" className="mosaico-grid" data-mosaico>
      {CATEGORIAS.map(({ clave, titulo, bajada, href, foto, Icono }) => (
        <Link key={clave} href={href} className="mosaico-celda" style={{
          position: 'relative',
          minHeight: 260,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '2.5rem 1.25rem',
          color: '#fff',
          textDecoration: 'none',
          overflow: 'hidden',
          // El borde va en globals.css: en línea le ganaría a la media query
          // que lo pasa de vertical a horizontal al apilarse.
        }}>
          {foto && (
            /* `next/image` y no `<img>`: estas cinco fotos pesaban 1.9 MB
               juntas —una sola, 707 KB— y se ven a 252 px de ancho. Next las
               sirve en AVIF o WebP al tamaño que toca; en un teléfono con
               datos eso es la diferencia entre esperar y no esperar.
               `sizes` le dice cuánto ocupa de verdad: sin eso pediría la
               versión de pantalla completa. */
            <Image src={foto} alt="" aria-hidden fill sizes="(max-width: 700px) 50vw, 20vw"
              style={{ objectFit: 'cover', zIndex: 0 }} />
          )}

          {/* El velo. Sobre foto oscurece; sin foto da profundidad al negro
              plano, para que las cinco celdas se lean como una sola pieza. */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, zIndex: 1,
            background: foto
              ? 'linear-gradient(180deg, rgba(11,11,12,.42) 0%, rgba(11,11,12,.72) 55%, rgba(11,11,12,.88) 100%)'
              : 'linear-gradient(180deg, #17181C 0%, var(--negro) 100%)',
          }} />

          <div style={{ position: 'relative', zIndex: 2, display: 'grid', justifyItems: 'center', gap: '.9rem' }}>
            <span style={{ opacity: .92 }}><Icono /></span>

            <h3 className="titular" style={{ fontSize: '1.05rem', letterSpacing: '.04em', margin: 0 }}>
              {titulo}
            </h3>

            <p className="etiqueta" style={{
              color: 'rgba(255,255,255,.66)', fontSize: '.66rem',
              lineHeight: 1.75, whiteSpace: 'pre-line', margin: 0,
            }}>
              {bajada}
            </p>
          </div>
        </Link>
      ))}
    </section>
  )
}
