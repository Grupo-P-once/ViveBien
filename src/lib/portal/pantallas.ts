import { aHref, coincide, contar, describir, type Filtros } from '../busquedas'
import { aTarjeta, type FilaPropiedadPortal, type PropiedadTarjeta } from './tarjeta'
import type { ConsultaCliente } from '../consultas'

/**
 * Lo que enseñan las cuatro pantallas de 3b-1, decidido aquí y no en la vista
 * (V-1.1.85). Sin Supabase dentro: entra lo que ya se leyó, sale lo que se
 * pinta. Así cada regla —sobre todo la de «nuevas desde que las vi»— se prueba
 * sin navegador ni base de datos.
 */

const FUERA = ['pausada', 'vendida', 'rentada', 'eliminada']

/** ¿Sigue esta propiedad a la venta o en renta de verdad? */
export function disponible(p: FilaPropiedadPortal): boolean {
  return p.estado_pub === 'publicada' && !FUERA.includes(p.estatus ?? '')
}

const cuando = (p: FilaPropiedadPortal) => Date.parse(p.publicada_en || p.created_at || '') || 0

// ── Guardadas ──────────────────────────────────────────────────────────────

export type FilaFavoritoPortal = { propiedad_id: string; creado_en: string }

export type GuardadaVista = PropiedadTarjeta & {
  guardadaEn: string
  /** `false` = se pausó o ya se vendió/rentó. Se sigue enseñando, pero diciéndolo. */
  disponible: boolean
}

/**
 * Las guardadas, de la más reciente a la más antigua.
 *
 * Una guardada que se pausó o se vendió **no desaparece**: desaparecer sin
 * avisar es peor que decir «ya no está disponible» —la persona la guardó por
 * algo y merece saber qué pasó—. Si la propiedad ya no existe en la base, ahí
 * sí se omite: no hay nada que enseñar.
 */
export function guardadasVista(
  favoritos: FilaFavoritoPortal[],
  propiedades: FilaPropiedadPortal[],
): GuardadaVista[] {
  const porId = new Map(propiedades.map((p) => [p.id, p]))
  return favoritos
    .map((f) => {
      const p = porId.get(f.propiedad_id)
      return p ? { ...aTarjeta(p), guardadaEn: f.creado_en, disponible: disponible(p) } : null
    })
    .filter((x): x is GuardadaVista => x !== null)
    .sort((a, b) => Date.parse(b.guardadaEn) - Date.parse(a.guardadaEn))
}

// ── Mis búsquedas y Alertas ────────────────────────────────────────────────

export type FilaBusquedaPortal = {
  id: number
  nombre: string | null
  filtros: Filtros
  creado_en: string
  /** Última vez que miró las alertas de ESTA búsqueda (migración 24). */
  revisadas_en?: string | null
  /** ¿Quiere que le AVISEMOS de lo nuevo (migración 24) y cada cuánto (migración 58)? */
  alertas?: boolean | null
  frecuencia?: 'diaria' | 'semanal' | null
}

export type BusquedaVista = {
  id: number
  nombre: string
  descripcion: string
  href: string
  total: number
  nuevas: number
  creadoEn: string
  revisadasEn: string | null
  alertas: boolean
  frecuencia: 'diaria' | 'semanal'
}

/**
 * Desde cuándo cuenta lo «nuevo» de una búsqueda: desde la última vez que la
 * miró, y si nunca la ha mirado, desde que la guardó (D-28.2).
 */
export function desdeCuandoEsNuevo(b: FilaBusquedaPortal): number {
  const revisada = b.revisadas_en ? Date.parse(b.revisadas_en) : NaN
  return Number.isFinite(revisada) ? revisada : (Date.parse(b.creado_en) || 0)
}

/** Las propiedades que esta búsqueda no había visto todavía, de más nueva a más vieja. */
export function nuevasDe(b: FilaBusquedaPortal, propiedades: FilaPropiedadPortal[]): FilaPropiedadPortal[] {
  const desde = desdeCuandoEsNuevo(b)
  return propiedades
    .filter((p) => disponible(p) && coincide(p, b.filtros) && cuando(p) > desde)
    .sort((a, b2) => cuando(b2) - cuando(a))
}

