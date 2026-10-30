import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 37 (D-80): dos artículos de ayuda en BORRADOR. PGlite en memoria: nada toca producción. */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const NUEVOS = ['como-darme-de-baja-de-los-correos', 'como-recibir-recomendaciones-por-correo']
let db: PGlite
const articulos = async () => (await db.query<{ slug: string; cuerpo: string; estado: string }>(`select slug, cuerpo, estado from public.knowledge_articles order by slug`)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(sql('27-centro-de-ayuda.sql'))
  await db.exec(sql('27-centro-de-ayuda-contenido.sql'))
  // Supabase concede SELECT a anon/authenticated por defecto; lo que decide qué filas se ven es la política (RLS), que es lo que se prueba.
  await db.exec('grant usage on schema public to anon, authenticated; grant select on all tables in schema public to anon, authenticated;')
}, 90_000)
afterAll(async () => { await db?.close() })

describe('migración 37', () => {
  it('crea sólo los dos artículos, en BORRADOR, y se puede reaplicar sin duplicar', async () => {
    const antes = await articulos()
    await db.exec(sql('37-ayuda-correo.sql'))
    await db.exec(sql('37-ayuda-correo.sql'))
    const despues = await articulos()
    expect(despues).toHaveLength(antes.length + 2)
    const nuevos = despues.filter((a) => !antes.some((b) => b.slug === a.slug))
    expect(nuevos.map((a) => a.slug).sort()).toEqual(NUEVOS)
    expect(nuevos.every((a) => a.estado === 'BORRADOR')).toBe(true)
    // el resto del Centro no cambió ni una letra
    for (const b of antes) expect(despues.find((a) => a.slug === b.slug)).toEqual(b)
  })

  it('un BORRADOR no lo ve el público (lectura anónima) hasta que se publique', async () => {
    await db.exec('set role anon')
    const vistos = (await db.query<{ slug: string }>(`select slug from public.knowledge_articles where slug = any($1)`, [NUEVOS])).rows
    await db.exec('reset role')
    expect(vistos).toEqual([])
  })

  it('el texto es honesto y legible por el visor: sin listas ni tablas, sin direcciones de correo, con 3 días y confirmación', async () => {
    for (const a of (await articulos()).filter((x) => NUEVOS.includes(x.slug))) {
      expect(a.cuerpo, a.slug).not.toMatch(/^\s*([-*+]\s|\d+\.\s|#|\|)/m)
      expect(a.cuerpo, a.slug).not.toMatch(/[\w.]+@[\w.]+/)
    }
    const r = (await articulos()).find((a) => a.slug === 'como-recibir-recomendaciones-por-correo')!.cuerpo
    expect(r).toMatch(/como máximo una vez cada tres días/)
    expect(r).toMatch(/Sí, quiero seguir recibiéndolas/)
    expect(r).toMatch(/No hace falta crear una cuenta/)
    expect(r).not.toMatch(/casilla|confirmar tu correo/)
  })

  it('al publicar (con la firma que exige la base) el público los ve; la reversa los borra y sólo a ellos', async () => {
    await db.exec(`update public.knowledge_articles a set estado = 'PUBLICADO', publicado_por = 'activacion-correo', publicado_en = now() from public.knowledge_categories c where c.id = a.categoria_id and c.slug = 'busquedas-y-alertas' and a.slug in ('${NUEVOS.join("','")}')`)
    await db.exec('set role anon')
    expect((await db.query(`select 1 from public.knowledge_articles where slug = any($1)`, [NUEVOS])).rows).toHaveLength(2)
    await db.exec('reset role')
    const antes = (await articulos()).length
    await db.exec(sql('37-ayuda-correo.REVERTIR.sql'))
    expect((await articulos()).length).toBe(antes - 2)
    expect((await articulos()).filter((a) => NUEVOS.includes(a.slug))).toEqual([])
  })
})
