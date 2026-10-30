import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 51: lo vendido y lo rentado ya no se lee con la clave anónima (segunda barrera, igual que la aplicación). Contra Postgres real (PGlite), partiendo de la política vigente en producción (migración 34). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key, estado_pub text, estatus text);
  create table public.fotos (id serial primary key, propiedad_id text references public.propiedades(id));
  grant usage on schema public to anon, authenticated, service_role;
  grant select on all tables in schema public to anon, authenticated, service_role;
  alter table public.propiedades enable row level security;
  alter table public.fotos enable row level security;
  create policy "propiedades_lectura_publica" on public.propiedades for select to anon, authenticated using (
    estado_pub = 'publicada' and coalesce(estatus, 'disponible') not in ('pausada', 'eliminada'));
  create policy "fotos_lectura_publica" on public.fotos for select to anon, authenticated using (
    exists (select 1 from propiedades p where p.id = fotos.propiedad_id and coalesce(p.estado_pub,'publicada') = 'publicada'));
`
const CASOS: Array<[string, string, string | null, boolean]> = [
  ['disp', 'publicada', 'disponible', true], ['nulo', 'publicada', null, true],
  ['vend', 'publicada', 'vendida', false], ['rent', 'publicada', 'rentada', false],
  ['paus', 'publicada', 'pausada', false], ['elim', 'publicada', 'eliminada', false],
  ['borr', 'borrador', 'disponible', false], ['borr-rent', 'borrador', 'rentada', false],
]
let d: PGlite
async function como(rol: string, consulta: string) {
  await d.exec(`set role ${rol}`)
  try { return (await d.query<Record<string, unknown>>(consulta)).rows } finally { await d.exec('reset role') }
}
beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const [id, e, s] of CASOS) { await d.query('insert into public.propiedades values ($1,$2,$3)', [id, e, s]); await d.query('insert into public.fotos (propiedad_id) values ($1)', [id]) }
})
afterAll(async () => { await d.close() })

describe('migración 51 — lo cerrado no se lee en público', () => {
  it('antes: la política vigente sí dejaba leer lo vendido y lo rentado (el hueco)', async () => {
    const v = (await como('anon', 'select id from public.propiedades')).map((r) => r.id)
    expect(v).toContain('vend'); expect(v).toContain('rent')
  })
  it('después: anon y authenticated leen solo lo disponible (y estatus nulo); service_role lo ve todo', async () => {
    await d.exec(sql('51-rls-lectura-publica-cerradas.sql'))
    const esperadas = CASOS.filter((c) => c[3]).map((c) => c[0]).sort()
    for (const rol of ['anon', 'authenticated']) expect((await como(rol, 'select id from public.propiedades')).map((r) => r.id as string).sort(), rol).toEqual(esperadas)
    expect((await como('service_role', 'select id from public.propiedades')).length).toBe(CASOS.length)
  })
  it('las fotos de lo cerrado tampoco se sirven (efecto colateral buscado) y la política conserva nombre, roles y comando', async () => {
    const fotos = (await como('anon', 'select propiedad_id from public.fotos')).map((r) => r.propiedad_id as string).sort()
    // las fotos solo miran estado_pub: este es el comportamiento vigente de `fotos_lectura_publica` (consulta propiedades con los permisos de quien lee)
    expect(fotos).toEqual(['disp', 'nulo'])
    const p = (await d.query<{ roles: string; cmd: string; permissive: string }>(`select roles::text, cmd, permissive from pg_policies where policyname='propiedades_lectura_publica'`)).rows
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ cmd: 'SELECT', permissive: 'PERMISSIVE' })
    expect(p[0].roles).toMatch(/anon/); expect(p[0].roles).toMatch(/authenticated/)
  })
  it('se puede correr dos veces y la reversa vuelve a la regla de la migración 34', async () => {
    await d.exec(sql('51-rls-lectura-publica-cerradas.sql'))
    await d.exec(sql('51-rls-lectura-publica-cerradas.REVERTIR.sql'))
    const v = (await como('anon', 'select id from public.propiedades')).map((r) => r.id)
    expect(v).toContain('vend'); expect(v).not.toContain('paus')
    await d.exec(sql('51-rls-lectura-publica-cerradas.sql'))
  })
})
