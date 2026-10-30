import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { capacidad, columnasPara, filasPara, necesitaCarrusel, paginaActual, paginasDe } from '../src/lib/catalogo/disposicion'
import { escapar, htmlPastilla, htmlPin, precioCorto, precioLargo } from '../src/lib/catalogo/marcadores'

/**
 * Catálogo de propiedades (22-oct-2026): secciones por tipo con carrusel de 2 filas y «Mostrar todas», tarjetas compactas, galería fluida y mapa.
 * Lo que pidió el propietario: «máximo 2 filas y 3 o 4 columnas, por carrusel; debajo “mostrar más” y que ya no haya carrusel»; fotos «sin delay,
 * deslizando y fluidas»; mapa con todas las propiedades o una en específico; «mapa completo»; pin con la casa del logotipo.
 */
const raiz = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')

describe('catálogo · disposición (2 filas, 3–4 columnas)', () => {
  it('columnas según el ancho del contenedor: 4 · 3 · 2 · 1', () => {
    expect([1240, 1100].map(columnasPara)).toEqual([4, 4])
    expect([1099, 760].map(columnasPara)).toEqual([3, 3])
    expect([759, 520].map(columnasPara)).toEqual([2, 2])
    expect([519, 360, 0].map(columnasPara)).toEqual([1, 1, 1])
  })
  it('caben dos filas completas; más que eso → carrusel', () => {
    expect(capacidad(4)).toBe(8); expect(capacidad(3)).toBe(6); expect(capacidad(1)).toBe(2)
    expect(necesitaCarrusel(8, 4)).toBe(false); expect(necesitaCarrusel(9, 4)).toBe(true)
    expect(necesitaCarrusel(6, 3)).toBe(false); expect(necesitaCarrusel(7, 3)).toBe(true)
  })
  it('una fila si todas caben en una; si no, dos (nunca tres)', () => {
    expect(filasPara(3, 4)).toBe(1); expect(filasPara(4, 4)).toBe(1); expect(filasPara(5, 4)).toBe(2); expect(filasPara(40, 3)).toBe(2)
  })
  it('páginas del carrusel = columnas totales ÷ columnas visibles', () => {
    expect(paginasDe(9, 4)).toBe(2)          // 5 columnas de 2 filas → 2 pantallas de 4
    expect(paginasDe(16, 4)).toBe(2); expect(paginasDe(17, 4)).toBe(3)
    expect(paginasDe(7, 3)).toBe(2); expect(paginasDe(2, 1)).toBe(1); expect(paginasDe(3, 1)).toBe(2)     // móvil: 1 columna visible, 2 filas
  })
  it('página actual acotada y sin dividir entre cero', () => {
    expect(paginaActual(0, 100, 3)).toBe(0); expect(paginaActual(160, 100, 3)).toBe(2); expect(paginaActual(9999, 100, 3)).toBe(2)
    expect(paginaActual(50, 0, 3)).toBe(0); expect(paginaActual(50, 100, 1)).toBe(0)
  })
})

describe('catálogo · marcadores del mapa', () => {
  it('precio corto: se TRUNCA, nunca sube; $9,950,000 → $9.9M', () => {
    expect(precioCorto(9_950_000)).toBe('$9.9M'); expect(precioCorto(6_300_000)).toBe('$6.3M'); expect(precioCorto(2_000_000)).toBe('$2M')
    expect(precioCorto(850_000)).toBe('$850K'); expect(precioCorto(0)).toBe(''); expect(precioCorto(NaN)).toBe('')
  })
  it('precio largo con separadores', () => { expect(precioLargo(6300000)).toBe('$6,300,000') })
  it('el texto de los anuncios se escapa (no se puede inyectar HTML en un marcador)', () => {
    expect(escapar('<img src=x onerror=alert(1)>"\'&')).toBe('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;')
    const h = htmlPastilla(5_000_000, 'normal', '<script>alert(1)</script>')
    expect(h).not.toContain('<script'); expect(h).toContain('&lt;script&gt;')
  })
  it('pastilla normal (blanca) y seleccionada (roja, con el precio corto debajo); pin con la casa del logotipo', () => {
    const n = htmlPastilla(9_950_000, 'normal', 'x'), s = htmlPastilla(9_950_000, 'seleccionada', 'x')
    expect(n).toContain('$9,950,000'); expect(n).not.toContain('mk-sel'); expect(n).not.toContain('<small>')
    expect(s).toContain('mk-sel'); expect(s).toContain('<small>$9.9M</small>')
    expect(htmlPastilla(null, 'normal', 'x')).toContain('Consultar')
    expect(htmlPin(false, 'x')).toContain('#A30D12'); expect(htmlPin(true, 'x')).toContain('#1A1A1A'); expect(htmlPin(false, 'x')).toContain('M3 18L14 6.5L25 18')
  })
})

