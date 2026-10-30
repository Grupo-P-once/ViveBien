import { nombreDe } from './propiedad-publica'
import { claveDeZona, zonasBuscadas } from './zonas-buscadas'

/**
 * Los números de las gráficas del panel, calculados sin tocar la base.
 *
 * Funciones puras a propósito: la ruta trae las filas y esto las convierte en
 * series. Así cada cálculo se prueba con datos de ejemplo, y un número raro en
 * una gráfica se puede reproducir sin abrir Supabase.
 *
 * Regla de todo el archivo: **no se inventa nada**. Si no hay datos para una
 * gráfica, se devuelve vacío y el panel lo dice. Una gráfica con ceros de
 * relleno parece un negocio que no funciona; una vacía con su explicación dice
 * la verdad: todavía no hay datos.
 */

export type FilaEvento = {
  nombre: string
  propiedad_id: string | null
  datos: Record<string, unknown> | null
  creado_en: string
  sesion: string | null
}

export type FilaPropiedad = {
  id: string
  folio?: string | null
  titulo?: string | null
  tipo?: string | null
  operacion?: string | null
  precio?: number | string | null
  ubicacion?: string | null
  estado_pub?: string | null
  publicada_en?: string | null
  created_at?: string | null
}

export type FilaContacto = {
  /** `leads.created_at` o `solicitudes_contacto.creado_en`. */
  fecha: string | null
  propiedad_id: string | null
}

/** Donde está el negocio. México no cambia de horario desde 2022. */
const ZONA_HORARIA = 'America/Mexico_City'

/** «2026-09-16» en hora de León, no en UTC: una visita a las 22:00 es de hoy. */
export function diaLocal(fechaIso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date(fechaIso))
}

const TIPOS: Record<string, string> = {
  casa: 'Casas',
  departamento: 'Departamentos',
  terreno: 'Terrenos',
  nave: 'Naves industriales',
  bodega: 'Bodegas',
  local: 'Locales comerciales',
  comercial: 'Locales comerciales',
  oficina: 'Oficinas',
}

export function etiquetaTipo(tipo: string | null | undefined): string {
  return TIPOS[(tipo ?? '').toLowerCase()] ?? 'Sin tipo'
}

function publicadas(props: FilaPropiedad[]): FilaPropiedad[] {
  return props.filter((p) => p.estado_pub === 'publicada')
}

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/* ── 1. Vistas y leads por día ───────────────────────────────── */

export type PuntoDiario = { dia: string; vistas: number; leads: number }

/**
 * Los últimos `dias` días, **todos**, también los que no tuvieron nada.
 *
 * Un día sin visitas es un cero, no un hueco: si se omitiera, la línea uniría el
 * día anterior con el siguiente y dibujaría una actividad que no hubo.
 */
export function serieDiaria(
  eventos: FilaEvento[],
  contactos: FilaContacto[],
  hoy: Date,
  dias = 30,
): PuntoDiario[] {
  const puntos = new Map<string, PuntoDiario>()
  for (let i = dias - 1; i >= 0; i--) {
    const d = diaLocal(new Date(hoy.getTime() - i * 86_400_000).toISOString())
    puntos.set(d, { dia: d, vistas: 0, leads: 0 })
  }
  for (const e of eventos) {
    if (e.nombre !== 'property_view') continue
    const p = puntos.get(diaLocal(e.creado_en))
    if (p) p.vistas++
  }
  for (const c of contactos) {
    if (!c.fecha) continue
    const p = puntos.get(diaLocal(c.fecha))
    if (p) p.leads++
  }
  return [...puntos.values()]
}

/* ── 2. Composición: inventario e interés ────────────────────── */

export type Porcion = { clave: string; etiqueta: string; n: number }

/**
 * Hasta 4 porciones y el resto en «Otros».
 *
 * Una dona sólo se lee de un vistazo con pocas porciones; con siete, las
 * pequeñas son indistinguibles y el color deja de identificar nada. El orden de
 * las claves es fijo (por tipo, no por tamaño) para que «Naves» tenga el mismo
 * color en las dos donas aunque en una sea la mayor y en otra la menor.
 */
