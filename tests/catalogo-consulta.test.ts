import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { coincide, normalizarFiltros, type Filtros } from '../src/lib/busquedas'
import { DEFINICIONES } from '../src/lib/caracteristicas'
import { aInstrucciones, aplicarCondiciones, condicionesDb, describirConsulta } from '../src/lib/catalogo-consulta'
import { ITEMS_MAS, type Cond } from '../src/lib/filtros-mas'
import { filtrar, type Fila as FilaEv } from './dobles/postgrest-evaluador'

/**
 * Los filtros del catálogo EN LA CONSULTA (28-oct-2026). Tres cosas distintas, cada una con su control positivo:
 *  A · la GRAMÁTICA que sale hacia PostgREST (cadenas exactas) y su SEGURIDAD (no se puede inyectar sintaxis ni filtrar columnas privadas);
 *  B · la EQUIVALENCIA con la regla exacta sobre Postgres REAL (PGlite): la base NUNCA puede ocultar una coincidencia (la consulta es un superconjunto de `coincide`);
 *  C · el evaluador de PostgREST de las pruebas da lo MISMO que Postgres real para esas mismas condiciones (valida que las cadenas dicen lo que se quiere decir).
 * Datos 100 % sintéticos y reproducibles (semilla fija). Lo que NO prueba (y está declarado): una instancia real de PostgREST.
 */
const AHORA = Date.parse('2026-10-28T15:00:00Z')
const f = (p: Record<string, unknown>): Filtros => normalizarFiltros(p)!

/* ══ A · gramática y seguridad ══════════════════════════════════════════════ */
describe('A · lo que sale hacia PostgREST', () => {
  it('cadenas exactas para una búsqueda con filtros de siempre y nuevos', () => {
    const { conds } = condicionesDb(f({ ban: 3, est: 2, ant: '10', mm: 'video', amb: 'estudio,bodega', dir: 'San Juan', cmin: 50 }), AHORA)
    expect(describirConsulta(conds)).toEqual([
      'banos=gte.3',
      'extras->caracteristicas->estacionamientos=gte.2',
      'metros=gte.50', 'tipo=neq.terreno',
      'or=(or(extras->caracteristicas->interiores.cs.["bodega_interna"],extras->caracteristicas->equipamiento.cs.["bodega_interna"]),extras->caracteristicas->interiores.cs.["estudio"])',
      'videos=not.eq.{}',
      'extras->caracteristicas->antiguedad_anos=lte.10',
      'or=(ubicacion.ilike.%s__%,colonia.ilike.%s__%)',
      'or=(ubicacion.ilike.%j___%,colonia.ilike.%j___%)',
    ])
  })
  it('«0 estacionamientos» es una igualdad, no un mínimo; booleanos y enumeraciones usan el operador correcto', () => {
    expect(describirConsulta(condicionesDb(f({ est: 0 }), AHORA).conds)).toEqual(['extras->caracteristicas->estacionamientos=eq.0'])
    expect(describirConsulta(condicionesDb(f({ gen: 'amueblado,elevador' }), AHORA).conds)).toEqual([
      'or=(extras->caracteristicas->>amueblado.in.(si,semi),extras->caracteristicas->elevador.eq.true)',
    ])
  })
  it('la fecha relativa viaja como instante UTC calculado en America/Mexico_City', () => {
    expect(describirConsulta(condicionesDb(f({ pub: 'hoy' }), AHORA).conds)).toEqual(['publicada_en=gte.2026-10-28T06:00:00.000Z'])
    expect(describirConsulta(condicionesDb(f({ pub: 'ayer' }), Date.parse('2026-10-28T05:59:59Z')).conds)).toEqual(['publicada_en=gte.2026-10-26T06:00:00.000Z'])
  })
  it('SEGURIDAD: lo que escribe una persona jamás agrega sintaxis de filtro (comas, paréntesis, igualdades, comillas)', () => {
    for (const hostil of ['x),or=(id.eq.1', '"; drop table propiedades;--', 'a,b(c)d', "o'neil", '*:%:_', 'x'.repeat(80)]) {
      const nf = f({ dir: hostil, zona: hostil })
      const exprs = aInstrucciones(condicionesDb(nf, AHORA).conds).filter((i) => i.tipo === 'o').map((i) => (i as { expr: string }).expr)
      expect(exprs.length).toBeGreaterThan(0)
      for (const e of exprs) expect(e, hostil).toMatch(/^((ubicacion|colonia|ciudad)\.ilike\.%[a-z0-9_%]+%)(,(ubicacion|colonia|ciudad)\.ilike\.%[a-z0-9_%]+%)*$/)
    }
  })
  it('SEGURIDAD: solo se puede filtrar por columnas PÚBLICAS; una interna lanza ANTES de armar nada', () => {
    for (const interna of ['owner_id', 'calle', 'cp', 'whatsapp', 'telefono', 'nota_moderacion', 'revisado_por', 'origen_tipo']) {
      expect(() => aInstrucciones([{ t: 'col', col: interna, op: 'eq', v: 'x' }]), interna).toThrow(/columna no admitida/)
    }
  })
  it('SEGURIDAD: un valor con caracteres de sintaxis o una clave fuera de [a-z0-9_] se rechaza', () => {
    expect(() => aInstrucciones([{ t: 'col', col: 'operacion', op: 'eq', v: 'venta,id.eq.1' }])).toThrow(/valor no admitido/)
    expect(() => aInstrucciones([{ t: 'col', col: 'operacion', op: 'eq', v: 'a)' }])).toThrow(/valor no admitido/)
    expect(() => aInstrucciones([{ t: 'json', clave: 'x->y', op: 'eqb', v: true }])).toThrow(/clave no admitida/)
    expect(() => aInstrucciones([{ t: 'ilike', cols: ['ubicacion'], patron: '%a,b%' }])).toThrow(/patrón no admitido/)
  })
  it('no se aplica NADA a medias: si una condición es inválida, el constructor no recibe ninguna llamada', () => {
    const llamadas: string[] = []
    type B = { filter(c: string, o: string, v: unknown): B; or(e: string): B }
    const b: B = { filter(c, o, v) { llamadas.push(`${c}.${o}.${v}`); return b }, or(e) { llamadas.push(`or(${e})`); return b } }
    const mala: Cond[] = [{ t: 'col', col: 'banos', op: 'gte', v: 2 }, { t: 'col', col: 'owner_id', op: 'eq', v: 'x' }]
    expect(() => aplicarCondiciones(b, mala)).toThrow()
    expect(llamadas).toEqual([])
    aplicarCondiciones(b, [{ t: 'col', col: 'banos', op: 'gte', v: 2 }])
    expect(llamadas).toEqual(['banos.gte.2'])
  })
  it('un término de «Características» que no existe produce `imposible` (la ruta no consulta)', () => { expect(condicionesDb(f({ car: 'jacuzzi' }), AHORA).imposible).toBe(true) })
})

