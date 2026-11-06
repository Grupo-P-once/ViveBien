import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { ESTADOS, ACCIONES, evaluar, type EstadoCita, type PapelCita, type AccionCita } from '../src/lib/citas/estados'

/**
 * Las migraciones 15 + 70 (modelo v2) contra un Postgres de verdad (PGlite, en memoria).
 *
 * Nada de esto toca ninguna base real: la base vive y muere dentro de la prueba. Aquí se prueba lo que
 * sólo Postgres garantiza —que dos citas confirmadas no se empalmen, las versiones, los permisos, la
 * regla de 2 horas, los recordatorios sin duplicados— y que la función SQL y `src/lib/citas/estados.ts`
 * digan exactamente lo mismo.
 *
 * Decisiones del dueño que se prueban aquí (5-nov-2026): D-2 (sólo la confirmada aparta horario),
 * D-5 (el cliente cancela o pide otro horario hasta 2 h antes) y D-4 (recordatorios 24 h y 1 h).
 */

let db: PGlite

const CLIENTE = 'cli'
const ASESOR = 'ase'
const ADMIN = 'admin-x'

type Fila = Record<string, unknown> & { id: string; version: number; estado: string }

function base(o: Record<string, unknown> = {}) {
  return JSON.stringify({
    propiedad_id: 'p1', cliente_uid: CLIENTE, asesor_uid: ASESOR, estado: 'REQUESTED',
    cliente_nombre: 'Cliente de prueba', cliente_telefono: '+524771234567', consentimiento_version: 'prueba',
    creada_por: CLIENTE, actor_rol: 'cliente', margen_min: 15, ...o,
  })
}

async function crear(o: Record<string, unknown>): Promise<Fila> {
  const r = await db.query<Fila>('select * from cita_crear($1::jsonb)', [base(o)])
  return r.rows[0]
}

async function transicionar(id: string, version: number, accion: string, uid: string | null, rol: string, datos: object = {}) {
  return db.query<Fila>('select * from cita_transicionar($1, $2, $3, $4, $5, $6, $7::jsonb)',
    [id, version, accion, uid, rol, 'panel', JSON.stringify(datos)])
}

async function motivoDe(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return err.code === '23P01' ? '23P01' : (err.message ?? 'error')
  }
}

const enMin = (min: number) => new Date(Date.now() + min * 60_000)

