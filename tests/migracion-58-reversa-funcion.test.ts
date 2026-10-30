import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 58 — la REVERSA devuelve `baja_de_cuenta` EXACTAMENTE a la definición que estaba vigente antes de la 58 (28-oct-2026).
 * Una reversa que solo borra las tablas dejaría la función nueva (que borra tablas que ya no existen → la baja de cuenta fallaría para todos).
 * Se demuestra comparando `pg_get_functiondef` antes de la 58 y después de revertir + reaplicar la 26. En un entorno REAL (staging/producción) el procedimiento
 * es el mismo pero con la definición VIVA guardada antes de aplicar (no la del archivo): ver «Plan de despliegue — migración 58» en Obsidian.
 */
let db: PGlite
const raiz = path.join(__dirname, '..')
const leer = (p: string) => readFileSync(path.join(raiz, p), 'utf8')
const def = async () =>
  (await db.query<{ d: string }>(`select pg_get_functiondef('public.baja_de_cuenta(text,text,timestamptz,text)'::regprocedure) d`)).rows[0].d

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(leer('docker/esquema.sql'))
  await db.exec(leer('supabase/25-baja-de-cuenta.REVERTIR.sql'))
  await db.exec(leer('supabase/25-baja-de-cuenta.sql'))
  await db.exec(leer('supabase/26-baja-de-cuenta-funcion.sql'))
  await db.exec(leer('docker/datos-sinteticos.sql'))
}, 120_000)
afterAll(async () => { await db?.close() })

describe('reversa de la 58', () => {
  it('antes de la 58 la función no conoce las tablas nuevas; tras la 58 sí', async () => {
    const antes = await def()
    expect(antes).not.toContain('cliente_contactos')
    await db.exec(leer('supabase/58-cliente-notificaciones-y-contactos.sql'))
    expect(await def()).toContain('cliente_contactos')
    expect(await def()).not.toBe(antes)
  })

  it('REVERTIR.sql (sola, una transacción) deja la función IDÉNTICA a la de antes y la baja sigue funcionando', async () => {
    // La definición "vigente antes" se reconstruye en una base gemela (26 sola) y se compara byte a byte.
    const gemela = await PGlite.create()
    await gemela.exec(leer('docker/esquema.sql'))
    await gemela.exec(leer('supabase/25-baja-de-cuenta.REVERTIR.sql'))
    await gemela.exec(leer('supabase/25-baja-de-cuenta.sql'))
    await gemela.exec(leer('supabase/26-baja-de-cuenta-funcion.sql'))
    const esperada = (await gemela.query<{ d: string }>(`select pg_get_functiondef('public.baja_de_cuenta(text,text,timestamptz,text)'::regprocedure) d`)).rows[0].d
    await gemela.close()

    // La reversa es UNA transacción: restaura la función (bloque de la 26) y borra lo nuevo. No hace falta ningún segundo paso.
    await db.exec(leer('supabase/58-cliente-notificaciones-y-contactos.REVERTIR.sql'))
    expect(await def()).toBe(esperada)
    expect(await def()).not.toContain('cliente_contactos')

    const r = (await db.query<{ r: Record<string, unknown> }>(`select public.baja_de_cuenta('u-cliente') as r`)).rows[0].r
    expect(r.resultado).toBe('bloqueada')   // sin las tablas nuevas, la baja NO se rompe
  })

  it('NEGATIVA: borrar SOLO las tablas (la reversa ingenua que había antes) rompe la baja de cuenta — por eso la reversa restaura la función en la misma transacción', async () => {
    const otra = await PGlite.create()
    await otra.exec(leer('docker/esquema.sql'))
    await otra.exec(leer('supabase/25-baja-de-cuenta.REVERTIR.sql'))
    await otra.exec(leer('supabase/25-baja-de-cuenta.sql'))
    await otra.exec(leer('supabase/26-baja-de-cuenta-funcion.sql'))
    await otra.exec(leer('supabase/58-cliente-notificaciones-y-contactos.sql'))
    await otra.exec(leer('docker/datos-sinteticos.sql'))
    await otra.exec('drop table public.cliente_contactos; drop table public.notificaciones; drop table public.preferencias_notificacion;')
    await expect(otra.query(`select public.baja_de_cuenta('u-cliente')`)).rejects.toThrow()
    await otra.close()
  })
})
