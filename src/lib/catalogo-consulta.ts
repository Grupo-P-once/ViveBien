/**
 * Los filtros del catálogo como CONSULTA a la base (28-oct-2026): lo que se pide a Postgres, no un filtro de tarjetas ya cargadas en el navegador.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ
 *  El catálogo consulta con `order created_at desc limit 500`. Si el filtro se aplicara DESPUÉS, una coincidencia que no esté entre las 500 más nuevas se perdería sin
 *  avisar. Aquí los filtros van en el WHERE: la base filtra ANTES del límite.
 *
 * CÓMO
 *  1. `condicionesDb` traduce los filtros a condiciones (IR, ver `filtros-mas.ts`). Las que la base puede decidir EXACTO (números, listas, igualdades) lo son; las de texto con
 *     acentos se piden como SUPERCONJUNTO (`ILIKE` con comodines).
 *  2. `aplicarCondiciones` las aplica a la consulta de PostgREST (`.filter` / `.or`). TODO valor que sale hacia la base se valida antes (`seguro`): lo que no encaje se rechaza
 *     y la ruta cae en el respaldo (consulta sin filtros de base + `coincide` en el servidor), nunca arma un filtro a medias.
 *  3. La ruta deja el resultado EXACTO con `coincide` (la misma regla que el navegador y las alertas).
 *
 * LÍMITES (a declarar, no a ocultar)
 *  · La traducción a PostgREST (`->`, `->>`, `cs`, `not.eq.{}`) sigue la documentación del operador y está probada contra Postgres real (PGlite) en SQL equivalente, pero NO contra
 *    una instancia real de PostgREST: por eso existe el respaldo y la bandera `degradado`. Verificarlo en staging con la consulta REST real está PENDIENTE.
 *  · Si la base devuelve `limit` filas, la respuesta lleva `truncado: true`: puede haber más coincidencias de las que se muestran. Paginación = propuesta, no implementada.
 * ─────────────────────────────────────────────────────────────
 */

import { condicionesMas, condTexto, type Cond } from './filtros-mas'
import type { Filtros } from './busquedas'

export const LIMITE_CATALOGO = 500

/* ── Condiciones de los filtros de SIEMPRE (los nuevos están en `condicionesMas`) ── */

function condicionesBasicas(f: Filtros): Cond[] {
  const c: Cond[] = []
  if (f.op) c.push({ t: 'col', col: 'operacion', op: 'eq', v: f.op })
  if (f.tipo) c.push(f.tipo === 'departamento' ? { t: 'col', col: 'tipo', op: 'in', v: ['departamento', 'depto'] } : { t: 'col', col: 'tipo', op: 'eq', v: f.tipo })
  if (f.zona) c.push(condTexto(['ubicacion', 'colonia', 'ciudad'], f.zona))
  if (f.pmin) c.push({ t: 'col', col: 'precio', op: 'gte', v: f.pmin })
  if (f.pmax) c.push({ t: 'col', col: 'precio', op: 'lte', v: f.pmax })
  if (f.sub) c.push({ t: 'col', col: 'subtipo', op: 'eq', v: f.sub })
  if (f.rec) c.push({ t: 'col', col: 'recamaras', op: 'gte', v: f.rec })
  if (f.ban) c.push({ t: 'col', col: 'banos', op: 'gte', v: f.ban })
  if (f.est !== undefined) c.push({ t: 'json', clave: 'estacionamientos', op: f.est === 0 ? 'eqn' : 'gten', v: f.est })
  if (f.smin) c.push({ t: 'col', col: 'metros', op: 'gte', v: f.smin })
  if (f.smax) c.push({ t: 'col', col: 'metros', op: 'lte', v: f.smax })
  if (f.amu) c.push({ t: 'and', conds: [{ t: 'col', col: 'operacion', op: 'eq', v: 'renta' }, { t: 'json', clave: 'amueblado', op: 'ins', v: ['si', 'semi'] }] })
  if (f.masc) c.push({ t: 'and', conds: [{ t: 'col', col: 'operacion', op: 'eq', v: 'renta' }, { t: 'json', clave: 'mascotas', op: 'ins', v: ['permitidas', 'con_restricciones'] }] })
  return c
}

/** TODAS las condiciones (básicas + «Más filtros»). `imposible` = no puede haber resultados: la ruta responde vacío sin consultar. */
export function condicionesDb(f: Filtros, ahora = Date.now()): { conds: Cond[]; imposible: boolean } {
  const mas = condicionesMas(f, ahora)
  return { conds: [...condicionesBasicas(f), ...mas.conds], imposible: mas.imposible }
}

/* ── IR → PostgREST ───────────────────────────────────────────────────────── */

const COLUMNAS = new Set(['operacion', 'tipo', 'subtipo', 'precio', 'metros', 'recamaras', 'banos', 'ubicacion', 'colonia', 'ciudad', 'publicada_en', 'videos', 'planos'])
const CLAVE = /^[a-z0-9_]{1,40}$/
/** Un valor puede viajar a la base solo si no trae NINGÚN carácter con significado en la sintaxis de filtros de PostgREST. */
const VALOR = /^[A-Za-z0-9_\-:.+]{1,64}$/
const PATRON = /^[a-z0-9_%]{1,200}$/

