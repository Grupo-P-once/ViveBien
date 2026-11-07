import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * V-1.1.94 · 3c-3 — Las cuatro rutas del Centro público.
 *
 * Lo que vigila este archivo no es que «se vean bien»: es que el Centro no
 * pueda enseñar algo interno ni indexar lo que no debe.
 */

const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8')
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const PORTADA = 'src/app/ayuda/page.tsx'
const CATEGORIA = 'src/app/ayuda/[categoria]/page.tsx'
const ARTICULO = 'src/app/ayuda/[categoria]/[articulo]/page.tsx'
const BUSCAR = 'src/app/ayuda/buscar/page.tsx'
const CONSULTAS = 'src/lib/ayuda/consultas.ts'

describe('las cuatro rutas existen', () => {
  it('portada, categoría, artículo y buscador', () => {
    for (const r of [PORTADA, CATEGORIA, ARTICULO, BUSCAR]) {
      expect(() => leer(r), `falta ${r}`).not.toThrow()
    }
  })

  it('y las tres de API', () => {
    for (const r of ['categorias', 'buscar', 'feedback']) {
      expect(() => leer(`src/app/api/ayuda/${r}/route.ts`)).not.toThrow()
    }
  })
})

describe('lo que se indexa y lo que no', () => {
  it('el Centro SÍ se indexa: es lo contrario del portal', () => {
    const l = leer('src/app/ayuda/layout.tsx')
    expect(l, 'el Centro se marcó noindex').not.toMatch(/index:\s*false/)
  })

  it('la página de RESULTADOS no se indexa', () => {
    // Una URL por cada cosa que alguien teclee sería basura en un buscador, y
    // dejaría rastro público de lo que la gente pregunta.
    expect(sinComentarios(leer(BUSCAR))).toMatch(/noIndexar:\s*true/)
  })

  it('el sitemap lleva /ayuda y los artículos, pero NO /ayuda/buscar', () => {
    const s = sinComentarios(leer('src/app/sitemap.ts'))
    expect(s).toMatch(/\$\{BASE\}\/ayuda`/)
    expect(s).toMatch(/\$\{BASE\}\/ayuda\/\$\{categoria\}\/\$\{articulo\}`/)
    expect(s, 'el buscador entró al sitemap').not.toMatch(/\/ayuda\/buscar/)
    expect(s).toMatch(/\.\.\.ayuda/)
  })
})

describe('nada interno sale al público', () => {
  const consultas = sinComentarios(leer(CONSULTAS))

  it('TODA consulta a `knowledge_articles` filtra ámbito Y estado', () => {
    // Además del RLS. Dos barreras para lo mismo no sobran cuando detrás hay
    // procedimientos internos.
    //
    // Se mide por consulta, no contando filtros sueltos: las categorías no
    // tienen `estado`, así que comparar totales daba un falso desajuste.
    const consultasDeArticulos = consultas
      .split('.from(')
      .filter((t) => t.startsWith("'knowledge_articles'"))
    expect(consultasDeArticulos.length, 'no hay consultas que revisar').toBeGreaterThanOrEqual(5)
    for (const c of consultasDeArticulos) {
      const cuerpo = c.slice(0, 400)   // cada consulta cabe de sobra
      expect(cuerpo, 'una consulta no filtra el ámbito').toMatch(/\.eq\('ambito', 'publica'\)/)
      expect(cuerpo, 'una consulta no filtra el estado').toMatch(/\.eq\('estado', 'PUBLICADO'\)/)
    }
  })

  it('las categorías filtran el ámbito (no tienen estado)', () => {
    const cats = consultas.split(".from('knowledge_categories')")[1] ?? ''
    expect(cats.slice(0, 300)).toMatch(/\.eq\('ambito', 'publica'\)/)
  })

  it('se lee con la clave ANÓNIMA, para que decida el RLS', () => {
    // Con la clave de servicio, un `where` olvidado filtraría un artículo
    // interno. Con la anónima, el RLS lo impide aunque el código falle.
    expect(consultas).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
    expect(consultas, 'el Centro usa la clave de servicio').not.toMatch(/SERVICE_ROLE|SERVICE_KEY/)
  })

  it('una categoría interna devuelve 404, no una página vacía', () => {
    // `categoriasPublicas` sólo trae ámbito público; si no está, notFound().
    const c = sinComentarios(leer(CATEGORIA))
    expect(c).toMatch(/categoriasPublicas\(\)/)
    expect(c).toMatch(/notFound\(\)/)
  })

  it('un slug inválido no llega a la base', () => {
    for (const r of [CATEGORIA, ARTICULO]) {
      expect(sinComentarios(leer(r)), `${r} no valida el slug`).toMatch(/slugValido/)
    }
  })
})

describe('el aviso va antes que el cuerpo', () => {
  it('el artículo lo pinta, y arriba', () => {
    const a = sinComentarios(leer(ARTICULO))
    expect(a).toMatch(/AvisoDelProducto/)
    // Antes de los párrafos: un aviso al final llega tarde.
    expect(a.indexOf('AvisoDelProducto')).toBeLessThan(a.indexOf('parrafos.map'))
  })

  it('las listas marcan lo que no está disponible', () => {
    const p = leer('src/components/ayuda/Piezas.tsx')
    expect(p).toMatch(/EtiquetaDelProducto/)
    expect(p).toMatch(/ETIQUETA_DEL_PRODUCTO/)
  })

  it('«disponible» no pinta ningún aviso', () => {
    // Un aviso en cada artículo los volvería ruido y nadie leería el que importa.
    const p = leer('src/components/ayuda/Piezas.tsx')
    expect(p).toMatch(/if \(!etiqueta \|\| !aviso\) return null/)
  })
})