describe('catálogo · galería fluida (sin retraso)', () => {
  const g = leer('src/components/catalogo/GaleriaFluida.tsx'), css = leer('src/components/catalogo/catalogo.css')
  it('todas las fotos son <img> de una pista con scroll-snap: no se cambia el src de una sola imagen', () => {
    expect(css).toMatch(/\.gf-pista \{[^}]*scroll-snap-type: x mandatory/); expect(css).toMatch(/\.gf-foto \{[^}]*scroll-snap-align: start/)
    expect(g).not.toMatch(/setFotoIdx|fotos\[fotoIdx\]/)
  })
  it('un gesto en la foto no mueve el carrusel de la sección y el dedo desliza (pan-x)', () => {
    expect(css).toMatch(/\.gf-pista \{[^}]*overscroll-behavior-x: contain/); expect(css).toMatch(/\.gf-pista \{[^}]*touch-action: pan-x pan-y/)
  })
  it('precarga las vecinas (al acercarse, al tocar y al avanzar) y las decodifica al llegar', () => {
    expect(g).toContain('IntersectionObserver'); expect(g).toMatch(/rootMargin/); expect(g).toContain('actual + 3'); expect(g).toContain('.decode?.()')
    expect(g).toContain('onTouchStart={calentar}'); expect(g).toContain('onPointerEnter={calentar}')
  })
  it('no baja las 18 fotos de golpe: solo tienen src las cargadas', () => {
    expect(g).toMatch(/const conSrc = i < cargadas/)
  })
  it('se puede arrastrar con el ratón, con teclado y con flechas; respeta movimiento reducido', () => {
    expect(g).toContain('pointerType !== \'mouse\''); expect(g).toContain('ArrowRight'); expect(g).toContain('prefers-reduced-motion')
    expect(g).toContain('aria-roledescription="carrusel"')
  })
  it('la altura está reservada (sin saltos de diseño)', () => { expect(css).toMatch(/\.gf \{[^}]*aspect-ratio: 16 \/ 10/) })
})

describe('catálogo · secciones y página', () => {
  const s = leer('src/components/catalogo/SeccionCarrusel.tsx'), p = leer('src/app/propiedades/page-client.tsx'), css = leer('src/components/catalogo/catalogo.css')
  it('cada tipo: carrusel de 2 filas, «Mostrar todas (N)» que quita el carrusel y «Mostrar menos»', () => {
    expect(s).toContain('necesitaCarrusel(n, columnas) && !expandida'); expect(s).toContain('Mostrar todas ('); expect(s).toContain('Mostrar menos'); expect(s).toContain('aria-expanded={expandida}')
    expect(css).toMatch(/grid-template-rows: repeat\(var\(--filas, 2\), auto\)/)
  })
  it('la página usa las secciones y las tarjetas nuevas, y el mapa nuevo (no el anterior)', () => {
    expect(p).toContain('<SeccionCarrusel'); expect(p).toContain('<TarjetaCompacta'); expect(p).toContain('MapaCatalogo'); expect(p).not.toContain('MapaListado'); expect(p).not.toContain('<PropertyCard')
  })
  it('conserva los seis tipos y el «Ver solo estos»', () => {
    for (const t of ["'nave'", "'casa'", "'departamento'", "'terreno'", "'comercial'", "'oficina'"]) expect(p).toContain(`tipo: ${t}`)
    expect(s).toContain('Ver solo estos')
  })
  it('el precio conserva la tipografía de siempre (Montserrat 900, color de marca)', () => {
    expect(css).toMatch(/\.tc-precio strong \{[^}]*font-weight: 900/); expect(css).toMatch(/\.tc-precio strong \{[^}]*color: var\(--rojo\)/)
  })
})

