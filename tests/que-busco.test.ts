import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * P3-07 (V-1.1.82): «Qué estoy buscando» tiene UN solo modelo.
 */
const escrito = vi.hoisted(() => ({ upsert: null as null | Record<string, unknown> }))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) c[m] = () => c
    c.maybeSingle = async () => ({ data: null, error: null })
    c.upsert = async (fila: Record<string, unknown>) => { escrito.upsert = fila; return { error: null } }
    return c
  }
  return {
    ...real,
    // V-1.1.87 (etapa 1): la ruta ya no llama a `verifyIdToken`, sino a
    // `exigir`. Se arma el autorizador REAL con los extremos de esta prueba,
    // para que recorra de verdad sesión → estado → permiso.
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      real.crearAutorizador({ verificar: async () => ({ uid: 'u-1', email: 'cliente@ejemplo.com', emailVerified: true }), perfil: async () => ({ uid: 'u-1', email: 'cliente@ejemplo.com', emailVerified: true, rol: 'cliente' as const, superAdmin: false, estado: 'activo' as const, nombre: null }), denegado: async () => {} })(
        req, (p) => puede(p, permiso), permiso,
      ),
    verifyIdToken: async () => ({ uid: 'u-1', email: 'cliente@ejemplo.com', emailVerified: true }),
    getPerfil: async () => ({ uid: 'u-1', email: 'cliente@ejemplo.com', emailVerified: true, rol: 'cliente', superAdmin: false, estado: 'activo', nombre: null }),
    supabaseAdmin: () => ({ from: () => cadena() }),
  }
})

import {
  COLUMNAS_QUE_BUSCO, normalizarOperacion, normalizarPresupuesto, normalizarTipos, normalizarZonas, OPCIONES_TIPO, queBuscoDe,
} from '../src/lib/cliente/busqueda'
import { CAMPOS_EDITABLES } from '../src/lib/perfil'
import { PATCH } from '../src/app/api/usuarios/me/route'

describe('el modelo', () => {
  it('son exactamente cuatro columnas', () => {
    expect(COLUMNAS_QUE_BUSCO).toBe('busca_operacion, busca_zonas, busca_tipos, presupuesto_max')
  })

  it('sin fila, vacío (sin inventar)', () => {
    expect(queBuscoDe(null)).toEqual({ operacion: null, zonas: [], tipos: [], presupuestoMax: null })
  })

  it('zonas: limpias, sin repetir (acentos incluidos), máximo 8; vacía → null', () => {
    expect(normalizarZonas(['  San  Juan   Bosco ', 'san juan bosco', 'León', 'Leon', 7, ''])).toEqual(['San Juan Bosco', 'León'])
    expect(normalizarZonas(Array.from({ length: 12 }, (_, i) => `Zona ${i}`))).toHaveLength(8)
    expect(normalizarZonas([])).toBeNull()
    expect(normalizarZonas('Centro')).toBeNull()
  })

  it('tipos: sólo claves conocidas; la etiqueta vieja se traduce', () => {
    expect(normalizarTipos(['Casa', 'Local comercial', 'Depto', 'nave', 'castillo', 'CASA'])).toEqual(['casa', 'local', 'departamento', 'nave'])
    expect(normalizarTipos(['inventado'])).toBeNull()
    for (const { clave } of OPCIONES_TIPO) expect(normalizarTipos([clave])).toEqual([clave])
  })

  it('operación y presupuesto', () => {
    expect(normalizarOperacion('ambas')).toBe('ambas')
    expect(normalizarOperacion('comprar')).toBeNull()
    expect(normalizarPresupuesto('2,500,000')).toBe(2_500_000)
    expect(normalizarPresupuesto(0)).toBeNull()
    expect(normalizarPresupuesto(-5)).toBeNull()
    expect(normalizarPresupuesto('abc')).toBeNull()
  })

  it('el perfil ya no acepta las columnas viejas', () => {
    expect(CAMPOS_EDITABLES as readonly string[]).not.toContain('busca_zona')
    expect(CAMPOS_EDITABLES as readonly string[]).not.toContain('busca_tipo')
    for (const c of ['busca_operacion', 'busca_zonas', 'busca_tipos', 'presupuesto_max']) {
      expect(CAMPOS_EDITABLES as readonly string[], c).toContain(c)
    }
  })
})

