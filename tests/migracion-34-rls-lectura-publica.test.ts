import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 34 (D-59) — la política RLS de lectura pública coincide con `esVisibleAlPublico`.
 * Contra Postgres real (PGlite): se parte de la política vigente en producción (`estado_pub = 'publicada'`, anon+authenticated).
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const sinComentarios = (n: string) => sql(n).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key, estado_pub text, estatus text);
  create table public.fotos (id serial primary key, propiedad_id text references public.propiedades(id));
  create table public.leads (id serial primary key, dato text);
  grant usage on schema public to anon, authenticated, service_role;
  grant select on all tables in schema public to anon, authenticated, service_role;
  alter table public.propiedades enable row level security;
  alter table public.fotos enable row level security;
  alter table public.leads enable row level security;
  create policy "propiedades_lectura_publica" on public.propiedades for select to anon, authenticated using (estado_pub = 'publicada');
  create policy "fotos_lectura_publica" on public.fotos for select to anon, authenticated using (
    exists (select 1 from propiedades p where p.id = fotos.propiedad_id and coalesce(p.estado_pub,'publicada') = 'publicada'));
  create policy "leads_otra" on public.leads for select to authenticated using (true);
  insert into public.leads (dato) values ('x');
`
// [id, estado_pub, estatus, ¿visible al público?]
const CASOS: Array<[string, string, string | null, boolean]> = [
  ['pub-disp', 'publicada', 'disponible', true],
  ['pub-vend', 'publicada', 'vendida', true],
  ['pub-rent', 'publicada', 'rentada', true],
  ['pub-nulo', 'publicada', null, true],
  ['pub-paus', 'publicada', 'pausada', false],
  ['pub-elim', 'publicada', 'eliminada', false],
  ['bor-disp', 'borrador', 'disponible', false],
  ['bor-paus', 'borrador', 'pausada', false],
  ['rev-disp', 'en_revision', 'disponible', false],
  ['cam-disp', 'cambios_solicitados', 'disponible', false],
  ['rec-disp', 'rechazada', 'disponible', false],
  ['bor-nulo', 'borrador', null, false],
]

let d: PGlite
async function como(rol: string, consulta: string) {
  await d.exec(`set role ${rol}`)
  try { return (await d.query<Record<string, unknown>>(consulta)).rows } finally { await d.exec('reset role') }
}
const ids = async (rol: string) => (await como(rol, 'select id from public.propiedades order by id')).map((r) => r.id as string).sort()
const esperadas = CASOS.filter((c) => c[3]).map((c) => c[0]).sort()
const todas = CASOS.map((c) => c[0]).sort()
const politicas = async () => (await d.query<{ policyname: string; roles: string; cmd: string; permissive: string; qual: string }>(
  `select policyname, roles::text, cmd, permissive, qual from pg_policies where schemaname='public' order by tablename, policyname`)).rows

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const [id, e, s] of CASOS) await d.query('insert into public.propiedades values ($1,$2,$3)', [id, e, s])
  for (const [id] of CASOS) await d.query('insert into public.fotos (propiedad_id) values ($1)', [id])
})
afterAll(async () => { await d.close() })

describe('migración 34 — antes (línea base de producción)', () => {
  it('con la política vieja, pausada y eliminada SÍ eran legibles (el hueco)', async () => {
    const v = await ids('anon')
    expect(v).toContain('pub-paus')
    expect(v).toContain('pub-elim')
  })
})

describe('migración 34 — después de aplicar', () => {
  let antes: Awaited<ReturnType<typeof politicas>>
  beforeAll(async () => { antes = await politicas(); await d.exec(sql('34-rls-lectura-publica-estatus.sql')) })

  it('anon lee exactamente lo visible: disponible, vendida, rentada y estatus NULL', async () => {
    expect(await ids('anon')).toEqual(esperadas)
  })
  it('publicada + pausada y publicada + eliminada → 0 filas', async () => {
    expect(await como('anon', `select id from public.propiedades where id in ('pub-paus','pub-elim')`)).toHaveLength(0)
  })
  it('borrador, en_revision, cambios_solicitados y rechazada → 0 filas, con cualquier estatus', async () => {
    expect(await como('anon', `select id from public.propiedades where estado_pub <> 'publicada'`)).toHaveLength(0)
  })
  it('authenticated con la clave de usuario ve lo mismo que anon (la política cubre ambos roles)', async () => {
    expect(await ids('authenticated')).toEqual(esperadas)
  })
  it('service_role (panel, publicador, portal, citas, búsquedas, rutas internas) sigue viendo TODO', async () => {
    expect(await ids('service_role')).toEqual(todas)
  })
  it('es la misma política (nombre, comando, roles, tipo); sólo cambió el USING; las demás intactas', async () => {
    const despues = await politicas()
    expect(despues.map((p) => p.policyname)).toEqual(antes.map((p) => p.policyname))
    const a = antes.find((p) => p.policyname === 'propiedades_lectura_publica')!
    const p = despues.find((x) => x.policyname === 'propiedades_lectura_publica')!
    expect({ ...p, qual: '' }).toEqual({ ...a, qual: '' })
    expect(p.qual).toMatch(/pausada/)
    expect(p.qual).toMatch(/eliminada/)
    for (const otra of ['fotos_lectura_publica', 'leads_otra']) {
      expect(despues.find((x) => x.policyname === otra)).toEqual(antes.find((x) => x.policyname === otra))
    }
  })
  it('otras tablas no se afectan (leads_otra sigue igual para authenticated)', async () => {
    expect(await como('authenticated', 'select dato from public.leads')).toHaveLength(1)
  })
  it('efecto colateral: las fotos de una propiedad pausada o en borrador dejan de ser públicas; las de las visibles siguen', async () => {
    const f = (await como('anon', 'select propiedad_id from public.fotos')).map((r) => r.propiedad_id as string).sort()
    expect(f).toEqual(esperadas)
  })
  it('es idempotente: aplicarla dos veces da el mismo resultado', async () => {
    await d.exec(sql('34-rls-lectura-publica-estatus.sql'))
    expect(await ids('anon')).toEqual(esperadas)
    expect((await politicas()).filter((p) => p.policyname === 'propiedades_lectura_publica')).toHaveLength(1)
  })
})

describe('migración 34 — reversa', () => {
  it('la reversa devuelve la definición anterior y no toca otras políticas', async () => {
    await d.exec(sql('34-rls-lectura-publica-estatus.REVERTIR.sql'))
    const v = await ids('anon')
    expect(v).toContain('pub-paus')
    expect(v).toContain('pub-elim')
    expect(v).not.toContain('bor-disp')
    expect((await politicas()).map((p) => p.policyname).sort()).toEqual(['fotos_lectura_publica', 'leads_otra', 'propiedades_lectura_publica'])
  })
  it('se puede volver a aplicar tras revertir', async () => {
    await d.exec(sql('34-rls-lectura-publica-estatus.sql'))
    expect(await ids('anon')).toEqual(esperadas)
  })
})

describe('migración 34 — falla cerrada y alcance del archivo', () => {
  it('si la política no existe, falla (no inventa una)', async () => {
    const x = new PGlite()
    await x.exec('create table public.propiedades (id text, estado_pub text, estatus text); alter table public.propiedades enable row level security;')
    await expect(x.exec(sql('34-rls-lectura-publica-estatus.sql'))).rejects.toThrow()
    await x.close()
  })
  it('el SQL contiene un solo ALTER POLICY sobre esa política (nada de DROP, GRANT, DELETE ni otras tablas)', () => {
    for (const f of ['34-rls-lectura-publica-estatus.sql', '34-rls-lectura-publica-estatus.REVERTIR.sql']) {
      const limpio = sinComentarios(f)
      expect(limpio.match(/alter policy/gi)).toHaveLength(1)
      expect(limpio).toContain('"propiedades_lectura_publica" on public.propiedades')
      expect(limpio).not.toMatch(/drop |grant |revoke |delete |insert |update |create /i)
    }
  })
  it('la lista SQL vigente (la de la migración 51, que amplía la de la 34) y la de la aplicación son la misma', async () => {
    const { ESTATUS_OCULTOS_AL_PUBLICO } = await import('../src/lib/visibilidad-publica')
    const lista = (n: string) => sinComentarios(n).match(/not in \(([^)]*)\)/)![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(lista('51-rls-lectura-publica-cerradas.sql')).toEqual([...ESTATUS_OCULTOS_AL_PUBLICO])
    // la 34 sigue siendo un subconjunto: la 51 solo agrega, no quita
    for (const e of lista('34-rls-lectura-publica-estatus.sql')) expect(lista('51-rls-lectura-publica-cerradas.sql')).toContain(e)
  })
})
