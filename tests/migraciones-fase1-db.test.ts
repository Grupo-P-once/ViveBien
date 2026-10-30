import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { COLUMNAS_INTERNAS, COLUMNAS_PUBLICAS } from '../src/lib/propiedad-publica'
import { FLAGS, FLAGS_APAGADOS, normalizarFlags } from '../src/lib/config/flags'

/**
 * Ensayo (dry run) de las migraciones 18 y 19 contra un Postgres de verdad
 * (PGlite, en memoria). Nada de esto toca producción.
 *
 * Se comprueba lo que la base garantiza —qué puede leer `anon`— y que cada
 * migración se pueda aplicar dos veces sin romperse.
 */

let db: PGlite
const leerSql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')

async function comoAnon<T>(sql: string): Promise<T[] | string> {
  try {
    await db.exec('set role anon')
    const r = await db.query<T>(sql)
    return r.rows
  } catch (e) {
    return (e as Error).message
  } finally {
    await db.exec('reset role')
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  const columnas = [...COLUMNAS_PUBLICAS.filter((c) => c !== 'id'), ...COLUMNAS_INTERNAS]
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.propiedades (id text primary key, ${columnas.map((c) => `${c} text`).join(', ')});
    -- Como hoy en producción (tras la 17): lectura de tabla completa.
    grant select on public.propiedades to anon, authenticated;
    insert into public.propiedades (id, titulo, owner_id, whatsapp) values ('p1', 'Casa', 'dueno-1', '5215555555555');
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('migración 18 — columnas públicas de propiedades', () => {
  it('antes: anon puede leer columnas internas (el hallazgo SEC-02)', async () => {
    const r = await comoAnon<{ owner_id: string }>('select owner_id from public.propiedades')
    expect(r).toEqual([{ owner_id: 'dueno-1' }])
  })

  it('se aplica y se puede reaplicar', async () => {
    await db.exec(leerSql('18-columnas-publicas.sql'))
    await db.exec(leerSql('18-columnas-publicas.sql'))
    // La lista pública creció después: la 23 añade `precio_incluye_iva` y su
    // permiso (V-1.1.84). Lo que anon puede leer es la suma de las dos.
    await db.exec(leerSql('23-precio-con-iva.sql'))
  })

  it('después: anon lee todas las columnas públicas', async () => {
    const r = await comoAnon<Record<string, unknown>>(`select ${COLUMNAS_PUBLICAS.join(', ')} from public.propiedades`)
    expect(Array.isArray(r) ? r.length : r).toBe(1)
  })

  it('después: anon no lee ninguna columna interna', async () => {
    for (const c of COLUMNAS_INTERNAS) {
      const r = await comoAnon(`select ${c} from public.propiedades`)
      expect(typeof r === 'string' ? r : 'SE PUDO LEER', c).toMatch(/permission denied/)
    }
  })

  it('después: `select *` de anon falla (nadie puede pedir todo)', async () => {
    expect(await comoAnon('select * from public.propiedades')).toMatch(/permission denied/)
  })
})

describe('migración 19 — configuracion y flags', () => {
  it('se aplica y se puede reaplicar sin duplicar ni pisar la fila', async () => {
    await db.exec(leerSql('19-configuracion.sql'))
    await db.exec(`update public.configuracion set valor = valor || '{"portalCliente": true}' where clave = 'flags'`)
    await db.exec(leerSql('19-configuracion.sql'))
    const r = await db.query<{ n: number; portal: boolean }>(
      `select count(*)::int as n, bool_and((valor->>'portalCliente')::boolean) as portal from public.configuracion`,
    )
    // La reaplicación no devuelve el flag a su valor inicial.
    expect(r.rows[0]).toEqual({ n: 1, portal: true })
    await db.exec(`update public.configuracion set valor = valor || '{"portalCliente": false}' where clave = 'flags'`)
  })

  it('nace con flags conocidos, todos apagados; los que se agregan después valen apagado si faltan', async () => {
    const r = await db.query<{ valor: Record<string, unknown> }>(`select valor from public.configuracion where clave = 'flags'`)
    for (const clave of Object.keys(r.rows[0].valor)) expect(FLAGS as readonly string[], clave).toContain(clave)
    expect(normalizarFlags(r.rows[0].valor)).toEqual(FLAGS_APAGADOS)
  })

  it('anon no puede leerla ni escribirla', async () => {
    expect(await comoAnon('select * from public.configuracion')).toMatch(/permission denied/)
    expect(await comoAnon(`insert into public.configuracion (clave, valor) values ('x', '{}')`)).toMatch(/permission denied/)
  })

  it('rechaza claves raras y valores que no son objeto', async () => {
    await expect(db.exec(`insert into public.configuracion (clave, valor) values ('Flags!', '{}')`)).rejects.toThrow()
    await expect(db.exec(`insert into public.configuracion (clave, valor) values ('otra', '[]')`)).rejects.toThrow()
  })
})

describe('lectura de flags', () => {
  it('sólo un `true` literal enciende un flag conocido', () => {
    expect(normalizarFlags(null)).toEqual(FLAGS_APAGADOS)
    expect(normalizarFlags([true])).toEqual(FLAGS_APAGADOS)
    expect(normalizarFlags({ portalCliente: 'true', aiContent: 1 })).toEqual(FLAGS_APAGADOS)
    const f = normalizarFlags({ portalCliente: true, inventado: true })
    expect(f.portalCliente).toBe(true)
    expect(f).not.toHaveProperty('inventado')
  })
})