function seguro(v: string | number, que: string): string {
  const s = String(v)
  if (!VALOR.test(s)) throw new Error(`valor no admitido en ${que}`)
  return s
}
function columna(c: string): string { if (!COLUMNAS.has(c)) throw new Error('columna no admitida'); return c }
function clave(c: string): string { if (!CLAVE.test(c)) throw new Error('clave no admitida'); return c }
const rutaJson = (c: string) => `extras->caracteristicas->${clave(c)}`
const rutaTexto = (c: string) => `extras->caracteristicas->>${clave(c)}`

type Triple = [col: string, op: string, val: string]

/** Una condición SIMPLE como (columna, operador, valor) de PostgREST. */
function triple(c: Extract<Cond, { t: 'col' | 'json' | 'noVacio' }> | (Extract<Cond, { t: 'ilike' }> & { cols: [string] })): Triple {
  switch (c.t) {
    case 'col':
      return c.op === 'in'
        ? [columna(c.col), 'in', `(${(c.v as string[]).map((x) => seguro(x, 'in')).join(',')})`]
        : [columna(c.col), c.op, seguro(c.v as string | number, c.col)]
    case 'json':
      switch (c.op) {
        case 'cs': return [rutaJson(c.clave), 'cs', `["${seguro(c.v as string, 'cs')}"]`]
        case 'eqs': return [rutaTexto(c.clave), 'eq', seguro(c.v as string, 'eqs')]
        case 'ins': return [rutaTexto(c.clave), 'in', `(${(c.v as string[]).map((x) => seguro(x, 'ins')).join(',')})`]
        case 'eqn': return [rutaJson(c.clave), 'eq', seguro(c.v as number, 'eqn')]
        case 'gten': return [rutaJson(c.clave), 'gte', seguro(c.v as number, 'gten')]
        case 'lten': return [rutaJson(c.clave), 'lte', seguro(c.v as number, 'lten')]
        case 'gtn': return [rutaJson(c.clave), 'gt', seguro(c.v as number, 'gtn')]
        case 'eqb': return [rutaJson(c.clave), 'eq', c.v === true ? 'true' : 'false']
      }
      throw new Error('operador no admitido')
    case 'noVacio': return [columna(c.col), 'not.eq', '{}']
    case 'ilike': { if (!PATRON.test(c.patron)) throw new Error('patrón no admitido'); return [columna(c.cols[0]), 'ilike', c.patron] }
  }
}

const esSimple = (c: Cond): c is Extract<Cond, { t: 'col' | 'json' | 'noVacio' }> | (Extract<Cond, { t: 'ilike' }> & { cols: [string] }) =>
  c.t === 'col' || c.t === 'json' || c.t === 'noVacio' || (c.t === 'ilike' && c.cols.length === 1)

/** La condición como fragmento de una expresión `or(...)` / `and(...)` de PostgREST (anidable). */
export function expresion(c: Cond): string {
  if (esSimple(c)) { const [col, op, val] = triple(c); return `${col}.${op}.${val}` }
  if (c.t === 'ilike') { if (!PATRON.test(c.patron)) throw new Error('patrón no admitido'); return `or(${c.cols.map((x) => `${columna(x)}.ilike.${c.patron}`).join(',')})` }
  if (c.t === 'or') return `or(${c.conds.map(expresion).join(',')})`
  return `and(${c.conds.map(expresion).join(',')})`
}

/** Lo que se aplica al constructor de la consulta: filtros simples (`col=op.val`) y grupos `or=(...)`. */
export type Aplicacion = { tipo: 'filtro'; col: string; op: string; val: string } | { tipo: 'o'; expr: string }

/** Aplana el AND de nivel superior y devuelve las instrucciones para el constructor. Lanza ante cualquier valor no admitido. */
export function aInstrucciones(conds: Cond[]): Aplicacion[] {
  const salida: Aplicacion[] = []
  const visitar = (c: Cond) => {
    if (c.t === 'and') { c.conds.forEach(visitar); return }
    if (esSimple(c)) { const [col, op, val] = triple(c); salida.push({ tipo: 'filtro', col, op, val }); return }
    if (c.t === 'ilike') { if (!PATRON.test(c.patron)) throw new Error('patrón no admitido'); salida.push({ tipo: 'o', expr: c.cols.map((x) => `${columna(x)}.ilike.${c.patron}`).join(',') }); return }
    salida.push({ tipo: 'o', expr: c.conds.map(expresion).join(',') })
  }
  conds.forEach(visitar)
  return salida
}

/** El subconjunto del constructor de PostgREST (supabase-js) que se usa. */
export type Constructor<T> = { filter(columna: string, operador: string, valor: unknown): T; or(expresion: string): T }

/** Aplica las condiciones a la consulta. Si algún valor no es admisible LANZA antes de aplicar nada a medias. */
export function aplicarCondiciones<T extends Constructor<T>>(consulta: T, conds: Cond[]): T {
  const instrucciones = aInstrucciones(conds)   // valida TODO primero
  let q = consulta
  for (const i of instrucciones) q = i.tipo === 'filtro' ? q.filter(i.col, i.op, i.val) : q.or(i.expr)
  return q
}

/** Texto plano de la consulta para registros y pruebas (nunca contiene datos de personas). */
export function describirConsulta(conds: Cond[]): string[] {
  return aInstrucciones(conds).map((i) => (i.tipo === 'filtro' ? `${i.col}=${i.op}.${i.val}` : `or=(${i.expr})`))
}

