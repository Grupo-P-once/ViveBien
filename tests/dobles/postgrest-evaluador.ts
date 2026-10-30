/**
 * Evaluador MÍNIMO e INDEPENDIENTE de los filtros de PostgREST que emite `src/lib/catalogo-consulta.ts` (28-oct-2026).
 *
 * Lee las CADENAS ya construidas (`col`, `op`, `val` y las expresiones `or(...)`), las interpreta con la gramática documentada de PostgREST y las evalúa sobre filas de JavaScript.
 * Sirve para comprobar que el texto que sale hacia la base DICE lo que se quiere decir (paréntesis, comas, corchetes, anidación), no solo que el código llame a los métodos.
 *
 * LÍMITE (declarado en el plan): es una reimplementación de la semántica documentada, NO una instancia real de PostgREST. La semántica de los operadores sobre Postgres real se prueba
 * aparte en PGlite (`catalogo-consulta.test.ts`). Lo que ninguna de las dos prueba es la traducción real de PostgREST: queda para staging.
 *
 * Gramática soportada (la que el adaptador emite): `col=op.val` y `or=(a,b,and(c,d))`; ops `eq neq gte lte gt in cs ilike not.eq`; rutas `col`, `extras->caracteristicas->k` (jsonb) y
 * `extras->caracteristicas->>k` (texto).
 */
export type Fila = Record<string, unknown>
export type Instruccion = { tipo: 'filtro'; col: string; op: string; val: string } | { tipo: 'o'; expr: string }

const NUMERICAS = new Set(['precio', 'metros', 'recamaras', 'banos'])
const FECHAS = new Set(['publicada_en'])

/** Orden de tipos de `jsonb` en Postgres: Null < String < Number < Boolean < Array < Object. */
function rango(v: unknown): number {
  if (v === null) return 0
  if (typeof v === 'string') return 1
  if (typeof v === 'number') return 2
  if (typeof v === 'boolean') return 3
  if (Array.isArray(v)) return 4
  return 5
}
function compararJson(a: unknown, b: unknown): number {
  const ra = rango(a), rb = rango(b)
  if (ra !== rb) return ra < rb ? -1 : 1
  if (ra === 2) return (a as number) === (b as number) ? 0 : (a as number) < (b as number) ? -1 : 1
  if (ra === 1) return a === b ? 0 : (a as string) < (b as string) ? -1 : 1
  if (ra === 3) return a === b ? 0 : a === false ? -1 : 1
  return JSON.stringify(a) === JSON.stringify(b) ? 0 : JSON.stringify(a) < JSON.stringify(b) ? -1 : 1
}

type Valor = { clase: 'json'; v: unknown } | { clase: 'texto'; v: string | null } | { clase: 'col'; v: unknown }

function valorDe(fila: Fila, ruta: string): Valor | null {
  const m = ruta.match(/^extras->caracteristicas->(>?)([a-z0-9_]+)$/)
  if (!m) return { clase: 'col', v: fila[ruta] }
  const ex = fila.extras
  const c = ex && typeof ex === 'object' && !Array.isArray(ex) ? (ex as Fila).caracteristicas : undefined
  const v = c && typeof c === 'object' && !Array.isArray(c) ? (c as Fila)[m[2]] : undefined
  if (v === undefined) return null                       // clave ausente = NULL de SQL: ninguna comparación se cumple
  if (m[1] === '>') return { clase: 'texto', v: v === null ? null : typeof v === 'string' ? v : JSON.stringify(v) }
  return { clase: 'json', v }
}

function aLike(patron: string): RegExp {
  let r = ''
  for (const ch of patron) r += ch === '%' || ch === '*' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${r}$`, 'is')
}

function parseJson(texto: string): unknown { try { return JSON.parse(texto) } catch { return texto } }

/** `col op val` sobre una fila, con la semántica de SQL (NULL nunca cumple). */
export function cumple(fila: Fila, col: string, op: string, val: string): boolean {
  const x = valorDe(fila, col)
  if (x === null || x.v === null || x.v === undefined) {
    // NULL de SQL. Única excepción útil aquí: un JSON `null` explícito sí participa en el orden de jsonb, pero ningún filtro del adaptador lo busca.
    return false
  }
  if (op === 'not.eq' && val === '{}') return Array.isArray(x.v) && x.v.length > 0     // NOT (col = '{}'): NULL → falso; vacío → falso
  if (op === 'ilike') return typeof x.v === 'string' && aLike(val).test(x.v)
  if (op === 'in') { const lista = val.replace(/^\(|\)$/g, '').split(','); return lista.includes(String(x.v)) }
  if (op === 'cs') {
    if (x.clase !== 'json' || !Array.isArray(x.v)) return false
    const pedido = parseJson(val)
    return Array.isArray(pedido) && pedido.every((e) => (x.v as unknown[]).includes(e))   // jsonb @> '[...]'
  }
  const cmp = (a: unknown, b: unknown): number | null => {
    if (x.clase === 'json') return compararJson(a, b)
    if (FECHAS.has(col)) return Date.parse(String(a)) - Date.parse(String(b))
    if (NUMERICAS.has(col)) return Number(a) - Number(b)
    return String(a) === String(b) ? 0 : String(a) < String(b) ? -1 : 1
  }
  const objetivo = x.clase === 'json' ? parseJson(val) : val
  const c = cmp(x.v, objetivo)
  if (c === null || Number.isNaN(c)) return false
  switch (op) {
    case 'eq': return c === 0
    case 'neq': return c !== 0
    case 'gte': return c >= 0
    case 'lte': return c <= 0
    case 'gt': return c > 0
    case 'lt': return c < 0
  }
  throw new Error(`operador no soportado por el evaluador: ${op}`)
}

/** Parte por comas de NIVEL SUPERIOR (respeta `()`, `[]`, `{}` y comillas). */
function partir(expr: string): string[] {
  const salida: string[] = []
  let prof = 0, comilla = false, ini = 0
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === '"') comilla = !comilla
    else if (!comilla && '([{'.includes(ch)) prof++
    else if (!comilla && ')]}'.includes(ch)) prof--
    else if (!comilla && prof === 0 && ch === ',') { salida.push(expr.slice(ini, i)); ini = i + 1 }
  }
  salida.push(expr.slice(ini))
  return salida
}

function evaluarTermino(fila: Fila, t: string): boolean {
  const g = t.match(/^(and|or)\(([\s\S]*)\)$/)
  if (g) { const hijos = partir(g[2]).map((h) => evaluarTermino(fila, h)); return g[1] === 'and' ? hijos.every(Boolean) : hijos.some(Boolean) }
  const m = t.match(/^([a-z0-9_>\-]+)\.(not\.eq|eq|neq|gte|lte|gt|lt|in|cs|ilike)\.([\s\S]*)$/)
  if (!m) throw new Error(`expresión no reconocida: ${t}`)
  return cumple(fila, m[1], m[2], m[3])
}

/** Aplica las instrucciones (AND entre ellas) a las filas, como lo haría la base. */
export function filtrar(filas: Fila[], instrucciones: Instruccion[]): Fila[] {
  return filas.filter((f) => instrucciones.every((i) => (i.tipo === 'filtro' ? cumple(f, i.col, i.op, i.val) : partir(i.expr).some((t) => evaluarTermino(f, t)))))
}
