import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 39 (propuesta de comisión: textos versionados y aceptaciones). Contra Postgres real (PGlite).
 * Lo importante: ningún texto pasa a vigente sin revisión jurídica; lo vigente no se edita; solo hay uno vigente; el hash lo calcula la BASE;
 * una aceptación solo se agrega (ni se edita ni se borra), una vez por persona y versión, y solo del texto vigente; anon/authenticated no ven nada.
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite

const BASE = `create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;`
const CUERPO = 'Texto de prueba de la propuesta de comisión. '.repeat(3)
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

async function como<T = Record<string, unknown>>(rol: string, consulta: string): Promise<T[]> {
  await d.exec(`set role ${rol}`)
  try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') }
}
const falla = async (rol: string, consulta: string) => como(rol, consulta).then(() => null, (e: Error) => e.message)
const sr = <T = Record<string, unknown>>(q: string) => como<T>('service_role', q)

beforeAll(async () => { d = new PGlite(); await d.exec(BASE); await d.exec(sql('39-comision-textos-y-aceptaciones.sql')) })
afterAll(async () => { await d.close() })

describe('migración 39 — textos de comisión', () => {
  it('crea las tablas, se puede reaplicar y NO trae ningún texto', async () => {
    await d.exec(sql('39-comision-textos-y-aceptaciones.sql'))
    expect((await sr('select count(*)::int as n from public.comision_textos'))[0]).toEqual({ n: 0 })
    expect((await sr('select count(*)::int as n from public.comision_aceptaciones'))[0]).toEqual({ n: 0 })
  })
  it('un texto nace en borrador y el hash lo calcula la base (SHA-256 del cuerpo)', async () => {
    await sr(`insert into public.comision_textos (version, titulo, cuerpo, creado_por) values ('v1', 'Propuesta de comisión', '${CUERPO}', 'admin@x.test')`)
    const f = (await sr<{ estado: string; hash: string; revisado_por_abogado: boolean }>('select estado, hash, revisado_por_abogado from public.comision_textos'))[0]
    expect(f).toEqual({ estado: 'borrador', hash: sha(CUERPO), revisado_por_abogado: false })
    // aunque la app mande un hash, la base lo reemplaza
    await sr(`insert into public.comision_textos (version, titulo, cuerpo, hash, creado_por) values ('v0', 'Otra propuesta', '${CUERPO}x', 'a', 'admin@x.test')`)
    expect((await sr<{ hash: string }>("select hash from public.comision_textos where version='v0'"))[0].hash).toBe(sha(CUERPO + 'x'))
    await sr("delete from public.comision_textos where version='v0'") // un borrador sí se puede borrar
  })
  it('NO puede nacer vigente ni pasar a vigente sin revisión jurídica', async () => {
    expect(await falla('service_role', `insert into public.comision_textos (version, titulo, cuerpo, estado, creado_por) values ('v9', 'Propuesta', '${CUERPO}', 'vigente', 'a@x.test')`)).toMatch(/nace en borrador/)
    expect(await falla('service_role', "update public.comision_textos set estado='vigente' where version='v1'")).toMatch(/revisión jurídica/)
  })
  it('con revisión jurídica pasa a vigente; luego su contenido no se edita ni se borra', async () => {
    await sr("update public.comision_textos set estado='vigente', revisado_por_abogado=true where version='v1'")
    expect((await sr<{ estado: string; vigente: boolean }>("select estado, vigente_desde is not null as vigente from public.comision_textos where version='v1'"))[0]).toEqual({ estado: 'vigente', vigente: true })
    expect(await falla('service_role', "update public.comision_textos set cuerpo = cuerpo || ' cambio' where version='v1'")).toMatch(/no se edita/)
    expect(await falla('service_role', "update public.comision_textos set titulo='Otro título' where version='v1'")).toMatch(/no se edita/)
    expect(await falla('service_role', "delete from public.comision_textos where version='v1'")).toMatch(/no se borra/)
    expect(await falla('service_role', "update public.comision_textos set estado='borrador' where version='v1'")).toMatch(/no vuelve a borrador/)
  })
  it('solo puede haber UN texto vigente', async () => {
    await sr(`insert into public.comision_textos (version, titulo, cuerpo, creado_por) values ('v2', 'Propuesta v2', '${CUERPO}2', 'a@x.test')`)
    expect(await falla('service_role', "update public.comision_textos set estado='vigente', revisado_por_abogado=true where version='v2'")).toMatch(/duplicate key|unique/i)
  })
})

