import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * La barra lateral del Centro de Ayuda.
 *
 * Lo que se vigila aquí no es el aspecto —eso lo mide el navegador— sino las
 * decisiones que, si se deshacen sin darse cuenta, rompen algo real:
 *
 *  · que el árbol salga de **una** lectura y no de una por categoría;
 *  · que una categoría vacía siga apareciendo en la navegación;
 *  · que `desactualizado` se propague si cualquiera de las dos lecturas falló
 *    (callarlo es lo único que el Centro no puede hacer);
 *  · que la barra no arrastre JavaScript al cliente;
 *  · que esté en las tres pantallas internas, no en una.
 */

const lee = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const consultas = lee('src/lib/ayuda/consultas.ts')
const barra = lee('src/components/ayuda/BarraLateral.tsx')
const layout = lee('src/app/ayuda/layout.tsx')

const PANTALLAS = [
  'src/app/ayuda/[categoria]/page.tsx',
  'src/app/ayuda/[categoria]/[articulo]/page.tsx',
  'src/app/ayuda/buscar/page.tsx',
]

describe('el Centro no es una isla', () => {
  /* Salió en 3c-3 sin cabecera ni pie, y era la única ruta pública así. Se
     podía entrar desde el menú y no había forma de volver a Propiedades, al
     Valuador o a la cuenta — en cuatro rutas indexables a las que la gente
     llega directamente desde Google. */

  it('el layout pinta la cabecera del sitio', () => {
    expect(layout).toContain("import Header from '@/components/Header'")
    expect(layout).toMatch(/<Header\s*\/>/)
  })

  it('y el pie, donde viven privacidad y términos', () => {
    expect(layout).toContain("import Footer from '@/components/Footer'")
    expect(layout).toMatch(/<Footer\s*\/>/)
  })

  it('van en el layout, no copiados en cada página', () => {
    // Cuatro rutas: en el layout no se puede olvidar en la quinta.
    for (const r of [...PANTALLAS, 'src/app/ayuda/page.tsx']) {
      expect(lee(r)).not.toContain("from '@/components/Header'")
    }
  })

  it('el contenido va en un <main>', () => {
    // axe lo señalaba (`landmark-one-main`): el Centro no tenía ninguno.
    expect(layout).toMatch(/<main>\{children\}<\/main>/)
  })

  it('sigue siendo indexable: nada de noindex', () => {
    // Que se encuentre en un buscador es el objetivo del Centro.
    expect(layout).not.toMatch(/noIndexar|index:\s*false/)
  })

  it('la barra lateral arranca por debajo de la cabecera pegajosa', () => {
    // La cabecera es `sticky top:0` con z-index 1000 y mide --alto-cabecera.
    // Con `top-8` a secas, la barra se metía debajo y perdía el primer tema.
    expect(barra).toContain('var(--alto-cabecera, 120px) + 1.5rem')
    expect(barra).not.toMatch(/className="sticky top-8/)
  })
})

describe('el artículo dice cuándo lo que enseña puede estar viejo (P2 de Codex)', () => {
  /* `articulo()` descartaba el `desactualizado` que `conRed` ya calculaba. Si
     Supabase caía y se servía la copia guardada, la categoría y la búsqueda
     avisaban y **el artículo no** — justo la pantalla donde están las
     instrucciones que alguien va a seguir paso a paso.

     Rompía la regla que la propia unidad declara en su cabecera: enseñar lo
     de hace unos minutos es mejor que enseñar nada, SIEMPRE QUE SE DIGA. */
  const pagina = lee('src/app/ayuda/[categoria]/[articulo]/page.tsx')

  it('la consulta devuelve la marca de frescura, no sólo el artículo', () => {
    expect(consultas).toContain('export type ArticuloConFrescura')
    expect(consultas).toContain('return { articulo: datos[0] ?? null, desactualizado }')
    // Y ya no se descarta al desestructurar.
    expect(consultas).not.toMatch(/const \{ datos \} = await conRed<ArticuloPublico>\(`art:/)
  })

  it('la página la recoge y la pinta', () => {
    expect(pagina).toContain('AvisoDesactualizado')
    expect(pagina).toMatch(/\{d\.desactualizado && <AvisoDesactualizado \/>\}/)
  })

  it('basta con que falle UNA de las dos lecturas', () => {
    // La pantalla mezcla categorías y artículo: callarlo por una sería mentir
    // a medias.
    expect(pagina).toContain('desactualizado || catsViejas')
  })

  it('el aviso va ANTES del artículo, no al final', () => {
    const iAviso = pagina.indexOf('{d.desactualizado && <AvisoDesactualizado />}')
    const iArticulo = pagina.indexOf('<article')
    expect(iAviso).toBeGreaterThan(-1)
    expect(iAviso).toBeLessThan(iArticulo)
  })

  it('las otras dos pantallas siguen avisando', () => {
    for (const r of ['src/app/ayuda/[categoria]/page.tsx', 'src/app/ayuda/buscar/page.tsx']) {
      expect(lee(r)).toContain('AvisoDesactualizado')
    }
  })
})

describe('los dos defectos que arrastraba el Centro', () => {
  /* Ninguno lo introdujo la barra lateral: estaban desde 3c-3 y quedaron
     registrados en el plan como tarea propia. Se cierran aquí porque caen
     dentro del Centro de Ayuda. */

  it('el título no duplica el sufijo', () => {
    /* Con `template: '%s | Centro de Ayuda · Vive Bien'` en el layout Y el
       sufijo ya puesto por `paginaSeo`, las rutas internas salían así:
         «Entrar con Google | Centro de Ayuda · Vive Bien | Centro de Ayuda · Vive Bien»
       La portada no lo sufría porque usa el `default`, que no pasa por la
       plantilla. */
    expect(layout).not.toContain('template:')
    // Cadena simple: el tipo de Next exige `template` junto a `default`.
    expect(layout).toMatch(/title: 'Centro de Ayuda \| Vive Bien'/)
  })

  it('cada ruta sigue trayendo su título completo', () => {
    // Sin `template`, el título de la página es el que se ve tal cual.
    for (const [ruta, aguja] of [
      ['src/app/ayuda/page.tsx', "titulo: 'Centro de Ayuda | Vive Bien'"],
      ['src/app/ayuda/buscar/page.tsx', "titulo: 'Buscar en el Centro de Ayuda | Vive Bien'"],
      ['src/app/ayuda/[categoria]/page.tsx', 'Centro de Ayuda · Vive Bien`'],
      ['src/app/ayuda/[categoria]/[articulo]/page.tsx', 'Centro de Ayuda · Vive Bien`'],
    ] as const) {
      expect(lee(ruta)).toContain(aguja)
    }
  })

  it('el pie no salta de H2 a H4', () => {
    /* Las páginas cierran en `h2` y el pie abría en `h4`: un nivel saltado,
       que axe marca como `heading-order`. Cambio sólo semántico — los cuatro
       llevan `fontSize` en línea, así que no se mueve un píxel. */
    const pie = lee('src/components/Footer.tsx')
    expect(pie).not.toMatch(/<h4[\s>]/)
    expect(pie).not.toContain('</h4>')
    expect((pie.match(/<h3[\s>]/g) ?? []).length).toBe(4)
  })

  it('el pie conserva su aspecto: los tamaños siguen en línea', () => {
    // Si alguien quitara el `fontSize`, el cambio h4→h3 SÍ se vería.
    const pie = lee('src/components/Footer.tsx')
    for (const m of pie.match(/<h3 style=\{\{[^}]+\}\}/g) ?? []) {
      expect(m).toContain('fontSize:')
      expect(m).toContain('fontWeight:')
    }
  })
})

