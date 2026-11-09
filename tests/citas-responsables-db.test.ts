import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

/**
 * Migración 76 (asignar al responsable de citas) contra un Postgres real (PGlite): las dos funciones atómicas y auditadas que usa `/admin/citas/responsables`.
 * Se aplica sobre 15 + 70 + 72 + 73 (el esquema de citas) con los permisos por omisión de Supabase para poder comprobar los REVOKE.
 */
let db: PGlite

const audit = (o: Record<string, unknown> = {}) => JSON.stringify({
  actor_uid: 'admin-x', actor_email: 'admin@ejemplo.invalid', actor_rol: 'admin', accion: 'citas.responsable_propiedad',
  antes: { responsable: null }, despues: { responsable: 'ase', motivo: 'El asociado atiende las visitas de esta nave' }, ...o,
})
const asignar = async (propiedad: string, antes: string | null, a: string | null, au = audit()) =>
  (await db.query<{ r: { resultado: string } }>('select public.citas_asignar_responsable_propiedad($1, $2, $3, $4::jsonb) as r', [propiedad, antes, a, au])).rows[0].r.resultado
const equipo = async (antes: string | null, a: string | null, au = audit({ accion: 'citas.responsable_equipo' })) =>
  (await db.query<{ r: { resultado: string } }>('select public.citas_asignar_responsable_equipo($1, $2, $3::jsonb) as r', [antes, a, au])).rows[0].r.resultado
const responsableDe = async (p: string) => (await db.query<{ r: string | null }>('select responsable_citas_uid as r from public.propiedades where id = $1', [p])).rows[0].r
const auditorias = async () => (await db.query<{ n: string }>('select count(*) as n from public.audit_logs')).rows[0].n

