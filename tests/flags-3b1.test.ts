import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * V-1.1.85 (3b-1) · D-31 — Encender y apagar módulos desde el panel:
 * sólo Super Admin, con motivo, con bitácora y con el servidor decidiendo.
 */

const bd = vi.hoisted(() => ({
  perfil: null as null | Record<string, unknown>,
  valor: {} as Record<string, unknown>,
  version: 3,
  updates: [] as Array<Record<string, unknown>>,
  auditoria: [] as Array<Record<string, unknown>>,
  bitacoraPrevia: [] as Array<Record<string, unknown>>,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcFalla: false,
  sinFuncion: false,
  conflicto: false,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const cadena = (tabla: string): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) {
      c[m] = () => (tabla === 'audit_logs' ? { ...c, then: (r: (v: unknown) => unknown) => r({ data: bd.bitacoraPrevia, error: null }) } : c)
    }
    c.maybeSingle = async () => ({ data: { valor: bd.valor, version: bd.version }, error: null })
    c.update = (f: Record<string, unknown>) => { bd.updates.push(f); return { eq: async () => ({ error: null }) } }
    return c
  }
  return {
    ...real,
    supabaseAdmin: () => ({
      from: (t: string) => cadena(t),
      // `configuracion_cambiar_flag` (migración 31): cambia SÓLO esa clave + bitácora, todo o nada. Misma semántica, simulada.
      rpc: async (fn: string, a: Record<string, unknown>) => {
        bd.rpc.push({ fn, args: a })
        if (bd.sinFuncion) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
        if (bd.rpcFalla) return { data: null, error: { code: 'XX000', message: 'boom' } }
        const flag = a.p_flag as string
        if (!(flag in bd.valor)) return { data: { resultado: 'flag_desconocido' }, error: null }
        if (bd.conflicto || bd.valor[flag] !== a.p_antes) return { data: { resultado: 'conflicto' }, error: null }
        const au = a.p_audit as Record<string, unknown>
        bd.valor = { ...bd.valor, [flag]: a.p_a }
        bd.version += 1
        bd.updates.push({ valor: bd.valor, version: bd.version, actualizado_por: au.actor_email })
        bd.auditoria.push({ actor: { uid: au.actor_uid, email: au.actor_email }, accion: au.accion, entidad: 'configuracion', entidadId: flag, antes: au.antes, despues: au.despues })
        return { data: { resultado: 'ok' }, error: null }
      },
    }),
    exigir: async () => (bd.perfil
      ? { perfil: bd.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: 403 }) }),
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async (x: Record<string, unknown>) => { bd.auditoria.push(x) } }))

import { FLAGS, ETIQUETA_FLAG, MINIMO_MOTIVO_FLAG, decidirCambioDeFlag, normalizarFlags, FLAGS_APAGADOS } from '../src/lib/config/flags'
import { GET, POST } from '../src/app/api/admin/flags/route'

const SUPER = { uid: 'u-1', email: 'super@vivebienn.com', rol: 'admin', superAdmin: true, estado: 'activo', nombre: null }

describe('la decisión (sin base de datos)', () => {
  const apagados = { ...FLAGS_APAGADOS }
  const MOTIVO = 'apertura interna para revisar el portal'

  it('sólo acepta módulos que existen', () => {
    expect(decidirCambioDeFlag(apagados, { flag: 'inventado', valor: true, motivo: MOTIVO })).toEqual({ ok: false, motivo: 'Ese módulo no existe.' })
    expect(decidirCambioDeFlag(apagados, { flag: 'portalClienteInterno', valor: true, motivo: MOTIVO })).toMatchObject({ ok: true })
  })

  it('el valor tiene que ser sí o no de verdad', () => {
    for (const valor of ['true', 1, null, undefined]) {
      expect(decidirCambioDeFlag(apagados, { flag: 'citasEnLinea', valor, motivo: MOTIVO })).toMatchObject({ ok: false })
    }
  })

  it('el motivo es obligatorio y con contenido', () => {
    expect(decidirCambioDeFlag(apagados, { flag: 'citasEnLinea', valor: true, motivo: '   ' })).toMatchObject({ ok: false })
    expect(decidirCambioDeFlag(apagados, { flag: 'citasEnLinea', valor: true, motivo: 'a'.repeat(MINIMO_MOTIVO_FLAG - 1) })).toMatchObject({ ok: false })
    expect(decidirCambioDeFlag(apagados, { flag: 'citasEnLinea', valor: true, motivo: 'a'.repeat(MINIMO_MOTIVO_FLAG) })).toMatchObject({ ok: true })
  })

  it('no se «cambia» a lo mismo que ya está', () => {
    expect(decidirCambioDeFlag({ ...apagados, citasEnLinea: true }, { flag: 'citasEnLinea', valor: true, motivo: MOTIVO }))
      .toEqual({ ok: false, motivo: 'Ese módulo ya está así.' })
  })

  it('devuelve el antes y el después, para la bitácora', () => {
    expect(decidirCambioDeFlag(apagados, { flag: 'portalCliente', valor: true, motivo: `  ${MOTIVO}  ` }))
      .toEqual({ ok: true, flag: 'portalCliente', de: false, a: true, motivo: MOTIVO })
  })

  it('cada módulo tiene nombre para la pantalla', () => {
    for (const f of FLAGS) expect(ETIQUETA_FLAG[f], f).toBeTruthy()
  })
})

