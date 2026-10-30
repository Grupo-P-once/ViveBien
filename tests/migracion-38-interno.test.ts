import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 38 (origen, comisión pactada y notas internas): tablas nuevas, solo del servidor. Contra Postgres real (PGlite).
 * Se comprueba: crea las dos tablas, se puede correr dos veces, las reglas de datos, que anon y authenticated NO leen ni escriben,
 * que borrar la propiedad borra lo interno, y que la reversa las quita sin tocar nada más.
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite

const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1'), ('p2');
  grant usage on schema public to anon, authenticated, service_role;
  grant all on public.propiedades to anon, authenticated, service_role;
`
async function como<T = Record<string, unknown>>(rol: string, consulta: string): Promise<T[]> {
  await d.exec(`set role ${rol}`)
  try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') }
}
const falla = async (rol: string, consulta: string) => como(rol, consulta).then(() => null, (e: Error) => e.message)

beforeAll(async () => { d = new PGlite(); await d.exec(BASE); await d.exec(sql('38-propiedad-interno.sql')) })
afterAll(async () => { await d.close() })

const tablas = async () => (await d.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_name in ('propiedad_notas','propiedad_origen') order by 1")).rows.map((r) => r.table_name)

describe('migración 38 — datos internos de la propiedad', () => {
  it('crea las dos tablas y se puede volver a correr', async () => {
    expect(await tablas()).toEqual(['propiedad_notas', 'propiedad_origen'])
    await d.exec(sql('38-propiedad-interno.sql'))
    expect(await tablas()).toEqual(['propiedad_notas', 'propiedad_origen'])
  })
  it('el servidor guarda; la comisión NO tiene valor por defecto', async () => {
    await como('service_role', `insert into public.propiedad_origen (propiedad_id, origen_tipo, creado_por, actualizado_por) values ('p1', 'trato_directo', 'a@x.test', 'a@x.test')`)
    const f = (await como<{ comision_tipo: string | null; comision_valor: string | null }>('service_role', 'select comision_tipo, comision_valor from public.propiedad_origen'))[0]
    expect(f).toEqual({ comision_tipo: null, comision_valor: null })
    await como('service_role', `insert into public.propiedad_notas (propiedad_id, autor_uid, autor_rol, texto) values ('p1', 'uid-1', 'admin', 'hola')`)
    expect((await como('service_role', 'select count(*)::int as n from public.propiedad_notas'))[0]).toEqual({ n: 1 })
  })
  it('rechaza tipos inventados, notas vacías, roles desconocidos y comisiones negativas', async () => {
    expect(await falla('service_role', `insert into public.propiedad_origen (propiedad_id, origen_tipo, creado_por, actualizado_por) values ('p2', 'primo', 'a@x.test', 'a@x.test')`)).toMatch(/check/i)
    expect(await falla('service_role', `insert into public.propiedad_origen (propiedad_id, origen_tipo, comision_tipo, creado_por, actualizado_por) values ('p2', 'broker', 'regalo', 'a@x.test', 'a@x.test')`)).toMatch(/check/i)
    expect(await falla('service_role', `insert into public.propiedad_origen (propiedad_id, origen_tipo, comision_tipo, comision_valor, creado_por, actualizado_por) values ('p2', 'broker', 'porcentaje', -1, 'a@x.test', 'a@x.test')`)).toMatch(/check/i)
    expect(await falla('service_role', `insert into public.propiedad_notas (propiedad_id, autor_uid, autor_rol, texto) values ('p1', 'uid-1', 'admin', '')`)).toMatch(/check/i)
    expect(await falla('service_role', `insert into public.propiedad_notas (propiedad_id, autor_uid, autor_rol, texto) values ('p1', 'uid-1', 'cliente', 'x')`)).toMatch(/check/i)
    expect(await falla('service_role', `insert into public.propiedad_notas (propiedad_id, autor_uid, autor_rol, texto) values ('no-existe', 'uid-1', 'admin', 'x')`)).toMatch(/foreign key|violates/i)
  })
  it('anon y authenticated NO pueden leer ni escribir', async () => {
    for (const rol of ['anon', 'authenticated']) {
      for (const t of ['propiedad_origen', 'propiedad_notas']) {
        expect(await falla(rol, `select * from public.${t}`), `${rol} lee ${t}`).toMatch(/permission denied/i)
      }
      expect(await falla(rol, `insert into public.propiedad_notas (propiedad_id, autor_uid, autor_rol, texto) values ('p1','u','admin','x')`)).toMatch(/permission denied/i)
      expect(await falla(rol, `delete from public.propiedad_origen`)).toMatch(/permission denied/i)
    }
  })
  it('si se borra la propiedad, se borra lo interno', async () => {
    await d.exec(`delete from public.propiedades where id = 'p1'`)
    expect((await como('service_role', 'select count(*)::int as n from public.propiedad_origen'))[0]).toEqual({ n: 0 })
    expect((await como('service_role', 'select count(*)::int as n from public.propiedad_notas'))[0]).toEqual({ n: 0 })
  })
  it('la reversa quita solo las dos tablas', async () => {
    await d.exec(sql('38-propiedad-interno.REVERTIR.sql'))
    expect(await tablas()).toEqual([])
    expect((await d.query('select count(*)::int as n from public.propiedades')).rows[0]).toEqual({ n: 1 })
  })
})

describe('regresión 24-oct-2026: guardar el origen dos veces', () => {
  // Las pruebas de arriba terminan con la reversa: se vuelve a aplicar la migración y se empieza sin filas.
  beforeAll(async () => { await d.exec(sql('38-propiedad-interno.sql')); await d.exec('delete from public.propiedad_origen') })
  it('un upsert SIN creado_por falla aunque la fila exista (por eso la ruta hace INSERT y luego UPDATE)', async () => {
    await d.exec("insert into public.propiedad_origen (propiedad_id, origen_tipo, creado_por, actualizado_por) values ('p2', 'trato_directo', 'a@x.mx', 'a@x.mx')")
    const e = await falla('service_role', "insert into public.propiedad_origen (propiedad_id, origen_tipo, actualizado_por) values ('p2', 'inmobiliaria', 'b@x.mx') on conflict (propiedad_id) do update set origen_tipo = excluded.origen_tipo")
    expect(e).toMatch(/creado_por/)
  })
  it('el UPDATE cambia lo editable y conserva creado_por', async () => {
    await d.exec("update public.propiedad_origen set origen_tipo = 'inmobiliaria', actualizado_por = 'b@x.mx' where propiedad_id = 'p2'")
    const f = (await d.query<{ origen_tipo: string; creado_por: string }>("select origen_tipo, creado_por from public.propiedad_origen where propiedad_id = 'p2'")).rows[0]
    expect(f).toEqual({ origen_tipo: 'inmobiliaria', creado_por: 'a@x.mx' })
  })
  it('la ruta no usa upsert sobre propiedad_origen', () => {
    const ruta = readFileSync(path.join(__dirname, '..', 'src', 'app', 'api', 'propiedades', '[id]', 'interno', 'route.ts'), 'utf8')
    expect(ruta.includes('.upsert(')).toBe(false)
  })
})
