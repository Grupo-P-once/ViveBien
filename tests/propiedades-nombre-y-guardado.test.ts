import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { destinoDePublicacion } from '../src/lib/publicacion'
import { nombrarSiEstaPublicada } from '../src/lib/asignar-slug'
import { idPresentable } from '../src/lib/slug'
import { COLUMNAS_PUBLICAS } from '../src/lib/propiedad-publica'

/**
 * V-1.1.84 — Las dos cosas que no deben repetirse:
 *   · una propiedad publicada con URL «propiedad-sin-titulo-…»;
 *   · un cambio que se guarda a medias sin decirlo.
 */

const leer = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/** Base falsa: recuerda lo que se actualiza y responde como PostgREST. */
function baseCon(fila: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = []
  const db = {
    from() {
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = () => c
      c.neq = () => c
      c.is = () => c
      c.limit = async () => ({ data: [], error: null })
      c.maybeSingle = async () => ({ data: fila, error: null })
      c.update = (f: Record<string, unknown>) => { updates.push(f); return c }
      // `.update().eq().is().select()` termina devolviendo filas
      c.then = undefined
      return c
    },
  }
  // El `select()` final de asignarSlugAlPublicar devuelve lo escrito.
  const conSelectFinal = {
    from() {
      const c = db.from() as Record<string, unknown>
      const update = c.update as (f: Record<string, unknown>) => unknown
      c.update = (f: Record<string, unknown>) => {
        update(f)
        return { eq: () => ({ is: () => ({ select: async () => ({ data: [{ slug: f.slug }], error: null }) }) }) }
      }
      return c
    },
  }
  return { db: conSelectFinal as never, updates }
}

describe('nunca más una publicada sin nombre público', () => {
  const publicadaSinNombre = {
    id: 'propiedad-sin-titulo-wljv', slug: null, titulo: 'TERRENO INDUSTRIAL (A) PANAM II SILAO',
    tipo: 'terreno', operacion: 'venta', ubicacion: '36293 Silao de la Victoria, Gto.', ciudad: null,
    estado_pub: 'publicada',
  }

  it('le pone nombre a la publicada que no lo tiene', async () => {
    const { db, updates } = baseCon(publicadaSinNombre)
    await nombrarSiEstaPublicada(db, publicadaSinNombre.id)
    expect(updates).toHaveLength(1)
    const slug = String(updates[0].slug)
    expect(slug).toMatch(/^terreno-en-venta-/)
    expect(slug).toContain('panam')
    expect(idPresentable(slug)).toBe(true)
  })

  it('no toca la que ya tiene nombre, ni la que no está publicada', async () => {
    const conNombre = baseCon({ ...publicadaSinNombre, slug: 'terreno-en-venta-silao-abcd' })
    await nombrarSiEstaPublicada(conNombre.db, 'x')
    expect(conNombre.updates).toEqual([])

    const borrador = baseCon({ ...publicadaSinNombre, estado_pub: 'borrador' })
    await nombrarSiEstaPublicada(borrador.db, 'x')
    expect(borrador.updates).toEqual([])
  })

  it('sin fila o con la base caída, no revienta la petición que la llamó', async () => {
    const vacia = baseCon(null)
    await expect(nombrarSiEstaPublicada(vacia.db, 'x')).resolves.toBeUndefined()
    await expect(nombrarSiEstaPublicada(vacia.db, '')).resolves.toBeUndefined()
    const rota = { from() { throw new Error('sin conexión') } } as never
    await expect(nombrarSiEstaPublicada(rota, 'x')).resolves.toBeUndefined()
  })

  it('los dos caminos que publican la llaman (este era el hueco)', () => {
    for (const ruta of ['src/app/api/propiedades/[id]/estado/route.ts', 'src/app/api/admin/propiedades/route.ts', 'src/app/api/admin/propiedades/[id]/route.ts']) {
      expect(leer(ruta), ruta).toMatch(/asignarSlugAlPublicar|nombrarSiEstaPublicada/)
    }
  })

  it('el sitemap deja fuera lo que no tiene nombre presentable', () => {
    const s = leer('src/app/sitemap.ts')
    expect(s).toContain('idPresentable')
    expect(idPresentable('propiedad-sin-titulo-wljv')).toBe(false)
    expect(idPresentable('terreno-en-renta-lagos-leon-jegv')).toBe(true)
    expect(idPresentable('sanjuan')).toBe(true)
  })
})

