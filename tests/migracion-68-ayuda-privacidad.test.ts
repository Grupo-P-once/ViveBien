import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 68: tres artículos de privacidad en el Centro de Ayuda (medición y elección, consulta vs anunciante, ARCO).
 * PGlite en memoria: nada toca ninguna base real. Los artículos deben decir lo mismo que el código y el Aviso: se comprueba contra las constantes reales.
 */
const leer = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')
const SLUGS = ['medicion-del-sitio-y-google-analytics', 'mi-consulta-y-el-anunciante', 'derechos-arco-como-ejercerlos']
let db: PGlite
const cuenta = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n)
const articulos = () => cuenta(`select count(*) n from public.knowledge_articles where slug = any(array['${SLUGS.join("','")}'])`)

beforeEach(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(leer('supabase/27-centro-de-ayuda.sql'))
  await db.exec(leer('supabase/27-centro-de-ayuda-contenido.sql')) // estado de producción: las categorías ya existen
}, 60_000)
afterEach(async () => { await db?.close() })

describe('migración 68: artículos de privacidad', () => {
  it('inserta los tres artículos publicados, públicos y con fuentes; es repetible sin duplicar', async () => {
    const antes = await cuenta('select count(*) n from public.knowledge_articles')
    await db.exec(leer('supabase/68-ayuda-privacidad-medicion-consultas-arco.sql'))
    await db.exec(leer('supabase/68-ayuda-privacidad-medicion-consultas-arco.sql'))
    expect(await articulos()).toBe(3)
    expect(await cuenta('select count(*) n from public.knowledge_articles')).toBe(antes + 3)
    const filas = (await db.query<{ slug: string; estado: string; ambito: string; cat: string; estado_producto: string }>(
      `select a.slug, a.estado, a.ambito, a.estado_producto, c.slug cat from public.knowledge_articles a join public.knowledge_categories c on c.id = a.categoria_id where a.slug = any(array['${SLUGS.join("','")}']) order by a.slug`)).rows
    expect(filas.map((f) => [f.slug, f.estado, f.ambito, f.cat])).toEqual(SLUGS.slice().sort().map((s) => [s, 'PUBLICADO', 'publica', 'privacidad-y-seguridad']))
    expect(await cuenta(`select count(*) n from public.knowledge_article_sources s join public.knowledge_articles a on a.id = s.articulo_id where a.slug = any(array['${SLUGS.join("','")}'])`)).toBe(6)
  })

  it('la reversa quita los tres artículos y no borra categorías ni los artículos existentes', async () => {
    const cats = await cuenta('select count(*) n from public.knowledge_categories')
    const art0 = await cuenta('select count(*) n from public.knowledge_articles')
    await db.exec(leer('supabase/68-ayuda-privacidad-medicion-consultas-arco.sql'))
    await db.exec(leer('supabase/68-ayuda-privacidad-medicion-consultas-arco.REVERTIR.sql'))
    expect(await articulos()).toBe(0)
    expect(await cuenta('select count(*) n from public.knowledge_articles')).toBe(art0)
    expect(await cuenta('select count(*) n from public.knowledge_categories')).toBe(cats)
  })

  it('solo usa lo que entiende el visor (párrafos, negritas y enlaces): sin tablas, listas ni encabezados', () => {
    const cuerpos = [...leer('supabase/68-ayuda-privacidad-medicion-consultas-arco.sql').matchAll(/\$c\$([\s\S]*?)\$c\$/g)].map((m) => m[1])
    expect(cuerpos).toHaveLength(3)
    for (const c of cuerpos) {
      expect(c, 'sin tabla').not.toMatch(/^\s*\|/m)
      expect(c, 'sin lista').not.toMatch(/^\s*([-*•]|\d+\.)\s/m)
      expect(c, 'sin encabezado').not.toMatch(/^\s*#/m)
    }
  })

  it('los artículos dicen lo mismo que el código y el Aviso (analítica elegible, consulta sin anunciante, plazos ARCO)', () => {
    const sql = leer('supabase/68-ayuda-privacidad-medicion-consultas-arco.sql')
    const aviso = leer('src/app/privacidad/page.tsx')
    const footer = leer('src/components/Footer.tsx')
    const banner = leer('src/components/AvisoAnalitica.tsx')
    // Los textos de los botones y del pie que el artículo cita existen en el código.
    expect(sql).toContain('«Preferencias de analítica»'); expect(footer).toContain('Preferencias de analítica')
    for (const b of ['Aceptar', 'Rechazar']) { expect(sql).toContain(`«${b}»`); expect(banner).toContain(`>${b}<`) }
    // La consulta es de VIVE BIEN y el anunciante no recibe datos (Aviso y ADR-0006); si el Aviso lo niega, el artículo no puede afirmarlo.
    expect(aviso).toMatch(/el anunciante no recibe el nombre, teléfono, correo ni mensaje/)
    expect(sql).toMatch(/Quien publica la propiedad no recibe tu nombre/)
    // Plazos de los derechos ARCO: los mismos del Aviso.
    expect(aviso).toMatch(/veinte días hábiles/); expect(aviso).toMatch(/quince días hábiles/)
    expect(sql).toMatch(/\*\*veinte días hábiles\*\*/); expect(sql).toMatch(/\*\*quince días hábiles\*\*/)
  })
})
