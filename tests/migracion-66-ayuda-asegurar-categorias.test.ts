import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 66: corrige hacia adelante el estado de la 64 en staging (registrada SIN insertar nada porque el Centro de Ayuda estaba vacío, E-59).
 * PGlite en memoria: nada toca ninguna base real.
 */
const leer = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')
const SLUGS = ['correos-de-vive-bien-y-tus-preferencias', 'activar-o-desactivar-avisos-por-correo']
let db: PGlite
const cuenta = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n)
const articulos = () => cuenta(`select count(*) n from public.knowledge_articles where slug = any(array['${SLUGS.join("','")}'])`)

beforeEach(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(leer('supabase/27-centro-de-ayuda.sql')) // solo el esquema: SIN categorías, igual que staging
}, 60_000)
afterEach(async () => { await db?.close() })

describe('migración 66: asegura categorías y artículos de correos', () => {
  it('desde el estado de STAGING (0 categorías, la 64 sin efecto) deja las 2 categorías y los 2 artículos publicados con sus fuentes', async () => {
    expect(await cuenta('select count(*) n from public.knowledge_categories')).toBe(0)
    await db.exec(leer('supabase/64-ayuda-correos-y-preferencias.sql')) // la 64 «aplicada» no inserta nada
    expect(await articulos()).toBe(0)
    await db.exec(leer('supabase/66-ayuda-correos-asegurar-categorias.sql'))
    expect(await articulos()).toBe(2)
    const filas = (await db.query<{ slug: string; estado: string; ambito: string; cat: string }>(
      `select a.slug, a.estado, a.ambito, c.slug cat from public.knowledge_articles a join public.knowledge_categories c on c.id = a.categoria_id where a.slug = any(array['${SLUGS.join("','")}']) order by a.slug`)).rows
    expect(filas).toEqual([
      { slug: 'activar-o-desactivar-avisos-por-correo', estado: 'PUBLICADO', ambito: 'publica', cat: 'busquedas-y-alertas' },
      { slug: 'correos-de-vive-bien-y-tus-preferencias', estado: 'PUBLICADO', ambito: 'publica', cat: 'privacidad-y-seguridad' },
    ])
    expect(await cuenta(`select count(*) n from public.knowledge_article_sources s join public.knowledge_articles a on a.id = s.articulo_id where a.slug = any(array['${SLUGS.join("','")}'])`)).toBeGreaterThanOrEqual(6)
  })

  it('en el estado de PRODUCCIÓN (las nueve categorías ya existen) no cambia ninguna categoría y es repetible sin duplicar', async () => {
    await db.exec(leer('supabase/27-centro-de-ayuda-contenido.sql'))
    const antes = await cuenta('select count(*) n from public.knowledge_categories')
    const art0 = await cuenta('select count(*) n from public.knowledge_articles')
    await db.exec(leer('supabase/66-ayuda-correos-asegurar-categorias.sql'))
    await db.exec(leer('supabase/66-ayuda-correos-asegurar-categorias.sql'))
    expect(await cuenta('select count(*) n from public.knowledge_categories')).toBe(antes)
    expect(await cuenta('select count(*) n from public.knowledge_articles')).toBe(art0 + 2)
    expect(await articulos()).toBe(2)
  })

  it('la reversa quita los dos artículos y NO borra categorías', async () => {
    await db.exec(leer('supabase/66-ayuda-correos-asegurar-categorias.sql'))
    const cats = await cuenta('select count(*) n from public.knowledge_categories')
    await db.exec(leer('supabase/66-ayuda-correos-asegurar-categorias.REVERTIR.sql'))
    expect(await articulos()).toBe(0)
    expect(await cuenta('select count(*) n from public.knowledge_categories')).toBe(cats)
  })

  it('el contenido es idéntico al de la 64 (misma redacción)', () => {
    const s64 = leer('supabase/64-ayuda-correos-y-preferencias.sql')
    const s66 = leer('supabase/66-ayuda-correos-asegurar-categorias.sql')
    const bloques = (t: string) => [...t.matchAll(/\$c\$([\s\S]*?)\$c\$/g)].map((m) => m[1])
    expect(bloques(s66)).toEqual(bloques(s64))
    expect(bloques(s66)).toHaveLength(2)
  })
})