describe('nada se guarda a medias en silencio', () => {
  it('la columna del IVA es pública y viaja en el select', () => {
    expect(COLUMNAS_PUBLICAS).toContain('precio_incluye_iva')
  })

  it('las dos pantallas de edición avisan de lo que no se guardó', () => {
    expect(leer('src/app/dashboard/page.tsx')).toMatch(/json\.omitidas/)
    expect(leer('src/app/publicador/propiedades/[id]/editar/page.tsx')).toMatch(/sinColumna/)
  })

  it('el alta del panel clásico también es tolerante y avisa', () => {
    const s = leer('src/app/api/admin/propiedades/route.ts')
    expect(s).toContain('escribirTolerante')
    expect(s).toContain('omitidas')
  })
})

describe('el botón de publicar no pide un cambio que no toca', () => {
  it.each([
    ['admin, ya publicada → sólo guardar', 'publicada', true, null],
    ['admin, borrador → publicar', 'borrador', true, 'publicada'],
    ['admin, en revisión → publicar', 'en_revision', true, 'publicada'],
    ['publicador, borrador → a revisión', 'borrador', false, 'en_revision'],
    ['publicador, ya en revisión → nada', 'en_revision', false, null],
    ['sin estado → publicar (admin)', null, true, 'publicada'],
  ] as const)('%s', (_, estado, esAdmin, esperado) => {
    expect(destinoDePublicacion(estado, esAdmin)).toBe(esperado)
  })

  it('el asistente usa esa regla (y no manda el estado a ciegas)', () => {
    expect(leer('src/app/publicador/propiedades/[id]/editar/page.tsx')).toContain('destinoDePublicacion')
  })
})

describe('migración 23 — ensayo en PGlite', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const sql = (n: string) => leer(`supabase/${n}`)
  const columna = async (db: InstanceType<typeof PGlite>) => (await db.query<{ t: string; nulos: string; porDefecto: string | null }>(
    `select data_type as t, is_nullable as nulos, column_default as "porDefecto"
       from information_schema.columns
      where table_schema='public' and table_name='propiedades' and column_name='precio_incluye_iva'`)).rows[0]

  it('añade la columna sin tocar los datos, se aplica dos veces y se puede revertir', async () => {
    const db = await PGlite.create()
    await db.exec(`
      create role anon; create role authenticated;
      create table public.propiedades (id text primary key, titulo text, precio numeric);
      insert into public.propiedades values ('sanjuan', 'Bodega', 89000), ('tzula', 'Quinta', 5000000);
      grant select (id, titulo, precio) on public.propiedades to anon, authenticated;
    `)
    await db.exec(sql('23-precio-con-iva.sql'))
    await db.exec(sql('23-precio-con-iva.sql'))

    expect(await columna(db)).toEqual({ t: 'boolean', nulos: 'NO', porDefecto: 'false' })
    const filas = (await db.query<{ id: string; precio: string; iva: boolean }>(
      'select id, precio, precio_incluye_iva as iva from public.propiedades order by id')).rows
    expect(filas).toEqual([
      { id: 'sanjuan', precio: '89000', iva: false },
      { id: 'tzula', precio: '5000000', iva: false },
    ])

    // anon puede leerla: la ficha pública enseña el «+ IVA». (Que `select *`
    // le falle se comprueba con la tabla completa en migraciones-fase1-db.)
    await db.exec('set role anon')
    expect((await db.query('select precio_incluye_iva from public.propiedades')).rows).toHaveLength(2)
    await db.exec('reset role')

    await db.exec(sql('23-precio-con-iva.REVERTIR.sql'))
    expect(await columna(db)).toBeUndefined()
  })
})