export function busquedasVista(
  busquedas: FilaBusquedaPortal[],
  propiedades: FilaPropiedadPortal[],
): BusquedaVista[] {
  const disponibles = propiedades.filter(disponible)
  return busquedas.map((b) => {
    // Una sola pasada da las dos cifras, y «nuevas» cuenta desde que la miró
    // (o desde que la guardó, si nunca la ha mirado).
    const { total, nuevas } = contar(disponibles, b.filtros, b.revisadas_en ?? b.creado_en)
    return {
      id: b.id,
      nombre: (b.nombre ?? '').trim() || describir(b.filtros),
      descripcion: describir(b.filtros),
      href: aHref(b.filtros),
      total,
      nuevas,
      creadoEn: b.creado_en,
      revisadasEn: b.revisadas_en ?? null,
      alertas: b.alertas === true,
      frecuencia: b.frecuencia === 'semanal' ? 'semanal' : 'diaria',
    }
  })
}

export type AlertaVista = {
  busquedaId: number
  nombre: string
  href: string
  revisadasEn: string | null
  nuevas: PropiedadTarjeta[]
}

/** Lo nuevo de cada búsqueda, para la pantalla de Alertas. Máximo 12 por búsqueda. */
export function alertasVista(
  busquedas: FilaBusquedaPortal[],
  propiedades: FilaPropiedadPortal[],
  tope = 12,
): AlertaVista[] {
  return busquedas.map((b) => ({
    busquedaId: b.id,
    nombre: (b.nombre ?? '').trim() || describir(b.filtros),
    href: aHref(b.filtros),
    revisadasEn: b.revisadas_en ?? null,
    nuevas: nuevasDe(b, propiedades).slice(0, tope).map(aTarjeta),
  }))
}

/** Cuántas alertas sin ver hay en total (el contador del menú). */
export function totalNuevas(busquedas: FilaBusquedaPortal[], propiedades: FilaPropiedadPortal[]): number {
  const ids = new Set<string>()
  for (const b of busquedas) for (const p of nuevasDe(b, propiedades)) ids.add(p.id)
  return ids.size
}

// ── Mis consultas ──────────────────────────────────────────────────────────

export type ConsultaVista = ConsultaCliente & {
  /** La propiedad por la que preguntó, si sigue existiendo. */
  propiedad: PropiedadTarjeta | null
  propiedadDisponible: boolean
}

export function consultasVista(
  consultas: ConsultaCliente[],
  propiedades: FilaPropiedadPortal[],
): ConsultaVista[] {
  const porId = new Map(propiedades.map((p) => [p.id, p]))
  return consultas.map((c) => {
    const p = c.propiedadId ? porId.get(c.propiedadId) : undefined
    return { ...c, propiedad: p ? aTarjeta(p) : null, propiedadDisponible: p ? disponible(p) : false }
  })
}

// ── Me interesan (3b-2) ────────────────────────────────────────────────────

export type FilaInteres = {
  propiedad_id: string | null
  /** Qué hizo: pidió informes, pidió visita, o tiene una visita agendada. */
  que: 'informacion' | 'visita' | 'cita'
  cuando: string
  /** Sólo para las citas: en qué estado está. */
  estado?: string | null
}

export type InteresVista = PropiedadTarjeta & {
  disponible: boolean
  /** Lo que hizo con esta propiedad, de lo más reciente a lo más antiguo. */
  interacciones: Array<{ que: FilaInteres['que']; cuando: string; estado?: string | null }>
  ultima: string
}

/**
 * «Me interesan»: las propiedades sobre las que esta persona **hizo algo
 * comercial con su cuenta** — pidió informes, pidió una visita o tiene una
 * visita agendada (D-27.2, D-28.1 = A).
 *
 * Lo que NO cuenta, a propósito: abrir una ficha (nadie guarda quién la vio) y
 * los formularios públicos (`leads` no tiene cuenta: adivinar por correo sería
 * enseñarle a alguien la actividad de otro).
 */
export function interesanVista(
  interacciones: FilaInteres[],
  propiedades: FilaPropiedadPortal[],
): InteresVista[] {
  const porId = new Map(propiedades.map((p) => [p.id, p]))
  const juntas = new Map<string, InteresVista>()

  for (const i of [...interacciones].sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando))) {
    const p = i.propiedad_id ? porId.get(i.propiedad_id) : undefined
    if (!p) continue // ya no existe o no está publicada: no se inventa una tarjeta
    const ya = juntas.get(p.id)
    const paso = { que: i.que, cuando: i.cuando, estado: i.estado ?? null }
    if (ya) ya.interacciones.push(paso)
    else juntas.set(p.id, { ...aTarjeta(p), disponible: disponible(p), interacciones: [paso], ultima: i.cuando })
  }

  return [...juntas.values()].sort((a, b) => Date.parse(b.ultima) - Date.parse(a.ultima))
}
