import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getImageProps } from 'next/image'
import { describe, expect, it, vi } from 'vitest'
import { cargadorCloudinary } from '../src/lib/medios/cargador-cloudinary'
import { fotoOptimizada } from '../src/lib/medios/optimizar'

/**
 * LINT-1 (2-nov-2026) — pruebas de regresión de la limpieza completa del lint (0 errores, 0 avisos).
 * Parte 1: el cargador de imágenes (fotos de Cloudinary SIN pasar por el optimizador de Vercel) y el render del servidor de los componentes que dejaron de usar efectos.
 * Parte 2: el código de los cambios de comportamiento mínimos (ficha, comparador, menú, carga de tablas) conserva su forma; la comparación visual vive en Obsidian.
 */
// El aviso lee la sesión de Firebase; en el servidor no hay sesión (no se crea la app real).
vi.mock('@/lib/firebase', () => ({ auth: { onAuthStateChanged: () => () => {} } }))

const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1700000000/propiedades/casa.jpg'
const UNSPLASH = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&auto=format&fit=crop'
const src = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('cargador de Cloudinary para next/image', () => {
  it('es exactamente `fotoOptimizada`: la transformación sigue siendo la de Cloudinary por URL', () => {
    for (const w of [16, 384, 640, 1080, 1920]) expect(cargadorCloudinary({ src: CLOUD, width: w })).toBe(fotoOptimizada(CLOUD, w))
    // `next/image` ofrece hasta 3840 px; las fotos nunca se piden por encima del techo que ya tenía el `srcset` (1920), para no pesar más que antes
    for (const w of [2048, 3840]) expect(cargadorCloudinary({ src: CLOUD, width: w })).toContain(',w_1920/')
    expect(cargadorCloudinary({ src: CLOUD, width: 640 })).toContain('/image/upload/f_auto,q_auto,w_640/')
  })
  it('lo que no es de Cloudinary sale intacto (Unsplash, /public, data:)', () => {
    for (const u of [UNSPLASH, '/placeholder.jpg', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', '']) expect(cargadorCloudinary({ src: u, width: 828 })).toBe(u)
  })
  it('next/image arma el srcset con ese cargador y NUNCA apunta a /_next/image', () => {
    const { props } = getImageProps({ loader: cargadorCloudinary, src: CLOUD, alt: '', fill: true, sizes: '(max-width: 640px) 100vw, 380px' })
    expect(props.srcSet).toMatch(/res\.cloudinary\.com\/demo\/image\/upload\/f_auto,q_auto,w_\d+\//)
    expect(props.srcSet).not.toContain('/_next/image')
    expect(props.src).not.toContain('/_next/image')
    const sin = getImageProps({ loader: cargadorCloudinary, src: UNSPLASH, alt: '', fill: true, sizes: '380px' })
    expect(sin.props.srcSet).not.toContain('/_next/image')
  })
  it('la precarga del visor usa exactamente lo que pinta la ventana (mismo cargador y mismo `sizes`)', () => {
    const a = getImageProps({ loader: cargadorCloudinary, src: CLOUD, width: 0, height: 0, sizes: '90vw', alt: '' }).props
    const b = getImageProps({ loader: cargadorCloudinary, src: CLOUD, width: 0, height: 0, sizes: '90vw', alt: '', loading: 'eager', decoding: 'async' }).props
    expect(a.srcSet).toBe(b.srcSet)
    const ficha = src('src/app/propiedades/[id]/page-client.tsx')
    expect(ficha).toMatch(/getImageProps\(\{ loader: cargadorCloudinary, src: u, width: 0, height: 0, sizes: '90vw', alt: '' \}\)/)
    expect(ficha).toMatch(/sizes="90vw"/)
  })
  it('las pantallas migradas no vuelven a usar el optimizador de Vercel (`unoptimized` o cargador propio en cada <NextImage>)', () => {
    const archivos = ['src/components/PropertyCard.tsx', 'src/app/propiedades/page-client.tsx', 'src/app/propiedades/[id]/page-client.tsx', 'src/components/inicio/QueEsViveBien.tsx', 'src/components/inicio/RedesSociales.tsx',
      'src/components/nosotros/SeccionesNosotros.tsx', 'src/app/contacto/page-client.tsx', 'src/app/valuador/page-client.tsx', 'src/components/Header.tsx', 'src/app/dashboard/page.tsx']
    for (const f of archivos) {
      const t = src(f)
      for (const m of t.matchAll(/<NextImage\b[\s\S]*?\/?>/g)) expect(m[0], `${f}: ${m[0].slice(0, 80)}`).toMatch(/unoptimized|loader=\{cargadorCloudinary\}/)
    }
  })
})

describe('render del servidor de los componentes que dejaron de usar efectos (HTML inicial = antes)', () => {
  it('BarraComparar no pinta nada hasta hidratar (como antes: `montado` falso en el servidor)', async () => {
    const { default: Barra } = await import('../src/components/BarraComparar')
    expect(renderToStaticMarkup(createElement(Barra))).toBe('')
  })
  it('AvisoConfiguracion no pinta nada sin la lectura de salud', async () => {
    const { default: Aviso } = await import('../src/components/AvisoConfiguracion')
    expect(renderToStaticMarkup(createElement(Aviso))).toBe('')
  })
})

describe('forma del código en los cambios de comportamiento mínimo', () => {
  it('ficha de propiedad: la sesión se lee del valor vigente (ref) y la carga NO se repite al iniciar sesión', () => {
    const t = src('src/app/propiedades/[id]/page-client.tsx')
    expect(t).toMatch(/const sesionRef = useRef\(isLoggedIn\)/)
    expect(t).toMatch(/useEffect\(\(\) => \{ sesionRef\.current = isLoggedIn \}, \[isLoggedIn\]\)/)
    expect(t).toMatch(/debeOfrecerRegistro\(\{ conSesion: sesionRef\.current, fichasVistas: vistas \}\)/)
    expect(t).toMatch(/\n  \}, \[id\]\)\n/) // la carga sigue dependiendo SOLO de `id`
  })
  it('comparador: tarjeta, barra y página lo leen como almacén externo (sin efectos con setState)', () => {
    for (const f of ['src/components/PropertyCard.tsx', 'src/components/BarraComparar.tsx', 'src/app/comparar/page-client.tsx']) {
      const t = src(f)
      expect(t, f).toMatch(/useSyncExternalStore\(/)
      expect(t, f).toMatch(/alCambiarComparar\(aviso\)/)
      expect(t, f).not.toMatch(/setIds\(|setComparando\(/)
    }
  })
  it('menú del encabezado: se cierra al cambiar de ruta (ajuste durante el render, sin efecto)', () => {
    const t = src('src/components/Header.tsx')
    expect(t).toMatch(/if \(rutaVista !== ruta\) \{ setRutaVista\(ruta\); setMenuOpen\(false\) \}/)
    expect(t).not.toMatch(/useEffect\(\(\) => \{ setMenuOpen\(false\) \}, \[ruta\]\)/)
  })
  it('Registros y Usuarios: la primera carga no escribe «cargando» (ya parte en true); «Actualizar» y los cambios sí', () => {
    for (const f of ['src/components/Registros.tsx', 'src/components/Usuarios.tsx']) {
      const t = src(f)
      expect(t, f).toMatch(/useState\(true\)/)
      expect(t, f).toMatch(/const traer = useCallback\(async \(\) => \{\n    try \{/)
      expect(t, f).toMatch(/const cargar = useCallback\(async \(\) => \{\n    setCargando\(true\)\n    await traer\(\)\n  \}, \[traer\]\)/)
      expect(t, f).toMatch(/await traer\(\)/)
    }
    expect(src('src/components/Usuarios.tsx')).toMatch(/await cargar\(\)/) // tras un cambio se recarga con «cargando»
  })
  it('«Mis propiedades»: `?nueva=1` abre el formulario sin marco; lo manual manda hasta que la URL cambia', () => {
    const t = src('src/components/portal/MisPropiedades.tsx')
    expect(t).toMatch(/const abrirNueva = abrirManual \?\? \(pidioNueva && !conMarco\)/)
    expect(t).toMatch(/if \(pidioVisto !== pidioNueva\) \{ setPidioVisto\(pidioNueva\); setAbrirManual\(null\) \}/)
    expect(t).toMatch(/if \(pidioNueva && conMarco\) abrirNuevaPropiedad\(\)/)
  })
  it('aviso de baja de precio: el estado por sesión/ficha se ajusta al instante y el efecto solo consulta', () => {
    const t = src('src/components/AvisoBajaDePrecio.tsx')
    expect(t).toMatch(/setEstado\(isLoggedIn \? 'cargando' : 'inactivo'\)/)
    expect(t).toMatch(/useEffect\(\(\) => \{\n    if \(!isLoggedIn\) return\n    let vivo = true\n    llamar\(/)
  })
})