describe('la API', () => {
  const pedir = (cuerpo?: unknown) => (cuerpo === undefined
    ? GET(new Request('https://vivebienn.com/api/admin/flags'))
    : POST(new Request('https://vivebienn.com/api/admin/flags', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify(cuerpo),
    })))

  beforeEach(() => {
    bd.perfil = SUPER
    bd.valor = { ...FLAGS_APAGADOS }
    bd.updates = []
    bd.auditoria = []
    bd.bitacoraPrevia = []
    bd.rpc = []
    bd.rpcFalla = false
    bd.sinFuncion = false
    bd.conflicto = false
  })

  it('quien no es Super Admin no entra (lo decide `exigir`)', async () => {
    bd.perfil = null
    expect((await pedir()).status).toBe(403)
    expect((await pedir({ flag: 'portalCliente', valor: true, motivo: 'da igual lo que escriba' })).status).toBe(403)
    expect(bd.updates).toEqual([])
  })

  it('el cambio va por la función transaccional; si falla o falta la migración 31, 503 y nada cambia', async () => {
    const cuerpo = { flag: 'portalClienteInterno', valor: true, motivo: 'apertura interna para revisar' }
    bd.rpcFalla = true
    expect((await pedir(cuerpo)).status).toBe(503)
    bd.rpcFalla = false
    bd.sinFuncion = true
    const r = await pedir(cuerpo)
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/migración 31/)
    expect(bd.updates).toEqual([])
    expect(bd.auditoria).toEqual([])
  })

  it('CONCURRENCIA: si otro Super Admin ya cambió ese módulo, 409 y no se pisa', async () => {
    bd.conflicto = true
    const r = await pedir({ flag: 'portalClienteInterno', valor: true, motivo: 'apertura interna para revisar' })
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('conflicto')
    expect(bd.updates).toEqual([])
  })

  it('GET devuelve el estado, el orden y quién tocó cada uno', async () => {
    bd.valor = { ...FLAGS_APAGADOS, portalClienteInterno: true }
    bd.bitacoraPrevia = [
      { actor_email: 'super@vivebienn.com', entidad_id: 'portalClienteInterno', despues: { valor: true, motivo: 'revisión interna' }, creado_en: '2026-09-22T18:00:00Z' },
      { actor_email: 'otro@vivebienn.com', entidad_id: 'portalClienteInterno', despues: { valor: false, motivo: 'viejo' }, creado_en: '2026-09-20T10:00:00Z' },
    ]
    const r = await pedir()
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.flags.portalClienteInterno).toBe(true)
    expect(j.orden).toEqual([...FLAGS])
    // Sólo el último cambio de cada módulo.
    expect(j.ultimos.portalClienteInterno).toEqual({ por: 'super@vivebienn.com', en: '2026-09-22T18:00:00Z', motivo: 'revisión interna', a: true })
  })

  it('sin motivo no se guarda nada', async () => {
    const r = await pedir({ flag: 'portalCliente', valor: true, motivo: 'corto' })
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ error: expect.stringContaining('motivo') })
    expect(bd.updates).toEqual([])
    expect(bd.auditoria).toEqual([])
  })

  it('un módulo que no existe no se guarda', async () => {
    expect((await pedir({ flag: 'portalDeLaSuerte', valor: true, motivo: 'porque sí, y con motivo largo' })).status).toBe(400)
    expect(bd.updates).toEqual([])
  })

  it('un cambio bueno: escribe, sube la versión, audita el antes y el después, y responde lo guardado', async () => {
    const r = await pedir({ flag: 'portalClienteInterno', valor: true, motivo: 'apertura interna para revisar' })
    expect(r.status).toBe(200)

    expect(bd.updates).toHaveLength(1)
    const escrito = bd.updates[0]
    expect((escrito.valor as Record<string, boolean>).portalClienteInterno).toBe(true)
    // No se pisa lo demás.
    expect((escrito.valor as Record<string, boolean>).portalCliente).toBe(false)
    expect(escrito.version).toBe(4)
    expect(escrito.actualizado_por).toBe('super@vivebienn.com')

    expect(bd.auditoria).toMatchObject([{
      accion: 'configuracion.flag',
      entidad: 'configuracion',
      entidadId: 'portalClienteInterno',
      antes: { valor: false },
      despues: { valor: true, motivo: 'apertura interna para revisar' },
    }])

    // La respuesta sale de la base, no de lo que pidió el navegador (D-32).
    const j = await r.json()
    expect(j.flags).toMatchObject(normalizarFlags(bd.valor))
  })

  it('apagar también pasa por lo mismo', async () => {
    bd.valor = { ...FLAGS_APAGADOS, citasEnLinea: true }
    const r = await pedir({ flag: 'citasEnLinea', valor: false, motivo: 'se apaga hasta tener Mis visitas' })
    expect(r.status).toBe(200)
    expect((bd.updates[0].valor as Record<string, boolean>).citasEnLinea).toBe(false)
    expect(bd.auditoria[0]).toMatchObject({ antes: { valor: true }, despues: { valor: false } })
  })
})

