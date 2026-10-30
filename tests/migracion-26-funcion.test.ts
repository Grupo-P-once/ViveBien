import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * V-1.1.87 · D-43 — La función `baja_de_cuenta` en PGlite.
 *
 * El contenedor de Docker (PostgreSQL 17.6, el mismo que producción) es la
 * validación principal: `docker/` tiene el esquema, los datos inventados y las
 * 29 pruebas. Esto es el **segundo motor**, que corre en cada `vitest` sin
 * necesidad de Docker y cubre lo esencial.
 *
 * Todo en memoria. Nada toca producción, y ningún dato es real.
 */

let db: PGlite
const raiz = path.join(__dirname, '..')
const leer = (p: string) => readFileSync(path.join(raiz, p), 'utf8')
const uno = async <T>(sql: string): Promise<T> => ((await db.query<T>(sql)).rows[0])

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(leer('docker/esquema.sql'))
  await db.exec(leer('supabase/25-baja-de-cuenta.REVERTIR.sql'))
  await db.exec(leer('supabase/25-baja-de-cuenta.sql'))
  await db.exec(leer('supabase/26-baja-de-cuenta-funcion.sql'))
  await db.exec(leer('docker/datos-sinteticos.sql'))
}, 120_000)

afterAll(async () => { await db?.close() })

const baja = async (uid: string) =>
  (await uno<{ r: Record<string, unknown> }>(`select public.baja_de_cuenta('${uid}') as r`)).r

describe('baja_de_cuenta en PGlite', () => {
  it('uid inexistente → no_existe, sin tocar nada', async () => {
    expect((await baja('no-existe')).resultado).toBe('no_existe')
    expect((await uno<{ n: number }>(`select count(*)::int n from usuarios where estado='eliminada'`)).n).toBe(0)
  })

  it('el último super admin queda protegido; con otro activo, sí se puede', async () => {
    expect((await baja('u-super-1')).resultado).toBe('bloqueada')
    expect((await baja('u-super-2')).resultado).toBe('ultimo_super_admin')
    const u = await uno<{ estado: string; email: string | null }>(
      `select estado, email from usuarios where uid='u-super-2'`)
    expect(u).toMatchObject({ estado: 'activo' })
    expect(u.email).not.toBeNull()
  })

  it('baja de cliente: lápida, correo libre y re-alta con el mismo correo', async () => {
    expect((await baja('u-cliente')).resultado).toBe('bloqueada')
    const l = await uno<Record<string, unknown>>(
      `select estado, rol, email, nombre, telefono, completitud from usuarios where uid='u-cliente'`)
    expect(l).toMatchObject({ estado: 'eliminada', rol: 'cliente', completitud: 0 })
    expect(l.email).toBeNull()
    expect(l.nombre).toBeNull()

    await db.exec(`insert into usuarios (uid,email,rol) values ('u-nuevo','ana.ficticia@ejemplo.invalid','cliente')`)
    const n = await uno<{ uid: string; rol: string }>(
      `select uid, rol from usuarios where lower(email)='ana.ficticia@ejemplo.invalid'`)
    expect(n).toEqual({ uid: 'u-nuevo', rol: 'cliente' })
  })

  it('la invitación pendiente de ese correo queda revocada; la de otro, no', async () => {
    const i = await uno<{ mia: string; otra: string }>(`
      select (select estado from invitaciones where lower(email)='ana.ficticia@ejemplo.invalid') mia,
             (select estado from invitaciones where lower(email)='zoe.ficticia@ejemplo.invalid') otra`)
    expect(i).toEqual({ mia: 'revocada_por_baja', otra: 'pendiente' })
  })

  it('la PII bloqueada no se lee por las vistas, y el hecho se conserva', async () => {
    const v = await uno<Record<string, unknown>>(
      `select nombre, telefono, email, mensaje, tipo, consentimiento_version
         from solicitudes_contacto_operativas where cliente_uid='u-cliente'`)
    expect(v.nombre).toBeNull()
    expect(v.mensaje).toBeNull()
    expect(v).toMatchObject({ tipo: 'informacion' })
    expect(v.consentimiento_version).not.toBeNull()
  })

  it('es idempotente: repetir no duplica ni cambia nada', async () => {
    expect((await baja('u-cliente')).resultado).toBe('ya_eliminada')
    expect((await baja('u-cliente')).resultado).toBe('ya_eliminada')
    expect((await uno<{ n: number }>(`select count(*)::int n from bajas_de_cuenta where uid='u-cliente'`)).n).toBe(1)
  })

  it('publicador: las propiedades SIGUEN publicadas y pasan a requiere_gestion', async () => {
    expect((await baja('u-publicador')).resultado).toBe('bloqueada')
    const p = await uno<{ n: number; otras: number }>(`
      select (select count(*)::int from propiedades
               where owner_id='u-publicador' and estatus='disponible'
                 and estado_pub='publicada' and gestion='requiere_gestion') n,
             (select count(*)::int from propiedades where id='p-3' and gestion is not null) otras`)
    expect(p).toEqual({ n: 2, otras: 0 })
  })

  it('EL ROLLBACK: un error a mitad deja la cuenta intacta', async () => {
    await db.exec(`
      create or replace function reventar() returns trigger language plpgsql as $$
      begin raise exception 'fallo_intencional'; end $$;
      create trigger t_reventar before update on public.propiedades
        for each row execute function reventar();`)

    await expect(db.query(`select public.baja_de_cuenta('u-admin')`)).rejects.toThrow()

    const u = await uno<Record<string, unknown>>(
      `select estado, email, nombre from usuarios where uid='u-admin'`)
    expect(u).toMatchObject({ estado: 'activo' })
    expect(u.email).not.toBeNull()
    expect(u.nombre).not.toBeNull()
    expect((await uno<{ n: number }>(`select count(*)::int n from bajas_de_cuenta where uid='u-admin'`)).n).toBe(0)

    await db.exec(`drop trigger t_reventar on public.propiedades`)
  })
})
