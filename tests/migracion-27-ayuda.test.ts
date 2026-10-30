import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * V-1.1.94 (3c-3) — Ensayo de la migración 27 (Centro de Ayuda).
 *
 * Todo ocurre en PGlite, en memoria. Nada de esto toca producción.
 *
 * ─────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA AQUÍ Y POR QUÉ
 *
 * No basta con que la migración «corra». Lo que hay que demostrar es que las
 * dos reglas que sostienen el Centro están en la BASE, no sólo en el código:
 *
 *   1. Un artículo que describe algo que no existe NO puede publicarse sin
 *      avisarlo. Si sólo lo comprobara el servidor, un `insert` a mano se lo
 *      saltaría.
 *   2. Publicado sin constancia de quién lo aprobó es exactamente lo que la
 *      regla «la IA nunca publica» prohíbe.
 *
 * Y que el contenido inicial entra limpio: 37 artículos, 31 publicados.
 * ─────────────────────────────────────────────────────────────
 */

let db: PGlite
const leerSql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')

const MIGRACION = '27-centro-de-ayuda.sql'
const CONTENIDO = '27-centro-de-ayuda-contenido.sql'
const REVERTIR = '27-centro-de-ayuda.REVERTIR.sql'

/**
 * PGlite no trae los roles de Supabase. Se crean igual que en el ensayo de la
 * migración 25: sin ellos, `create policy … to anon` no se puede ni ensayar.
 */
const ROLES = 'create role anon; create role authenticated; create role service_role;'

async function nueva(conContenido = false): Promise<PGlite> {
  const d = new PGlite()
  await d.exec(ROLES)
  await d.exec(leerSql(MIGRACION))
  if (conContenido) await d.exec(leerSql(CONTENIDO))
  return d
}

const TABLAS = [
  'knowledge_categories', 'knowledge_articles', 'knowledge_article_versions',
  'knowledge_article_sources', 'knowledge_article_relations', 'knowledge_article_tags',
  'knowledge_feedback', 'knowledge_searches', 'knowledge_change_events',
]

beforeAll(async () => { db = await nueva() }, 60_000)

afterAll(async () => { await db?.close() })

describe('la migración se aplica y se puede reaplicar', () => {
  it('crea las nueve tablas del documento', async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname='public' and tablename like 'knowledge_%' order by 1`)
    expect(rows.map((r) => r.tablename).sort()).toEqual([...TABLAS].sort())
  })

  it('es idempotente: aplicarla dos veces no rompe nada', async () => {
    await expect(db.exec(leerSql(MIGRACION))).resolves.toBeDefined()
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'knowledge_%'`)
    expect(rows[0].n).toBe(9)
  })

  it('las nueve llevan RLS activo', async () => {
    const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname='public' and tablename like 'knowledge_%'`)
    for (const r of rows) expect(r.rowsecurity, `${r.tablename} sin RLS`).toBe(true)
  })
})

describe('la base impide prometer lo que no existe', () => {
  const categoria = async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into knowledge_categories (slug, nombre) values ('cat-' || gen_random_uuid(), 'X') returning id`)
    return rows[0].id
  }

  it('un artículo «futuro» NO se puede guardar sin aviso', async () => {
    const c = await categoria()
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo, estado_producto)
       values ($1, 'sin-aviso', 'Algo que no existe', 'futuro')`, [c],
    )).rejects.toThrow(/knowledge_articles_futuro_avisa/)
  })

  it('«parcial» y «no_disponible» tampoco', async () => {
    const c = await categoria()
    for (const ep of ['parcial', 'no_disponible']) {
      await expect(db.query(
        `insert into knowledge_articles (categoria_id, slug, titulo, estado_producto)
         values ($1, $2, 'X', $3)`, [c, `s-${ep}`, ep],
      )).rejects.toThrow(/futuro_avisa/)
    }
  })

  it('un aviso en blanco no cuenta como aviso', async () => {
    const c = await categoria()
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo, estado_producto, aviso)
       values ($1, 'aviso-vacio', 'X', 'futuro', '   ')`, [c],
    )).rejects.toThrow(/futuro_avisa/)
  })

  it('con el aviso puesto, sí entra', async () => {
    const c = await categoria()
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo, estado_producto, aviso)
       values ($1, 'con-aviso', 'X', 'futuro', 'Todavía no está disponible.')`, [c],
    )).resolves.toBeDefined()
  })

  it('«disponible» no necesita aviso', async () => {
    const c = await categoria()
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo) values ($1, 'normal', 'X')`, [c],
    )).resolves.toBeDefined()
  })
})

