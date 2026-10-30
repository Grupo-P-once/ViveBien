import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 58 (rol cliente): contactos, notificaciones, preferencias y la baja de cuenta ampliada. Mismo motor y esquema que `migracion-26-funcion.test.ts`:
 * PGlite en memoria con el esquema y los datos INVENTADOS de `docker/`. Nada toca producción.
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
  await db.exec(leer('supabase/58-cliente-notificaciones-y-contactos.sql'))
  await db.exec(leer('docker/datos-sinteticos.sql'))
}, 120_000)
afterAll(async () => { await db?.close() })

describe('migración 58', () => {
  it('se puede correr dos veces', async () => { await db.exec(leer('supabase/58-cliente-notificaciones-y-contactos.sql')) })

  it('las tres tablas nuevas existen, con RLS activa y sin políticas (solo el servidor)', async () => {
    const f = (await db.query<{ relname: string; rls: boolean }>(`select c.relname, c.relrowsecurity rls from pg_class c where c.relname in ('cliente_contactos','notificaciones','preferencias_notificacion') order by 1`)).rows
    expect(f).toEqual([{ relname: 'cliente_contactos', rls: true }, { relname: 'notificaciones', rls: true }, { relname: 'preferencias_notificacion', rls: true }])
    expect(Number((await uno<{ n: string }>(`select count(*) n from pg_policies where tablename in ('cliente_contactos','notificaciones','preferencias_notificacion')`)).n)).toBe(0)
  })

  it('un contacto solo admite canal y destino conocidos', async () => {
    await db.exec(`insert into cliente_contactos (uid, propiedad_id, canal) values ('u-cliente', 'p1', 'whatsapp')`)
    await expect(db.exec(`insert into cliente_contactos (uid, propiedad_id, canal) values ('u-cliente', 'p1', 'paloma')`)).rejects.toThrow()
    await expect(db.exec(`insert into cliente_contactos (uid, propiedad_id, canal, destino) values ('u-cliente', 'p1', 'correo', 'otro')`)).rejects.toThrow()
  })

  it('una notificación es idempotente por (uid, clave) y solo acepta enlaces del propio sitio', async () => {
    await db.exec(`insert into notificaciones (uid, tipo, titulo, clave, enlace) values ('u-cliente', 'busqueda_nueva', 'Nueva casa para tu búsqueda', 'busqueda:1:prop:p1', '/propiedades/p1')`)
    await expect(db.exec(`insert into notificaciones (uid, tipo, titulo, clave) values ('u-cliente', 'busqueda_nueva', 'Otra vez', 'busqueda:1:prop:p1')`)).rejects.toThrow()
    await expect(db.exec(`insert into notificaciones (uid, tipo, titulo, clave, enlace) values ('u-cliente', 'sistema', 'Phishing', 'x1', 'https://malo.test')`)).rejects.toThrow()
    await expect(db.exec(`insert into notificaciones (uid, tipo, titulo, clave, enlace) values ('u-cliente', 'sistema', 'Phishing', 'x2', '//malo.test')`)).rejects.toThrow()
  })

  it('el aviso por correo de alertas nace APAGADO y el legal ENCENDIDO (consentimiento explícito)', async () => {
    await db.exec(`insert into preferencias_notificacion (uid) values ('u-cliente')`)
    expect(await uno(`select correo_alertas, correo_legal, consentimiento_alertas_en from preferencias_notificacion where uid = 'u-cliente'`)).toEqual({ correo_alertas: false, correo_legal: true, consentimiento_alertas_en: null })
  })

  it('las búsquedas guardadas tienen frecuencia (diaria o semanal) y fecha de último aviso', async () => {
    const { id } = await uno<{ id: string }>(`insert into busquedas_guardadas (uid, filtros) values ('u-cliente', '{}') returning id`)
    expect(await uno(`select frecuencia, avisada_en from busquedas_guardadas where id = ${id}`)).toEqual({ frecuencia: 'diaria', avisada_en: null })
    await expect(db.exec(`update busquedas_guardadas set frecuencia = 'cada-minuto' where id = ${id}`)).rejects.toThrow()
  })

  it('LA BAJA DE CUENTA borra los datos nuevos del cliente y deja los de otra persona', async () => {
    await db.exec(`insert into cliente_contactos (uid, propiedad_id, canal) values ('u-super-1', 'p1', 'telefono')`)
    await db.exec(`insert into notificaciones (uid, tipo, titulo, clave) values ('u-super-1', 'sistema', 'Aviso ajeno', 'ajeno-1')`)
    const r = (await uno<{ r: Record<string, unknown> }>(`select public.baja_de_cuenta('u-cliente') as r`)).r
    expect(r.resultado).toBe('bloqueada')
    for (const t of ['cliente_contactos', 'notificaciones', 'preferencias_notificacion']) {
      expect(Number((await uno<{ n: string }>(`select count(*) n from ${t} where uid = 'u-cliente'`)).n), t).toBe(0)
    }
    expect(Number((await uno<{ n: string }>(`select count(*) n from cliente_contactos where uid = 'u-super-1'`)).n)).toBe(1)
    expect(Number((await uno<{ n: string }>(`select count(*) n from notificaciones where uid = 'u-super-1'`)).n)).toBe(1)
    expect(Number((await uno<{ n: string }>(`select count(*) n from busquedas_guardadas where uid = 'u-cliente'`)).n)).toBe(0)
  })

  it('la reversa deja la base como antes (sin las tablas ni las columnas)', async () => {
    await db.exec(leer('supabase/58-cliente-notificaciones-y-contactos.REVERTIR.sql'))
    expect(Number((await uno<{ n: string }>(`select count(*) n from pg_class where relname in ('cliente_contactos','notificaciones','preferencias_notificacion')`)).n)).toBe(0)
    expect(Number((await uno<{ n: string }>(`select count(*) n from information_schema.columns where table_name = 'busquedas_guardadas' and column_name in ('frecuencia','avisada_en')`)).n)).toBe(0)
  })
})
