import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 63: la baja promocional deja una SUPRESIÓN durable (sólo la huella) que bloquea el marketing y NO el servicio ni lo transaccional,
 * y 'email.failed' / 'email.suppressed' actualizan el envío. Todo en PGlite, en memoria, con datos sintéticos: nada toca ninguna base real.
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let db: PGlite
const q = async <T = Record<string, unknown>>(texto: string, params: unknown[] = []) => (await db.query<T>(texto, params)).rows
const fn = async (texto: string, params: unknown[]) => (await db.query<{ r: Record<string, unknown> }>(`select ${texto} as r`, params)).rows[0].r
const PREFS = { operacion: 'venta', tipos: ['nave'], zonas: ['León'] }
const suscribir = (email: string) => fn('public.correo_suscribir($1, $2, $3::jsonb, $4, $5)', [email, 'Ana', JSON.stringify(PREFS), 'recomendaciones', 'marketing-test'])
const reservar = (clave: string, cat: string, email: string, sus: string | null = null) =>
  fn('public.correo_reservar_envio($1, $2, $3, $4, $5::uuid, $6::text[], $7)', [clave, cat, 'prueba', email, sus, null, 'produccion'])
const evento = (id: string, tipo: string, email: string, resend: string | null = null, permanente = false) => fn('public.correo_evento($1, $2, $3, $4, $5)', [id, tipo, email, resend, permanente])
const motivo = async (email: string) => (await q<{ motivo: string }>('select motivo from public.correo_supresiones where email_hash = public.correo_huella($1)', [email]))[0]?.motivo ?? null

async function activar(email: string): Promise<string> {
  const s = await suscribir(email)
  await fn('public.correo_confirmar($1::uuid)', [s.id])
  return String(s.id)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(sql('62-correo-suscripciones.sql'))
  await db.exec(sql('63-correo-baja-promocional.sql'))
}, 90_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.query("select public.correo_conciliar(0, 0, 'sintetico', null)") })

describe('baja promocional = supresión durable que sólo bloquea el marketing', () => {
  it('es idempotente (se puede reaplicar) y el CHECK sólo admite los motivos conocidos', async () => {
    await db.exec(sql('63-correo-baja-promocional.sql'))
    await expect(db.query(`insert into public.correo_supresiones (email_hash, motivo) values ('x', 'inventado')`)).rejects.toThrow(/check/i)
  })

  it('una baja escribe la supresión (sólo huella) y detiene el marketing, pero NO el servicio ni lo transaccional', async () => {
    const id = await activar('baja.uno@ejemplo.test')
    expect(await reservar('reco/uno/1', 'marketing', 'baja.uno@ejemplo.test', id)).toMatchObject({ accion: 'enviar' })
    await fn('public.correo_baja($1::uuid, $2)', [id, 'enlace'])
    expect(await motivo('baja.uno@ejemplo.test')).toBe('baja_promocional')
    expect(await reservar('reco/uno/2', 'marketing', 'baja.uno@ejemplo.test', id)).toMatchObject({ accion: 'suprimido' })
    expect(await reservar('aviso/uno/1', 'servicio', 'baja.uno@ejemplo.test')).toMatchObject({ accion: 'enviar' })
    expect(await reservar('tx/uno/1', 'transaccional', 'baja.uno@ejemplo.test')).toMatchObject({ accion: 'enviar' })
    // La tabla guarda la huella, nunca la dirección.
    const filas = await q<Record<string, unknown>>('select * from public.correo_supresiones')
    expect(JSON.stringify(filas)).not.toContain('ejemplo.test')
  })

  it('repetir la baja no duplica la supresión', async () => {
    const id = await activar('baja.dos@ejemplo.test')
    await fn('public.correo_baja($1::uuid, $2)', [id, 'enlace'])
    expect((await fn('public.correo_baja($1::uuid, $2)', [id, 'enlace'])).cambio).toBe(false)
    expect((await q('select 1 from public.correo_supresiones where email_hash = public.correo_huella($1)', ['baja.dos@ejemplo.test'])).length).toBe(1)
  })

  it('una id desconocida no rompe ni crea supresiones', async () => {
    const antes = (await q('select 1 from public.correo_supresiones')).length
    expect(await fn(`public.correo_baja('00000000-0000-0000-0000-000000000000'::uuid, 'x')`, [])).toMatchObject({ ok: true, cambio: false })
    expect((await q('select 1 from public.correo_supresiones')).length).toBe(antes)
  })

  it('la supresión sobrevive a la purga de 2 años de la suscripción y a «olvidar la cuenta»', async () => {
    const id = await activar('baja.purga@ejemplo.test')
    await fn('public.correo_baja($1::uuid, $2)', [id, 'enlace'])
    await db.query(`update public.correo_suscriptores set baja_en = now() - interval '800 days', actualizado_en = now() - interval '800 days' where id = $1::uuid`, [id])
    expect((await fn('public.correo_purgar()', [])).suscripciones).toBeGreaterThanOrEqual(1)
    expect(await q('select 1 from public.correo_suscriptores where id = $1::uuid', [id])).toEqual([])
    expect(await motivo('baja.purga@ejemplo.test')).toBe('baja_promocional')
    expect(await reservar('reco/purga/1', 'marketing', 'baja.purga@ejemplo.test')).toMatchObject({ accion: 'suprimido' })
    await fn('public.correo_olvidar_cuenta($1, $2)', ['uid-sintetico', 'baja.purga@ejemplo.test'])
    expect(await motivo('baja.purga@ejemplo.test')).toBe('baja_promocional')
  })

  it('volver a suscribirse exige confirmar: antes sigue bloqueado; al confirmar se levanta la supresión', async () => {
    const id = await activar('vuelve@ejemplo.test')
    await fn('public.correo_baja($1::uuid, $2)', [id, 'enlace'])
    const otra = await suscribir('vuelve@ejemplo.test')
    expect(otra.accion).toBe('confirmar')
    expect(await reservar('reco/vuelve/1', 'marketing', 'vuelve@ejemplo.test', id)).toMatchObject({ accion: 'suprimido' })
    expect((await fn('public.correo_confirmar($1::uuid)', [id])).estado).toBe('activa')
    expect(await motivo('vuelve@ejemplo.test')).toBeNull()
    expect(await reservar('reco/vuelve/2', 'marketing', 'vuelve@ejemplo.test', id)).toMatchObject({ accion: 'enviar' })
  })

  it('desde la cuenta: retirar escribe la supresión y aceptar de nuevo la levanta', async () => {
    const aceptar = (a: boolean) => fn('public.correo_cuenta_marketing($1, $2, $3, $4::jsonb, $5)', ['uid-cuenta', 'cuenta@ejemplo.test', a, JSON.stringify(PREFS), 'marketing-test'])
    expect((await aceptar(true)).estado).toBe('activa')
    await aceptar(false)
    expect(await motivo('cuenta@ejemplo.test')).toBe('baja_promocional')
    expect((await aceptar(true)).estado).toBe('activa')
    expect(await motivo('cuenta@ejemplo.test')).toBeNull()
  })

  it('un rebote permanente reemplaza la baja promocional (y ya bloquea el servicio); una queja no se rebaja', async () => {
    const id = await activar('rebota@ejemplo.test')
    await fn('public.correo_baja($1::uuid, $2)', [id, 'enlace'])
    await evento('svix-r1', 'email.bounced', 'rebota@ejemplo.test', null, true)
    expect(await motivo('rebota@ejemplo.test')).toBe('rebote')
    expect(await reservar('aviso/rebota/1', 'servicio', 'rebota@ejemplo.test')).toMatchObject({ accion: 'suprimido' })

    const id2 = await activar('queja@ejemplo.test')
    await evento('svix-q1', 'email.complained', 'queja@ejemplo.test')
    await fn('public.correo_baja($1::uuid, $2)', [id2, 'enlace'])
    expect(await motivo('queja@ejemplo.test')).toBe('queja')
  })
})