describe('catálogo · mapa', () => {
  const m = leer('src/components/catalogo/MapaCatalogo.tsx')
  it('enseña todas o una en específico, y «Mapa completo» con Esc y diálogo', () => {
    expect(m).toContain('Ver todas ('); expect(m).toContain('Mapa completo'); expect(m).toContain("role: 'dialog'"); expect(m).toContain("e.key === 'Escape'")
    expect(m).toContain('onSeleccionar(p.id)'); expect(m).toContain('flyTo')
  })
  it('no inventa ubicaciones: sin coordenadas o «aproximada» no se pinta, y se dice cuántas faltan', () => {
    expect(m).toContain("p.precision_ubicacion !== 'aproximada'"); expect(m).toContain('no aparece'); expect(m).not.toMatch(/\|\| LEON|\?\? LEON/)
  })
  it('Leaflet se descarga solo al abrir el mapa y el texto del popup se escapa', () => {
    expect(m).toMatch(/if \(!abierto \|\| mapa\.current\) return/); expect(m).toContain("import('leaflet')"); expect(m).toContain('escapar(nombreDe(p))')
  })
})

import { puntuar, recomendadasPara } from '../src/lib/catalogo/recomendadas'
describe('catálogo · recomendadas de la ficha', () => {
  const base = { id: 'b', tipo: 'casa', operacion: 'venta', precio: 5_000_000, ciudad: 'León', estado_dir: 'Guanajuato' }
  const mk = (id: string, o: Record<string, unknown> = {}) => ({ id, tipo: 'casa', operacion: 'venta', precio: 5_200_000, ciudad: 'León', estado_dir: 'Guanajuato', ...o })
  it('las más parecidas primero: tipo, operación, ciudad y precio cercano', () => {
    const lista = [mk('lejos', { tipo: 'nave', operacion: 'renta', precio: 90_000_000, ciudad: 'Silao' }), mk('igual'), mk('otro-tipo', { tipo: 'terreno' })]
    expect(recomendadasPara(base, lista).map((p) => p.id)).toEqual(['igual', 'otro-tipo', 'lejos'])
    expect(puntuar(base, mk('x'))).toBeGreaterThan(puntuar(base, mk('y', { tipo: 'nave', operacion: 'renta', precio: 1, ciudad: 'Silao' })))
  })
  it('nunca incluye la propiedad actual ni repetidas, respeta el tope y completa con otras', () => {
    const lista = [mk('b'), mk('a'), mk('a'), ...Array.from({ length: 20 }, (_, i) => mk(`n${i}`, { tipo: 'oficina' }))]
    const r = recomendadasPara(base, lista, 10)
    expect(r).toHaveLength(10); expect(r.find((p) => p.id === 'b')).toBeUndefined(); expect(r.filter((p) => p.id === 'a')).toHaveLength(1); expect(r[0].id).toBe('a')
  })
  it('«depto» y «departamento» cuentan como el mismo tipo; sin lista, nada', () => {
    expect(puntuar({ id: 'x', tipo: 'depto' }, { id: 'y', tipo: 'departamento' })).toBeGreaterThanOrEqual(4)
    expect(recomendadasPara(base, [])).toEqual([])
  })
})

describe('catálogo · ficha de la propiedad', () => {
  const f = leer('src/app/propiedades/[id]/page-client.tsx'), css = leer('src/components/catalogo/catalogo.css')
  it('la galería principal es la fluida (todas las fotos en la pista; ya no se cambia el src de una sola imagen) y se abre en grande al tocarla', () => {
    expect(f).toContain('<GaleriaFluida variante="ficha"'); expect(f).toContain('alAbrir={setLightbox}'); expect(f).not.toMatch(/setMainFoto\(i => \(i \+ 1\)/)
  })
  it('el lightbox descarga y decodifica las fotos vecinas al abrirse', () => { expect(f).toContain('for (const d of [1, -1, 2])'); expect(f).toContain('im.decode?.()') })
  it('tarjeta de datos: lo esencial con iconos y el detalle en filas, con folio', () => {
    expect(f).toContain('data-ficha-datos'); expect(f).toContain('className="fd-clave"'); expect(f).toContain('className="fd-lista"'); expect(f).toContain('fd-folio')
    expect(css).toMatch(/\.fd-clave \{[^}]*grid-template-columns/)
  })
  it('al pie salen las recomendadas en carrusel (no la rejilla de 4 de antes)', () => {
    expect(f).toContain('<CarruselRelacionadas'); expect(f).toContain('recomendadasPara(data, visibles, 10)'); expect(f).not.toContain('Propiedades similares'); expect(f).not.toContain('<PropertyCard')
    const c = leer('src/components/catalogo/CarruselRelacionadas.tsx'); expect(c).toContain("'--filas': 1"); expect(c).toContain('aria-roledescription')
  })
})