describe('migración 24 — ensayo en PGlite', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const sql = (n: string) => readFileSync(join(__dirname, '..', 'supabase', n), 'utf8')

  it('añade la marca de alertas, deja las claves explícitas sin pisar lo encendido, y se revierte', async () => {
    const db = await PGlite.create()
    await db.exec(`
      create table public.busquedas_guardadas (id bigint primary key, uid text, nombre text, filtros jsonb, alertas boolean default false, creado_en timestamptz default now());
      create table public.configuracion (clave text primary key, valor jsonb not null, version integer not null default 1, actualizado_por text, actualizado_en timestamptz default now());
      insert into public.busquedas_guardadas (id, uid, filtros) values (1, 'u-1', '{"op":"venta"}');
      insert into public.configuracion (clave, valor, actualizado_por) values ('flags', '{"portalCliente": true, "aiContent": false}'::jsonb, 'antes');
    `)

    await db.exec(sql('24-alertas-y-flags.sql'))
    await db.exec(sql('24-alertas-y-flags.sql')) // idempotente

    const col = (await db.query<{ t: string; nulos: string }>(
      `select data_type as t, is_nullable as nulos from information_schema.columns
        where table_schema='public' and table_name='busquedas_guardadas' and column_name='revisadas_en'`)).rows[0]
    expect(col).toEqual({ t: 'timestamp with time zone', nulos: 'YES' })

    // La búsqueda que ya existía sigue ahí, con la marca vacía (= como hoy).
    expect((await db.query('select id, uid, revisadas_en from public.busquedas_guardadas')).rows)
      .toEqual([{ id: 1, uid: 'u-1', revisadas_en: null }])

    const flags = (await db.query<{ valor: Record<string, boolean> }>("select valor from public.configuracion where clave='flags'")).rows[0].valor
    expect(flags.portalCliente).toBe(true)          // lo encendido NO se pisa
    expect(flags.portalClienteInterno).toBe(false)  // la clave que faltaba, explícita
    expect(flags.citasEnLinea).toBe(false)
    for (const f of FLAGS) expect(Object.keys(flags), f).toContain(f)

    await db.exec(sql('24-alertas-y-flags.REVERTIR.sql'))
    expect((await db.query(
      `select 1 from information_schema.columns where table_schema='public' and table_name='busquedas_guardadas' and column_name='revisadas_en'`)).rows)
      .toEqual([])
  })
})
