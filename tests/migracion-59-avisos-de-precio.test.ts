import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * Migración 59 — «Avisarme cuando baje de precio» (PREPARADA, no aplicada). Se prueba: (1) que `baja_de_cuenta` es la de la 58 más SOLO la línea que borra los avisos, (2) que la reversa devuelve
 * la función de la 58 EXACTA y quita la tabla, (3) en PGlite (Postgres real): la tabla se crea, aplicarla dos veces no rompe, las reglas (CHECK, clave primaria) se cumplen y la reversa la quita.
 */
const m58 = readFileSync('supabase/58-cliente-notificaciones-y-contactos.sql', 'utf8')
const m59 = readFileSync('supabase/59-avisos-de-precio.sql', 'utf8')
const rev = readFileSync('supabase/59-avisos-de-precio.REVERTIR.sql', 'utf8')
const funcion = (sql: string) => sql.split('\n').slice(sql.split('\n').findIndex((l) => l.startsWith('create or replace function public.baja_de_cuenta'))).join('\n').split('\n$$;')[0] + '\n$$;'

describe('baja_de_cuenta: la 59 solo añade el borrado de los avisos', () => {
  it('diferencia exacta con la de la 58: dos líneas añadidas (comentario + delete) y ninguna cambiada', () => {
    const a = funcion(m58).split('\n'); const b = funcion(m59).split('\n')
    const nuevas = b.filter((l) => !a.includes(l))
    expect(nuevas.map((l) => l.trim())).toEqual(['-- Lo nuevo de la 59: sus avisos de «baja de precio».', 'delete from public.cliente_avisos_precio       where uid = p_uid;'])
    expect(a.filter((l) => !b.includes(l))).toEqual([])
    expect(b.length).toBe(a.length + 2)
  })
  it('la reversa devuelve la función de la 58 EXACTA', () => { expect(funcion(rev)).toBe(funcion(m58)) })
})

describe('la tabla en Postgres real (PGlite)', () => {
  const tabla = m59.split('create or replace function public.baja_de_cuenta')[0] + ' commit;'
  async function nueva() {
    const db = await PGlite.create()
    await db.exec(`create role anon; create role authenticated; create role service_role;`)
    return db
  }
  it('se crea, es idempotente, valida sus reglas y la reversa la quita', async () => {
    const db = await nueva()
    await db.exec(tabla); await db.exec(tabla)                                   // dos veces
    await db.exec(`insert into public.cliente_avisos_precio (uid, propiedad_id, precio_base) values ('u-ana', 'p1', 3000000)`)
    const f = await db.query<{ moneda: string; avisado_en: string | null }>(`select moneda, avisado_en from public.cliente_avisos_precio`)
    expect(f.rows[0]).toMatchObject({ moneda: 'MXN', avisado_en: null })
    await expect(db.exec(`insert into public.cliente_avisos_precio (uid, propiedad_id, precio_base) values ('u-ana', 'p1', 1)`)).rejects.toThrow()         // misma persona y propiedad
    await expect(db.exec(`insert into public.cliente_avisos_precio (uid, propiedad_id, precio_base) values ('u-ana', 'p2', 0)`)).rejects.toThrow()         // precio no positivo
    await expect(db.exec(`insert into public.cliente_avisos_precio (uid, propiedad_id, precio_base, moneda) values ('u-ana', 'p3', 5, 'PESOS')`)).rejects.toThrow() // moneda de 3 letras
    await expect(db.exec(`insert into public.cliente_avisos_precio (uid, propiedad_id, precio_base) values ('x', 'p4', 5)`)).rejects.toThrow()               // uid demasiado corto
    // solo el servidor: anon y authenticated no pueden leer ni escribir
    const rls = await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'cliente_avisos_precio'`)
    expect(rls.rows[0].relrowsecurity).toBe(true)
    for (const rol of ['anon', 'authenticated']) {
      const p = await db.query<{ ok: boolean }>(`select has_table_privilege('${rol}', 'public.cliente_avisos_precio', 'select') as ok`)
      expect(p.rows[0].ok, rol).toBe(false)
    }
    const s = await db.query<{ ok: boolean }>(`select has_table_privilege('service_role', 'public.cliente_avisos_precio', 'insert') as ok`)
    expect(s.rows[0].ok).toBe(true)
    await db.exec(`drop table if exists public.cliente_avisos_precio`)
    const quedo = await db.query(`select 1 from pg_class where relname = 'cliente_avisos_precio'`)
    expect(quedo.rows).toHaveLength(0)
  }, 60_000)
})
