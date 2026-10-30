import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 57: `propiedad_origen.colaborador_id` (opcional, FK al directorio). Contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1'), ('p2');
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
`
const MIGRACIONES = ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql', '46-comision-fecha-de-cierre.sql', '47-comision-ajustes-y-gastos.sql', '48-contabilidad-comisiones.sql', '53-contabilidad-aportaciones-al-grupo.sql', '55-colaboradores-externas-y-constancias.sql', '57-propiedad-origen-colaborador.sql']
let d: PGlite
const q = async <T = Record<string, unknown>>(consulta: string): Promise<T[]> => { await d.exec('set role service_role'); try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') } }

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of MIGRACIONES) await d.exec(sql(f))
  await q(`insert into public.propiedad_origen (propiedad_id, origen_tipo, creado_por, actualizado_por) values ('p1', 'trato_directo', 'a@b.mx', 'a@b.mx'), ('p2', 'inmobiliaria', 'a@b.mx', 'a@b.mx')`)
  await q(`insert into public.colaboradores (id, tipo, nombre, creado_por) values ('11111111-1111-4111-8111-111111111111', 'agente', 'Laura Mendoza', 'a@b.mx')`)
})
afterAll(async () => { await d.close() })

describe('migración 57 — colaborador ligado al origen de una propiedad', () => {
  it('se puede correr dos veces y las filas existentes quedan sin colaborador', async () => {
    await d.exec(sql('57-propiedad-origen-colaborador.sql'))
    const filas = await q<{ colaborador_id: string | null }>(`select colaborador_id from public.propiedad_origen`)
    expect(filas.every((f) => f.colaborador_id === null)).toBe(true)
  })
  it('se puede ligar un colaborador del directorio y quitarlo', async () => {
    await q(`update public.propiedad_origen set colaborador_id = '11111111-1111-4111-8111-111111111111' where propiedad_id = 'p1'`)
    expect((await q<{ colaborador_id: string }>(`select colaborador_id from public.propiedad_origen where propiedad_id = 'p1'`))[0].colaborador_id).toBe('11111111-1111-4111-8111-111111111111')
    await q(`update public.propiedad_origen set colaborador_id = null where propiedad_id = 'p1'`)
    expect((await q<{ colaborador_id: string | null }>(`select colaborador_id from public.propiedad_origen where propiedad_id = 'p1'`))[0].colaborador_id).toBeNull()
  })
  it('un colaborador que no existe no se puede ligar (llave foránea)', async () => {
    await expect(q(`update public.propiedad_origen set colaborador_id = '99999999-9999-4999-8999-999999999999' where propiedad_id = 'p2'`)).rejects.toThrow()
  })
  it('un colaborador ligado no se puede borrar (de todos modos no se borran: se desactivan)', async () => {
    await q(`update public.propiedad_origen set colaborador_id = '11111111-1111-4111-8111-111111111111' where propiedad_id = 'p2'`)
    await expect(q(`delete from public.colaboradores where id = '11111111-1111-4111-8111-111111111111'`)).rejects.toThrow()
  })
  it('la reversa quita la columna sin tocar los colaboradores ni el origen', async () => {
    await d.exec(sql('57-propiedad-origen-colaborador.REVERTIR.sql'))
    const col = await q<{ n: string }>(`select count(*) n from information_schema.columns where table_name = 'propiedad_origen' and column_name = 'colaborador_id'`)
    expect(Number(col[0].n)).toBe(0)
    expect(Number((await q<{ n: string }>(`select count(*) n from public.colaboradores`))[0].n)).toBe(1)
    expect(Number((await q<{ n: string }>(`select count(*) n from public.propiedad_origen`))[0].n)).toBe(2)
  })
})
