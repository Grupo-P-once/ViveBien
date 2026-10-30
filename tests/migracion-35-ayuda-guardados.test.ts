import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Centro de Ayuda · «¿Cómo guardo una propiedad?» (migración 35, D-75).
 *
 * Todo en PGlite, en memoria: nada toca producción. La migración está PREPARADA, no aplicada.
 * Se demuestra que corrige sólo ese artículo, que lo que dice coincide con el código (la ficha
 * NO tiene corazón; guardar exige sesión y es de la cuenta), que el visor la entiende y que la
 * reversa devuelve exactamente el texto de producción de hoy.
 */

const leerSql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const leerSrc = (n: string) => readFileSync(path.join(__dirname, '..', 'src', n), 'utf8')
const ROLES = 'create role anon; create role authenticated; create role service_role;'
const SLUG = 'como-guardar-una-propiedad'

// El texto que hoy sirve producción (leído con un SELECT el 8-oct-2026).
const TEXTO_DE_PRODUCCION = 'Pulsa el **corazón** en la ficha o en la tarjeta. La propiedad se añade a tus guardadas y la encuentras en tu portal.\n\nHace falta tener sesión iniciada: es lo que nos permite recordarlo la próxima vez que entres.'

let db: PGlite
const todos = async () => (await db.query<{ slug: string; cuerpo: string; actualizado_en: string }>(
  `select slug, cuerpo, actualizado_en::text from public.knowledge_articles order by slug`)).rows
const cuerpo = async () => (await todos()).find((a) => a.slug === SLUG)!.cuerpo

beforeAll(async () => {
  db = new PGlite()
  await db.exec(ROLES)
  await db.exec(leerSql('27-centro-de-ayuda.sql'))
  await db.exec(leerSql('27-centro-de-ayuda-contenido.sql'))
}, 90_000)
afterAll(async () => { await db?.close() })

describe('antes de aplicar', () => {
  it('el artículo de la base coincide con el que sirve producción hoy', async () => {
    expect(await cuerpo()).toBe(TEXTO_DE_PRODUCCION)
  })
})

describe('migración 35', () => {
  it('cambia SÓLO ese artículo y se puede reaplicar', async () => {
    const antes = await todos()
    await db.exec(leerSql('35-ayuda-guardados.sql'))
    await db.exec(leerSql('35-ayuda-guardados.sql'))
    const despues = await todos()
    expect(despues).toHaveLength(antes.length)
    const distintos = despues.filter((d) => d.cuerpo !== antes.find((a) => a.slug === d.slug)!.cuerpo).map((d) => d.slug)
    expect(distintos).toEqual([SLUG])
  })

  it('dice lo que el código hace: tarjeta (no ficha), sesión, cuenta, «Mis guardadas»', async () => {
    const t = await cuerpo()
    expect(t).not.toMatch(/en la ficha/i)
    expect(t).toMatch(/tarjeta/)
    expect(t).toMatch(/Mis guardadas/)
    expect(t).toMatch(/sesión iniciada/)
    expect(t).toMatch(/de tu cuenta, no del navegador/)
    // …y el código lo confirma: la ficha no tiene corazón y la tarjeta sí.
    expect(leerSrc('app/propiedades/[id]/page-client.tsx')).not.toMatch(/fa-heart|useFavoritos/)
    expect(leerSrc('components/PropertyCard.tsx')).toMatch(/useFavoritos\(\)/)
  })

  it('el visor lo entiende: sólo párrafos, negritas y enlaces (sin listas, tablas ni títulos)', async () => {
    const t = await cuerpo()
    expect(t).not.toMatch(/^\s*([-*+]\s|\d+\.\s|#|\|)/m)
  })

  it('la reversa devuelve exactamente el texto anterior', async () => {
    await db.exec(leerSql('35-ayuda-guardados.REVERTIR.sql'))
    expect(await cuerpo()).toBe(TEXTO_DE_PRODUCCION)
  })
})
