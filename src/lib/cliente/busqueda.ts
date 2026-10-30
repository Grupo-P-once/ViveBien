import { tipoEtiqueta } from '../portal/tarjeta'

/**
 * «Qué estoy buscando» — UN solo modelo (P3-07, V-1.1.82).
 *
 * Antes convivían dos: `busca_zona` / `busca_tipo` (una zona, un tipo; los
 * usaba `/mi-cuenta`) y `busca_zonas` / `busca_tipos` (varios; los usaba el
 * portal), con la API copiando el primero de la lista a la columna vieja.
 * Además `/mi-cuenta` guardaba el tipo como ETIQUETA («Casa») mientras las
 * propiedades y el portal usan la CLAVE («casa»): nunca coincidían.
 *
 * Ahora: `busca_operacion`, `busca_zonas`, `busca_tipos`, `presupuesto_max`.
 * Aquí viven el modelo, las opciones y la limpieza; la API y las pantallas
 * sólo lo usan. Las columnas viejas se borran en la migración 22.
 */

export type Operacion = 'venta' | 'renta' | 'ambas'

export type QueBusco = {
  operacion: Operacion | null
  zonas: string[]
  tipos: string[]
  presupuestoMax: number | null
}

export const MAXIMO_ZONAS = 8
export const MAXIMO_TIPOS = 8

/** Las columnas de `usuarios` que forman el modelo. Nada más. */
export const COLUMNAS_QUE_BUSCO = 'busca_operacion, busca_zonas, busca_tipos, presupuesto_max' as const

export type FilaQueBusco = {
  busca_operacion?: string | null
  busca_zonas?: string[] | null
  busca_tipos?: string[] | null
  presupuesto_max?: number | null
}

/** Tipos que se pueden buscar: las claves que usan las propiedades. */
export const TIPOS_QUE_BUSCO = ['casa', 'departamento', 'terreno', 'nave', 'bodega', 'local', 'oficina', 'quinta'] as const

export const OPCIONES_TIPO = TIPOS_QUE_BUSCO.map((clave) => ({ clave, etiqueta: tipoEtiqueta(clave) ?? clave }))

/** Sugerencias de zona (se puede escribir cualquier otra). */
export const ZONAS_SUGERIDAS = [
  'Centro', 'Jardines del Moral', 'Campestre', 'Las Trojes', 'Punto Verde',
  'Cerro Gordo', 'La Martinica', 'San Juan Bosco', 'Piletas', 'Los Castillos',
  'Valle del Campestre', 'Gran Jardín',
] as const

const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function normalizarOperacion(v: unknown): Operacion | null {
  return v === 'venta' || v === 'renta' || v === 'ambas' ? v : null
}

/** Zonas: texto libre, sin espacios de sobra, sin repetir (sin importar acentos), máx. 8. `null` si queda vacía. */
export function normalizarZonas(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const vistas = new Set<string>()
  const lista: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const z = x.trim().replace(/\s+/g, ' ').slice(0, 60)
    const k = plano(z)
    if (!z || vistas.has(k)) continue
    vistas.add(k)
    lista.push(z)
    if (lista.length >= MAXIMO_ZONAS) break
  }
  return lista.length ? lista : null
}

/**
 * Tipos: sólo claves conocidas. Acepta también la etiqueta vieja («Casa»,
 * «Local comercial», «Depto») y la traduce a su clave. `null` si queda vacía.
 */
export function normalizarTipos(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const porNombre = new Map<string, string>()
  for (const { clave, etiqueta } of OPCIONES_TIPO) {
    porNombre.set(plano(clave), clave)
    porNombre.set(plano(etiqueta), clave)
  }
  porNombre.set('depto', 'departamento')
  const lista = [...new Set(v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => porNombre.get(plano(x)))
    .filter((x): x is string => !!x))].slice(0, MAXIMO_TIPOS)
  return lista.length ? lista : null
}

export function normalizarPresupuesto(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[^\d.]/g, '')) : NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** El modelo a partir de la fila de `usuarios`. */
export function queBuscoDe(fila: FilaQueBusco | null | undefined): QueBusco {
  return {
    operacion: normalizarOperacion(fila?.busca_operacion),
    zonas: normalizarZonas(fila?.busca_zonas) ?? [],
    tipos: normalizarTipos(fila?.busca_tipos) ?? [],
    presupuestoMax: normalizarPresupuesto(fila?.presupuesto_max),
  }
}

/** Alterna un valor en una lista (para las pastillas de elección múltiple). */
export function alternar(lista: readonly string[] | null | undefined, valor: string): string[] {
  const l = lista ?? []
  return l.includes(valor) ? l.filter((x) => x !== valor) : [...l, valor]
}
