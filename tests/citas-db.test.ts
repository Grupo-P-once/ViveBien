import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { ESTADOS, ACCIONES, evaluar, type EstadoCita, type PapelCita, type AccionCita } from '../src/lib/citas/estados'

/**
 * La migración 15 contra un Postgres de verdad (PGlite, en memoria).
 *
 * Nada de esto toca la base de producción: la base vive y muere dentro de la
 * prueba. Aquí se prueba lo que sólo Postgres garantiza —que no haya
 * empalmes, las versiones, los permisos— y que la función SQL y
 * `src/lib/citas/estados.ts` digan exactamente lo mismo.
 */

let db: PGlite

const CLIENTE = 'cli'
const ASESOR = 'ase'

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

beforeAll(async () => {
  db = await PGlite.create({ extensions: { btree_gist } })
  // Lo mínimo de Supabase que la migración supone.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions;
    create table public.usuarios (uid text primary key, nombre text);
    create table public.propiedades (id text primary key, titulo text);
    insert into public.usuarios values ('cli', 'Cliente'), ('ase', 'Asesor'), ('otro', 'Otro cliente');
    insert into public.propiedades values ('p1', 'Nave');
  `)
  await db.exec(readFileSync(path.join(process.cwd(), 'supabase', '15-citas.sql'), 'utf8'))
}, 60_000)

afterAll(async () => { await db?.close() })

describe('sin empalmes', () => {
  it('la misma clave devuelve la misma cita (doble clic, reintento)', async () => {
    const a = await crear({ inicio: '2031-01-06T16:00:00Z', fin: '2031-01-06T17:00:00Z', clave_idempotencia: 'idem-0001' })
    const b = await crear({ inicio: '2031-01-06T16:00:00Z', fin: '2031-01-06T17:00:00Z', clave_idempotencia: 'idem-0001' })
    expect(b.id).toBe(a.id)
    const n = await db.query<{ n: number }>(`select count(*)::int as n from citas where clave_idempotencia = 'idem-0001'`)
    expect(n.rows[0].n).toBe(1)
  })

  it('otra cita del mismo asesor dentro del margen choca; justo después, no', async () => {
    const choque = motivoDe(crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-06T17:00:00Z', fin: '2031-01-06T18:00:00Z', clave_idempotencia: 'idem-0002' }))
    expect(await choque).toBe('23P01')
    const libre = await crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-06T17:15:00Z', fin: '2031-01-06T18:15:00Z', clave_idempotencia: 'idem-0003' })
    expect(libre.estado).toBe('REQUESTED')
  })

  it('el mismo cliente no puede tener dos visitas a la vez, aunque sean de asesores distintos', async () => {
    await db.exec(`insert into usuarios values ('ase2', 'Otro asesor') on conflict do nothing`)
    const r = motivoDe(crear({ asesor_uid: 'ase2', inicio: '2031-01-06T16:30:00Z', fin: '2031-01-06T17:30:00Z', clave_idempotencia: 'idem-0004' }))
    expect(await r).toBe('23P01')
  })

  it('una cita cancelada libera su horario', async () => {
    const c = await crear({ inicio: '2031-01-08T16:00:00Z', fin: '2031-01-08T17:00:00Z', clave_idempotencia: 'idem-0005' })
    await transicionar(c.id, 1, 'cancelar', CLIENTE, 'cliente')
    const nueva = await crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-08T16:00:00Z', fin: '2031-01-08T17:00:00Z', clave_idempotencia: 'idem-0006' })
    expect(nueva.estado).toBe('REQUESTED')
  })

  it('dos peticiones simultáneas por el mismo horario: entra exactamente una', async () => {
    const r = await Promise.allSettled([
      crear({ inicio: '2031-01-09T16:00:00Z', fin: '2031-01-09T17:00:00Z', clave_idempotencia: 'idem-0007' }),
      crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-01-09T16:00:00Z', fin: '2031-01-09T17:00:00Z', clave_idempotencia: 'idem-0008' }),
    ])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
  })

  it('no se puede crear en el pasado', async () => {
    expect(await motivoDe(crear({ inicio: '2020-01-01T16:00:00Z', fin: '2020-01-01T17:00:00Z', clave_idempotencia: 'idem-0009' }))).toBe('fuera_de_tiempo')
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

  it('proponer un horario ocupado se rechaza antes de apartarlo', async () => {
    const a = await crear({ inicio: '2031-03-03T16:00:00Z', fin: '2031-03-03T17:00:00Z', clave_idempotencia: 'idem-0201' })
    await crear({ cliente_uid: 'otro', creada_por: 'otro', inicio: '2031-03-03T18:00:00Z', fin: '2031-03-03T19:00:00Z', clave_idempotencia: 'idem-0202' })
    expect(await motivoDe(transicionar(a.id, 1, 'proponer', ASESOR, 'asesor', { inicio: '2031-03-03T17:30:00Z', fin: '2031-03-03T18:30:00Z' }))).toBe('horario_ocupado')
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

describe('nadie fuera del servidor', () => {
  it('anon y authenticated no leen ni ejecutan nada', async () => {
    for (const rol of ['anon', 'authenticated']) {
      await db.exec(`set role ${rol}`)
      expect(await motivoDe(db.query('select count(*) from citas'))).toMatch(/permission denied/)
      expect(await motivoDe(db.query('select count(*) from citas_tokens'))).toMatch(/permission denied/)
      expect(await motivoDe(db.query(`select * from cita_crear('{}'::jsonb)`))).toMatch(/permission denied/)
      expect(await motivoDe(db.query(`select * from cita_transicionar(gen_random_uuid(), 1, 'cancelar', 'x', 'cliente', 'panel', '{}'::jsonb)`))).toMatch(/permission denied/)
      await db.exec('reset role')
    }
  })
})

/**
 * La prueba que mantiene juntas las dos copias de las reglas: para cada
 * estado × acción × papel, con la visita en el futuro y en el pasado, lo que
 * dice `evaluar()` tiene que ser lo mismo que hace la función SQL.
 */
describe('paridad: estados.ts ≡ cita_transicionar', () => {
  const PAPELES: PapelCita[] = ['cliente', 'asesor', 'admin', 'sistema']
  const uidDe = (p: PapelCita) => (p === 'cliente' ? CLIENTE : p === 'asesor' ? ASESOR : p === 'admin' ? 'admin-x' : null)
  let n = 0

  async function citaEn(estado: EstadoCita, pasada: boolean, propuestaPor: 'cliente' | 'asesor' | 'admin'): Promise<Fila> {
    // Cada caso en su propio día (de 16:00 a 17:00), para que no choquen entre sí:
    // las futuras desde 2032, las pasadas desde 2020.
    n += 1
    const futura = new Date(Date.UTC(2032, 0, 1, 16) + n * 86_400_000)
    const c = await crear({
      inicio: futura.toISOString(),
      fin: new Date(futura.getTime() + 3_600_000).toISOString(),
      clave_idempotencia: `paridad-${n}`,
    })
    const inicio = pasada ? new Date(Date.UTC(2020, 0, 1, 16) + n * 86_400_000) : futura
    const fin = new Date(inicio.getTime() + 3_600_000)
    const esCambio = estado === 'RESCHEDULE_REQUESTED'
    // Se coloca el estado a mano: la prueba es de la función, no de cómo se llegó ahí.
    await db.query(`update citas set
        inicio = $2, fin = $3, ocupa_desde = $2, ocupa_hasta = $3::timestamptz + interval '15 minutes',
        estado = $4, estado_previo = $5, propuesta_inicio = $6, propuesta_fin = $7, propuesta_por = $8
      where id = $1`, [
      c.id, inicio.toISOString(), fin.toISOString(), estado,
      esCambio ? 'CONFIRMED' : null,
      esCambio ? new Date(inicio.getTime() + 2 * 86_400_000 + 3 * 3_600_000).toISOString() : null,
      esCambio ? new Date(fin.getTime() + 2 * 86_400_000 + 3 * 3_600_000).toISOString() : null,
      esCambio ? propuestaPor : null,
    ])
    const r = await db.query<Fila>('select * from citas where id = $1', [c.id])
    return r.rows[0]
  }

  const casos: { estado: EstadoCita; accion: AccionCita; papel: PapelCita; pasada: boolean; por: 'cliente' | 'asesor' | 'admin' }[] = []
  for (const estado of ESTADOS) {
    for (const accion of ACCIONES) {
      for (const papel of PAPELES) {
        for (const pasada of [false, true]) {
          for (const por of estado === 'RESCHEDULE_REQUESTED' ? (['cliente', 'asesor', 'admin'] as const) : (['cliente'] as const)) {
            casos.push({ estado, accion, papel, pasada, por })
          }
        }
      }
    }
  }

  it(`las ${casos.length} combinaciones coinciden`, async () => {
    const diferencias: string[] = []
    for (const k of casos) {
      const fila = await citaEn(k.estado, k.pasada, k.por)
      const ahora = new Date()
      const nuevoInicio = new Date(Date.UTC(2028, 0, 3, 16))
      const datos = k.accion === 'proponer'
        ? { inicio: nuevoInicio.toISOString(), fin: new Date(nuevoInicio.getTime() + 3_600_000).toISOString() }
        : k.accion === 'cancelar' ? { motivo: 'prueba' } : {}

      const esperado = evaluar(k.accion, {
        estado: fila.estado as EstadoCita,
        inicio: fila.inicio as string,
        estado_previo: fila.estado_previo as EstadoCita | null,
        propuesta_inicio: fila.propuesta_inicio as string | null,
        propuesta_por: fila.propuesta_por as 'cliente' | 'asesor' | 'admin' | null,
      }, k.papel, ahora, datos && 'inicio' in datos ? datos.inicio : null)

      const real = await motivoDe(transicionar(fila.id, fila.version, k.accion, uidDe(k.papel), k.papel, datos))
      const dice = esperado.ok ? 'ok' : esperado.motivo
      if (dice !== real) diferencias.push(`${k.estado} · ${k.accion} · ${k.papel} · ${k.pasada ? 'pasada' : 'futura'} · propuso ${k.por}: TS=${dice} SQL=${real}`)
      if (real === 'ok') {
        const despues = await db.query<{ estado: string }>('select estado from citas where id = $1', [fila.id])
        if (esperado.ok && despues.rows[0].estado !== esperado.destino) {
          diferencias.push(`${k.estado} · ${k.accion} · ${k.papel}: destino TS=${esperado.destino} SQL=${despues.rows[0].estado}`)
        }
        // Que la cita no siga ocupando horario para los casos siguientes.
        await db.query(`update citas set estado = 'CANCELLED' where id = $1`, [fila.id])
      }
    }
    expect(diferencias).toEqual([])
  }, 120_000)
})
