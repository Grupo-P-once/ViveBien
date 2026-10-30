import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 28 — modalidad, overrides y la función transaccional
 * `usuario_cambiar_permisos` (hallazgo L2 de la fase ADMIN).
 *
 * En PGlite, en memoria. Lo que se demuestra en una base de verdad:
 *   · la migración aplica, se reaplica y se revierte;
 *   · el cambio y su bitácora son UNA transacción: si falla la bitácora (o un
 *     CHECK), NO queda el cambio;
 *   · si alguien cambió la cuenta desde que se leyó, la función lo detecta
 *     (`conflicto`) y no pisa nada;
 *   · sólo el servidor puede ejecutarla.
 */

const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const ROLES = 'create role anon; create role authenticated; create role service_role;'

// Lo mínimo del esquema real que la función toca (03-publicacion.sql y las tablas de usuarios).
const BASE = `
  create table public.usuarios (uid text primary key, rol text not null default 'cliente', estado text not null default 'activo', email text);
  create table public.audit_logs (
    id bigint generated always as identity primary key,
    actor_uid text not null, actor_email text, actor_rol text,
    accion text not null, entidad text not null, entidad_id text,
    antes jsonb, despues jsonb, creado_en timestamptz not null default now()
  );
`

let db: PGlite

async function nueva(): Promise<PGlite> {
  const d = new PGlite()
  await d.exec(ROLES)
  await d.exec(BASE)
  await d.exec(`insert into public.usuarios (uid, rol, email) values
    ('P1','publicador','p1@x.test'), ('C1','cliente','c1@x.test'), ('A1','admin','a1@x.test')`)
  await d.exec(sql('28-publicador-modalidad.sql'))
  return d
}

const AUDIT = (extra: Record<string, unknown> = {}) => JSON.stringify({
  actor_uid: 'ADM', actor_email: 'adm@x.test', actor_rol: 'admin', accion: 'usuario.editar',
  antes: { tipo_publicador: 'publicador', permisos_override: {} },
  despues: { tipo_publicador: 'asociado', permisos_override: {}, motivo: 'Alta como asociado según acuerdo' },
  ...extra,
})

async function llamar(d: PGlite, o: { uid?: string; antesTipo?: string | null; antesOv?: unknown; tipo?: string; ov?: unknown; audit?: string } = {}) {
  const r = await d.query<{ r: { resultado: string } }>(
    `select public.usuario_cambiar_permisos($1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb) as r`,
    [o.uid ?? 'P1', o.antesTipo === undefined ? 'publicador' : o.antesTipo, JSON.stringify(o.antesOv ?? {}), o.tipo ?? 'asociado', JSON.stringify(o.ov ?? {}), o.audit ?? AUDIT()],
  )
  return r.rows[0].r.resultado
}
const estado = async (d: PGlite, uid = 'P1') =>
  (await d.query<{ tipo_publicador: string; permisos_override: unknown }>(`select tipo_publicador, permisos_override from public.usuarios where uid=$1`, [uid])).rows[0]
const nAudit = async (d: PGlite) => (await d.query<{ n: number }>(`select count(*)::int as n from public.audit_logs`)).rows[0].n

beforeAll(async () => { db = await nueva() }, 60_000)
afterAll(async () => { await db?.close() })