/* ══ B y C · equivalencia con Postgres REAL y con el evaluador ═══════════════ */
let db: PGlite
const raiz = path.join(__dirname, '..')
const leer = (p: string) => readFileSync(path.join(raiz, p), 'utf8')

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const rnd = mulberry32(20261028)
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]

const UBICACIONES = ['Boulevard San Juan Bosco 4021', 'Calle San Juan Bosco', 'Calle Cañada 5', 'Av. Insurgentes 100', 'Paseo de los Leones', 'Calle Álamo 7', 'Zona Piel', null] as const
const COLONIAS = ['Buenaventura', 'Cañada del Refugio', 'Jardines de Jerez', 'Centro', 'Arboledas', null] as const
const FECHAS = ['2026-10-28T06:00:00Z', '2026-10-28T05:59:59Z', '2026-10-27T06:00:00Z', '2026-10-27T05:59:59Z', '2026-10-22T06:00:00Z', '2026-10-22T05:59:59Z', '2026-10-14T06:00:00Z', '2026-09-14T06:00:00Z', '2026-08-01T12:00:00Z', null] as const

function caracteristicasAleatorias(): Record<string, unknown> {
  const c: Record<string, unknown> = { v: 1 }
  for (const def of DEFINICIONES) {
    if (rnd() > 0.28) continue   // las claves se ponen AUNQUE no apliquen al tipo: la base no lo sabe, el filtro exacto sí
    switch (def.forma) {
      case 'lista': { const op = def.opciones.map(([v]) => v); const n = 1 + Math.floor(rnd() * Math.min(3, op.length)); c[def.clave] = [...new Set(Array.from({ length: n }, () => pick(op)))]; break }
      case 'enum': c[def.clave] = pick(def.opciones.map(([v]) => v)); break
      case 'bool': c[def.clave] = rnd() < 0.5; break
      case 'entero': case 'decimal': c[def.clave] = def.clave === 'antiguedad_anos' ? pick([0, 1, 3, 5, 6, 10, 20, 50, 51, 80]) : def.clave === 'estacionamientos' ? pick([0, 1, 2, 3, 4, 6]) : def.clave === 'm_terreno' ? pick([100, 250, 300, 1000]) : Math.min(def.max, def.min + Math.floor(rnd() * 5)); break
      case 'texto': c[def.clave] = 'giro de prueba'; break
      case 'fecha': c[def.clave] = '2026-11-01'; break
    }
  }
  return c
}