beforeAll(async () => {
  db = await PGlite.create({ extensions: { btree_gist, pgcrypto } })
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create table public.usuarios (uid text primary key, nombre text, rol text, estado text not null default 'activo');
    create table public.propiedades (id text primary key, titulo text);
    insert into public.usuarios values ('cli', 'Cliente', 'cliente', 'activo'), ('ase', 'Asociado', 'publicador', 'activo'), ('adm2', 'Otro admin', 'admin', 'activo'),
                                       ('admin-x', 'Admin', 'admin', 'activo'), ('susp', 'Suspendido', 'publicador', 'suspendido');
    insert into public.propiedades values ('p1', 'Nave'), ('p2', 'Casa');
    create schema vault;
    create table vault.decrypted_secrets (name text, decrypted_secret text);
    create table public.audit_logs (id bigint generated always as identity primary key, actor_uid text not null, actor_email text, actor_rol text, accion text not null, entidad text not null, entidad_id text, antes jsonb, despues jsonb, creado_en timestamptz not null default now());
  `)
  for (const m of ['19-configuracion.sql', '15-citas.sql', '70-citas-v2.sql', '72-citas-tareas-firma.sql', '73-citas-guardar-agenda.sql', '76-citas-responsables.sql']) {
    await db.exec(readFileSync(path.join(process.cwd(), 'supabase', m), 'utf8'))
  }
}, 90_000)

afterAll(async () => { await db?.close() })

describe('responsable de UNA propiedad', () => {
  it('asigna, cambia el responsable y deja la bitácora en la misma operación', async () => {
    expect(await asignar('p1', null, 'ase')).toBe('ok')
    expect(await responsableDe('p1')).toBe('ase')
    const fila = (await db.query<{ accion: string; entidad: string; entidad_id: string; actor_uid: string; despues: { motivo: string } }>(
      `select accion, entidad, entidad_id, actor_uid, despues from public.audit_logs order by id desc limit 1`)).rows[0]
    expect(fila).toMatchObject({ accion: 'citas.responsable_propiedad', entidad: 'propiedad', entidad_id: 'p1', actor_uid: 'admin-x' })
    expect(fila.despues.motivo.length).toBeGreaterThanOrEqual(10)
  })
  it('si la pantalla vio un «antes» que ya cambió: conflicto, no se escribe nada y no queda bitácora', async () => {
    const antes = await auditorias()
    expect(await asignar('p1', null, 'adm2')).toBe('conflicto') // ya lo tiene «ase»
    expect(await responsableDe('p1')).toBe('ase')
    expect(await auditorias()).toBe(antes)
  })
  it('quitar al responsable (a = null) con el «antes» correcto', async () => {
    expect(await asignar('p1', 'ase', null, audit({ antes: { responsable: 'ase' }, despues: { responsable: null, motivo: 'Vuelve a atenderla el responsable del equipo' } }))).toBe('ok')
    expect(await responsableDe('p1')).toBeNull()
  })
  it('una propiedad que no existe: no_existe', async () => {
    expect(await asignar('no-hay', null, 'ase')).toBe('no_existe')
  })
  it('una cuenta que no existe o no está activa no puede ser responsable: responsable_invalido y nada cambia', async () => {
    expect(await asignar('p2', null, 'fantasma')).toBe('responsable_invalido')
    expect(await asignar('p2', null, 'susp')).toBe('responsable_invalido')
    expect(await responsableDe('p2')).toBeNull()
  })
  it('un cambio que no cambia nada, o sin propiedad, se rechaza (22023)', async () => {
    await expect(asignar('p2', null, null)).rejects.toThrow(/cambio_invalido/)
    await expect(asignar('', null, 'ase')).rejects.toThrow(/cambio_invalido/)
  })
  it('sin la huella completa NO se hace el cambio: sin actor, sin acción, antes/después que no son objetos o un motivo de menos de 10 caracteres', async () => {
    const malas = [
      audit({ actor_uid: '' }), audit({ accion: '   ' }), audit({ antes: 'x' }), audit({ despues: null }),
      audit({ despues: { responsable: 'ase', motivo: 'corto' } }), audit({ despues: { responsable: 'ase' } }), '"texto"',
    ]
    for (const m of malas) await expect(asignar('p2', null, 'ase', m), m).rejects.toThrow(/auditoria_incompleta/)
    expect(await responsableDe('p2')).toBeNull()
  })
})

describe('responsable del EQUIPO (configuracion.citas)', () => {
  const valor = async () => (await db.query<{ v: Record<string, unknown>; version: number }>(`select valor as v, version from public.configuracion where clave = 'citas'`)).rows[0]
  it('la primera asignación CREA la fila `citas` (no existía) y deja la bitácora', async () => {
    expect((await db.query(`select 1 from public.configuracion where clave = 'citas'`)).rows).toHaveLength(0)
    expect(await equipo(null, 'admin-x', audit({ accion: 'citas.responsable_equipo', despues: { responsable: 'admin-x', motivo: 'Es quien coordina las visitas del equipo' } }))).toBe('ok')
    expect((await valor()).v).toEqual({ responsable_equipo_uid: 'admin-x' })
    const fila = (await db.query<{ entidad: string; entidad_id: string }>(`select entidad, entidad_id from public.audit_logs order by id desc limit 1`)).rows[0]
    expect(fila).toEqual({ entidad: 'configuracion', entidad_id: 'citas' })
  })
  it('cambiar con el «antes» correcto sube la versión; con uno viejo: conflicto', async () => {
    const v0 = (await valor()).version
    expect(await equipo('admin-x', 'adm2')).toBe('ok')
    expect((await valor()).v).toEqual({ responsable_equipo_uid: 'adm2' })
    expect((await valor()).version).toBe(v0 + 1)
    expect(await equipo('admin-x', 'ase')).toBe('conflicto')
  })
  it('una cuenta inexistente o suspendida no puede ser responsable del equipo', async () => {
    expect(await equipo('adm2', 'susp')).toBe('responsable_invalido')
    expect(await equipo('adm2', 'fantasma')).toBe('responsable_invalido')
    expect((await valor()).v).toEqual({ responsable_equipo_uid: 'adm2' })
  })
  it('quitarlo borra la clave y conserva el resto del JSON', async () => {
    await db.exec(`update public.configuracion set valor = valor || '{"otra": 1}'::jsonb where clave = 'citas'`)
    expect(await equipo('adm2', null)).toBe('ok')
    expect((await valor()).v).toEqual({ otra: 1 })
  })
  it('sin la huella completa no se cambia nada', async () => {
    await expect(equipo(null, 'admin-x', audit({ despues: { responsable: 'admin-x', motivo: 'corto' } }))).rejects.toThrow(/auditoria_incompleta/)
    await expect(equipo(null, null)).rejects.toThrow(/cambio_invalido/)
  })
})

describe('permisos: solo service_role ejecuta las dos funciones', () => {
  it.each([
    'public.citas_asignar_responsable_propiedad(text, text, text, jsonb)',
    'public.citas_asignar_responsable_equipo(text, text, jsonb)',
  ])('%s', async (fn) => {
    const puede = async (rol: string) => (await db.query<{ ok: boolean }>(`select has_function_privilege('${rol}', '${fn}', 'EXECUTE') as ok`)).rows[0].ok
    expect(await puede('anon'), 'anon').toBe(false)
    expect(await puede('authenticated'), 'authenticated').toBe(false)
    expect(await puede('service_role'), 'service_role').toBe(true)
  })
  it('en la práctica: anon y authenticated reciben «permission denied»', async () => {
    for (const rol of ['anon', 'authenticated']) {
      await db.exec(`set role ${rol}`)
      try { await expect(asignar('p2', null, 'ase')).rejects.toThrow(/permission denied/i) } finally { await db.exec('reset role') }
    }
  })
})
