import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ETIQUETA_DEL_PRODUCTO, TRANSICIONES, consultaBuscable, esVisiblePublicamente,
  normalizarConsulta, puedePublicarse, requiereAprobacionHumana, rutaDeBusqueda,
  rutaDeCategoria, rutaDelArticulo, slugDe, slugValido, transicionValida,
  type Articulo, type Estado,
} from '../src/lib/ayuda/modelo'
import { puede } from '../src/lib/acceso/permisos'

/**
 * V-1.1.94 · 3c-3 — El Centro de Ayuda no puede mentir.
 *
 * ─────────────────────────────────────────────────────────────
 * LAS DOS COSAS QUE ESTE ARCHIVO IMPIDE
 *
 * 1. Que una función que NO EXISTE parezca disponible. Trece de los artículos
 *    del inventario describen fases 4 a 12, y tres más describen cosas que
 *    funcionan a medias —las alertas se ven en el portal pero no mandan
 *    correo—. Publicar eso sin avisar sería prometer lo que no hay.
 *
 * 2. Que salga al público algo que no es público. Hay cuatro ámbitos en la
 *    misma tabla, y tres son internos: publicador, administrativa y técnica.
 *    Un fallo aquí no descuadra un diseño: filtra procedimientos internos.
 * ─────────────────────────────────────────────────────────────
 */

const ESTADOS: Estado[] = ['BORRADOR', 'EN_REVISION', 'APROBADO', 'PUBLICADO', 'DESACTUALIZADO', 'ARCHIVADO']

const articulo = (p: Partial<Articulo> = {}): Articulo => ({
  slug: 'como-guardar-una-propiedad',
  titulo: '¿Cómo guardar una propiedad?',
  cuerpo: 'Pulsa el corazón de la ficha y se añade a tus guardadas.',
  ambito: 'publica',
  estado: 'APROBADO',
  estadoDelProducto: 'disponible',
  prioridad: 1,
  ...p,
})

/* ─── El flujo editorial ─────────────────────────────────────────────── */

describe('el flujo editorial es el del documento y no otro', () => {
  it('los seis estados existen y ninguno sobra', () => {
    expect(Object.keys(TRANSICIONES).sort()).toEqual([...ESTADOS].sort())
  })

  it('el camino normal se puede recorrer entero', () => {
    expect(transicionValida('BORRADOR', 'EN_REVISION')).toBe(true)
    expect(transicionValida('EN_REVISION', 'APROBADO')).toBe(true)
    expect(transicionValida('APROBADO', 'PUBLICADO')).toBe(true)
    expect(transicionValida('PUBLICADO', 'DESACTUALIZADO')).toBe(true)
    expect(transicionValida('DESACTUALIZADO', 'EN_REVISION')).toBe(true)
  })

  it('NO se puede saltar de borrador a publicado', () => {
    // El atajo que se salta la revisión humana.
    expect(transicionValida('BORRADOR', 'PUBLICADO')).toBe(false)
    expect(transicionValida('BORRADOR', 'APROBADO')).toBe(false)
    expect(transicionValida('EN_REVISION', 'PUBLICADO')).toBe(false)
    expect(transicionValida('DESACTUALIZADO', 'PUBLICADO')).toBe(false)
    expect(transicionValida('ARCHIVADO', 'PUBLICADO')).toBe(false)
  })

  it('a PUBLICADO sólo se llega desde APROBADO', () => {
    const desde = ESTADOS.filter((e) => transicionValida(e, 'PUBLICADO'))
    expect(desde).toEqual(['APROBADO'])
  })

  it('publicar SIEMPRE requiere aprobación humana', () => {
    expect(requiereAprobacionHumana('PUBLICADO')).toBe(true)
    for (const e of ESTADOS.filter((x) => x !== 'PUBLICADO')) {
      expect(requiereAprobacionHumana(e)).toBe(false)
    }
  })

  it('un artículo archivado se puede recuperar como borrador', () => {
    expect(transicionValida('ARCHIVADO', 'BORRADOR')).toBe(true)
  })

  it('nadie se queda encerrado sin salida', () => {
    for (const e of ESTADOS) {
      expect(TRANSICIONES[e].length, `«${e}» no lleva a ninguna parte`).toBeGreaterThan(0)
    }
  })
})

/* ─── Prometer lo que no existe ──────────────────────────────────────── */