describe('la migración', () => {
  it('deja a todos los publicadores como modalidad normal, sin overrides', async () => {
    expect(await estado(db)).toEqual({ tipo_publicador: 'publicador', permisos_override: {} })
    expect(await estado(db, 'C1')).toEqual({ tipo_publicador: 'publicador', permisos_override: {} })
  })

  it('es idempotente', async () => {
    await expect(db.exec(sql('28-publicador-modalidad.sql'))).resolves.toBeDefined()
  })

  it('los CHECK de la base rechazan una modalidad rara y overrides que no son un objeto', async () => {
    await expect(db.exec(`update public.usuarios set tipo_publicador = 'premium' where uid='P1'`)).rejects.toThrow()
    await expect(db.exec(`update public.usuarios set permisos_override = '[]'::jsonb where uid='P1'`)).rejects.toThrow()
    await expect(db.exec(`update public.usuarios set permisos_override = '"x"'::jsonb where uid='P1'`)).rejects.toThrow()
  })

  it('la reversa quita función y columnas', async () => {
    const d = await nueva()
    await d.exec(sql('28-publicador-modalidad.REVERTIR.sql'))
    const f = await d.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname='usuario_cambiar_permisos'`)
    expect(f.rows[0].n).toBe(0)
    const c = await d.query<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_name='usuarios' and column_name in ('tipo_publicador','permisos_override')`)
    expect(c.rows[0].n).toBe(0)
    await d.close()
  }, 60_000)
})

