import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 37 (Fase C del apartado SEO): tablas nuevas, solo del servidor. Contra Postgres real (PGlite).
 * Se comprueba: que crea las tres tablas, que se puede correr dos veces, que las reglas de datos se cumplen, que anon y authenticated NO pueden
 * leer ni escribir, que service_role sí, y que la reversa las quita sin tocar nada más.
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite

const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);          -- una tabla ajena: la migración no debe tocarla
  insert into public.propiedades values ('p1');
  grant usage on schema public to anon, authenticated, service_role;
  grant all on public.propiedades to anon, authenticated, service_role;
`
async function como<T = Record<string, unknown>>(rol: string, consulta: string): Promise<T[]> {
  await d.exec(`set role ${rol}`)
  try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') }
}
const falla = async (rol: string, consulta: string) => como(rol, consulta).then(() => null, (e: Error) => e.message)

beforeAll(async () => { d = new PGlite(); await d.exec(BASE); await d.exec(sql('37-seo-historial-tareas-prompts.sql')) })
afterAll(async () => { await d.close() })

describe('migración 37 — SEO', () => {
  it('crea las tres tablas y se puede volver a correr sin error', async () => {
    const t = async () => (await d.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_name like 'seo\\_%' order by 1")).rows.map((r) => r.table_name)
    expect(await t()).toEqual(['seo_historial', 'seo_prompts_ia', 'seo_tareas'])
    await d.exec(sql('37-seo-historial-tareas-prompts.sql'))
    expect(await t()).toEqual(['seo_historial', 'seo_prompts_ia', 'seo_tareas'])
  })

  it('el servidor (service_role) puede guardar y leer en las tres', async () => {
    await como('service_role', `insert into public.seo_tareas (titulo, creada_por) values ('Agregar h1 al catálogo', 'su@x.com')`)
    await como('service_role', `insert into public.seo_prompts_ia (prompt, motor, aparece, creado_por) values ('mejores naves industriales en León', 'chatgpt', false, 'su@x.com')`)
    await como('service_role', `insert into public.seo_historial (periodo_dias, rango_desde, rango_hasta, clics, impresiones, ctr, posicion, creado_por) values (28, '2026-09-23', '2026-10-20', 8, 218, 3.67, 15.6, 'su@x.com')`)
    expect((await como('service_role', 'select count(*)::int as n from public.seo_tareas'))[0]).toEqual({ n: 1 })
    expect((await como<{ estado: string; prioridad: string; area: string }>('service_role', 'select estado, prioridad, area from public.seo_tareas'))[0]).toEqual({ estado: 'pendiente', prioridad: 'media', area: 'tecnico' })
  })

  it('anon y authenticated NO pueden leer ni escribir (ni con permisos dados por error)', async () => {
    for (const rol of ['anon', 'authenticated']) {
      for (const tabla of ['seo_historial', 'seo_tareas', 'seo_prompts_ia']) {
        expect(await falla(rol, `select * from public.${tabla}`), `${rol} lee ${tabla}`).toMatch(/permission denied/i)
      }
      expect(await falla(rol, `insert into public.seo_tareas (titulo, creada_por) values ('x x x', 'a@b.c')`)).toMatch(/permission denied/i)
    }
    // Aunque por error alguien les diera el permiso, la RLS sin políticas igual los deja sin filas.
    await d.exec('grant select on public.seo_tareas to authenticated')
    expect(await como('authenticated', 'select * from public.seo_tareas')).toEqual([])
    await d.exec('revoke select on public.seo_tareas from authenticated')
  })

  it('las reglas de datos se cumplen: valores fuera de catálogo, textos cortos o largos y URL no https se rechazan', async () => {
    const malos = [
      `insert into public.seo_tareas (titulo, creada_por, prioridad) values ('titulo ok', 'a@b.c', 'urgente')`,
      `insert into public.seo_tareas (titulo, creada_por, estado) values ('titulo ok', 'a@b.c', 'borrada')`,
      `insert into public.seo_tareas (titulo, creada_por) values ('ab', 'a@b.c')`,
      `insert into public.seo_tareas (titulo, creada_por, detalle) values ('titulo ok', 'a@b.c', '${'x'.repeat(1001)}')`,
      `insert into public.seo_prompts_ia (prompt, motor, aparece, creado_por) values ('pregunta valida', 'bing', true, 'a@b.c')`,
      `insert into public.seo_prompts_ia (prompt, motor, aparece, cita_url, creado_por) values ('pregunta valida', 'gemini', true, 'http://inseguro.com', 'a@b.c')`,
      `insert into public.seo_historial (periodo_dias, rango_desde, rango_hasta, clics, impresiones, ctr, posicion, creado_por) values (30, '2026-09-23', '2026-10-20', 1, 1, 1, 1, 'a@b.c')`,
      `insert into public.seo_historial (periodo_dias, rango_desde, rango_hasta, clics, impresiones, ctr, posicion, creado_por) values (28, '2026-10-20', '2026-09-23', 1, 1, 1, 1, 'a@b.c')`,
      `insert into public.seo_historial (periodo_dias, rango_desde, rango_hasta, clics, impresiones, ctr, posicion, creado_por) values (28, '2026-09-23', '2026-10-20', -1, 1, 1, 1, 'a@b.c')`,
    ]
    for (const q of malos) expect(await falla('service_role', q), q.slice(0, 80)).toMatch(/violates check constraint/i)
    await como('service_role', `insert into public.seo_prompts_ia (prompt, motor, aparece, cita_url, creado_por) values ('pregunta valida', 'gemini', true, 'https://vivebienn.com/blog', 'a@b.c')`)
  })

  it('la reversa quita solo las tres tablas', async () => {
    await d.exec(sql('37-seo-historial-tareas-prompts.REVERTIR.sql'))
    const quedan = (await d.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'seo\\_%'")).rows[0].n
    expect(quedan).toBe(0)
    expect((await d.query<{ id: string }>('select id from public.propiedades')).rows).toEqual([{ id: 'p1' }])
  })
})