describe('PATCH /api/usuarios/me escribe sólo el modelo único', () => {
  beforeEach(() => { escrito.upsert = null })
  const patch = (cuerpo: unknown) => PATCH(new Request('https://vivebienn.com/api/usuarios/me', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
  }))

  it('las columnas viejas que lleguen se ignoran; las nuevas se limpian', async () => {
    const r = await patch({
      busca_zona: 'Centro', busca_tipo: 'Casa',
      busca_zonas: ['Centro', ' centro ', 'Campestre'], busca_tipos: ['Casa', 'Nave industrial'],
      busca_operacion: 'renta', presupuesto_max: '18,000',
    })
    expect(r.status).toBe(200)
    const fila = escrito.upsert!
    expect(fila).not.toHaveProperty('busca_zona')
    expect(fila).not.toHaveProperty('busca_tipo')
    expect(fila).toMatchObject({
      uid: 'u-1', busca_zonas: ['Centro', 'Campestre'], busca_tipos: ['casa', 'nave'],
      busca_operacion: 'renta', presupuesto_max: 18_000,
    })
  })

  it('vaciar una lista la deja en null (no en [])', async () => {
    await patch({ busca_zonas: [], busca_tipos: ['inventado'] })
    expect(escrito.upsert).toMatchObject({ busca_zonas: null, busca_tipos: null })
  })

  it('sólo las columnas viejas: no hay nada que escribir', async () => {
    const r = await patch({ busca_zona: 'Centro', busca_tipo: 'Casa' })
    expect(await r.json()).toMatchObject({ ok: true, sinCambios: true })
    expect(escrito.upsert).toBeNull()
  })
})

describe('ninguna referencia residual a las columnas viejas', () => {
  const RAIZ = join(__dirname, '..')
  const archivos = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p, ext) : ext.test(n) ? [p] : []
  })

  it('ni en código ni en pruebas (salvo comentarios que cuentan la historia)', () => {
    const lista = [...archivos(join(RAIZ, 'src'), /\.(ts|tsx)$/), ...archivos(join(RAIZ, 'tests'), /\.ts$/)]
      // `perfil-3b2.test.ts` las nombra a propósito: comprueba que llegan y se IGNORAN.
      .filter((p) => !p.endsWith('que-busco.test.ts') && !p.endsWith('perfil-3b2.test.ts'))
    const culpables = lista
      .filter((p) => readFileSync(p, 'utf8').split('\n').some((l) =>
        /busca_zona\b|busca_tipo\b/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)))
      .map((p) => relative(RAIZ, p))
    expect(culpables).toEqual([])
  })

  it('en SQL sólo las migraciones que las crearon (06), copiaron (16) y borran (22)', () => {
    const conReferencia = archivos(join(RAIZ, 'supabase'), /\.sql$/)
      .filter((p) => /busca_zona\b|busca_tipo\b/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(join(RAIZ, 'supabase'), p).replace(/\\/g, '/'))
      .sort()
    for (const f of conReferencia) expect(f, f).toMatch(/^(06-perfil|16-portal-busqueda|22-que-busco-un-modelo(\.REVERTIR)?)\.sql$/)
  })
})

describe('migración 22 — ensayo en PGlite', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const sql = (n: string) => readFileSync(join(__dirname, '..', 'supabase', n), 'utf8')
  const columnas = async (db: InstanceType<typeof PGlite>) => (await db.query<{ c: string }>(
    `select column_name as c from information_schema.columns where table_schema='public' and table_name='usuarios' order by 1`)).rows.map((r) => r.c)

  it('borra las columnas viejas sin perder nada, y se puede aplicar dos veces', async () => {
    const db = await PGlite.create()
    await db.exec(`
      create table public.usuarios (uid text primary key, busca_zona text, busca_tipo text, busca_zonas text[], busca_tipos text[]);
      insert into public.usuarios values
        ('solo-viejo', ' Centro ', 'Casa', null, null),
        ('los-dos',    'Centro',   'casa', array['Campestre'], array['nave']),
        ('vacio',      null,       null,   null, null);
    `)
    await db.exec(sql('22-que-busco-un-modelo.sql'))
    await db.exec(sql('22-que-busco-un-modelo.sql'))
    expect(await columnas(db)).toEqual(['busca_tipos', 'busca_zonas', 'uid'])
    const filas = (await db.query<{ uid: string; busca_zonas: string[] | null; busca_tipos: string[] | null }>(
      'select uid, busca_zonas, busca_tipos from public.usuarios order by uid')).rows
    expect(filas).toEqual([
      { uid: 'los-dos', busca_zonas: ['Campestre'], busca_tipos: ['nave'] }, // la lista nueva manda
      { uid: 'solo-viejo', busca_zonas: ['Centro'], busca_tipos: ['casa'] }, // se copió antes de borrar
      { uid: 'vacio', busca_zonas: null, busca_tipos: null },
    ])
    await db.close()
  })

  it('la reversión vuelve a crear las columnas con el primer valor', async () => {
    const db = await PGlite.create()
    await db.exec(`create table public.usuarios (uid text primary key, busca_zonas text[], busca_tipos text[]);
      insert into public.usuarios values ('a', array['Centro','Campestre'], array['casa']);`)
    await db.exec(sql('22-que-busco-un-modelo.REVERTIR.sql'))
    const r = (await db.query<{ busca_zona: string; busca_tipo: string }>('select busca_zona, busca_tipo from public.usuarios')).rows
    expect(r).toEqual([{ busca_zona: 'Centro', busca_tipo: 'casa' }])
    await db.close()
  })
})