describe('migración 39 — aceptaciones', () => {
  const idVigente = async () => (await sr<{ id: string }>("select id from public.comision_textos where estado='vigente'"))[0].id
  const hashVigente = async () => (await sr<{ hash: string }>("select hash from public.comision_textos where estado='vigente'"))[0].hash

  it('se registra una aceptación del texto vigente, y una persona acepta una versión una sola vez', async () => {
    const id = await idVigente(); const h = await hashVigente()
    await sr(`insert into public.comision_aceptaciones (uid, texto_id, version, hash) values ('uid-1', '${id}', 'v1', '${h}')`)
    expect(await falla('service_role', `insert into public.comision_aceptaciones (uid, texto_id, version, hash) values ('uid-1', '${id}', 'v1', '${h}')`)).toMatch(/duplicate key|unique/i)
    await sr(`insert into public.comision_aceptaciones (uid, texto_id, version, hash) values ('uid-2', '${id}', 'v1', '${h}')`)
    expect((await sr('select count(*)::int as n from public.comision_aceptaciones'))[0]).toEqual({ n: 2 })
  })
  it('rechaza aceptar un texto que no es el vigente o con otro hash/versión', async () => {
    const id = await idVigente()
    const borrador = (await sr<{ id: string }>("select id from public.comision_textos where version='v2'"))[0].id
    expect(await falla('service_role', `insert into public.comision_aceptaciones (uid, texto_id, version, hash) values ('uid-3', '${borrador}', 'v2', '${sha('x')}')`)).toMatch(/texto vigente/)
    expect(await falla('service_role', `insert into public.comision_aceptaciones (uid, texto_id, version, hash) values ('uid-3', '${id}', 'v1', '${sha('otro')}')`)).toMatch(/otra versión/)
    expect(await falla('service_role', `insert into public.comision_aceptaciones (uid, texto_id, version, hash) values ('uid-3', '${id}', 'v1', 'no-es-hash')`)).toMatch(/otra versión|check/i)
  })
  it('una aceptación NO se edita ni se borra (es evidencia)', async () => {
    expect(await falla('service_role', "update public.comision_aceptaciones set uid='otro' where uid='uid-1'")).toMatch(/no se edita ni se borra/)
    expect(await falla('service_role', "delete from public.comision_aceptaciones where uid='uid-1'")).toMatch(/no se edita ni se borra/)
  })
  it('anon y authenticated NO leen ni escriben', async () => {
    for (const rol of ['anon', 'authenticated']) {
      for (const t of ['comision_textos', 'comision_aceptaciones']) expect(await falla(rol, `select * from public.${t}`), `${rol} lee ${t}`).toMatch(/permission denied/i)
      expect(await falla(rol, "insert into public.comision_aceptaciones (uid, texto_id, version, hash) values ('x', gen_random_uuid(), 'v', repeat('a',64))")).toMatch(/permission denied/i)
    }
  })
  it('la reversa quita las dos tablas y las funciones', async () => {
    await d.exec(sql('39-comision-textos-y-aceptaciones.REVERTIR.sql'))
    const t = (await d.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('comision_textos','comision_aceptaciones')")).rows[0]
    expect(t.n).toBe(0)
    const f = (await d.query<{ n: number }>("select count(*)::int as n from pg_proc where proname like 'comision_%'")).rows[0]
    expect(f.n).toBe(0)
  })
})