beforeAll(async () => {
  db = await PGlite.create({ extensions: { btree_gist, pgcrypto } })
  // Lo mínimo de Supabase que las migraciones suponen.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create table public.usuarios (uid text primary key, nombre text, rol text);
    create table public.propiedades (id text primary key, titulo text);
    insert into public.usuarios values
      ('cli', 'Cliente', 'cliente'), ('ase', 'Asesor', 'publicador'), ('otro', 'Otro cliente', 'cliente'),
      ('admin-x', 'Admin', 'admin'), ('super-x', 'Super admin', 'super_admin'), ('falso-admin', 'No es admin', 'cliente');
    insert into public.propiedades values ('p1', 'Nave');
    -- Un Vault de mentira: solo la vista que las funciones del token leen.
    create schema vault;
    create table vault.decrypted_secrets (name text, decrypted_secret text);
    create table public.audit_logs (id bigint generated always as identity primary key, actor_uid text not null, actor_email text, actor_rol text, accion text not null, entidad text not null, entidad_id text, antes jsonb, despues jsonb, creado_en timestamptz not null default now());
  `)
  await db.exec(readFileSync(path.join(process.cwd(), 'supabase', '15-citas.sql'), 'utf8'))
  await db.exec(readFileSync(path.join(process.cwd(), 'supabase', '70-citas-v2.sql'), 'utf8'))
  await db.exec(readFileSync(path.join(process.cwd(), 'supabase', '72-citas-tareas-firma.sql'), 'utf8'))
  await db.exec(readFileSync(path.join(process.cwd(), 'supabase', '73-citas-guardar-agenda.sql'), 'utf8'))
}, 90_000)

afterAll(async () => { await db?.close() })

describe('D-2 · sólo la cita confirmada aparta horario', () => {
  it('la misma clave devuelve la misma cita (doble clic, reintento)', async () => {
    const a = await crear({ inicio: '2031-01-06T16:00:00Z', fin: '2031-01-06T17:00:00Z', clave_idempotencia: 'idem-0001' })
    const b = await crear({ inicio: '2031-01-06T16:00:00Z', fin: '2031-01-06T17:00:00Z', clave_idempotencia: 'idem-0001' })
    expect(b.id).toBe(a.id)
    const n = await db.query<{ n: number }>(`select count(*)::int as n from citas where clave_idempotencia = 'idem-0001'`)
    expect(n.rows[0].n).toBe(1)
  })

  it('dos solicitudes pendientes del mismo horario conviven: ninguna lo aparta', async () => {
    const a = await crear({ inicio: '2031-01-07T16:00:00Z', fin: '2031-01-07T17:00:00Z', clave_idempotencia: 'idem-0010' })
    const b = await crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-07T16:00:00Z', fin: '2031-01-07T17:00:00Z', clave_idempotencia: 'idem-0011' })
    expect(a.estado).toBe('REQUESTED')
    expect(b.estado).toBe('REQUESTED')
  })

  it('una cita confirmada aparta su horario con margen: otra confirmada dentro del margen choca; justo después, no', async () => {
    await crear({ estado: 'CONFIRMED', inicio: '2031-01-10T16:00:00Z', fin: '2031-01-10T17:00:00Z', clave_idempotencia: 'idem-0020' })
    const choque = motivoDe(crear({ estado: 'CONFIRMED', cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-10T17:00:00Z', fin: '2031-01-10T18:00:00Z', clave_idempotencia: 'idem-0021' }))
    expect(await choque).toBe('23P01')
    const libre = await crear({ estado: 'CONFIRMED', cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-10T17:15:00Z', fin: '2031-01-10T18:15:00Z', clave_idempotencia: 'idem-0022' })
    expect(libre.estado).toBe('CONFIRMED')
  })

  it('confirmar una solicitud cuyo horario ya ocupa otra confirmada falla de forma atómica', async () => {
    await crear({ estado: 'CONFIRMED', inicio: '2031-01-12T16:00:00Z', fin: '2031-01-12T17:00:00Z', clave_idempotencia: 'idem-0030' })
    const pendiente = await crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-12T16:30:00Z', fin: '2031-01-12T17:30:00Z', clave_idempotencia: 'idem-0031' })
    expect(await motivoDe(transicionar(pendiente.id, 1, 'confirmar', ASESOR, 'asesor'))).toBe('23P01')
    const sigue = await db.query<{ estado: string; version: number }>('select estado, version from citas where id = $1', [pendiente.id])
    expect(sigue.rows[0]).toMatchObject({ estado: 'REQUESTED', version: 1 })
  })

  it('dos confirmaciones del mismo horario: entra exactamente una y la otra se queda pendiente', async () => {
    const a = await crear({ inicio: '2031-01-14T16:00:00Z', fin: '2031-01-14T17:00:00Z', clave_idempotencia: 'idem-0040' })
    const b = await crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-14T16:00:00Z', fin: '2031-01-14T17:00:00Z', clave_idempotencia: 'idem-0041' })
    const r = await Promise.allSettled([
      transicionar(a.id, 1, 'confirmar', ASESOR, 'asesor'),
      transicionar(b.id, 1, 'confirmar', ASESOR, 'asesor'),
    ])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    const estados = await db.query<{ estado: string }>('select estado from citas where id in ($1, $2) order by estado', [a.id, b.id])
    expect(estados.rows.map((x) => x.estado)).toEqual(['CONFIRMED', 'REQUESTED'])
  })

  it('el mismo cliente no puede tener dos visitas activas a la vez, aunque sean de asesores distintos', async () => {
    await db.exec(`insert into usuarios values ('ase2', 'Otro asesor', 'publicador') on conflict do nothing`)
    const r = motivoDe(crear({ asesor_uid: 'ase2', inicio: '2031-01-06T16:30:00Z', fin: '2031-01-06T17:30:00Z', clave_idempotencia: 'idem-0050' }))
    expect(await r).toBe('23P01')
  })

  it('una cita cancelada libera su horario', async () => {
    const c = await crear({ estado: 'CONFIRMED', inicio: '2031-01-16T16:00:00Z', fin: '2031-01-16T17:00:00Z', clave_idempotencia: 'idem-0060' })
    await transicionar(c.id, 1, 'cancelar', CLIENTE, 'cliente')
    const nueva = await crear({ estado: 'CONFIRMED', cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-16T16:00:00Z', fin: '2031-01-16T17:00:00Z', clave_idempotencia: 'idem-0061' })
    expect(nueva.estado).toBe('CONFIRMED')
  })

  it('dos creaciones simultáneas confirmadas por el mismo horario: entra exactamente una', async () => {
    const r = await Promise.allSettled([
      crear({ estado: 'CONFIRMED', inicio: '2031-01-18T16:00:00Z', fin: '2031-01-18T17:00:00Z', clave_idempotencia: 'idem-0070' }),
      crear({ estado: 'CONFIRMED', cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-18T16:00:00Z', fin: '2031-01-18T17:00:00Z', clave_idempotencia: 'idem-0071' }),
    ])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
  })

  it('no se puede crear en el pasado', async () => {
    expect(await motivoDe(crear({ inicio: '2020-01-01T16:00:00Z', fin: '2020-01-01T17:00:00Z', clave_idempotencia: 'idem-0080' }))).toBe('fuera_de_tiempo')
  })
})

describe('cambios de estado', () => {
  it('recorrido completo con historial y versión', async () => {
    const c = await crear({ inicio: '2031-02-03T16:00:00Z', fin: '2031-02-03T17:00:00Z', clave_idempotencia: 'idem-0101' })
    expect(await motivoDe(transicionar(c.id, 1, 'confirmar', CLIENTE, 'cliente'))).toBe('no_permitido')
    const conf = (await transicionar(c.id, 1, 'confirmar', ASESOR, 'asesor')).rows[0]
    expect(conf.estado).toBe('CONFIRMED')
    expect(conf.version).toBe(2)

    // Versión vieja: no cambia nada.
    expect(await motivoDe(transicionar(c.id, 1, 'cancelar', CLIENTE, 'cliente'))).toBe('version')

    const prop = (await transicionar(c.id, 2, 'proponer', CLIENTE, 'cliente', { inicio: '2031-02-04T16:00:00Z', fin: '2031-02-04T17:00:00Z' })).rows[0]
    expect(prop.estado).toBe('RESCHEDULE_REQUESTED')
    expect(prop.estado_previo).toBe('CONFIRMED')
    // D-5: la cita confirmada se CONSERVA mientras el cambio no se acepte.
    expect(new Date(prop.inicio as string).toISOString()).toBe('2031-02-03T16:00:00.000Z')
    // Quien propone no acepta su propia propuesta.
    expect(await motivoDe(transicionar(c.id, 3, 'aceptar_cambio', CLIENTE, 'cliente'))).toBe('no_permitido')
    const acep = (await transicionar(c.id, 3, 'aceptar_cambio', ASESOR, 'asesor')).rows[0]
    expect(acep.estado).toBe('RESCHEDULED')
    expect(new Date(acep.inicio as string).toISOString()).toBe('2031-02-04T16:00:00.000Z')
    expect(new Date(acep.ocupa_hasta as string).toISOString()).toBe('2031-02-04T17:15:00.000Z')

    // El asesor cancela: con motivo.
    expect(await motivoDe(transicionar(c.id, 4, 'cancelar', ASESOR, 'asesor'))).toBe('motivo_requerido')
    const canc = (await transicionar(c.id, 4, 'cancelar', ASESOR, 'asesor', { motivo: 'Se rentó' })).rows[0]
    expect(canc.estado).toBe('CANCELLED')

    const ev = await db.query<{ tipo: string; estado_antes: string | null; estado_despues: string }>(
      'select tipo, estado_antes, estado_despues from citas_eventos where cita_id = $1 order by id', [c.id])
    expect(ev.rows.map((e) => e.tipo)).toEqual(['CREATED', 'CONFIRMED', 'RESCHEDULE_PROPOSED', 'RESCHEDULE_ACCEPTED', 'CANCELLED'])
    expect(ev.rows[1]).toMatchObject({ estado_antes: 'REQUESTED', estado_despues: 'CONFIRMED' })
  })

  it('proponer un horario que ya ocupa una cita confirmada se rechaza antes de apartarlo', async () => {
    const a = await crear({ inicio: '2031-03-03T16:00:00Z', fin: '2031-03-03T17:00:00Z', clave_idempotencia: 'idem-0201' })
    await crear({ estado: 'CONFIRMED', cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-03-03T18:00:00Z', fin: '2031-03-03T19:00:00Z', clave_idempotencia: 'idem-0202' })
    expect(await motivoDe(transicionar(a.id, 1, 'proponer', ASESOR, 'asesor', { inicio: '2031-03-03T17:30:00Z', fin: '2031-03-03T18:30:00Z' }))).toBe('horario_ocupado')
  })

  it('aceptar un cambio cuyo horario nuevo ocupó otra confirmada falla y conserva la cita original', async () => {
    const a = await crear({ estado: 'CONFIRMED', inicio: '2031-03-10T16:00:00Z', fin: '2031-03-10T17:00:00Z', clave_idempotencia: 'idem-0210' })
    const p = (await transicionar(a.id, 1, 'proponer', CLIENTE, 'cliente', { inicio: '2031-03-11T16:00:00Z', fin: '2031-03-11T17:00:00Z' })).rows[0]
    // Mientras tanto otra persona confirma justo el horario propuesto.
    await crear({ estado: 'CONFIRMED', cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-03-11T16:00:00Z', fin: '2031-03-11T17:00:00Z', clave_idempotencia: 'idem-0211' })
    expect(await motivoDe(transicionar(a.id, p.version, 'aceptar_cambio', ASESOR, 'asesor'))).toBe('23P01')
    const sigue = await db.query<{ estado: string; inicio: string }>('select estado, inicio from citas where id = $1', [a.id])
    expect(sigue.rows[0].estado).toBe('RESCHEDULE_REQUESTED')
    expect(new Date(sigue.rows[0].inicio).toISOString()).toBe('2031-03-10T16:00:00.000Z')
  })

  it('un cliente no puede actuar sobre la cita de otro', async () => {
    const a = await crear({ inicio: '2031-03-05T16:00:00Z', fin: '2031-03-05T17:00:00Z', clave_idempotencia: 'idem-0301' })
    expect(await motivoDe(transicionar(a.id, 1, 'cancelar', 'otro', 'cliente'))).toBe('no_permitido')
  })

  it('cada cambio revoca los enlaces de correo vigentes', async () => {
    const a = await crear({ inicio: '2031-03-06T16:00:00Z', fin: '2031-03-06T17:00:00Z', clave_idempotencia: 'idem-0401' })
    await db.query(`insert into citas_tokens (cita_id, accion, para_rol, hash, version_cita, expira_en)
      values ($1, 'confirmar', 'asesor', 'hash-de-prueba', 1, now() + interval '1 day')`, [a.id])
    await transicionar(a.id, 1, 'cancelar', CLIENTE, 'cliente')
    const t = await db.query<{ revocado_en: string | null }>(`select revocado_en from citas_tokens where hash = 'hash-de-prueba'`)
    expect(t.rows[0].revocado_en).not.toBeNull()
  })
})

describe('rechazar (D-7: «Rechazada»)', () => {
  it('solo el responsable o un admin rechazan, con motivo, y solo una solicitud pendiente', async () => {
    const a = await crear({ inicio: '2031-04-01T16:00:00Z', fin: '2031-04-01T17:00:00Z', clave_idempotencia: 'idem-0501' })
    expect(await motivoDe(transicionar(a.id, 1, 'rechazar', CLIENTE, 'cliente', { motivo: 'no quiero' }))).toBe('no_permitido')
    expect(await motivoDe(transicionar(a.id, 1, 'rechazar', ASESOR, 'asesor'))).toBe('motivo_requerido')
    const r = (await transicionar(a.id, 1, 'rechazar', ASESOR, 'asesor', { motivo: 'Ya no está disponible' })).rows[0]
    expect(r.estado).toBe('REJECTED')
    expect(r.motivo_cancelacion).toBe('Ya no está disponible')
    // Ya rechazada: no se vuelve a rechazar ni a confirmar.
    expect(await motivoDe(transicionar(a.id, r.version, 'rechazar', ASESOR, 'asesor', { motivo: 'otra vez' }))).toBe('transicion_invalida')
    expect(await motivoDe(transicionar(a.id, r.version, 'confirmar', ASESOR, 'asesor'))).toBe('transicion_invalida')
    // Una cita confirmada se cancela, no se rechaza.
    const c = await crear({ estado: 'CONFIRMED', inicio: '2031-04-02T16:00:00Z', fin: '2031-04-02T17:00:00Z', clave_idempotencia: 'idem-0502' })
    expect(await motivoDe(transicionar(c.id, 1, 'rechazar', ASESOR, 'asesor', { motivo: 'x' }))).toBe('transicion_invalida')
  })

  it('una solicitud sin respuesta caduca como «Expirada» cuando llega la hora', async () => {
    const a = await crear({ inicio: '2031-04-05T16:00:00Z', fin: '2031-04-05T17:00:00Z', clave_idempotencia: 'idem-0510' })
    // Se coloca en el pasado a mano: la prueba es de la función, no de cómo se llegó ahí.
    await db.query(`update citas set inicio = now() - interval '2 hours', fin = now() - interval '1 hour',
      ocupa_desde = now() - interval '2 hours', ocupa_hasta = now() - interval '45 minutes' where id = $1`, [a.id])
    const e = (await transicionar(a.id, 1, 'vencer', null, 'sistema')).rows[0]
    expect(e.estado).toBe('EXPIRED')
    expect(e.motivo_cancelacion).toMatch(/Expirada/)
  })
})

describe('D-5 · el cliente cancela o pide otro horario hasta 2 horas antes', () => {
  it('con menos de 2 horas, el cliente no puede cancelar ni pedir otro horario de una cita confirmada; el equipo sí', async () => {
    const ini = enMin(90)
    const fin = new Date(ini.getTime() + 3_600_000)
    const c = await crear({ estado: 'CONFIRMED', inicio: ini.toISOString(), fin: fin.toISOString(), clave_idempotencia: 'idem-0601' })
    expect(await motivoDe(transicionar(c.id, 1, 'cancelar', CLIENTE, 'cliente'))).toBe('menos_de_2_horas')
    expect(await motivoDe(transicionar(c.id, 1, 'proponer', CLIENTE, 'cliente', { inicio: '2031-05-01T16:00:00Z', fin: '2031-05-01T17:00:00Z' }))).toBe('menos_de_2_horas')
    const canc = (await transicionar(c.id, 1, 'cancelar', ASESOR, 'asesor', { motivo: 'Imprevisto' })).rows[0]
    expect(canc.estado).toBe('CANCELLED')
  })

  it('con más de 2 horas, el cliente cancela', async () => {
    const ini = enMin(150)
    const c = await crear({ estado: 'CONFIRMED', inicio: ini.toISOString(), fin: new Date(ini.getTime() + 3_600_000).toISOString(), clave_idempotencia: 'idem-0602' })
    expect((await transicionar(c.id, 1, 'cancelar', CLIENTE, 'cliente')).rows[0].estado).toBe('CANCELLED')
  })

  it('una solicitud que todavía nadie confirmó se puede retirar en cualquier momento', async () => {
    const ini = enMin(30)
    const c = await crear({ inicio: ini.toISOString(), fin: new Date(ini.getTime() + 3_600_000).toISOString(), clave_idempotencia: 'idem-0603' })
    expect((await transicionar(c.id, 1, 'cancelar', CLIENTE, 'cliente')).rows[0].estado).toBe('CANCELLED')
  })
})

describe('quien actúa como admin tiene que serlo en la base', () => {
  it('un uid que no es admin no puede usar el papel admin; admin y super_admin sí', async () => {
    const c = await crear({ inicio: '2031-06-01T16:00:00Z', fin: '2031-06-01T17:00:00Z', clave_idempotencia: 'idem-0701' })
    expect(await motivoDe(transicionar(c.id, 1, 'confirmar', 'falso-admin', 'admin'))).toBe('no_permitido')
    expect(await motivoDe(transicionar(c.id, 1, 'confirmar', null, 'admin'))).toBe('no_permitido')
    expect((await transicionar(c.id, 1, 'confirmar', ADMIN, 'admin')).rows[0].estado).toBe('CONFIRMED')
    const d = await crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-06-02T16:00:00Z', fin: '2031-06-02T17:00:00Z', clave_idempotencia: 'idem-0702' })
    expect((await transicionar(d.id, 1, 'confirmar', 'super-x', 'admin')).rows[0].estado).toBe('CONFIRMED')
  })
})

describe('D-4 · recordatorios 24 h y 1 h antes, sin duplicados', () => {
  const recordatorios = async (citaId: string) => (await db.query<{ tipo: string; para_rol: string; estado: string; version_cita: number; clave: string }>(
    'select tipo, para_rol, estado, version_cita, clave from citas_recordatorios where cita_id = $1 order by id', [citaId])).rows

  it('una cita confirmada lejana programa 4 recordatorios (24 h y 1 h, cliente y asesor), y repetirlo no duplica', async () => {
    const c = await crear({ estado: 'CONFIRMED', inicio: '2031-07-01T16:00:00Z', fin: '2031-07-01T17:00:00Z', clave_idempotencia: 'idem-0801' })
    const r = await recordatorios(c.id)
    expect(r).toHaveLength(4)
    expect(r.map((x) => `${x.tipo}/${x.para_rol}`).sort()).toEqual(['1h/asesor', '1h/cliente', '24h/asesor', '24h/cliente'])
    expect(new Set(r.map((x) => x.clave)).size).toBe(4)
    const cuando = async (tipo: string) => new Date((await db.query<{ enviar_en: string }>(
      `select enviar_en from citas_recordatorios where cita_id = $1 and para_rol = 'cliente' and tipo = $2`, [c.id, tipo])).rows[0].enviar_en).toISOString()
    expect(await cuando('24h')).toBe('2031-06-30T16:00:00.000Z')
    expect(await cuando('1h')).toBe('2031-07-01T15:00:00.000Z')
    await db.query('select cita_programar_recordatorios(c) from citas c where id = $1', [c.id])
    expect(await recordatorios(c.id)).toHaveLength(4)
  })

  it('una solicitud pendiente NO programa recordatorios; al confirmarla sí', async () => {
    const c = await crear({ inicio: '2031-07-03T16:00:00Z', fin: '2031-07-03T17:00:00Z', clave_idempotencia: 'idem-0802' })
    expect(await recordatorios(c.id)).toHaveLength(0)
    await transicionar(c.id, 1, 'confirmar', ASESOR, 'asesor')
    expect((await recordatorios(c.id)).filter((x) => x.estado === 'pendiente')).toHaveLength(4)
  })

  it('cancelar una cita omite sus recordatorios pendientes', async () => {
    const c = await crear({ estado: 'CONFIRMED', inicio: '2031-07-05T16:00:00Z', fin: '2031-07-05T17:00:00Z', clave_idempotencia: 'idem-0803' })
    await transicionar(c.id, 1, 'cancelar', CLIENTE, 'cliente')
    const r = await recordatorios(c.id)
    expect(r.every((x) => x.estado === 'omitido')).toBe(true)
  })

  it('reprogramar omite los de la versión anterior y crea los nuevos con otra clave; mientras se espera la respuesta, la cita sigue firme', async () => {
    const c = await crear({ estado: 'CONFIRMED', inicio: '2031-07-08T16:00:00Z', fin: '2031-07-08T17:00:00Z', clave_idempotencia: 'idem-0804' })
    const p = (await transicionar(c.id, 1, 'proponer', CLIENTE, 'cliente', { inicio: '2031-07-09T16:00:00Z', fin: '2031-07-09T17:00:00Z' })).rows[0]
    // Con la propuesta pendiente la cita original sigue firme: sus recordatorios siguen vigentes (versión nueva).
    expect((await recordatorios(c.id)).filter((x) => x.estado === 'pendiente' && x.version_cita === p.version)).toHaveLength(4)
    await transicionar(c.id, p.version, 'aceptar_cambio', ASESOR, 'asesor')
    const r = await recordatorios(c.id)
    const vigentes = r.filter((x) => x.estado === 'pendiente')
    expect(vigentes).toHaveLength(4)
    expect(new Set(vigentes.map((x) => x.version_cita)).size).toBe(1)
    expect(new Set(r.map((x) => x.clave)).size).toBe(r.length)
    const nuevo = await db.query<{ enviar_en: string }>(`select enviar_en from citas_recordatorios where cita_id = $1 and estado = 'pendiente' and tipo = '24h' and para_rol = 'cliente'`, [c.id])
    expect(new Date(nuevo.rows[0].enviar_en).toISOString()).toBe('2031-07-08T16:00:00.000Z')
  })

  it('si faltan menos de 24 h solo se programa el de 1 h; si faltan menos de 1 h, ninguno', async () => {
    const a = enMin(600)
    const c1 = await crear({ estado: 'CONFIRMED', inicio: a.toISOString(), fin: new Date(a.getTime() + 3_600_000).toISOString(), clave_idempotencia: 'idem-0805' })
    expect((await recordatorios(c1.id)).map((x) => x.tipo).sort()).toEqual(['1h', '1h'])
    const b = enMin(40)
    const c2 = await crear({ estado: 'CONFIRMED', cliente_uid: 'otro', creada_por: 'otro', inicio: b.toISOString(), fin: new Date(b.getTime() + 3_600_000).toISOString(), clave_idempotencia: 'idem-0806' })
    expect(await recordatorios(c2.id)).toHaveLength(0)
  })

  it('el procesador reclama solo lo vencido, una vez; los fallos se reintentan hasta 5 veces; lo que ya empezó se omite', async () => {
    const ini = enMin(300)
    const c = await crear({ estado: 'CONFIRMED', inicio: ini.toISOString(), fin: new Date(ini.getTime() + 3_600_000).toISOString(), clave_idempotencia: 'idem-0807' })
    // Aún no toca (el de 1 h sale dentro de 4 h).
    expect((await db.query('select * from citas_recordatorios_reclamar(10)')).rows.filter((x) => (x as { cita_id: string }).cita_id === c.id)).toHaveLength(0)
    // Se adelanta a mano el primero para que toque ya.
    await db.query(`update citas_recordatorios set enviar_en = now() - interval '1 minute' where cita_id = $1 and para_rol = 'cliente'`, [c.id])
    const r1 = (await db.query<{ id: string; estado: string; intentos: number }>('select * from citas_recordatorios_reclamar(10)')).rows.filter((x) => (x as unknown as { cita_id: string }).cita_id === c.id)
    expect(r1).toHaveLength(1)
    expect(r1[0]).toMatchObject({ estado: 'enviando', intentos: 1 })
    // Un segundo procesador, en el mismo momento, no lo vuelve a tomar.
    expect((await db.query('select * from citas_recordatorios_reclamar(10)')).rows.filter((x) => (x as { cita_id: string }).cita_id === c.id)).toHaveLength(0)
    // Falla → queda en error y se reintenta; al quinto intento ya no.
    for (let n = 1; n <= 4; n++) {
      await db.query('select citas_recordatorio_marcar($1, false, $2)', [r1[0].id, 'fallo de prueba'])
      const otra = (await db.query<{ intentos: number }>('select * from citas_recordatorios_reclamar(10)')).rows.filter((x) => (x as unknown as { id: string }).id === r1[0].id)
      expect(otra).toHaveLength(1)
      expect(otra[0].intentos).toBe(n + 1)
    }
    await db.query('select citas_recordatorio_marcar($1, false, $2)', [r1[0].id, 'fallo de prueba'])
    expect((await db.query('select * from citas_recordatorios_reclamar(10)')).rows.filter((x) => (x as { id: string }).id === r1[0].id)).toHaveLength(0)
    const fin = await db.query<{ estado: string; ultimo_error: string }>('select estado, ultimo_error from citas_recordatorios where id = $1', [r1[0].id])
    expect(fin.rows[0]).toMatchObject({ estado: 'error', ultimo_error: 'fallo de prueba' })
  })

  it('marcar como enviado lo cierra para siempre, y lo que ya empezó se omite sin enviarse', async () => {
    // A otra hora que la prueba anterior: el mismo responsable no puede tener dos citas confirmadas al mismo tiempo.
    const ini = enMin(900)
    const c = await crear({ estado: 'CONFIRMED', cliente_uid: 'otro', creada_por: 'otro', inicio: ini.toISOString(), fin: new Date(ini.getTime() + 3_600_000).toISOString(), clave_idempotencia: 'idem-0808' })
    await db.query(`update citas_recordatorios set enviar_en = now() - interval '1 minute' where cita_id = $1 and para_rol = 'cliente'`, [c.id])
    const r = (await db.query<{ id: string; cita_id: string }>('select * from citas_recordatorios_reclamar(10)')).rows.find((x) => x.cita_id === c.id)!
    await db.query('select citas_recordatorio_marcar($1, true, null)', [r.id])
    expect((await db.query('select * from citas_recordatorios_reclamar(10)')).rows.filter((x) => (x as { id: string }).id === r.id)).toHaveLength(0)
    // Una visita que ya empezó: su recordatorio pendiente se omite en vez de mandarse tarde.
    await db.query(`update citas_recordatorios set inicio_cita = now() - interval '5 minutes', enviar_en = now() - interval '1 hour' where cita_id = $1 and estado = 'pendiente'`, [c.id])
    await db.query('select * from citas_recordatorios_reclamar(10)')
    const pendientes = await db.query<{ n: number }>(`select count(*)::int as n from citas_recordatorios where cita_id = $1 and estado in ('pendiente', 'enviando')`, [c.id])
    expect(pendientes.rows[0].n).toBe(0)
  })
})

describe('D-4 · la firma de la tarea la valida la base (migraciones 71 y 72)', () => {
  const SECRETO = 'a1'.repeat(32)
  const ahoraS = () => Math.floor(Date.now() / 1000)
  const firmar = (t: number, secreto = SECRETO) => createHmac('sha256', secreto).update(String(t)).digest('hex')
  const valida = async (t: number | null, f: string | null) => (await db.query<{ ok: boolean }>('select citas_tarea_firma_valida($1, $2) as ok', [t, f])).rows[0].ok
  const poner = async (secreto: string) => { await db.exec(`delete from vault.decrypted_secrets`); await db.query(`insert into vault.decrypted_secrets values ('citas_tareas_token', $1)`, [secreto]) }

  it('la 72 es independiente de la 71: un entorno nuevo NO tiene ningún validador de token reutilizable', async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname = 'citas_tarea_token_valido'`)
    expect(r.rows[0].n).toBe(0)
  })

  it('sin secreto configurado nada es válido', async () => {
    await db.exec(`delete from vault.decrypted_secrets`)
    const t = ahoraS()
    expect(await valida(t, firmar(t))).toBe(false)
  })

  it('la firma correcta del instante actual es válida UNA sola vez; repetirla es una repetición y se rechaza', async () => {
    await poner(SECRETO)
    const t = ahoraS()
    expect(await valida(t, firmar(t))).toBe(true)
    expect(await valida(t, firmar(t))).toBe(false)   // la misma petición reenviada
    expect(await valida(t + 1, firmar(t + 1))).toBe(true)   // otro instante, otra firma
  })

  it('una firma de otro secreto, de otro instante, mal formada o vacía no sirve', async () => {
    await poner(SECRETO)
    const t = ahoraS() + 5
    expect(await valida(t, firmar(t, 'b2'.repeat(32)))).toBe(false)         // otro secreto
    expect(await valida(t, firmar(t - 1))).toBe(false)                     // firma de otro instante
    expect(await valida(t, firmar(t).toUpperCase())).toBe(false)           // mayúsculas: no es el formato
    expect(await valida(t, firmar(t).slice(1))).toBe(false)
    expect(await valida(t, firmar(t) + '0')).toBe(false)
    expect(await valida(t, 'zz'.repeat(32))).toBe(false)
    expect(await valida(t, '')).toBe(false)
    expect(await valida(null, firmar(t))).toBe(false)
    expect(await valida(t, null)).toBe(false)
    // Y ninguno de los intentos fallidos «gastó» el instante: la firma buena de ese instante sigue sirviendo.
    expect(await valida(t, firmar(t))).toBe(true)
  })

  it('la ventana es de 120 segundos: una firma vieja o del futuro lejano caduca aunque esté bien firmada', async () => {
    await poner(SECRETO)
    const t = ahoraS()
    expect(await valida(t - 300, firmar(t - 300))).toBe(false)
    expect(await valida(t - 121, firmar(t - 121))).toBe(false)
    expect(await valida(t + 300, firmar(t + 300))).toBe(false)
    expect(await valida(t - 100, firmar(t - 100))).toBe(true)
  })

  it('un secreto demasiado corto en Vault (mal configurado) no valida nada', async () => {
    await poner('corto')
    const t = ahoraS() + 11
    expect(await valida(t, firmar(t, 'corto'))).toBe(false)
  })

  it('los instantes ya usados se purgan al cabo de un día, sin tocar los recientes', async () => {
    await poner(SECRETO)
    await db.exec(`insert into citas_tarea_firmas (tiempo) values (1000), (${ahoraS() - 90000})`)
    const t = ahoraS() + 21
    expect(await valida(t, firmar(t))).toBe(true)
    const r = await db.query<{ t: number }>(`select tiempo::float8 as t from citas_tarea_firmas where tiempo < ${ahoraS() - 86400}`)
    expect(r.rows).toHaveLength(0)
  })

  it('solo la clave de servicio pregunta si una firma es válida; invocar la tarea no es de nadie de la app', async () => {
    await poner(SECRETO)
    const t = ahoraS() + 31
    for (const rol of ['anon', 'authenticated']) {
      await db.exec(`set role ${rol}`)
      expect(await motivoDe(db.query('select citas_tarea_firma_valida($1, $2)', [t, firmar(t)])), rol).toMatch(/permission denied/)
      expect(await motivoDe(db.query('select count(*) from citas_tarea_firmas')), rol).toMatch(/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    expect((await db.query<{ ok: boolean }>('select citas_tarea_firma_valida($1, $2) as ok', [t, firmar(t)])).rows[0].ok).toBe(true)
    expect(await motivoDe(db.query('select citas_tarea_invocar()'))).toMatch(/permission denied/)
    await db.exec('reset role')
    for (const rol of ['anon', 'authenticated']) {
      await db.exec(`set role ${rol}`)
      expect(await motivoDe(db.query('select citas_tarea_invocar()')), rol).toMatch(/permission denied/)
      await db.exec('reset role')
    }
  })

  it('la tarea no llama a nadie si falta la URL, el secreto o si la URL no es https', async () => {
    // `net` no existe en PGlite: si la función intentara llamar, fallaría con "schema net does not exist".
    await db.exec(`delete from vault.decrypted_secrets`)
    expect((await db.query<{ r: unknown }>('select citas_tarea_invocar() as r')).rows[0].r).toBeNull()
    await db.query(`insert into vault.decrypted_secrets values ('citas_tareas_token', $1), ('citas_tareas_url', 'http://inseguro.example/api')`, [SECRETO])
    expect((await db.query<{ r: unknown }>('select citas_tarea_invocar() as r')).rows[0].r).toBeNull()
    await db.exec(`delete from vault.decrypted_secrets`)
    await db.query(`insert into vault.decrypted_secrets values ('citas_tareas_url', 'https://ejemplo.invalid/api/citas/tareas')`)
    expect((await db.query<{ r: unknown }>('select citas_tarea_invocar() as r')).rows[0].r).toBeNull()   // sin secreto
    await db.exec(`delete from vault.decrypted_secrets`)
  })
})