describe('usuario_cambiar_permisos: cambio y bitácora, juntos o nada', () => {
  it('ok: cambia la cuenta y deja UNA fila de bitácora con quién, a quién, antes, después y motivo', async () => {
    const d = await nueva()
    expect(await llamar(d, { ov: { mostrar_telefono: true } })).toBe('ok')
    expect(await estado(d)).toEqual({ tipo_publicador: 'asociado', permisos_override: { mostrar_telefono: true } })
    const { rows } = await d.query<Record<string, unknown>>(`select * from public.audit_logs`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_uid: 'ADM', actor_email: 'adm@x.test', actor_rol: 'admin', accion: 'usuario.editar', entidad: 'usuarios', entidad_id: 'P1' })
    expect(rows[0].antes).toMatchObject({ tipo_publicador: 'publicador' })
    expect(rows[0].despues).toMatchObject({ tipo_publicador: 'asociado', motivo: 'Alta como asociado según acuerdo' })
    expect(rows[0].creado_en).toBeTruthy() // la fecha la pone la base
    await d.close()
  }, 60_000)

  it('ATOMICIDAD: si la bitácora falla, el cambio NO queda (aquí, sin actor: NOT NULL)', async () => {
    const d = await nueva()
    await expect(llamar(d, { audit: JSON.stringify({ accion: 'usuario.editar', antes: {}, despues: {} }) })).rejects.toThrow()
    expect(await estado(d)).toEqual({ tipo_publicador: 'publicador', permisos_override: {} }) // intacto
    expect(await nAudit(d)).toBe(0)
    await d.close()
  }, 60_000)

  it('la huella tiene que estar COMPLETA: sin antes, sin después, sin acción, sin actor o con motivo de menos de 10 caracteres no hay cambio', async () => {
    const d = await nueva()
    const base = JSON.parse(AUDIT())
    const casos: Array<[string, Record<string, unknown> | string | null]> = [
      ['sin antes', { ...base, antes: undefined }],
      ['sin después', { ...base, despues: undefined }],
      ['antes no es un objeto', { ...base, antes: 'x' }],
      ['después sin motivo', { ...base, despues: { tipo_publicador: 'asociado' } }],
      ['motivo de 9 caracteres', { ...base, despues: { ...base.despues, motivo: '123456789' } }],
      ['motivo de sólo espacios', { ...base, despues: { ...base.despues, motivo: '            ' } }],
      ['motivo que es un objeto largo', { ...base, despues: { ...base.despues, motivo: { texto: 'abcdefghijklmnop' } } }],
      ['motivo que es un arreglo largo', { ...base, despues: { ...base.despues, motivo: ['abcdefghij', 'klmnop'] } }],
      ['motivo que es un número largo', { ...base, despues: { ...base.despues, motivo: 12345678901234 } }],
      ['motivo de 10 tabuladores', { ...base, despues: { ...base.despues, motivo: '\t'.repeat(10) } }],
      ['motivo de saltos de línea', { ...base, despues: { ...base.despues, motivo: '\n'.repeat(12) } }],
      ['actor sólo espacios', { ...base, actor_uid: '   \t ' }],
      ['acción sólo espacios', { ...base, accion: '   ' }],
      ['sin acción', { ...base, accion: undefined }],
      ['sin actor', { ...base, actor_uid: '' }],
      ['bitácora que no es un objeto', '"hola"'],
      ['bitácora nula', 'null'],
    ]
    for (const [nombre, audit] of casos) {
      await expect(llamar(d, { audit: typeof audit === 'string' ? audit : JSON.stringify(audit) }), nombre).rejects.toThrow()
    }
    expect(await estado(d)).toEqual({ tipo_publicador: 'publicador', permisos_override: {} })
    expect(await nAudit(d)).toBe(0)
    // y con exactamente 10 caracteres, sí
    expect(await llamar(d, { audit: JSON.stringify({ ...base, despues: { ...base.despues, motivo: '1234567890' } }) })).toBe('ok')
    await d.close()
  }, 90_000)

  it('ATOMICIDAD: si falla el propio cambio (CHECK de la base), tampoco queda bitácora', async () => {
    const d = await nueva()
    await expect(llamar(d, { tipo: 'premium' })).rejects.toThrow()
    await expect(llamar(d, { ov: [] })).rejects.toThrow()
    expect(await estado(d)).toEqual({ tipo_publicador: 'publicador', permisos_override: {} })
    expect(await nAudit(d)).toBe(0)
    await d.close()
  }, 60_000)

  it('CONCURRENCIA: si la cuenta ya no es como se leyó, `conflicto`: no cambia nada ni deja bitácora', async () => {
    const d = await nueva()
    expect(await llamar(d)).toBe('ok') // otro administrador cambió primero
    const antes = await estado(d)
    // el segundo, que leyó el estado viejo, intenta pisarlo
    expect(await llamar(d, { antesTipo: 'publicador', antesOv: {}, tipo: 'publicador', ov: { aceptar_citas: true } })).toBe('conflicto')
    expect(await estado(d)).toEqual(antes)
    expect(await nAudit(d)).toBe(1) // sólo la del primero
    await d.close()
  }, 60_000)

  it('el «antes» se compara como jsonb: el orden de las claves no cuenta', async () => {
    const d = await nueva()
    await d.exec(`update public.usuarios set permisos_override = '{"b": true, "a": false}'::jsonb where uid='P1'`)
    expect(await llamar(d, { antesOv: { a: false, b: true }, ov: { a: false } })).toBe('ok')
    await d.close()
  }, 60_000)

  it('sólo se cambia a un publicador: cliente y admin → no_publicador, uid ausente → no_existe, sin tocar nada', async () => {
    const d = await nueva()
    expect(await llamar(d, { uid: 'C1' })).toBe('no_publicador')
    expect(await llamar(d, { uid: 'A1' })).toBe('no_publicador')
    expect(await llamar(d, { uid: 'NOPE' })).toBe('no_existe')
    expect(await nAudit(d)).toBe(0)
    expect(await estado(d, 'C1')).toEqual({ tipo_publicador: 'publicador', permisos_override: {} })
    await d.close()
  }, 60_000)

  it('sólo el servidor puede ejecutarla: anon y authenticated no; service_role sí', async () => {
    const q = async (rol: string) => (await db.query<{ ok: boolean }>(
      `select has_function_privilege($1, 'public.usuario_cambiar_permisos(text,text,jsonb,text,jsonb,jsonb)', 'execute') as ok`, [rol])).rows[0].ok
    expect(await q('anon')).toBe(false)
    expect(await q('authenticated')).toBe(false)
    expect(await q('service_role')).toBe(true)
  })

  it('no es security definer (no eleva privilegios de quien la llame)', async () => {
    const { rows } = await db.query<{ prosecdef: boolean }>(`select prosecdef from pg_proc where proname='usuario_cambiar_permisos'`)
    expect(rows[0].prosecdef).toBe(false)
  })
})
