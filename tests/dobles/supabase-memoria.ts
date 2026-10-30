/**
 * Un Supabase DE MEMORIA para pruebas (28-oct-2026): lo justo del cliente `supabase-js` que usan las rutas y tareas del portal (`from().select/insert/update/upsert/delete` con
 * `eq`, `is`, `gte`, `in`, `order`, `limit`, `maybeSingle`, conteo `head`). Las filas viven en arreglos; las restricciones únicas se declaran por tabla. Sin red, sin base real.
 * Los filtros se evalúan ANTES de escribir (igual que PostgREST): un `update` sin coincidencias no toca nada.
 */
export type Fila = Record<string, unknown>
type Resultado = { data: unknown; error: null | { message: string; code?: string }; count?: number | null }

export function crearBase(inicial: Record<string, Fila[]> = {}, opciones: { unicas?: Record<string, string[]>; sinTabla?: string[] } = {}, porDefecto: Record<string, () => Fila> = {}) {
  const t: Record<string, Fila[]> = Object.fromEntries(Object.entries(inicial).map(([k, v]) => [k, v.map((f) => ({ ...f }))]))
  let siguiente = 1000
  const llamadas: Array<{ tabla: string; op: string; datos?: unknown }> = []

  function from(nombre: string) {
    if (opciones.sinTabla?.includes(nombre)) {
      const falla = { data: null, error: { message: `relation "${nombre}" does not exist`, code: '42P01' } }
      const b: Record<string, unknown> = new Proxy({}, { get: (_o, p) => (p === 'then' ? (res: (v: unknown) => unknown) => res(falla) : () => b) })
      return b
    }
    t[nombre] ??= []
    const filtros: Array<(f: Fila) => boolean> = []
    let modo: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
    let carga: unknown; let cabeza = false; let contar = false; let tope = Infinity; let orden: { col: string; asc: boolean } | null = null; let onConflict = ''; let ignorar = false

    function ejecutar(): Resultado {
      llamadas.push({ tabla: nombre, op: modo, datos: carga })
      const filas = t[nombre]
      const coincide = (f: Fila) => filtros.every((fn) => fn(f))
      if (modo === 'insert' || modo === 'upsert') {
        const nuevas = (Array.isArray(carga) ? carga : [carga]) as Fila[]
        const unica = modo === 'upsert' ? onConflict.split(',').filter(Boolean) : opciones.unicas?.[nombre] ?? []
        for (const n of nuevas) {
          const clave = unica.length ? filas.find((f) => unica.every((c) => f[c] === n[c])) : undefined
          if (clave) {
            if (modo === 'upsert' && !ignorar) Object.assign(clave, n)
            else if (modo === 'insert') return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
            continue
          }
          // Los valores por defecto de la base (`default now()`) se simulan por tabla; lo que manda el código gana.
          filas.push({ ...(typeof n.id === 'undefined' && nombre !== 'preferencias_notificacion' ? { id: siguiente++ } : {}), ...(porDefecto[nombre]?.() ?? {}), ...n })
        }
        return { data: nuevas, error: null }
      }
      if (modo === 'update') { const hit = filas.filter(coincide); hit.forEach((f) => Object.assign(f, carga as Fila)); return { data: hit.map((f) => ({ ...f })), error: null } }
      if (modo === 'delete') { const fuera = filas.filter(coincide); t[nombre] = filas.filter((f) => !coincide(f)); return { data: fuera, error: null } }
      let r = filas.filter(coincide).map((f) => ({ ...f }))
      if (orden) { const o = orden; r.sort((a, b) => (String(a[o.col] ?? '') < String(b[o.col] ?? '') ? -1 : 1) * (o.asc ? 1 : -1)) }
      const total = r.length
      r = r.slice(0, tope)
      return { data: cabeza ? null : r, error: null, count: contar ? total : null }
    }
    const api: Record<string, unknown> = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (modo === 'select') { cabeza = !!o?.head; contar = !!o?.count } return api },
      insert: (d: unknown) => { modo = 'insert'; carga = d; return api },
      update: (d: unknown) => { modo = 'update'; carga = d; return api },
      upsert: (d: unknown, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => { modo = 'upsert'; carga = d; onConflict = o?.onConflict ?? ''; ignorar = !!o?.ignoreDuplicates; return api },
      delete: () => { modo = 'delete'; return api },
      eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return api },
      is: (c: string, v: unknown) => { filtros.push((f) => (v === null ? f[c] == null : f[c] === v)); return api },
      gte: (c: string, v: unknown) => { filtros.push((f) => String(f[c] ?? '') >= String(v)); return api },
      in: (c: string, v: unknown[]) => { filtros.push((f) => v.includes(f[c])); return api },
      order: (col: string, o?: { ascending?: boolean }) => { orden = { col, asc: o?.ascending !== false }; return api },
      limit: (n: number) => { tope = n; return api },
      maybeSingle: () => Promise.resolve((() => { const r = ejecutar(); const d = r.data as Fila[] | null; return { ...r, data: d?.[0] ?? null } })()),
      single: () => api.maybeSingle,
      then: (res: (v: unknown) => unknown) => res(ejecutar()),
    }
    return api
  }
  return { from, tablas: t, llamadas }
}
