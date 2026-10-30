import type { PGlite } from '@electric-sql/pglite'

/**
 * Un `DbCorreo` de pruebas respaldado por PGlite (Postgres en memoria): `rpc` llama a las funciones REALES de la migración
 * 36 con parámetros nombrados (así se detecta cualquier diferencia de nombres entre el TypeScript y el SQL), y `from()` imita
 * lo mínimo del constructor de consultas de Supabase que usa el código (select/update, eq/lte/in, order, limit, maybeSingle).
 */
type Filtro = [string, 'eq' | 'lte' | 'in', unknown]

class Consulta implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: 'select' | 'update' = 'select'
  private cols = '*'
  private filtros: Filtro[] = []
  private orden: string | null = null
  private tope: number | null = null
  private valores: Record<string, unknown> = {}
  constructor(private db: PGlite, private tabla: string) {}

  select(cols = '*') { this.cols = cols; return this }
  update(valores: Record<string, unknown>) { this.op = 'update'; this.valores = valores; return this }
  eq(k: string, v: unknown) { this.filtros.push([k, 'eq', v]); return this }
  lte(k: string, v: unknown) { this.filtros.push([k, 'lte', v]); return this }
  in(k: string, v: unknown[]) { this.filtros.push([k, 'in', v]); return this }
  order(k: string, o: { ascending?: boolean } = {}) { this.orden = `${k} ${o.ascending === false ? 'desc' : 'asc'}`; return this }
  limit(n: number) { this.tope = n; return this }
  async maybeSingle() {
    const r = await this.ejecutar()
    return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : null, error: r.error }
  }
  then<A, B>(ok?: (v: { data: unknown; error: { message: string } | null }) => A | PromiseLike<A>, ko?: (e: unknown) => B | PromiseLike<B>) {
    return this.ejecutar().then(ok, ko)
  }

  private async ejecutar(): Promise<{ data: unknown; error: { message: string } | null }> {
    const params: unknown[] = []
    const donde = this.filtros.map(([k, op, v]) => {
      if (!/^[a-z_]+$/.test(k)) throw new Error('columna no válida')
      if (op === 'in') { params.push(v); return `${k} = any($${params.length})` }
      params.push(v)
      return `${k} ${op === 'eq' ? '=' : '<='} $${params.length}`
    })
    const w = donde.length ? ` where ${donde.join(' and ')}` : ''
    try {
      if (this.op === 'update') {
        const sets = Object.entries(this.valores).map(([k, v]) => { params.push(v); return `${k} = $${params.length}` })
        await this.db.query(`update public.${this.tabla} set ${sets.join(', ')}${w}`, params)
        return { data: null, error: null }
      }
      const cols = this.cols === '*' ? '*' : this.cols.replace(/\s+/g, ' ')
      const sql = `select ${cols} from public.${this.tabla}${w}${this.orden ? ` order by ${this.orden}` : ''}${this.tope ? ` limit ${this.tope}` : ''}`
      return { data: (await this.db.query(sql, params)).rows, error: null }
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : 'error' } }
    }
  }
}

export function dbCorreoPglite(db: PGlite) {
  return {
    from: (tabla: string) => new Consulta(db, tabla),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      const nombres = Object.keys(args)
      const molde: Record<string, string> = { p_props: '::text[]', p_prefs: '::jsonb', p_suscriptor: '::uuid' }
      const sql = `select public.${fn}(${nombres.map((n, i) => `${n} => $${i + 1}${molde[n] ?? ''}`).join(', ')}) as r`
      const valores = nombres.map((n) => (n === 'p_prefs' ? JSON.stringify(args[n]) : args[n]))
      try {
        const r = await db.query<{ r: unknown }>(sql, valores)
        return { data: r.rows[0]?.r ?? null, error: null }
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : 'error' } }
      }
    },
  }
}