describe('arbolPublico', () => {
  it('existe y devuelve categorías con sus artículos', () => {
    expect(consultas).toContain('export async function arbolPublico')
    expect(consultas).toContain('export type RamaDelArbol')
    expect(consultas).toMatch(/articulos:\s*\{/)
  })

  it('lee los artículos de una sola vez, no una consulta por categoría', () => {
    // Nueve categorías serían diez viajes a Supabase por pintado, y diez
    // copias en el amortiguador que pueden quedar desparejas entre sí.
    const cuerpo = consultas.slice(consultas.indexOf('export async function arbolPublico'))
    const fin = cuerpo.indexOf('\n}')
    const fn = cuerpo.slice(0, fin)
    expect(fn.match(/\.from\('knowledge_articles'\)/g) ?? []).toHaveLength(1)
    expect(fn).not.toMatch(/for\s*\(.*of.*cats\.datos\)[\s\S]*await/)
  })

  it('sólo trae lo público y publicado — dos barreras, como el resto', () => {
    const fn = consultas.slice(consultas.indexOf('arbol:articulos'))
    expect(fn).toContain("eq('ambito', 'publica')")
    expect(fn).toContain("eq('estado', 'PUBLICADO')")
  })

  it('conserva las categorías sin artículos', () => {
    // La página de categoría ya tiene su estado vacío; esconderla de la barra
    // haría desaparecer de la navegación algo que responde 200.
    expect(consultas).toContain("porCategoria.get(c.slug) ?? []")
    expect(consultas).not.toMatch(/\.filter\(\(?c\)? => c\.articulos\.length/)
  })

  it('propaga `desactualizado` si falla cualquiera de las dos lecturas', () => {
    expect(consultas).toContain('cats.desactualizado || arts.desactualizado')
  })

  it('respeta el mismo orden que el resto del Centro', () => {
    const fn = consultas.slice(consultas.indexOf('arbol:articulos'))
    expect(fn).toContain("order('prioridad', { ascending: true })")
  })
})

describe('el componente', () => {
  it('no es de cliente: no arrastra JS a una pantalla pública', () => {
    expect(barra).not.toContain("'use client'")
    expect(barra).not.toMatch(/\buseState\b|\buseEffect\b/)
  })

  it('se pliega con <details>, que funciona sin JavaScript', () => {
    expect(barra).toContain('<details')
    expect(barra).toContain('<summary')
  })

  it('marca dónde estás con aria-current, no sólo con color', () => {
    expect(barra).toContain("aria-current={leyendo ? 'page' : undefined}")
    expect(barra).toMatch(/aria-current=\{activa && !articuloActivo \? 'page' : undefined\}/)
  })

  it('la navegación va en un <nav> con nombre', () => {
    expect(barra).toMatch(/<nav[\s\S]{0,120}aria-label="Todo el Centro de Ayuda"/)
  })

  it('oculta la barra de escritorio en móvil y la plegada en escritorio', () => {
    // Si las dos se pintaran a la vez habría dos navegaciones duplicadas, y
    // un lector de pantalla las leería las dos.
    expect(barra).toContain('hidden lg:block')
    expect(barra).toContain('lg:hidden')
  })

  it('no se pinta si no hay nada que enseñar', () => {
    expect(barra).toContain('if (arbol.length === 0) return null')
  })

  it('avisa de los artículos de algo que aún no existe', () => {
    // Enterarse al abrirlo es enterarse tarde.
    expect(barra).toContain('EtiquetaDelProducto')
  })

  it('usa las rutas del modelo y no las arma a mano', () => {
    expect(barra).toContain('rutaDeCategoria')
    expect(barra).toContain('rutaDelArticulo')
    expect(barra).not.toMatch(/href=\{`\/ayuda\//)
  })
})

describe('está en las tres pantallas internas', () => {
  for (const ruta of PANTALLAS) {
    it(`${ruta} la pinta`, () => {
      const src = lee(ruta)
      expect(src).toContain('BarraLateralAyuda')
      expect(src).toContain('arbolPublico')
    })

    it(`${ruta} la pide en paralelo, sin retrasar el contenido`, () => {
      expect(lee(ruta)).toContain('await Promise.all([')
    })
  }

  it('la categoría y el artículo le dicen dónde está la persona', () => {
    expect(lee('src/app/ayuda/[categoria]/page.tsx')).toContain('categoriaActiva={c.slug}')
    const art = lee('src/app/ayuda/[categoria]/[articulo]/page.tsx')
    expect(art).toContain('categoriaActiva={d.categoria.slug}')
    expect(art).toContain('articuloActivo={d.articulo.slug}')
  })

  it('el artículo conserva su medida de lectura', () => {
    /* Antes esto fijaba `lg:grid-cols-[250px_minmax(0,760px)]`, una utilidad
       de Tailwind. Ya no: el Centro salió a producción con el contenido
       pegado al borde porque esas utilidades mueren bajo el reset sin capa
       (E-20). La medida vive ahora en CSS plano, fuera de `@layer`, y por eso
       sobrevive. */
    const art = lee('src/app/ayuda/[categoria]/[articulo]/page.tsx')
    expect(art).toContain('ayuda-contenedor--articulo')
    expect(art).toContain('ayuda-prosa')
    const css = lee('src/app/globals.css')
    expect(css).toMatch(/\.ayuda-prosa \{\s*max-width: 72ch/)
  })

  it('el contenedor no depende de utilidades de margen ni relleno', () => {
    /* LA REGRESIÓN QUE ESTO IMPIDE: en producción, `px-6` y `mx-auto` daban 0
       mientras `max-w-[1180px]` sí se aplicaba — sólo mueren margen y
       relleno, la firma del reset sin capa. Si alguien devuelve el
       contenedor a utilidades, el Centro vuelve a salir pegado al borde. */
    for (const r of [
      'src/app/ayuda/page.tsx',
      'src/app/ayuda/buscar/page.tsx',
      'src/app/ayuda/[categoria]/page.tsx',
      'src/app/ayuda/[categoria]/[articulo]/page.tsx',
    ]) {
      const src = lee(r)
      expect(src).toContain('ayuda-contenedor')
      expect(src).not.toMatch(/className="mx-auto[^"]*px-\d/)
    }
  })

  it('el ancho se calcula con `min()`, no con padding que el reset pueda borrar', () => {
    const css = lee('src/app/globals.css')
    expect(css).toMatch(/width: min\(100% - 5rem, 1240px\)/)
    expect(css).toMatch(/margin-inline: auto/)
    // Y coincide con el resto del sitio público (1240 px).
    expect(css).toContain('1240px')
  })

  it('la portada /ayuda NO la lleva: ya es el índice completo', () => {
    // Duplicar ahí las nueve categorías que la portada pinta en tarjetas
    // sería decir dos veces lo mismo en la misma pantalla.
    expect(lee('src/app/ayuda/page.tsx')).not.toContain('BarraLateralAyuda')
  })
})
