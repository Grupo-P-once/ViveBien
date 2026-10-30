import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 58 — REGRESIÓN de `baja_de_cuenta` ya REEMPLAZADA (28-oct-2026).
 *
 * La 58 sustituye la función de la 26. Las pruebas de la 26 solo corren contra la función de la 26; aquí se aplican la 26 Y la 58 y se repiten los casos que
 * más duelen si la función reemplazada se rompe: baja autorizada, baja rechazada, último super administrador protegido, idempotencia y rollback ATÓMICO
 * (si algo falla DESPUÉS de los borrados nuevos, los datos nuevos del cliente siguen ahí: no se pierde una parte de la baja).
 * PGlite en memoria con esquema y datos INVENTADOS (`docker/`). Nada toca producción.
 */
let db: PGlite
const raiz = path.join(__dirname, '..')
const leer = (p: string) => readFileSync(path.join(raiz, p), 'utf8')
const uno = async <T>(sql: string): Promise<T> => ((await db.query<T>(sql)).rows[0])
const n = async (sql: string) => Number((await uno<{ n: string }>(`select count(*) n from ${sql}`)).n)

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(leer('docker/esquema.sql'))
  await db.exec(leer('supabase/25-baja-de-cuenta.REVERTIR.sql'))
  await db.exec(leer('supabase/25-baja-de-cuenta.sql'))
  await db.exec(leer('supabase/26-baja-de-cuenta-funcion.sql'))
  await db.exec(leer('supabase/58-cliente-notificaciones-y-contactos.sql'))
  await db.exec(leer('docker/datos-sinteticos.sql'))
}, 120_000)
afterAll(async () => { await db?.close() })

const baja = async (uid: string) => (await uno<{ r: Record<string, unknown> }>(`select public.baja_de_cuenta('${uid}') as r`)).r
const sembrar = async (uid: string, clave: string) => {
  await db.exec(`insert into cliente_contactos (uid, propiedad_id, canal) values ('${uid}', 'p1', 'whatsapp')`)
  await db.exec(`insert into notificaciones (uid, tipo, titulo, clave) values ('${uid}', 'sistema', 'Aviso de prueba', '${clave}')`)
  await db.exec(`insert into preferencias_notificacion (uid, correo_alertas) values ('${uid}', true) on conflict (uid) do nothing`)
}
const datosNuevos = async (uid: string) =>
  (await n(`cliente_contactos where uid = '${uid}'`)) + (await n(`notificaciones where uid = '${uid}'`)) + (await n(`preferencias_notificacion where uid = '${uid}'`))

describe('baja_de_cuenta tras la 58', () => {
  it('baja RECHAZADA (último super administrador): no cambia la cuenta ni borra sus datos nuevos', async () => {
    await sembrar('u-super-2', 'rechazo-1')
    expect((await baja('u-super-1')).resultado).toBe('bloqueada')          // hay otro super activo: se puede
    expect((await baja('u-super-2')).resultado).toBe('ultimo_super_admin') // ya es el último: se rechaza
    expect(await uno(`select estado from usuarios where uid = 'u-super-2'`)).toMatchObject({ estado: 'activo' })
    expect(await datosNuevos('u-super-2')).toBe(3)                           // nada se borró
  })

  it('baja AUTORIZADA de un cliente: lápida + sus datos nuevos borrados, los de otra persona intactos', async () => {
    await sembrar('u-cliente', 'cliente-1')
    await sembrar('u-publicador', 'otro-1')
    const r = await baja('u-cliente')
    expect(r.resultado).toBe('bloqueada')
    expect(await uno(`select estado, email from usuarios where uid = 'u-cliente'`)).toMatchObject({ estado: 'eliminada', email: null })
    expect(await datosNuevos('u-cliente')).toBe(0)
    expect(await datosNuevos('u-publicador')).toBe(3)
  })

  it('es idempotente: repetir no cambia nada ni vuelve a tocar lo ajeno', async () => {
    expect((await baja('u-cliente')).resultado).toBe('ya_eliminada')
    expect(await n(`bajas_de_cuenta where uid = 'u-cliente'`)).toBe(1)
    expect(await datosNuevos('u-publicador')).toBe(3)
  })

  it('ROLLBACK ATÓMICO: un error DESPUÉS de los borrados nuevos deja la cuenta Y sus datos nuevos intactos', async () => {
    // Sin este orden la prueba sería trivial (el fallo llegaría ANTES de los borrados nuevos y nada demostraría atomicidad).
    const sql = leer('supabase/58-cliente-notificaciones-y-contactos.sql')
    expect(sql.indexOf('delete from public.preferencias_notificacion')).toBeGreaterThan(-1)
    expect(sql.indexOf('delete from public.preferencias_notificacion')).toBeLessThan(sql.indexOf('delete from public.bloqueos_asesores'))
    await sembrar('u-admin', 'atomico-1')
    // El borrado de `bloqueos_asesores` va DESPUÉS de los tres borrados nuevos dentro de la función; un disparador de sentencia lo hace fallar.
    await db.exec(`
      create or replace function reventar_despues() returns trigger language plpgsql as $$
      begin raise exception 'fallo_intencional_despues'; end $$;
      create trigger t_reventar_despues before delete on public.bloqueos_asesores
        for each statement execute function reventar_despues();`)
    await expect(db.query(`select public.baja_de_cuenta('u-admin')`)).rejects.toThrow()
    expect(await uno(`select estado from usuarios where uid = 'u-admin'`)).toMatchObject({ estado: 'activo' })
    expect(await n(`bajas_de_cuenta where uid = 'u-admin'`)).toBe(0)
    expect(await datosNuevos('u-admin')).toBe(3)                              // los borrados nuevos se DESHICIERON con el resto
    await db.exec(`drop trigger t_reventar_despues on public.bloqueos_asesores`)
    expect((await baja('u-admin')).resultado).toBe('bloqueada')                // sin el fallo, la misma baja sí completa
    expect(await datosNuevos('u-admin')).toBe(0)
  })
})