type Fila = FilaEv & { id: string; folio: string }
const FILAS: Fila[] = Array.from({ length: 300 }, (_, i) => ({
  id: `p${i}`, folio: `VB-2026-${String(i + 1).padStart(5, '0')}`,
  tipo: pick(['casa', 'departamento', 'depto', 'oficina', 'local', 'comercial', 'nave', 'bodega', 'edificio', 'terreno', 'rancho']),
  operacion: pick(['venta', 'renta']), precio: pick([null, 25_000, 60_000, 500_000, 1_200_000, 3_500_000, 9_000_000]),
  metros: pick([null, 45, 80, 120, 180, 500, 1500]), banos: pick([null, 0.5, 1, 2, 2.5, 3, 5]), recamaras: pick([null, 0, 1, 2, 3, 4]),
  subtipo: pick([null, null, 'consultorio', 'industrial']), ubicacion: pick(UBICACIONES), colonia: pick(COLONIAS), ciudad: pick(['León', 'León', null]),
  videos: rnd() < 0.3 ? ['https://www.youtube.com/watch?v=aaaaaaaaaaa'] : rnd() < 0.1 ? null : [], planos: rnd() < 0.3 ? ['https://res.cloudinary.com/demo/p.jpg'] : rnd() < 0.1 ? null : [],
  publicada_en: pick(FECHAS), extras: rnd() < 0.08 ? null : { caracteristicas: caracteristicasAleatorias() },
  estatus: 'disponible', estado_pub: 'publicada',
}))
// Casos hechos A MANO: una frase que CRUZA el límite entre dos campos, y acentos que la base no iguala.
FILAS.push({ ...FILAS[0], id: 'cruce', folio: 'VB-2026-99001', ubicacion: 'Calle Mayor Bosco', colonia: 'Buenaventura' } as Fila)
FILAS.push({ ...FILAS[0], id: 'acento', folio: 'VB-2026-99002', ubicacion: 'Calle León', colonia: 'Cañada' } as Fila)

const L = (v: string | number) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const J = (k: string) => `(extras->'caracteristicas'->'${k}')`
const T = (k: string) => `(extras->'caracteristicas'->>'${k}')`
/** Las condiciones como SQL de Postgres (la semántica documentada de cada operador de PostgREST). `rota` fuerza UN error para probar que el arnés lo detecta. */
function aSql(c: Cond, rota = false): string {
  switch (c.t) {
    case 'col': { const o = { eq: '=', neq: '<>', gte: '>=', lte: '<=' } as const; return c.op === 'in' ? `${c.col} IN (${(c.v as string[]).map(L).join(',')})` : `${c.col} ${o[c.op]} ${c.col === 'publicada_en' ? `'${c.v}'::timestamptz` : L(c.v as string | number)}` }
    case 'json': {
      const num = (op: string) => `${J(c.clave)} ${rota && op === '>=' ? '<=' : op} '${c.v}'::jsonb`
      switch (c.op) {
        case 'cs': return `${J(c.clave)} @> '["${c.v}"]'::jsonb`
        case 'eqs': return `${T(c.clave)} = ${L(c.v as string)}`
        case 'ins': return `${T(c.clave)} IN (${(c.v as string[]).map(L).join(',')})`
        case 'eqn': return num('='); case 'gten': return num('>='); case 'lten': return num('<='); case 'gtn': return num('>')
        case 'eqb': return `${J(c.clave)} = 'true'::jsonb`
      }
      throw new Error('op')
    }
    case 'noVacio': return `NOT (${c.col} = '{}')`
    case 'ilike': return `(${c.cols.map((x) => `${x} ILIKE ${L(c.patron)}`).join(' OR ')})`
    case 'or': return `(${c.conds.map((x) => aSql(x, rota)).join(' OR ')})`
    case 'and': return `(${c.conds.map((x) => aSql(x, rota)).join(' AND ')})`
  }
}