describe('guardar la agenda: atómico y auditado (migración 73)', () => {
  const H = JSON.stringify([{ dia: 1, desde: '09:00', hasta: '18:00' }, { dia: 6, desde: '10:00', hasta: '14:00' }])
  const A = JSON.stringify({ duracion_min: 60, margen_min: 15, anticipacion_horas: 2, ventana_dias: 30, confirmacion: 'manual' })
  const futuro = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()
  const guardar = (uid: string, h = H, a = A, b = '[]', actor = 'admin-x') => db.query(
    'select citas_guardar_agenda($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)', [actor, 'a@ejemplo.invalid', 'admin', uid, h, a, b])
  const filas = async (t: string, uid: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${t} where asesor_uid = $1`, [uid])).rows[0].n

  it('guarda horario, ajustes y bloqueos, y deja UNA fila de auditoría con el antes y el después', async () => {
    const b = JSON.stringify([{ desde: futuro(10), hasta: futuro(15), motivo: 'Vacaciones' }])
    await guardar('ase', H, A, b)
    expect(await filas('disponibilidad_asesores', 'ase')).toBe(2)
    const aj = await db.query<{ duracion_min: number; confirmacion: string }>(`select duracion_min, confirmacion from ajustes_citas where asesor_uid = 'ase'`)
    expect(aj.rows[0]).toMatchObject({ duracion_min: 60, confirmacion: 'manual' })
    const bl = await db.query<{ motivo: string }>(`select motivo from bloqueos_asesores where asesor_uid = 'ase'`)
    expect(bl.rows.map((x) => x.motivo)).toEqual(['Vacaciones'])
    const au = await db.query<{ accion: string; entidad_id: string; actor_uid: string; antes: { horario: unknown[] }; despues: { horario: unknown[] } }>(
      `select accion, entidad_id, actor_uid, antes, despues from audit_logs where entidad = 'agenda_citas' order by id desc limit 1`)
    expect(au.rows[0]).toMatchObject({ accion: 'citas.agenda_guardada', entidad_id: 'ase', actor_uid: 'admin-x' })
    expect(au.rows[0].antes.horario).toEqual([])      // primera vez: no había nada
    expect(au.rows[0].despues.horario).toHaveLength(2)
  })

  it('al guardar de nuevo REEMPLAZA (no acumula) y la auditoría recuerda lo anterior', async () => {
    await guardar('ase', JSON.stringify([{ dia: 2, desde: '08:00', hasta: '12:00' }]), A, '[]')
    expect(await filas('disponibilidad_asesores', 'ase')).toBe(1)
    expect(await filas('bloqueos_asesores', 'ase')).toBe(0)         // los bloqueos vigentes se reemplazan por los nuevos (ninguno)
    const au = await db.query<{ antes: { horario: unknown[]; bloqueos: unknown[] } }>(`select antes from audit_logs where entidad = 'agenda_citas' order by id desc limit 1`)
    expect(au.rows[0].antes.horario).toHaveLength(2)
    expect(au.rows[0].antes.bloqueos).toHaveLength(1)
  })

  it('los bloqueos que ya pasaron se conservan (historia); los vigentes y futuros se reemplazan', async () => {
    await db.query(`insert into bloqueos_asesores (asesor_uid, desde, hasta, motivo) values ('ase', now() - interval '20 days', now() - interval '10 days', 'Pasado')`)
    await guardar('ase', H, A, JSON.stringify([{ desde: futuro(3), hasta: futuro(4), motivo: 'Nuevo' }]))
    const bl = await db.query<{ motivo: string }>(`select motivo from bloqueos_asesores where asesor_uid = 'ase' order by desde`)
    expect(bl.rows.map((x) => x.motivo)).toEqual(['Pasado', 'Nuevo'])
  })

  it('si algo falla, NO cambia nada y NO queda auditoría (todo o nada)', async () => {
    const antes = { h: await filas('disponibilidad_asesores', 'ase'), a: (await db.query<{ n: number }>(`select count(*)::int as n from audit_logs`)).rows[0].n }
    // Duración fuera del límite de la tabla: la violación llega DESPUÉS de borrar el horario viejo, y todo se revierte.
    await expect(guardar('ase', H, JSON.stringify({ duracion_min: 5, margen_min: 15, anticipacion_horas: 2, ventana_dias: 30, confirmacion: 'manual' }))).rejects.toThrow()
    // Dos horarios que empiezan a la misma hora el mismo día: choca con la restricción única.
    await expect(guardar('ase', JSON.stringify([{ dia: 1, desde: '09:00', hasta: '10:00' }, { dia: 1, desde: '09:00', hasta: '11:00' }]))).rejects.toThrow()
    expect(await filas('disponibilidad_asesores', 'ase')).toBe(antes.h)
    expect((await db.query<{ n: number }>(`select count(*)::int as n from audit_logs`)).rows[0].n).toBe(antes.a)
  })

  it('una cuenta que no existe, o datos con otra forma, se rechazan', async () => {
    expect(await motivoDe(guardar('no-existe'))).toBe('no_encontrado')
    expect(await motivoDe(guardar('ase', '{}'))).toBe('datos_invalidos')
    expect(await motivoDe(guardar('ase', H, '[]'))).toBe('datos_invalidos')
    expect(await motivoDe(guardar('ase', H, A, '{}'))).toBe('datos_invalidos')
  })

  it('solo la clave de servicio puede guardar agendas', async () => {
    for (const rol of ['anon', 'authenticated']) {
      await db.exec(`set role ${rol}`)
      expect(await motivoDe(guardar('ase')), rol).toMatch(/permission denied/)
      await db.exec('reset role')
    }
    // En Supabase real service_role tiene privilegios sobre las tablas de public (y se salta RLS); el rol de mentira de este banco no, así que se los damos.
    await db.exec('grant all on all tables in schema public to service_role')
    await db.exec('alter role service_role bypassrls')
    await db.exec('set role service_role')
    expect(await motivoDe(guardar('ase'))).toBe('ok')
    await db.exec('reset role')
  })
})

describe('nadie fuera del servidor', () => {
  it('anon y authenticated no leen ni ejecutan nada', async () => {
    for (const rol of ['anon', 'authenticated']) {
      await db.exec(`set role ${rol}`)
      expect(await motivoDe(db.query('select count(*) from citas'))).toMatch(/permission denied/)
      expect(await motivoDe(db.query('select count(*) from citas_tokens'))).toMatch(/permission denied/)
      expect(await motivoDe(db.query('select count(*) from citas_recordatorios'))).toMatch(/permission denied/)
      expect(await motivoDe(db.query(`select * from cita_crear('{}'::jsonb)`))).toMatch(/permission denied/)
      expect(await motivoDe(db.query(`select * from cita_transicionar(gen_random_uuid(), 1, 'cancelar', 'x', 'cliente', 'panel', '{}'::jsonb)`))).toMatch(/permission denied/)
      expect(await motivoDe(db.query('select * from citas_recordatorios_reclamar(10)'))).toMatch(/permission denied/)
      expect(await motivoDe(db.query(`select citas_recordatorio_marcar(1, true, null)`))).toMatch(/permission denied/)
      await db.exec('reset role')
    }
  })
})

/**
 * La prueba que mantiene juntas las dos copias de las reglas: para cada
 * estado × acción × papel, con la cita lejana, ya empezada y (para el cliente) a menos de 2 horas,
 * lo que dice `evaluar()` tiene que ser lo mismo que hace la función SQL.
 */
describe('paridad: estados.ts ≡ cita_transicionar', () => {
  const PAPELES: PapelCita[] = ['cliente', 'asesor', 'admin', 'sistema']
  type Cuando = 'futura' | 'pasada' | 'proxima'
  let n = 0

  // Cada caso en su propia cita con su propio cliente y su propio asesor: así ninguna restricción
  // de exclusión de un caso estorba a otro y la prueba mide la función, no el orden de los casos.
  async function citaEn(estado: EstadoCita, cuando: Cuando, propuestaPor: 'cliente' | 'asesor' | 'admin', previo: EstadoCita | null) {
    n += 1
    const cli = `cli-p${n}`, ase = `ase-p${n}`
    await db.query(`insert into usuarios values ($1, 'c', 'cliente'), ($2, 'a', 'publicador')`, [cli, ase])
    const futura = new Date(Date.UTC(2032, 0, 1, 16) + n * 86_400_000)
    const c = await crear({
      cliente_uid: cli, asesor_uid: ase, creada_por: cli,
      inicio: futura.toISOString(), fin: new Date(futura.getTime() + 3_600_000).toISOString(),
      clave_idempotencia: `paridad-${n}`,
    })
    const inicio = cuando === 'pasada' ? new Date(Date.UTC(2020, 0, 1, 16) + n * 86_400_000)
      : cuando === 'proxima' ? enMin(90) : futura
    const fin = new Date(inicio.getTime() + 3_600_000)
    const esCambio = estado === 'RESCHEDULE_REQUESTED'
    // Se coloca el estado a mano: la prueba es de la función, no de cómo se llegó ahí.
    await db.query(`update citas set
        inicio = $2, fin = $3, ocupa_desde = $2, ocupa_hasta = $3::timestamptz + interval '15 minutes',
        estado = $4, estado_previo = $5, propuesta_inicio = $6, propuesta_fin = $7, propuesta_por = $8
      where id = $1`, [
      c.id, inicio.toISOString(), fin.toISOString(), estado,
      esCambio ? previo : null,
      esCambio ? new Date(inicio.getTime() + 2 * 86_400_000 + 3 * 3_600_000).toISOString() : null,
      esCambio ? new Date(fin.getTime() + 2 * 86_400_000 + 3 * 3_600_000).toISOString() : null,
      esCambio ? propuestaPor : null,
    ])
    const r = await db.query<Fila>('select * from citas where id = $1', [c.id])
    return { fila: r.rows[0], cli, ase }
  }

  const casos: { estado: EstadoCita; accion: AccionCita; papel: PapelCita; cuando: Cuando; por: 'cliente' | 'asesor' | 'admin'; previo: EstadoCita | null }[] = []
  for (const estado of ESTADOS) {
    for (const accion of ACCIONES) {
      for (const papel of PAPELES) {
        for (const cuando of ['futura', 'pasada'] as const) {
          const variantes = estado === 'RESCHEDULE_REQUESTED'
            ? (['cliente', 'asesor', 'admin'] as const).flatMap((por) => (['CONFIRMED', 'REQUESTED'] as const).map((previo) => ({ por, previo })))
            : [{ por: 'cliente' as const, previo: null }]
          for (const v of variantes) casos.push({ estado, accion, papel, cuando, por: v.por, previo: v.previo })
        }
      }
    }
    // La regla de 2 horas solo importa al cliente cuando cancela o pide otro horario.
    for (const accion of ['cancelar', 'proponer'] as const) {
      const variantes = estado === 'RESCHEDULE_REQUESTED'
        ? (['CONFIRMED', 'REQUESTED'] as const).map((previo) => ({ por: 'asesor' as const, previo }))
        : [{ por: 'cliente' as const, previo: null }]
      for (const v of variantes) casos.push({ estado, accion, papel: 'cliente', cuando: 'proxima', por: v.por, previo: v.previo })
    }
  }

  it(`las ${casos.length} combinaciones coinciden`, async () => {
    const diferencias: string[] = []
    for (const k of casos) {
      const { fila, cli, ase } = await citaEn(k.estado, k.cuando, k.por, k.previo)
      const uid = k.papel === 'cliente' ? cli : k.papel === 'asesor' ? ase : k.papel === 'admin' ? ADMIN : null
      const ahora = new Date()
      const nuevoInicio = new Date(Date.UTC(2028, 0, 3, 16))
      const datos = k.accion === 'proponer'
        ? { inicio: nuevoInicio.toISOString(), fin: new Date(nuevoInicio.getTime() + 3_600_000).toISOString() }
        : k.accion === 'cancelar' || k.accion === 'rechazar' ? { motivo: 'prueba' } : {}

      const esperado = evaluar(k.accion, {
        estado: fila.estado as EstadoCita,
        inicio: fila.inicio as string,
        estado_previo: fila.estado_previo as EstadoCita | null,
        propuesta_inicio: fila.propuesta_inicio as string | null,
        propuesta_por: fila.propuesta_por as 'cliente' | 'asesor' | 'admin' | null,
      }, k.papel, ahora, 'inicio' in datos ? datos.inicio : null)

      const real = await motivoDe(transicionar(fila.id, fila.version, k.accion, uid, k.papel, datos))
      const dice = esperado.ok ? 'ok' : esperado.motivo
      const etiqueta = `${k.estado}${k.previo ? `(antes ${k.previo})` : ''} · ${k.accion} · ${k.papel} · ${k.cuando} · propuso ${k.por}`
      if (dice !== real) diferencias.push(`${etiqueta}: TS=${dice} SQL=${real}`)
      if (real === 'ok') {
        const despues = await db.query<{ estado: string }>('select estado from citas where id = $1', [fila.id])
        if (esperado.ok && despues.rows[0].estado !== esperado.destino) {
          diferencias.push(`${etiqueta}: destino TS=${esperado.destino} SQL=${despues.rows[0].estado}`)
        }
      }
    }
    expect(diferencias).toEqual([])
  }, 900_000)
})