describe('el cuerpo del artículo NO se pinta como HTML crudo', () => {
  it('se construyen elementos, no se inyecta', () => {
    const a = leer(ARTICULO)
    // El único `dangerouslySetInnerHTML` de la página es el JSON-LD, que pasa
    // por `jsonLdSeguro`. El cuerpo, que lo escribe una persona en el panel,
    // se pinta con `<p>` y `<strong>` de verdad.
    const usos = a.match(/dangerouslySetInnerHTML/g) ?? []
    expect(usos).toHaveLength(1)
    expect(a).toMatch(/jsonLdSeguro\(/)
    expect(a).toMatch(/function Parrafo/)
  })

  it('un enlace del cuerpo sólo puede ser interno', () => {
    // `[texto](/ruta)` sí; `[texto](javascript:…)` y `[texto](//otro-sitio)` se pintan como texto (auditoría 7-nov-2026, H-11: `startsWith('/')` dejaba pasar `//host`).
    expect(leer(ARTICULO)).toMatch(/esRutaInterna\(enlace\[2\]\)/)
    expect(leer(ARTICULO)).not.toMatch(/enlace\[2\]\.startsWith\('\/'\)/)
  })
})

describe('la caída no deja el Centro en blanco', () => {
  const consultas = sinComentarios(leer(CONSULTAS))

  it('hay tiempo límite propio', () => {
    expect(consultas).toMatch(/LIMITE_MS/)
    expect(consultas).toMatch(/Promise\.race/)
  })

  it('y última copia buena', () => {
    expect(consultas).toMatch(/ultimaBuena/)
  })

  it('cuando se sirve la copia, SE DICE', () => {
    // Enseñar datos viejos sin avisar es peor que no enseñarlos.
    expect(consultas).toMatch(/desactualizado: true/)
    for (const r of [PORTADA, CATEGORIA, BUSCAR]) {
      expect(sinComentarios(leer(r)), `${r} se calla que puede estar viejo`).toMatch(/AvisoDesactualizado/)
    }
  })
})

describe('el buscador', () => {
  it('funciona sin JavaScript: es un form de verdad', () => {
    const p = leer('src/components/ayuda/Piezas.tsx')
    expect(p).toMatch(/action="\/ayuda\/buscar" method="get"/)
    expect(p).toMatch(/role="search"/)
  })

  it('lo que se teclea se normaliza y se acota antes de la base', () => {
    const api = sinComentarios(leer('src/app/api/ayuda/buscar/route.ts'))
    expect(api).toMatch(/normalizarConsulta/)
    expect(api).toMatch(/consultaBuscable/)
  })

  it('lo que el motor trataría como sintaxis se escapa', () => {
    /* Antes la búsqueda usaba `ilike`, donde los comodines son `%` y `_`, y
       esto exigía `replace(/[%_]/g, …)`.

       Desde el 1-oct-2026 usa `imatch` (regex), porque hacía falta para
       encontrar con acentos y sin ellos. Ahí los comodines son otros: `.`,
       `*`, `+`, `(`… Escapar `%` ya no pinta nada —en una regex es un
       carácter normal— y NO escapar los de regex rompería la consulta.

       La garantía es la misma de siempre: lo que la persona escribe es
       TEXTO, nunca sintaxis. Lo que cambió es cuál es la sintaxis. */
    const c = sinComentarios(leer(CONSULTAS))
    expect(c).toMatch(/function escaparRegex/)
    expect(c).toMatch(/\[\.\*\+\?\^\$\{\}\(\)\|\[\\\]\\\\\]/)
    // Y el valor va entrecomillado para la gramática de filtros de PostgREST.
    expect(c).toMatch(/function entrecomillar/)
  })

  it('sin resultados se ofrece salida, no una página muerta', () => {
    const b = sinComentarios(leer(BUSCAR))
    expect(b).toMatch(/No encontramos nada/)
    expect(b).toMatch(/explora por categoría/)
  })
})

describe('el feedback no guarda a nadie', () => {
  it('sin uid, sin correo, sin IP', () => {
    const f = sinComentarios(leer('src/app/api/ayuda/feedback/route.ts'))
    expect(f).toMatch(/knowledge_feedback/)
    for (const pii of ['uid', 'email', 'correo', 'ip', 'user_agent']) {
      expect(f.toLowerCase(), `el feedback guarda «${pii}»`).not.toMatch(new RegExp(`${pii}\\s*[:,]`))
    }
  })

  it('que no se pueda guardar no rompe la página', () => {
    expect(sinComentarios(leer('src/app/api/ayuda/feedback/route.ts'))).toMatch(/guardado: false[\s\S]*status: 200/)
  })
})

describe('E-20: la pantalla se declara para que Tailwind funcione', () => {
  it('el layout lleva `data-pantalla`', () => {
    // Sin esto, el reset sin capa de globals.css mataría todas las utilidades
    // de margen y relleno, como pasó en /entrar.
    expect(leer('src/app/ayuda/layout.tsx')).toMatch(/data-pantalla="ayuda"/)
  })

  it('la exención es por suscripción, no una lista de pantallas', () => {
    const css = leer('src/app/globals.css')
    expect(css).toMatch(/\*:not\(\[data-pantalla\] \*\)/)
    // Las 49 pantallas antiguas no lo declaran, así que no se mueve ninguna.
    expect(css, 'la exención volvió a ser sólo para el acceso')
      .not.toMatch(/\*:not\(\[data-pantalla="acceso"\] \*\)/)
  })
})
