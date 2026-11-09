import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

/**
 * Permisos de las migraciones de Citas (15, 70, 72, 73) contra un Postgres real (PGlite), SIN depender de la base compartida de citas-db.test.ts.
 *
 * Por qué una base aparte: en Supabase las tablas y funciones nuevas de `public` nacen con permisos para `anon` y `authenticated` (default privileges),
 * y por eso cada migración los REVOCA. En el PGlite pelado esos permisos no existen, así que una prueba sobre él pasaría aunque faltara un REVOKE. Aquí
 * se imitan primero los permisos por omisión de Supabase; si una migración deja de revocar, esta prueba falla.
 * `service_role` se crea con BYPASSRLS, como en Supabase.
 */
let db: PGlite

const TABLAS = [
  'citas', 'citas_eventos', 'citas_tokens', 'citas_correos', 'citas_recordatorios', 'citas_tarea_firmas',
  'ajustes_citas', 'bloqueos_asesores', 'disponibilidad_asesores', 'calendarios_google', 'google_oauth_estados',
]
const FUNCIONES_SOLO_SERVICE_ROLE = [
  'public.cita_crear(jsonb)',
  'public.cita_transicionar(uuid, integer, text, text, text, text, jsonb)',
  'public.cita_programar_recordatorios(public.citas)',
  'public.citas_recordatorios_reclamar(integer)',
  'public.citas_recordatorio_marcar(bigint, boolean, text)',
  'public.citas_tarea_firma_valida(bigint, text)',
  'public.citas_guardar_agenda(text, text, text, text, jsonb, jsonb, jsonb)',
]

const puedeFuncion = async (rol: string, fn: string) =>
  (await db.query<{ ok: boolean }>(`select has_function_privilege('${rol}', '${fn}', 'EXECUTE') as ok`)).rows[0].ok

