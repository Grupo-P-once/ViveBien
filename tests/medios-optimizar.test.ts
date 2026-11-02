import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ANCHOS,
  anchoUnsplash,
  esTransformable,
  fotoOptimizada,
  imgResponsiva,
  srcSetDe,
  srcSetUnsplash,
} from '@/lib/medios/optimizar'

/**
 * TASK 20.01 — entrega de imágenes al tamaño que se pinta.
 *
 * Las URLs de aquí son las **reales** medidas en producción el 30-sep-2026 en
 * `/propiedades`: la primera es la foto de 1476 KB que se servía a 1966×1108
 * dentro de una tarjeta de 394×230.
 */

const REAL =
  'https://res.cloudinary.com/zwsi9aar/image/upload/v1789326825/vivebien/nave/propiedad-sin-titulo-d52n/mu06zppz-04no5v.jpg'

describe('fotoOptimizada', () => {
  it('inserta la transformación justo tras /image/upload/', () => {
    expect(fotoOptimizada(REAL, 400)).toBe(
      'https://res.cloudinary.com/zwsi9aar/image/upload/f_auto,q_auto,w_400/v1789326825/vivebien/nave/propiedad-sin-titulo-d52n/mu06zppz-04no5v.jpg',
    )
  })

  it('conserva la versión y la carpeta: sin ellas, Cloudinary daría 404', () => {
    const salida = fotoOptimizada(REAL, 800)
    expect(salida).toContain('/v1789326825/')
    expect(salida).toContain('/vivebien/nave/propiedad-sin-titulo-d52n/')
    expect(salida.endsWith('mu06zppz-04no5v.jpg')).toBe(true)
  })

  it('pide f_auto y q_auto: formato y calidad los negocia el navegador', () => {
    expect(fotoOptimizada(REAL, 400)).toContain('f_auto,q_auto,')
  })

  it('redondea el ancho — Cloudinary no acepta decimales en w_', () => {
    expect(fotoOptimizada(REAL, 393.6)).toContain('w_394')
    // El punto sólo puede venir del host y de la extensión, nunca del `w_`.
    expect(fotoOptimizada(REAL, 393.6)).toMatch(/w_394\//)
    expect(fotoOptimizada(REAL, 393.6)).not.toMatch(/w_[\d]*\.[\d]/)
  })

  it('nunca pide un ancho de cero o negativo', () => {
    expect(fotoOptimizada(REAL, 0)).toContain('w_1')
    expect(fotoOptimizada(REAL, -50)).toContain('w_1')
  })

  /* ── Lo que NO debe tocar ───────────────────────────────────────────────
     Devolver la original intacta es preferible a construir una URL que dé
     404: una foto grande se ve, una foto rota no. */

  it('deja intactas las URLs que no son de Cloudinary', () => {
    for (const u of [
      '/placeholder.jpg',
      'https://images.unsplash.com/photo-148.jpg?w=1600',
      'data:image/gif;base64,R0lGOD',
      'https://otro-cdn.com/image/upload/v1/foo.jpg',
      '',
    ]) {
      expect(fotoOptimizada(u, 400)).toBe(u)
    }
  })

  it('no encadena transformaciones sobre una URL que ya las trae', () => {
    const ya =
      'https://res.cloudinary.com/zwsi9aar/image/upload/w_300,c_fill/v1/vivebien/casa/x.jpg'
    expect(esTransformable(ya)).toBe(false)
    expect(fotoOptimizada(ya, 800)).toBe(ya)
  })

  it('reconoce como transformable la URL de entrega normal', () => {
    expect(esTransformable(REAL)).toBe(true)
  })
})

describe('srcSetDe', () => {
  it('ofrece todos los anchos con su descriptor w', () => {
    const s = srcSetDe(REAL)
    for (const w of ANCHOS) expect(s).toContain(`w_${w}/`)
    expect(s.split(', ')).toHaveLength(ANCHOS.length)
    expect(s).toMatch(/ 400w,/)
    expect(s.endsWith(' 1920w')).toBe(true)
  })

  it('el descriptor coincide con el ancho pedido en la URL', () => {
    for (const par of srcSetDe(REAL).split(', ')) {
      const [url, desc] = par.split(' ')
      expect(url).toContain(`w_${desc!.replace('w', '')}/`)
    }
  })

  it('devuelve cadena vacía cuando no es transformable — un srcset vacío se ignora', () => {
    expect(srcSetDe('/placeholder.jpg')).toBe('')
    expect(srcSetDe('')).toBe('')
  })
})

describe('imgResponsiva', () => {
  it('da src, srcSet y sizes para una foto de Cloudinary', () => {
    const p = imgResponsiva(REAL, '(max-width: 768px) 100vw, 400px')
    expect(p.src).toContain('w_800/')
    expect(p.srcSet).toContain('w_400/')
    expect(p.sizes).toBe('(max-width: 768px) 100vw, 400px')
  })

  it('omite srcSet y sizes cuando no hay nada que ofrecer', () => {
    const p = imgResponsiva('/placeholder.jpg', '100vw')
    expect(p.src).toBe('/placeholder.jpg')
    expect(p.srcSet).toBeUndefined()
    // Sin srcSet, un `sizes` suelto no sirve de nada y confunde al depurar.
    expect(p.sizes).toBeUndefined()
  })

  it('respeta el ancho base que se le pide para el src de reserva', () => {
    expect(imgResponsiva(REAL, '100vw', 1200).src).toContain('w_1200/')
  })
})

describe('Unsplash', () => {
  const HERO =
    'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&auto=format&fit=crop&q=80'

  it('reescribe el ancho conservando el recorte y la calidad', () => {
    const u = new URL(anchoUnsplash(HERO, 640))
    expect(u.searchParams.get('w')).toBe('640')
    expect(u.searchParams.get('fit')).toBe('crop')
    expect(u.searchParams.get('q')).toBe('80')
    expect(u.searchParams.get('auto')).toBe('format')
  })

  it('no duplica el parámetro w', () => {
    expect(anchoUnsplash(HERO, 640).match(/[?&]w=/g)).toHaveLength(1)
  })

  it('ofrece un srcset completo', () => {
    const s = srcSetUnsplash(HERO)
    expect(s.split(', ')).toHaveLength(ANCHOS.length)
    expect(s).toContain('w=400')
    expect(s).toContain(' 1920w')
  })

  it('no toca lo que no es de Unsplash', () => {
    expect(anchoUnsplash(REAL, 400)).toBe(REAL)
    expect(srcSetUnsplash(REAL)).toBe('')
  })
})

describe('los componentes públicos usan el helper', () => {
  /* Las pruebas de arriba comprueban el helper en aislamiento, y pasarían
     igual si alguien devolviera `<img src={fotos[i]}>` a las tarjetas. Esto
     vigila el uso real, que es donde estaban los 5,1 MB. */
  const lee = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const sinComentarios = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

  const PANTALLAS = [
    'src/components/PropertyCard.tsx',
    'src/app/propiedades/page-client.tsx',
    'src/app/propiedades/[id]/page-client.tsx',
  ]

  for (const ruta of PANTALLAS) {
    it(`${ruta} no sirve una foto de Cloudinary sin transformar`, () => {
      const src = sinComentarios(lee(ruta))
      // Ninguna foto del catálogo puede llegar cruda al `src`.
      expect(src).not.toMatch(/src=\{fotos\[[^\]]+\]\}/)
      // `src={f}` solo es válido dentro de un <NextImage> que lleve el cargador de Cloudinary (LINT-1: pasa por `fotoOptimizada`).
      for (const m of src.matchAll(/<(\w+)\b[^<]*?src=\{f\}[^<]*?\/>/g)) expect(m[0], `${ruta}: ${m[0].slice(0, 60)}`).toMatch(/<NextImage\b[\s\S]*loader=\{cargadorCloudinary\}/)
      expect(src).not.toMatch(/<img\b[^>]*src=\{f\}/)
      // Y el helper tiene que estar importado de verdad (directo o a través del cargador de Cloudinary, que es `fotoOptimizada`).
      expect(src).toMatch(/from '@\/lib\/medios\/(optimizar|cargador-cloudinary)'/)
    })
  }

  it('las tarjetas del listado cargan en diferido', () => {
    // Seis tarjetas bajando su foto a la vez competían con el JS de hidratar.
    expect(lee('src/components/PropertyCard.tsx')).toContain('loading="lazy"')
  })

  it('el hero del catálogo ofrece un srcset a Unsplash', () => {
    const src = lee('src/app/propiedades/page-client.tsx')
    // Acotado a ANCHOS_FONDO y q=60: en retina el navegador elegía `1920w` y
    // el hero pesaba 476 KB, MÁS que los 342 KB de antes del arreglo.
    expect(src).toContain('/portadas/propiedades.webp') // portada LOCAL del propietario (WebP ~100 KB); el helper de Unsplash sigue en heroes.ts para otras pantallas
    expect(lee('src/lib/medios/heroes.ts')).toContain('srcSetUnsplash(url, ANCHOS_FONDO, 60)')
    expect(src).not.toContain('HERO_CATALOGO')
    expect(lee('src/lib/medios/heroes.ts')).toContain('srcSetUnsplash(url, ANCHOS_FONDO, 60)')
    expect(lee('src/lib/medios/heroes.ts')).toContain('anchoUnsplash(url, 1280, 60)')
    expect(lee('src/lib/medios/heroes.ts')).toContain('anchoUnsplash(url, 1280, 60)')
    // Es el LCP de la pantalla: sin prioridad, competía con todo lo demás.
    expect(src).toContain('fetchPriority="high"')
  })

  it('la precarga NO salta hasta que hay intención de ver fotos', () => {
    /* Medido en navegador: precargando desde el montaje, el listado hacía 13
       peticiones (~740 KB) antes de que nadie tocara una flecha — seis
       tarjetas × dos vecinas. En la pantalla cuyo problema era el peso, eso
       deshacía parte de 20.01. */
    /* Actualizada el 28-oct-2026: el rediseño del 22-oct reemplazó el carrusel de la tarjeta (`usaElCarrusel`) y la bandera `navegandoFotos`
       de la ficha por `GaleriaFluida`, que se usa en ambas. La intención es la misma y es lo que se vigila: sin intención de ver fotos solo se
       baja 1 foto (3 si es la primera pantalla, `prioridad`); las 3 primeras al acercarse (IntersectionObserver) y las 5 primeras al tocar. */
    const galeria = sinComentarios(lee('src/components/catalogo/GaleriaFluida.tsx'))
    expect(galeria).toContain('useState(prioridad ? 3 : 1)')
    expect(galeria).toMatch(/new IntersectionObserver\([\s\S]*rootMargin/)
    expect(galeria).toContain('Math.min(lista.length, 5)')
    // Las dos pantallas que muestran fotos usan ese componente; ninguna vuelve a precargar todo desde el montaje.
    expect(sinComentarios(lee('src/components/catalogo/TarjetaCompacta.tsx'))).toContain('GaleriaFluida')
    expect(sinComentarios(lee('src/app/propiedades/[id]/page-client.tsx'))).toContain('GaleriaFluida')
  })

  it('las galerías precargan la foto vecina (TASK 05.07)', () => {
    // El tirón al cambiar de imagen era una descarga en frío por cada flecha.
    const galeria = sinComentarios(lee('src/components/catalogo/GaleriaFluida.tsx'))
    // Siempre las 2 de adelante de la actual, y cada foto se decodifica al llegar para que pintarla no cueste un cuadro.
    expect(galeria).toContain('Math.min(lista.length, actual + 3)')
    expect(galeria).toContain('decode?.()')
    // El visor grande de la ficha también precarga la vecina.
    expect(lee('src/app/propiedades/[id]/page-client.tsx')).toMatch(/new Image\(\)/)
  })
})

describe('el ahorro que justifica la tarea', () => {
  /* Medido en producción el 30-sep-2026 contra la CDN de Cloudinary:
     original 1476 KB · w_400 18 KB · w_800 57 KB · w_1200 116 KB. */
  it('una tarjeta de 394px pide w_400, no la original', () => {
    const { srcSet } = imgResponsiva(REAL, '(max-width: 768px) 100vw, 400px')
    const primero = srcSet!.split(', ')[0]!
    expect(primero).toContain('w_400/')
    // Y la original ya no aparece sin transformación en ninguna candidata.
    expect(srcSet).not.toMatch(/upload\/v\d/)
  })
})