function agrupar(conteo: Map<string, number>, maximo = 4): Porcion[] {
  const orden = ['nave', 'casa', 'terreno', 'departamento', 'local', 'bodega', 'oficina']
  const filas = [...conteo.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])

  const principales = filas.slice(0, maximo)
  const resto = filas.slice(maximo).reduce((s, [, n]) => s + n, 0)

  const porciones = principales
    .map(([clave, n]) => ({ clave, etiqueta: etiquetaTipo(clave), n }))
    .sort((a, b) => {
      const ia = orden.indexOf(a.clave), ib = orden.indexOf(b.clave)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  if (resto > 0) porciones.push({ clave: 'otros', etiqueta: 'Otros', n: resto })
  return porciones
}

function normalizarTipo(t: string | null | undefined): string {
  const k = (t ?? '').toLowerCase()
  return k === 'comercial' ? 'local' : k || 'sin-tipo'
}

/** Qué hay publicado, por tipo. */
export function composicionInventario(props: FilaPropiedad[]): Porcion[] {
  const conteo = new Map<string, number>()
  for (const p of publicadas(props)) {
    const k = normalizarTipo(p.tipo)
    conteo.set(k, (conteo.get(k) ?? 0) + 1)
  }
  return agrupar(conteo)
}

/**
 * Qué mira la gente, por tipo: las vistas de ficha repartidas según el tipo de
 * la propiedad vista. Una vista de una propiedad que ya no existe no se puede
 * clasificar y no se cuenta.
 */
export function interesPorTipo(eventos: FilaEvento[], props: FilaPropiedad[]): Porcion[] {
  const tipoDe = new Map(props.map((p) => [p.id, normalizarTipo(p.tipo)]))
  const conteo = new Map<string, number>()
  for (const e of eventos) {
    if (e.nombre !== 'property_view' || !e.propiedad_id) continue
    const k = tipoDe.get(e.propiedad_id)
    if (!k) continue
    conteo.set(k, (conteo.get(k) ?? 0) + 1)
  }
  return agrupar(conteo)
}

/* ── 3. Zonas: lo que se busca frente a lo que hay ───────────── */

export type ZonaComparada = { zona: string; busquedas: number; activas: number }

/**
 * Para cada zona buscada, cuántas propiedades publicadas hay en ella.
 *
 * «En ella» = la zona aparece en el texto de la ubicación, sin acentos ni
 * mayúsculas. Es una aproximación honesta mientras `ciudad` y `colonia` estén
 * vacías en la base: cuando existan como columnas, esto debe compararse contra
 * ellas. Una zona muy buscada con 0 propiedades es inventario que falta.
 */
export function zonasFrenteAInventario(eventos: FilaEvento[], props: FilaPropiedad[], limite = 8): ZonaComparada[] {
  const busquedas = eventos
    .filter((e) => e.nombre === 'search_performed')
    .map((e) => ({ sesion: e.sesion, zona: typeof e.datos?.zona === 'string' ? (e.datos.zona as string) : null, creado: e.creado_en }))

  const ubicaciones = publicadas(props).map((p) => claveDeZona(p.ubicacion ?? ''))

  return zonasBuscadas(busquedas, limite).map(([zona, n]) => {
    const clave = claveDeZona(zona)
    return { zona, busquedas: n, activas: ubicaciones.filter((u) => u.includes(clave)).length }
  })
}

/* ── 4. Precios que se buscan ────────────────────────────────── */

export type Rango = { rango: string; n: number }

const RANGOS_RENTA: [number, string][] = [
  [10_000, 'Hasta $10k'], [20_000, '$10k–$20k'], [50_000, '$20k–$50k'], [100_000, '$50k–$100k'], [Infinity, 'Más de $100k'],
]
const RANGOS_VENTA: [number, string][] = [
  [1_000_000, 'Hasta $1M'], [3_000_000, '$1M–$3M'], [5_000_000, '$3M–$5M'], [10_000_000, '$5M–$10M'], [Infinity, 'Más de $10M'],
]

/**
 * Histograma del presupuesto de quien busca, separado en renta y venta.
 *
 * Por separado porque en una sola escala una renta de $15k y una venta de
 * $5M no caben: los rangos de renta quedarían todos aplastados contra el cero.
 *
 * El presupuesto de una búsqueda es su precio máximo; si sólo puso mínimo, ese.
 * Si no eligió operación, se asigna por magnitud (desde $200k, venta): en León
 * una renta mensual no llega ahí y una venta no baja de ahí. Se dice en el panel.
 */
export function preciosBuscados(eventos: FilaEvento[]): { renta: Rango[]; venta: Rango[]; total: number } {
  const renta = RANGOS_RENTA.map(([, r]) => ({ rango: r, n: 0 }))
  const venta = RANGOS_VENTA.map(([, r]) => ({ rango: r, n: 0 }))
  let total = 0

  for (const e of eventos) {
    if (e.nombre !== 'search_performed') continue
    const precio = numero(e.datos?.precioMax) ?? numero(e.datos?.precioMin)
    if (!precio) continue
    const op = e.datos?.op === 'renta' || e.datos?.op === 'venta' ? e.datos.op : precio >= 200_000 ? 'venta' : 'renta'
    const tabla = op === 'renta' ? RANGOS_RENTA : RANGOS_VENTA
    const destino = op === 'renta' ? renta : venta
    const i = tabla.findIndex(([tope]) => precio <= tope)
    destino[i].n++
    total++
  }
  return { renta, venta, total }
}

/* ── 5. Días en el mercado frente a precio ───────────────────── */

export type PuntoMercado = { folio: string; nombre: string; operacion: 'venta' | 'renta'; precio: number; dias: number }

/**
 * Cada propiedad publicada con precio: cuántos días lleva publicada y cuánto
 * pide. Una propiedad arriba a la derecha lleva mucho tiempo y es cara:
 * candidata a revisar el precio.
 */
export function diasEnMercado(props: FilaPropiedad[], hoy: Date): PuntoMercado[] {
  return publicadas(props)
    .map((p) => {
      const precio = numero(p.precio)
      const desde = p.publicada_en ?? p.created_at
      if (!precio || !desde || (p.operacion !== 'venta' && p.operacion !== 'renta')) return null
      const dias = Math.max(0, Math.floor((hoy.getTime() - Date.parse(desde)) / 86_400_000))
      return { folio: p.folio ?? '', nombre: nombreDe(p), operacion: p.operacion, precio, dias }
    })
    .filter((x): x is PuntoMercado => x !== null)
}

/* ── 6. Favoritos frente a contactos reales ──────────────────── */

export type InteresPropiedad = { folio: string; nombre: string; favoritos: number; contactos: number }

/**
 * Las 5 propiedades con más interés, comparando guardar en favoritos (gratis,
 * sin compromiso) con pedir contacto (dar teléfono). Mucho favorito y ningún
 * contacto suele decir que algo frena: el precio, las fotos, la información.
 */
export function topFavoritosContactos(
  props: FilaPropiedad[],
  favoritos: { propiedad_id: string | null }[],
  contactos: FilaContacto[],
  limite = 5,
): InteresPropiedad[] {
  const fav = new Map<string, number>()
  for (const f of favoritos) if (f.propiedad_id) fav.set(f.propiedad_id, (fav.get(f.propiedad_id) ?? 0) + 1)
  const con = new Map<string, number>()
  for (const c of contactos) if (c.propiedad_id) con.set(c.propiedad_id, (con.get(c.propiedad_id) ?? 0) + 1)

  return props
    .map((p) => ({ folio: p.folio ?? '', nombre: nombreDe(p), favoritos: fav.get(p.id) ?? 0, contactos: con.get(p.id) ?? 0 }))
    .filter((x) => x.favoritos + x.contactos > 0)
    .sort((a, b) => b.contactos - a.contactos || b.favoritos - a.favoritos)
    .slice(0, limite)
}