/** Cuántas filas ve un rol en una tabla, o «denegado» si la base le niega el permiso. */
async function filasComo(rol: string, tabla: string): Promise<number | 'denegado'> {
  await db.exec(`set role ${rol}`)
  try {
    return Number((await db.query<{ n: string }>(`select count(*) as n from public.${tabla}`)).rows[0].n)
  } catch {
    return 'denegado'
  } finally {
    await db.exec('reset role')
  }
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { btree_gist, pgcrypto } })
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    -- Los permisos por omisión de Supabase para lo que se cree en public (lo que las migraciones tienen que revocar):
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create table public.usuarios (uid text primary key, nombre text, rol text);
    create table public.propiedades (id text primary key, titulo text);
    insert into public.usuarios values ('cli', 'Cliente', 'cliente'), ('ase', 'Asesor', 'publicador');
    insert into public.propiedades values ('p1', 'Nave');
    create schema vault;
    create table vault.decrypted_secrets (name text, decrypted_secret text);
    create table public.audit_logs (id bigint generated always as identity primary key, actor_uid text not null, actor_email text, actor_rol text, accion text not null, entidad text not null, entidad_id text, antes jsonb, despues jsonb, creado_en timestamptz not null default now());
  `)
  for (const m of ['15-citas.sql', '70-citas-v2.sql', '72-citas-tareas-firma.sql', '73-citas-guardar-agenda.sql']) {
    await db.exec(readFileSync(path.join(process.cwd(), 'supabase', m), 'utf8'))
  }
  // Una cita real para comprobar qué ve cada rol (la crea el único que puede: service_role/superusuario).
  await db.query('select * from cita_crear($1::jsonb)', [JSON.stringify({
    propiedad_id: 'p1', cliente_uid: 'cli', asesor_uid: 'ase', estado: 'REQUESTED', cliente_nombre: 'Cliente de prueba', cliente_telefono: '+524771234567',
    consentimiento_version: 'prueba', creada_por: 'cli', actor_rol: 'cliente', margen_min: 15,
    inicio: '2031-02-03T16:00:00Z', fin: '2031-02-03T17:00:00Z', clave_idempotencia: 'permisos-0001',
  })])
}, 90_000)

afterAll(async () => { await db?.close() })

describe('funciones de Citas: solo service_role las ejecuta', () => {
  it.each(FUNCIONES_SOLO_SERVICE_ROLE)('%s', async (fn) => {
    expect(await puedeFuncion('anon', fn), 'anon').toBe(false)
    expect(await puedeFuncion('authenticated', fn), 'authenticated').toBe(false)
    expect(await puedeFuncion('service_role', fn), 'service_role').toBe(true)
  })

  it('`citas_tarea_invocar` (la que dispara el cron) no la ejecuta nadie más que el dueño: ni anon, ni authenticated, ni service_role', async () => {
    const fn = 'public.citas_tarea_invocar()'
    for (const rol of ['anon', 'authenticated', 'service_role']) expect(await puedeFuncion(rol, fn), rol).toBe(false)
  })

  it('en la práctica: anon y authenticated reciben «permission denied» al llamar a cita_crear / cita_transicionar, y service_role no', async () => {
    for (const rol of ['anon', 'authenticated']) {
      await db.exec(`set role ${rol}`)
      try {
        await expect(db.query(`select * from cita_crear('{}'::jsonb)`)).rejects.toThrow(/permission denied/i)
        await expect(db.query(`select * from cita_transicionar('00000000-0000-0000-0000-000000000000', 1, 'cancelar', null, 'cliente', 'panel', '{}'::jsonb)`)).rejects.toThrow(/permission denied/i)
      } finally { await db.exec('reset role') }
    }
  })
})

describe('tablas de Citas: cerradas para anon y authenticated', () => {
  it.each(TABLAS)('%s: RLS activo y ninguna política abierta a anon/authenticated', async (t) => {
    const rls = await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where oid = 'public.${t}'::regclass`)
    expect(rls.rows[0].relrowsecurity, 'RLS').toBe(true)
    const pol = await db.query<{ n: string }>(`select count(*) as n from pg_policies where schemaname = 'public' and tablename = '${t}' and (roles && array['anon','authenticated','public']::name[])`)
    expect(Number(pol.rows[0].n), 'políticas para anon/authenticated/public').toBe(0)
  })

  it.each(TABLAS)('%s: anon y authenticated no tienen NINGÚN privilegio de tabla (segunda capa, además de RLS)', async (t) => {
    for (const rol of ['anon', 'authenticated']) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const r = await db.query<{ ok: boolean }>(`select has_table_privilege('${rol}', 'public.${t}', '${p}') as ok`)
        expect(r.rows[0].ok, `${rol} ${p} en ${t}`).toBe(false)
      }
    }
  })

  it('con una cita real guardada: anon y authenticated no ven NI UNA fila de citas ni de su historial; service_role sí', async () => {
    for (const t of ['citas', 'citas_eventos']) {
      expect(await filasComo('service_role', t), `service_role · ${t}`).toBeGreaterThan(0)
      for (const rol of ['anon', 'authenticated']) {
        const v = await filasComo(rol, t)
        expect(v === 'denegado' || v === 0, `${rol} · ${t} = ${v}`).toBe(true)
      }
    }
  })

  it('anon y authenticated no pueden escribir en citas (insert/update/delete)', async () => {
    // «Cerrado» = la base lo niega, o lo acepta sin tocar ninguna fila (RLS sin políticas). Nunca cambiar algo.
    const escribir = async (rol: string, sql: string): Promise<number | 'denegado'> => {
      await db.exec(`set role ${rol}`)
      try { return (await db.query(sql)).affectedRows ?? 0 } catch { return 'denegado' } finally { await db.exec('reset role') }
    }
    for (const rol of ['anon', 'authenticated']) {
      for (const sql of [`update public.citas set estado = 'CONFIRMED'`, `delete from public.citas`]) {
        const r = await escribir(rol, sql)
        expect(r === 'denegado' || r === 0, `${rol} · ${sql} = ${r}`).toBe(true)
      }
    }
    const intacta = await db.query<{ estado: string }>('select estado from public.citas')
    expect(intacta.rows.every((f) => f.estado === 'REQUESTED')).toBe(true)
  })
})