const arr = (a: unknown) => (Array.isArray(a) ? `{${a.map((x) => `"${x}"`).join(',')}}` : null)
beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(leer('docker/esquema.sql'))
  for (const p of FILAS) {
    await db.query(
      `insert into public.propiedades (id, folio, tipo, operacion, precio, metros, banos, recamaras, subtipo, ubicacion, colonia, ciudad, videos, planos, publicada_en, extras, estatus, estado_pub)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],$14::text[],$15::timestamptz,$16::jsonb,$17,$18)`,
      [p.id, p.folio, p.tipo, p.operacion, p.precio, p.metros, p.banos, p.recamaras, p.subtipo, p.ubicacion, p.colonia, p.ciudad, arr(p.videos), arr(p.planos), p.publicada_en, p.extras === null ? null : JSON.stringify(p.extras), p.estatus, p.estado_pub],
    )
  }
}, 180_000)
afterAll(async () => { await db?.close() })

/* La lista de filtros: cada opción, rangos, números, antigüedad, fechas, texto y básicos, y combinaciones aleatorias reproducibles. */
const BASE: Record<string, unknown>[] = [
  ...ITEMS_MAS.map((i) => ({ [i.grupo]: i.id })),
  { amb: 'estudio,bodega' }, { ext: 'patio,terraza,balcon' }, { srv: 'internet,caseta' }, { ame: 'gimnasio,sum' }, { mm: 'video,planos' }, { gen: 'alberca,amueblado' },
  { cmin: 100 }, { cmax: 100 }, { cmin: 50, cmax: 200 }, { tmin: 200 }, { tmax: 500 }, { tmin: 1, tmax: 300 },
  { ban: 1 }, { ban: 3 }, { ban: 5 }, { est: 0 }, { est: 1 }, { est: 3 },
  ...(['estreno', '5', '10', '20', '50', 'mas50'] as const).map((ant) => ({ ant })),
  ...(['hoy', 'ayer', '7', '15', '30', '45'] as const).map((pub) => ({ pub })),
  ...['bosco', 'Cañada', 'CANADA', 'san juan', 'bosco buenaventura', 'jardines jerez', 'leon', 'león', 'calle', 'x1'].map((dir) => ({ dir })),
  ...['alberca', 'mascotas', 'amueblado', 'estudio', 'jardin', 'gimnasio', 'patio', 'permite mascotas', 'alberca, mascotas', 'a estrenar', 'consultorio'].map((car) => ({ car })),
  { op: 'renta' }, { op: 'Venta' }, { tipo: 'depto' }, { tipo: 'comercial' }, { tipo: 'terreno' }, { zona: 'león' }, { zona: 'san juan bosco' }, { zona: 'bosco buenaventura' }, { zona: 'leon canada' },
  { pmin: 1_000_000, pmax: 5_000_000 }, { rec: 2 }, { sub: 'consultorio', tipo: 'oficina' }, { smin: 100, smax: 600 }, { op: 'renta', amu: 1 }, { op: 'renta', masc: 1 },
]
const COMBOS = Array.from({ length: 160 }, () => Object.assign({}, ...Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => pick(BASE))))
const FILTROS = [...BASE, ...COMBOS].map(normalizarFiltros).filter((x): x is Filtros => x !== null)

