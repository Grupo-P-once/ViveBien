import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 45: los registros «solo se agrega» tampoco se pueden vaciar. Se reproduce el comportamiento de Supabase, que concede a service_role
 * TODOS los permisos de cada tabla nueva (el hallazgo del 25-oct-2026 en producción), y se comprueba contra Postgres real (PGlite).
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1');
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
`
const falla = async (consulta: string, rol = 'service_role') => {
  await d.exec(`set role ${rol}`)
  try { await d.exec(consulta); return null } catch (e) { return (e as Error).message } finally { await d.exec('reset role') }
}
const filas = async (t: string) => Number((await d.query<{ n: string }>(`select count(*) n from public.${t}`)).rows[0].n)

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '39-comision-textos-y-aceptaciones.sql', '43-origen-acreditacion-y-operaciones.sql', '44-aceptaciones-legales.sql']) await d.exec(sql(f))
  await d.exec("insert into public.legal_aceptaciones (uid, documento, version) values ('uid-1', 'terminos', '2026-04-06')")
})
afterAll(async () => { await d.close() })

describe('antes de la 45 (como quedó en producción): service_role podía vaciar el registro', () => {
  it('TRUNCATE de legal_aceptaciones pasaba', async () => {
    expect(await falla('truncate public.legal_aceptaciones')).toBeNull()
    expect(await filas('legal_aceptaciones')).toBe(0)
    await d.exec("insert into public.legal_aceptaciones (uid, documento, version) values ('uid-1', 'terminos', '2026-04-06')")
  })
})

describe('migración 45', () => {
  beforeAll(async () => { await d.exec(sql('45-registros-solo-agregar.sql')) })
  it('se puede correr dos veces', async () => { await d.exec(sql('45-registros-solo-agregar.sql')) })
  it('ninguna de las cuatro tablas se puede vaciar, ni con el permiso original (dueño)', async () => {
    for (const t of ['legal_aceptaciones', 'comision_aceptaciones', 'comision_operaciones', 'comision_textos']) {
      expect(await falla(`truncate public.${t}`)).toMatch(/permission denied|solo se agrega: no se vacía/)
      await expect(d.exec(`truncate public.${t}`)).rejects.toThrow(/solo se agrega: no se vacía|cannot truncate a table referenced/)
    }
    expect(await filas('legal_aceptaciones')).toBe(1)
  })
  it('en las aceptaciones service_role solo conserva SELECT e INSERT', async () => {
    for (const t of ['legal_aceptaciones', 'comision_aceptaciones']) {
      const p = (await d.query<{ privilege_type: string }>(`select privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='${t}' and grantee='service_role' order by 1`)).rows.map((r) => r.privilege_type)
      expect(p).toEqual(['INSERT', 'SELECT'])
    }
    expect(await falla("update public.legal_aceptaciones set version = '2026-01-01'")).toMatch(/permission denied/)
    expect(await falla("delete from public.legal_aceptaciones")).toMatch(/permission denied/)
  })
  it('en operaciones y textos sigue pudiendo leer, insertar y actualizar (lo que usan las funciones) pero no borrar ni vaciar', async () => {
    for (const t of ['comision_operaciones', 'comision_textos']) {
      const p = (await d.query<{ privilege_type: string }>(`select privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='${t}' and grantee='service_role'`)).rows.map((r) => r.privilege_type)
      expect(p).toEqual(expect.arrayContaining(['SELECT', 'INSERT', 'UPDATE']))
      expect(p).not.toContain('TRUNCATE')
    }
    const o = (await d.query<{ privilege_type: string }>("select privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='comision_operaciones' and grantee='service_role'")).rows.map((r) => r.privilege_type)
    expect(o).not.toContain('DELETE')
  })
  it('las funciones de comisión siguen funcionando como service_role (registrar y cambiar estado)', async () => {
    const audit = JSON.stringify({ actor_uid: 'u-admin', actor_email: 'admin@vb.mx', actor_rol: 'admin', accion: 'x', antes: {}, despues: {} })
    await d.exec('set role service_role')
    try {
      const r = (await d.query<{ r: { resultado: string; id: string } }>(`select public.comision_operacion_registrar('{"propiedad_id":"p1","tipo":"renta","base_centavos":100000,"regla_version":"v","total_centavos":100000,"vivebien_centavos":100000,"colaborador_centavos":0,"colaborador_retenido_centavos":0,"reparto_estado":"no_aplica","retencion":"sin_colaborador","atribuible":false,"clave_idempotencia":"op-45-prueba-1","creado_por":"asesor@vb.mx"}'::jsonb, '${audit}'::jsonb) as r`)).rows[0].r
      expect(r.resultado).toBe('ok')
      const c = (await d.query<{ r: { resultado: string } }>(`select public.comision_operacion_cambiar_estado('${r.id}', 'registrada', 'anulada', 'Prueba de la migración 45', '${audit}'::jsonb) as r`)).rows[0].r
      expect(c.resultado).toBe('ok')
    } finally { await d.exec('reset role') }
  })
  it('la reversa quita los disparadores y devuelve los permisos', async () => {
    await d.exec(sql('45-registros-solo-agregar.REVERTIR.sql'))
    expect(await falla('truncate public.legal_aceptaciones')).toBeNull()
  })
})