describe('un artículo NO puede hacer parecer disponible lo que no lo está', () => {
  it('lo disponible se publica sin más', () => {
    expect(puedePublicarse(articulo())).toEqual({ ok: true })
  })

  it('futuro, parcial y no disponible EXIGEN un aviso', () => {
    for (const ep of ['futuro', 'parcial', 'no_disponible'] as const) {
      const r = puedePublicarse(articulo({ estadoDelProducto: ep }))
      expect(r.ok, `«${ep}» se publicó sin avisar`).toBe(false)
      if (!r.ok) expect(r.motivo).toMatch(/parecer disponible/)
    }
  })

  it('con el aviso puesto, sí se publica', () => {
    // Las alertas son el caso real: se ven en el portal, pero no mandan correo.
    expect(puedePublicarse(articulo({
      titulo: 'Cómo funcionan las alertas',
      estadoDelProducto: 'parcial',
      aviso: 'Las alertas se ven en tu portal. Todavía no te llega un correo cuando hay novedades.',
    }))).toEqual({ ok: true })
  })

  it('un aviso en blanco no cuenta como aviso', () => {
    for (const vacio of ['', '   ', '\n']) {
      expect(puedePublicarse(articulo({ estadoDelProducto: 'futuro', aviso: vacio })).ok).toBe(false)
    }
  })

  it('sin título o sin cuerpo no se publica', () => {
    expect(puedePublicarse(articulo({ titulo: '  ' })).ok).toBe(false)
    expect(puedePublicarse(articulo({ cuerpo: '' })).ok).toBe(false)
  })

  it('a cada estado le corresponde una etiqueta, salvo a «disponible»', () => {
    expect(ETIQUETA_DEL_PRODUCTO.disponible).toBeNull()
    expect(ETIQUETA_DEL_PRODUCTO.futuro).toBe('Todavía no disponible')
    expect(ETIQUETA_DEL_PRODUCTO.parcial).toBe('Disponible en parte')
    expect(ETIQUETA_DEL_PRODUCTO.no_disponible).toBe('No disponible')
  })
})

/* ─── Lo público es sólo lo público ──────────────────────────────────── */

describe('los cuatro ámbitos no se mezclan', () => {
  it('hacen falta LAS DOS cosas: ámbito público y publicado', () => {
    expect(esVisiblePublicamente({ ambito: 'publica', estado: 'PUBLICADO' })).toBe(true)
  })

  it('ningún ámbito interno sale, ni aunque esté publicado', () => {
    for (const ambito of ['publicador', 'administrativa', 'tecnica'] as const) {
      expect(
        esVisiblePublicamente({ ambito, estado: 'PUBLICADO' }),
        `el ámbito «${ambito}» se filtró al público`,
      ).toBe(false)
    }
  })

  it('ningún estado distinto de PUBLICADO sale, ni aunque sea público', () => {
    for (const estado of ESTADOS.filter((e) => e !== 'PUBLICADO')) {
      expect(
        esVisiblePublicamente({ ambito: 'publica', estado }),
        `un artículo «${estado}» se filtró al público`,
      ).toBe(false)
    }
  })

  it('las 24 combinaciones: exactamente UNA es visible', () => {
    const ambitos = ['publica', 'publicador', 'administrativa', 'tecnica'] as const
    const visibles = ambitos.flatMap((ambito) =>
      ESTADOS.filter((estado) => esVisiblePublicamente({ ambito, estado })).map((e) => `${ambito}/${e}`))
    expect(visibles).toEqual(['publica/PUBLICADO'])
  })
})

/* ─── El RLS dice lo mismo que el código ─────────────────────────────── */