describe('eventos del proveedor: fallos y supresiones del lado de Resend', () => {
  const envio = async (clave: string, estado: string, resend: string) =>
    db.query(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado, resend_id, entorno) values ($1, 'servicio', 'x', 'h', $2, $3, 'produccion')`, [clave, estado, resend])
  const estado = async (resend: string) => (await q<{ estado: string }>('select estado from public.correo_envios where resend_id = $1', [resend]))[0].estado

  it("'email.failed' marca error sólo si seguía pendiente o enviado; un entregado no se toca", async () => {
    await envio('f/1', 'enviado', 're_f1'); await envio('f/2', 'entregado', 're_f2')
    await evento('svix-f1', 'email.failed', 'x@ejemplo.test', 're_f1')
    await evento('svix-f2', 'email.failed', 'x@ejemplo.test', 're_f2')
    expect(await estado('re_f1')).toBe('error')
    expect(await estado('re_f2')).toBe('entregado')
  })

  it('un evento repetido no se vuelve a aplicar; uno fuera de orden (entrega tras fallo) no revive el envío', async () => {
    await envio('f/3', 'enviado', 're_f3')
    expect(await evento('svix-f3', 'email.failed', 'x@ejemplo.test', 're_f3')).toMatchObject({ resultado: 'aplicado' })
    expect(await evento('svix-f3', 'email.failed', 'x@ejemplo.test', 're_f3')).toMatchObject({ resultado: 'duplicado' })
    await evento('svix-f3b', 'email.delivered', 'x@ejemplo.test', 're_f3')
    expect(await estado('re_f3')).toBe('error')
  })

  it("'email.suppressed' marca el envío como suprimido (omitido) y suprime la dirección", async () => {
    await envio('f/4', 'enviado', 're_f4')
    await evento('svix-s1', 'email.suppressed', 'suprimida@ejemplo.test', 're_f4')
    expect(await estado('re_f4')).toBe('suprimido')
    expect(await motivo('suprimida@ejemplo.test')).toBe('rebote')
  })
})

describe('reversa', () => {
  it('REVERTIR restaura las funciones y el CHECK de la 62, y la 63 se puede volver a aplicar', async () => {
    await db.exec(sql('63-correo-baja-promocional.REVERTIR.sql'))
    await expect(db.query(`insert into public.correo_supresiones (email_hash, motivo) values ('y', 'baja_promocional')`)).rejects.toThrow(/check/i)
    const id = await activar('reversa@ejemplo.test')
    await fn('public.correo_baja($1::uuid, $2)', [id, 'enlace'])
    expect(await motivo('reversa@ejemplo.test')).toBeNull() // la 62 no escribía supresión en la baja
    await db.exec(sql('63-correo-baja-promocional.sql'))
    const id2 = await activar('reversa.dos@ejemplo.test')
    await fn('public.correo_baja($1::uuid, $2)', [id2, 'enlace'])
    expect(await motivo('reversa.dos@ejemplo.test')).toBe('baja_promocional')
  })
})
