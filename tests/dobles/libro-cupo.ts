import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { DbCorreo } from '../../src/lib/correo/enviar'
import { dbCorreoPglite } from './correo-pglite'

/**
 * Un LIBRO DE CUPO de pruebas: Postgres en memoria (PGlite) con la migración 62 REAL cargada. Lo usan las pruebas de los emisores de correo
 * (avisos, citas, invitaciones, leads) para que el cupo del plan gratuito se cuente con las funciones SQL de verdad y no con un doble que acepte todo.
 *
 * Uso en una prueba:
 *   const h = vi.hoisted(() => ({ db: null as unknown }))
 *   vi.mock('../src/lib/correo/libro', () => ({ dbDelLibro: () => h.db }))
 *   beforeAll(async () => { libro = await crearLibro(); h.db = libro.db })
 *   beforeEach(() => libro.vaciar())
 */
export type Libro = {
  db: DbCorreo
  pg: PGlite
  vaciar: () => Promise<void>
  /** Cuántos envíos cuentan hoy en la rebanada (`pruebas` por defecto: así corren las pruebas). */
  usados: (entorno?: 'pruebas' | 'produccion') => Promise<number>
  filas: () => Promise<Array<{ clave: string; categoria: string; tipo: string; estado: string; email_hash: string; entorno: string }>>
  /** Huella (con la sal de ESTA base) de un correo: lo único que el libro guarda de un destinatario. */
  huella: (correo: string) => Promise<string>
  cerrar: () => Promise<void>
}

export async function crearLibro(): Promise<Libro> {
  const pg = new PGlite()
  await pg.exec('create role anon; create role authenticated; create role service_role;')
  await pg.exec(readFileSync(path.join(__dirname, '..', '..', 'supabase', '62-correo-suscripciones.sql'), 'utf8'))
  const db = dbCorreoPglite(pg) as unknown as DbCorreo
  return {
    db,
    pg,
    // Deja el libro vacío CON una lectura sintética del panel de Resend (0/0): el correo opcional en producción la exige (conciliación).
    vaciar: async () => {
      await pg.exec('delete from public.correo_envios; delete from public.correo_supresiones; delete from public.correo_conciliacion;')
      await pg.query("select public.correo_conciliar(0, 0, 'prueba-sintetica', null)")
    },
    usados: async (entorno = 'produccion') => {
      const r = await pg.query<{ n: number }>(`select count(*)::int n from public.correo_envios where entorno = $1 and estado not in ('suprimido', 'omitido')`, [entorno])
      return r.rows[0].n
    },
    filas: async () => (await pg.query<{ clave: string; categoria: string; tipo: string; estado: string; email_hash: string; entorno: string }>('select clave, categoria, tipo, estado, email_hash, entorno from public.correo_envios order by id')).rows,
    huella: async (correo) => (await pg.query<{ h: string }>('select public.correo_huella($1) h', [correo])).rows[0].h,
    cerrar: async () => { await pg.close() },
  }
}