describe('la migración 27 protege lo mismo que el modelo', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/27-centro-de-ayuda.sql'), 'utf8')

  it('las nueve tablas del documento, ni una menos', () => {
    for (const t of [
      'knowledge_categories', 'knowledge_articles', 'knowledge_article_versions',
      'knowledge_article_sources', 'knowledge_article_relations', 'knowledge_article_tags',
      'knowledge_feedback', 'knowledge_searches', 'knowledge_change_events',
    ]) {
      expect(sql, `falta ${t}`).toMatch(new RegExp(`create table if not exists public\\.${t}`))
      expect(sql, `${t} sin RLS`).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
    }
  })

  it('`anon` sólo lee artículos públicos y publicados', () => {
    expect(sql).toMatch(/using \(ambito = 'publica' and estado = 'PUBLICADO'\)/)
  })

  it('versiones, fuentes, búsquedas y cambios NO tienen política de lectura', () => {
    // Con RLS activo y sin política, no se lee. Es deliberado.
    for (const t of ['knowledge_article_versions', 'knowledge_article_sources',
                     'knowledge_searches', 'knowledge_change_events']) {
      const politicas = sql.match(new RegExp(`create policy [^;]*on public\\.${t}[^;]*;`, 'g')) ?? []
      expect(politicas, `${t} abrió una política`).toHaveLength(0)
    }
  })

  it('la base exige el aviso, no sólo el código', () => {
    // Si alguien escribe directo en SQL, el CHECK lo para igual.
    expect(sql).toMatch(/knowledge_articles_futuro_avisa/)
    expect(sql).toMatch(/estado_producto = 'disponible' or \(aviso is not null/)
  })

  it('un artículo publicado deja constancia de quién lo aprobó', () => {
    expect(sql).toMatch(/knowledge_articles_publicado_con_firma/)
    expect(sql).toMatch(/estado <> 'PUBLICADO' or \(publicado_por is not null/)
  })

  it('existe el archivo para revertirla', () => {
    const rev = readFileSync(join(process.cwd(), 'supabase/27-centro-de-ayuda.REVERTIR.sql'), 'utf8')
    expect(rev).toMatch(/drop table if exists public\.knowledge_categories/)
    // Y avisa de que es destructiva antes de que alguien la ejecute.
    expect(rev).toMatch(/DESTRUCTIVA/)
  })
})

/* ─── Permisos ───────────────────────────────────────────────────────── */

describe('quién escribe y quién publica', () => {
  const q = (rol: string, superAdmin = false) => ({ rol, superAdmin })

  it('redactar y publicar son permisos SEPARADOS', () => {
    // Si fueran el mismo, la frontera «la IA propone, una persona publica» no
    // existiría en ninguna parte del sistema.
    const p = readFileSync(join(process.cwd(), 'src/lib/acceso/permisos.ts'), 'utf8')
    expect(p).toMatch(/'ayuda\.redactar'/)
    expect(p).toMatch(/'ayuda\.publicar'/)
  })

  it('ni el cliente ni el publicador tocan el Centro', () => {
    for (const rol of ['cliente', 'publicador']) {
      expect(puede(q(rol), 'ayuda.redactar'), `${rol} redacta`).toBe(false)
      expect(puede(q(rol), 'ayuda.publicar'), `${rol} publica`).toBe(false)
    }
  })

  it('admin y super admin sí', () => {
    expect(puede(q('admin'), 'ayuda.publicar')).toBe(true)
    expect(puede(q('admin', true), 'ayuda.publicar')).toBe(true)
  })

  it('03.08 no se rompió: el catálogo anterior sigue igual', () => {
    expect(puede(q('cliente'), 'cuenta.propia')).toBe(true)
    expect(puede(q('cliente'), 'panel.admin')).toBe(false)
  })
})

/* ─── URLs ───────────────────────────────────────────────────────────── */

describe('las rutas del Centro', () => {
  it('un slug se hace de un título, sin acentos ni signos', () => {
    expect(slugDe('¿Cómo guardar una propiedad?')).toBe('como-guardar-una-propiedad')
    expect(slugDe('Privacidad y seguridad')).toBe('privacidad-y-seguridad')
    expect(slugDe('  Mi  búsqueda  ')).toBe('mi-busqueda')
    expect(slugDe('Valuador — ¿cómo funciona?')).toBe('valuador-como-funciona')
  })

  it('un slug generado siempre es válido', () => {
    for (const t of ['¿Cómo?', 'Ñandú', 'A/B testing', '2026: el año', '   ', '---']) {
      const s = slugDe(t)
      if (s) expect(slugValido(s), `«${t}» dio «${s}»`).toBe(true)
    }
  })

  it('un slug inválido NO produce una URL rota: produce `null`', () => {
    expect(rutaDelArticulo('mi-cuenta', 'como-entrar')).toBe('/ayuda/mi-cuenta/como-entrar')
    for (const malo of ['Mi-Cuenta', 'mi cuenta', '../admin', 'mi_cuenta', '']) {
      expect(rutaDelArticulo(malo, 'x'), `pasó «${malo}»`).toBeNull()
      expect(rutaDeCategoria(malo)).toBeNull()
    }
  })

  it('la búsqueda codifica lo que se teclea', () => {
    expect(rutaDeBusqueda('cómo guardar')).toBe('/ayuda/buscar?q=c%C3%B3mo%20guardar')
    expect(rutaDeBusqueda('   ')).toBe('/ayuda/buscar')
    expect(rutaDeBusqueda('a&b=c')).toContain('a%26b%3Dc')
  })
})

/* ─── Búsqueda ───────────────────────────────────────────────────────── */

describe('la búsqueda', () => {
  it('nadie escribe con tildes en un buscador', () => {
    expect(normalizarConsulta('Valuación')).toBe('valuacion')
    expect(normalizarConsulta('  CÓMO   guardar ')).toBe('como guardar')
  })

  it('lo que llega de fuera se acota', () => {
    expect(normalizarConsulta('x'.repeat(500))).toHaveLength(200)
  })

  it('una sola letra no busca nada útil', () => {
    expect(consultaBuscable('a')).toBe(false)
    expect(consultaBuscable(' ')).toBe(false)
    expect(consultaBuscable('ir')).toBe(true)
  })
})
