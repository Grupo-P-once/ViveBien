import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 44 (aceptación de Términos y Aviso de Privacidad) contra Postgres real (PGlite): solo el servidor la toca, solo se agrega,
 * una persona acepta cada versión de cada documento una vez, y la reversa la quita.
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
`
async function como<T = Record<string, unknown>>(rol: string, consulta: string): Promise<T[]> {
  await d.exec(`set role ${rol}`)
  try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') }
}
const falla = (rol: string, consulta: string) => como(rol, consulta).then(() => null, (e: Error) => e.message)

beforeAll(async () => { d = new PGlite(); await d.exec(BASE); await d.exec(sql('44-aceptaciones-legales.sql')) })
afterAll(async () => { await d.close() })

describe('migración 44 — aceptaciones legales', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('44-aceptaciones-legales.sql')) })
  it('anon y authenticated no leen ni escriben', async () => {
    for (const rol of ['anon', 'authenticated']) {
      expect(await falla(rol, 'select * from public.legal_aceptaciones')).toMatch(/permission denied/)
      expect(await falla(rol, "insert into public.legal_aceptaciones (uid, documento, version) values ('abc', 'terminos', '2026-04-06')")).toMatch(/permission denied/)
    }
  })
  it('el servidor agrega una aceptación por documento y versión; repetirla falla (el servidor la trata como idempotente)', async () => {
    await como('service_role', "insert into public.legal_aceptaciones (uid, documento, version, agente) values ('uid-1', 'terminos', '2026-04-06', 'Chrome')")
    await como('service_role', "insert into public.legal_aceptaciones (uid, documento, version) values ('uid-1', 'privacidad', '2026-09-11')")
    expect(await falla('service_role', "insert into public.legal_aceptaciones (uid, documento, version) values ('uid-1', 'terminos', '2026-04-06')")).toMatch(/unique|duplicate/)
    await como('service_role', "insert into public.legal_aceptaciones (uid, documento, version) values ('uid-1', 'terminos', '2026-11-01')")
    expect(Number((await como<{ n: string }>('service_role', "select count(*) n from public.legal_aceptaciones where uid = 'uid-1'"))[0].n)).toBe(3)
  })
  it('solo documentos conocidos, versión con forma de fecha y uid razonable', async () => {
    expect(await falla('service_role', "insert into public.legal_aceptaciones (uid, documento, version) values ('uid-2', 'contrato', '2026-04-06')")).toMatch(/check/)
    expect(await falla('service_role', "insert into public.legal_aceptaciones (uid, documento, version) values ('uid-2', 'terminos', 'abril')")).toMatch(/check/)
    expect(await falla('service_role', "insert into public.legal_aceptaciones (uid, documento, version) values ('x', 'terminos', '2026-04-06')")).toMatch(/check/)
  })
  it('solo se agrega: el servidor no tiene permiso de editar ni de borrar, y el disparador lo impide aunque lo tuviera', async () => {
    expect(await falla('service_role', "update public.legal_aceptaciones set version = '2026-01-01' where uid = 'uid-1'")).toMatch(/permission denied/)
    expect(await falla('service_role', "delete from public.legal_aceptaciones where uid = 'uid-1'")).toMatch(/permission denied/)
    // Como dueño de la tabla (sin restricción de permisos) el disparador sigue impidiéndolo:
    await expect(d.exec("update public.legal_aceptaciones set version = '2026-01-01' where uid = 'uid-1'")).rejects.toThrow(/no se edita ni se borra/)
    await expect(d.exec("delete from public.legal_aceptaciones where uid = 'uid-1'")).rejects.toThrow(/no se edita ni se borra/)
  })
  it('la reversa quita la tabla', async () => {
    await d.exec(sql('44-aceptaciones-legales.REVERTIR.sql'))
    const t = (await d.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_name = 'legal_aceptaciones'")).rows
    expect(t).toEqual([])
  })
})
