import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { entornoCorreo, MARKETING_AUTORIZADO } from '../src/lib/correo/config'
import { crearLibro, type Libro } from './dobles/libro-cupo'

/**
 * Bloqueo de consentimiento (31-oct-2026): los valores activados por omisión de la migración 65 son SOLO de correos de servicio (alertas de búsquedas que la persona
 * guardó con «Avisarme», baja de precio de lo que marcó con la campana, avisos legales). Lo PROMOCIONAL no tiene valor por omisión: exige una elección afirmativa,
 * separada, con prueba, y además una barrera de código (MARKETING_AUTORIZADO) mientras no haya texto legal aprobado (MKT-36). Estas pruebas lo fijan.
 */
const leer = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')
const sinComentarios = (sql: string) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

let libro: Libro
beforeAll(async () => { libro = await crearLibro() }, 60_000)
afterAll(async () => { await libro?.cerrar() })

describe('lo promocional no se activa por omisión', () => {
  it('barrera de código: aun con CORREO_MARKETING=1 y CORREO_TRANSACCIONAL=1 el correo promocional sigue apagado mientras MARKETING_AUTORIZADO sea false', () => {
    expect(MARKETING_AUTORIZADO).toBe(false)
    const e = entornoCorreo({ CORREO_MARKETING: '1', CORREO_TRANSACCIONAL: '1', RESEND_API_KEY: 're_x' })
    expect(e.marketing).toBe(false)
  })

  it('el emisor único NO acepta la categoría promocional (el tipo la excluye) y los avisos de cliente son solo de servicio', () => {
    expect(leer('src/lib/correo/emisor.ts')).toMatch(/categoria: Exclude<CategoriaCorreo, 'marketing'>/)
    const avisos = leer('src/lib/avisos-cliente-servidor.ts')
    expect(avisos).toContain("categoria: 'servicio'")
    expect(avisos).not.toMatch(/categoria: '(marketing|promocional)'/)
  })

  it('migración 65: sus sentencias solo tocan preferencias_notificacion (alertas/precio/legal); no mencionan suscriptores ni marketing', () => {
    const sql = sinComentarios(leer('supabase/65-avisos-activados-por-omision.sql'))
    expect(sql).not.toMatch(/correo_suscriptores|marketing|promo|suscri/i)
    expect(sql).toMatch(/alter column correo_alertas set default true/)
    expect(sql).toMatch(/alter column correo_precio set default true/)
    expect(sql).not.toMatch(/correo_legal set default/) // el legal ya nacía activado: no cambia
  })

  it('la tabla de preferencias de avisos NO tiene ninguna columna promocional: una cuenta nueva no puede nacer con promociones', async () => {
    const db = new PGlite()
    await db.exec(`create table public.preferencias_notificacion (uid text primary key, correo_alertas boolean not null default false, correo_legal boolean not null default true, consentimiento_alertas_en timestamptz, actualizado_en timestamptz not null default now())`)
    await db.exec(leer('supabase/60-correo-baja-de-precio.sql'))
    await db.exec(`create table public.usuarios (uid text primary key)`)
    await db.exec(leer('supabase/65-avisos-activados-por-omision.sql'))
    const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'preferencias_notificacion'`)).rows.map((c) => c.column_name)
    expect(cols.filter((c) => /promo|marketing|suscri|recomend|comercial/i.test(c))).toEqual([])
    await db.close()
  })

  it('una suscripción promocional nace PENDIENTE y no puede quedar ACTIVA sin prueba de consentimiento y confirmación (restricción real de la migración 62)', async () => {
    const r = await libro.pg.query<{ estado: string }>(`insert into public.correo_suscriptores (email, email_norm, nombre) values ('prueba@ejemplo.invalid', 'prueba@ejemplo.invalid', 'P') returning estado`)
    expect(r.rows[0].estado).toBe('pendiente')
    await expect(libro.pg.query(`update public.correo_suscriptores set estado = 'activa' where email_norm = 'prueba@ejemplo.invalid'`)).rejects.toThrow(/correo_suscriptores_activa_con_prueba/)
    await expect(libro.pg.query(`update public.correo_suscriptores set estado = 'activa', consentimiento_en = now() where email_norm = 'prueba@ejemplo.invalid'`)).rejects.toThrow(/correo_suscriptores_activa_con_prueba/) // falta la confirmación
  })

  it('el panel de preferencias de avisos declara que las promociones son otro consentimiento, otra ruta y otra tabla', () => {
    expect(leer('src/components/portal/PreferenciasDeAvisos.tsx')).toMatch(/otro consentimiento, otra ruta, otra tabla/)
  })
})