async function ejecutar(rota = false) {
  const reporte = { total: 0, conResultados: 0, ocultaPorLaBase: [] as string[], evaluadorDifiere: [] as string[], holgura: 0, vacios: 0 }
  for (const nf of FILTROS) {
    reporte.total++
    const js = new Set(FILAS.filter((p) => coincide(p as never, nf, AHORA)).map((p) => p.id))
    if (js.size) reporte.conResultados++
    const { conds, imposible } = condicionesDb(nf, AHORA)
    if (imposible) { if (js.size) reporte.ocultaPorLaBase.push(`imposible pero JS encuentra: ${JSON.stringify(nf)}`); continue }
    const donde = conds.map((c) => aSql(c, rota)).join(' AND ') || 'true'
    const sql = new Set((await db.query<{ id: string }>(`select id from public.propiedades where ${donde}`)).rows.map((r) => r.id))
    const ev = new Set(filtrar(FILAS, aInstrucciones(conds)).map((p) => p.id as string))
    for (const id of js) if (!sql.has(id)) reporte.ocultaPorLaBase.push(`${id} ← ${JSON.stringify(nf)}`)
    if (!rota && (sql.size !== ev.size || [...sql].some((id) => !ev.has(id)))) reporte.evaluadorDifiere.push(`${JSON.stringify(nf)}  sql=${sql.size} evaluador=${ev.size}`)
    reporte.holgura += sql.size - [...sql].filter((id) => js.has(id)).length
    if (!sql.size) reporte.vacios++
  }
  return reporte
}

describe('B · la consulta NUNCA oculta una coincidencia (superconjunto de `coincide`) — Postgres REAL', () => {
  it('300 propiedades sintéticas × cientos de filtros: ninguna coincidencia exacta queda fuera de la consulta', async () => {
    const r = await ejecutar()
    console.info(`[consulta] propiedades=${FILAS.length} filtros=${r.total} conResultados=${r.conResultados} sinResultados=${r.vacios} holguraMediaPorFiltro=${(r.holgura / r.total).toFixed(2)} ocultadasPorLaBase=${r.ocultaPorLaBase.length}`)
    expect(r.total, 'filtros evaluados').toBeGreaterThan(200)
    expect(r.conResultados, 'la prueba no puede ser vacía: debe haber muchos filtros con resultados').toBeGreaterThan(100)
    expect(r.ocultaPorLaBase, `la base ocultó coincidencias:\n${r.ocultaPorLaBase.slice(0, 5).join('\n')}`).toEqual([])
  }, 180_000)

  it('casos HECHOS A MANO: la frase que cruza dos campos y las vocales con acento no se pierden', async () => {
    for (const p of [{ dir: 'bosco buenaventura' }, { zona: 'bosco buenaventura' }, { dir: 'leon' }, { dir: 'canada' }, { zona: 'león cañada' }]) {
      const nf = f(p)
      const js = FILAS.filter((x) => coincide(x as never, nf, AHORA)).map((x) => x.id)
      const { conds } = condicionesDb(nf, AHORA)
      const sql = (await db.query<{ id: string }>(`select id from public.propiedades where ${conds.map((c) => aSql(c)).join(' AND ')}`)).rows.map((r) => r.id)
      for (const id of js) expect(sql, `${JSON.stringify(p)}: la base perdió «${id}»`).toContain(id)
    }
    expect(FILAS.filter((x) => coincide(x as never, f({ dir: 'bosco buenaventura' }), AHORA)).map((x) => x.id)).toContain('cruce')
  })

  it('CONTROL POSITIVO del arnés: con una traducción ROTA (≥ convertido en ≤) el arnés SÍ detecta que la base oculta coincidencias', async () => {
    const r = await ejecutar(true)
    expect(r.ocultaPorLaBase.length, 'si esto fuera 0, el arnés no sirve para detectar nada').toBeGreaterThan(0)
  }, 180_000)
})

describe('C · el evaluador de PostgREST de las pruebas coincide con Postgres real', () => {
  it('para las mismas condiciones, las cadenas de PostgREST evaluadas dan EXACTAMENTE las filas que devuelve Postgres', async () => {
    const r = await ejecutar()
    expect(r.evaluadorDifiere, `el evaluador difiere de Postgres:\n${r.evaluadorDifiere.slice(0, 5).join('\n')}`).toEqual([])
  }, 180_000)
  it('la consulta no es perezosa: hay filtros sin resultados en la base y la holgura (falsos positivos que corrige `coincide`) es acotada', async () => {
    const r = await ejecutar()
    expect(r.vacios).toBeGreaterThan(0)
    expect(r.holgura / r.total, `holgura media por filtro: ${(r.holgura / r.total).toFixed(2)} filas`).toBeLessThan(25)
  }, 180_000)
})