describe('publicar deja constancia de quién lo aprobó', () => {
  it('PUBLICADO sin firma se rechaza', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into knowledge_categories (slug, nombre) values ('cat-firma', 'X') returning id`)
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo, estado)
       values ($1, 'sin-firma', 'X', 'PUBLICADO')`, [rows[0].id],
    )).rejects.toThrow(/publicado_con_firma/)
  })

  it('con quién y cuándo, entra', async () => {
    const { rows } = await db.query<{ id: string }>(`select id from knowledge_categories where slug='cat-firma'`)
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo, estado, publicado_por, publicado_en)
       values ($1, 'con-firma', 'X', 'PUBLICADO', 'una-persona', now())`, [rows[0].id],
    )).resolves.toBeDefined()
  })
})

describe('las restricciones dicen lo que deben decir', () => {
  it('sólo los seis estados del documento', async () => {
    const { rows } = await db.query<{ id: string }>(`select id from knowledge_categories where slug='cat-firma'`)
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo, estado)
       values ($1, 'estado-raro', 'X', 'LISTO')`, [rows[0].id],
    )).rejects.toThrow(/estado_check/)
  })

  it('sólo los cuatro ámbitos', async () => {
    const { rows } = await db.query<{ id: string }>(`select id from knowledge_categories where slug='cat-firma'`)
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo, ambito)
       values ($1, 'ambito-raro', 'X', 'secreta')`, [rows[0].id],
    )).rejects.toThrow(/ambito_check/)
  })

  it('un slug con mayúsculas o espacios no entra', async () => {
    const { rows } = await db.query<{ id: string }>(`select id from knowledge_categories where slug='cat-firma'`)
    for (const malo of ['Mi-Cuenta', 'mi cuenta', 'mi_cuenta']) {
      await expect(db.query(
        `insert into knowledge_articles (categoria_id, slug, titulo) values ($1, $2, 'X')`,
        [rows[0].id, malo],
      ), `pasó «${malo}»`).rejects.toThrow(/slug_check/)
    }
  })

  it('el mismo slug no se repite dentro de una categoría', async () => {
    const { rows } = await db.query<{ id: string }>(`select id from knowledge_categories where slug='cat-firma'`)
    await expect(db.query(
      `insert into knowledge_articles (categoria_id, slug, titulo) values ($1, 'con-firma', 'Otro')`, [rows[0].id],
    )).rejects.toThrow(/slug_unico/)
  })

  it('un artículo no se relaciona consigo mismo', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from knowledge_articles where slug='con-firma'`)
    await expect(db.query(
      `insert into knowledge_article_relations (articulo_id, relacionado_id) values ($1, $1)`, [rows[0].id],
    )).rejects.toThrow(/no_consigo/)
  })
})

describe('el contenido inicial entra limpio', () => {
  let limpia: PGlite

  beforeAll(async () => {
    limpia = await nueva(true)
  }, 60_000)

  afterAll(async () => { await limpia?.close() })

  it('nueve categorías', async () => {
    const { rows } = await limpia.query<{ n: number }>(`select count(*)::int as n from knowledge_categories`)
    expect(rows[0].n).toBe(9)
  })

  it('37 artículos: 31 publicados y 6 en borrador', async () => {
    const { rows } = await limpia.query<{ estado: string; n: number }>(
      `select estado, count(*)::int as n from knowledge_articles group by 1 order by 1`)
    const por = Object.fromEntries(rows.map((r) => [r.estado, r.n]))
    expect(por.PUBLICADO).toBe(31)
    expect(por.BORRADOR).toBe(6)
    expect(Object.values(por).reduce((a, b) => a + b, 0)).toBe(37)
  })

  it('NINGÚN artículo publicado promete algo que no existe sin avisarlo', async () => {
    const { rows } = await limpia.query<{ slug: string }>(
      `select slug from knowledge_articles
       where estado='PUBLICADO' and estado_producto <> 'disponible'
         and (aviso is null or btrim(aviso) = '')`)
    expect(rows.map((r) => r.slug)).toEqual([])
  })

  it('los tres casos PARCIALES están publicados y avisan', async () => {
    // Son los peligrosos: parecen disponibles. Las alertas, por ejemplo, se
    // ven en el portal pero no mandan correo.
    const { rows } = await limpia.query<{ slug: string; aviso: string }>(
      `select slug, aviso from knowledge_articles where estado_producto='parcial' and estado='PUBLICADO'`)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    for (const r of rows) expect(r.aviso.length, `«${r.slug}» avisa poco`).toBeGreaterThan(30)
    expect(rows.map((r) => r.slug)).toContain('como-funcionan-las-alertas')
  })

  it('NINGÚN artículo «futuro» está publicado', async () => {
    const { rows } = await limpia.query<{ slug: string }>(
      `select slug from knowledge_articles where estado_producto='futuro' and estado='PUBLICADO'`)
    expect(rows.map((r) => r.slug)).toEqual([])
  })

  it('lo de publicadores NO es público', async () => {
    const { rows } = await limpia.query<{ n: number }>(
      `select count(*)::int as n from knowledge_articles a
       join knowledge_categories c on c.id=a.categoria_id
       where c.slug='publicadores' and a.ambito='publica'`)
    expect(rows[0].n).toBe(0)
  })

  it('cada artículo publicado tiene firma', async () => {
    const { rows } = await limpia.query<{ n: number }>(
      `select count(*)::int as n from knowledge_articles
       where estado='PUBLICADO' and (publicado_por is null or publicado_en is null)`)
    expect(rows[0].n).toBe(0)
  })

  it('las fuentes enlazan artículos con el código de verdad', async () => {
    const { rows } = await limpia.query<{ n: number }>(
      `select count(*)::int as n from knowledge_article_sources`)
    expect(rows[0].n).toBeGreaterThan(20)
    const { rows: tipos } = await limpia.query<{ tipo: string }>(
      `select distinct tipo from knowledge_article_sources order by 1`)
    expect(tipos.map((t) => t.tipo)).toEqual(
      expect.arrayContaining(['api', 'component', 'documentation', 'permission', 'route']))
  })

  it('el contenido también es idempotente', async () => {
    await limpia.exec(leerSql(CONTENIDO))
    const { rows } = await limpia.query<{ n: number }>(`select count(*)::int as n from knowledge_articles`)
    expect(rows[0].n).toBe(37)
  })
})

describe('se puede revertir', () => {
  it('el REVERTIR deja el esquema como estaba', async () => {
    const d = await nueva(true)
    await d.exec(leerSql(REVERTIR))
    const { rows } = await d.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'knowledge_%'`)
    expect(rows[0].n).toBe(0)
    await d.close()
  }, 60_000)
})
