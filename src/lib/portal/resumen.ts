import { aHref, coincide, contar, describir, plano, type Filtros } from '../busquedas'
import type { CitaVista } from '../citas/vista'
import { aTarjeta, type FilaPropiedadPortal, type PropiedadTarjeta } from './tarjeta'
import { rutaDeVisitas } from '../citas/enlaces'
import { queBuscoDe, type FilaQueBusco } from '../cliente/busqueda'
import { desdeCuandoEsNuevo } from './pantallas'

/**
 * Lo que enseña el Inicio del portal del cliente (mockup 05), armado con
 * datos que ya existen. Puro: se prueba sin base.
 *
 * Nada se inventa. Lo que el mockup enseña y todavía no existe no se pinta:
 *   · las consultas no tienen estado de seguimiento → sólo «Enviada» y fecha;
 *   · no hay envío de alertas por correo → no se promete «te avisaremos».
 */

export type FilaBusqueda = { id: number; nombre: string | null; filtros: Filtros; creado_en: string; revisadas_en?: string | null }
export type FilaFavorito = { propiedad_id: string; creado_en: string }
export type FilaSolicitud = { id: number; propiedad_id: string; propiedad_titulo: string | null; tipo: string; creado_en: string }
/** La fila de `usuarios` que usa el Inicio: nombre + el modelo único de «Qué estoy buscando». */
export type FilaPerfilPortal = FilaQueBusco & { nombre: string | null }

export type AvisoPortal = { id: string; texto: string; enlace: string; en: string | null; urgente: boolean }

export type ResumenPortal = {
  /**
   * ¿Se puede agendar en línea? (flag `citasEnLinea`). Con `false`, el portal
   * no enseña NINGÚN llamado a solicitar visita: prometer algo apagado es peor
   * que no ofrecerlo (D-32, V-1.1.85).
   */
  citasEnLinea: boolean
  tarjetas: { guardadas: number; busquedas: number; nuevas: number; visitas: number }
  /** Ids de sus guardadas, para pintar el corazón lleno en las tarjetas. */
  guardadas: string[]
  paraTi: { criterio: 'preferencias' | 'recientes'; propiedades: PropiedadTarjeta[] }
  tuBusqueda: { operacion: string | null; presupuestoMax: number | null; zonas: string[]; tipos: string[] } | null
  consultas: { id: number; titulo: string; tipo: 'visita' | 'informacion'; creadoEn: string; propiedad: PropiedadTarjeta | null }[]
  proximasVisitas: CitaVista[]
  busquedas: { id: number; nombre: string; href: string; total: number; nuevas: number }[]
  avisos: AvisoPortal[]
}

const ESTATUS_FUERA = ['pausada', 'vendida', 'rentada', 'eliminada']
const disponible = (p: FilaPropiedadPortal) => p.estado_pub === 'publicada' && !ESTATUS_FUERA.includes(p.estatus ?? '')
const cuando = (p: FilaPropiedadPortal) => Date.parse(p.publicada_en || p.created_at || '') || 0

/**
 * Lo que busca, del modelo único (P3-07, V-1.1.82). Para ordenar «Para ti»,
 * «las dos» (ambas) no filtra por operación.
 */
export function preferencias(perfil: FilaPerfilPortal | null) {
  const q = queBuscoDe(perfil)
  return { zonas: q.zonas, tipos: q.tipos, operacion: q.operacion === 'ambas' ? null : q.operacion, presupuestoMax: q.presupuestoMax }
}

/** Propiedades nuevas para alguna de sus búsquedas: publicadas después de guardarla. */
export function nuevasCoincidencias(propiedades: FilaPropiedadPortal[], busquedas: FilaBusqueda[]): FilaPropiedadPortal[] {
  // Desde la última vez que miró esa búsqueda; si nunca, desde que la guardó
  // (D-28.2, V-1.1.85). Antes se contaba siempre desde que la guardó, así que
  // el contador nunca bajaba: lo que fue nuevo lo era para siempre.
  return propiedades.filter((p) => disponible(p) && busquedas.some((b) => {
    const desde = desdeCuandoEsNuevo(b)
    return coincide(p, b.filtros) && desde > 0 && cuando(p) > desde
  }))
}

/** Qué tanto se parece a lo que busca: sus búsquedas pesan más que sus preferencias. */
function puntaje(p: FilaPropiedadPortal, busquedas: FilaBusqueda[], pref: ReturnType<typeof preferencias>): number {
  let n = busquedas.some((b) => coincide(p, b.filtros)) ? 3 : 0
  if (pref.operacion && p.operacion === pref.operacion) n += 1
  if (pref.tipos.length && pref.tipos.includes(p.tipo ?? '')) n += 1
  if (pref.zonas.length) {
    const donde = plano([p.ubicacion, p.colonia, p.ciudad].filter(Boolean).join(' '))
    if (pref.zonas.some((z) => donde.includes(plano(z)))) n += 1
  }
  if (pref.presupuestoMax && typeof p.precio === 'number' && p.precio > 0 && p.precio <= pref.presupuestoMax) n += 1
  return n
}

export function construirResumenPortal(e: {
  perfil: FilaPerfilPortal | null
  propiedades: FilaPropiedadPortal[]
  favoritos: FilaFavorito[]
  busquedas: FilaBusqueda[]
  solicitudes: FilaSolicitud[]
  /** Visitas activas y futuras del cliente, en orden. */
  citas: CitaVista[]
  /** Flag `citasEnLinea` (apagado por defecto: nunca se promete lo que no está). */
  citasEnLinea?: boolean
}): ResumenPortal {
  const pref = preferencias(e.perfil)
  const disponibles = e.propiedades.filter(disponible)
  const porId = new Map(e.propiedades.map((p) => [p.id, p]))

  const nuevas = nuevasCoincidencias(e.propiedades, e.busquedas)

  // «Nuevas propiedades para ti»: si nada se parece a lo que busca, se dice
  // que son las más recientes en vez de fingir que están elegidas para él.
  const puntuadas = disponibles
    .map((p) => ({ p, n: puntaje(p, e.busquedas, pref) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || cuando(b.p) - cuando(a.p))
  const paraTi = puntuadas.length
    ? { criterio: 'preferencias' as const, propiedades: puntuadas.slice(0, 3).map((x) => aTarjeta(x.p)) }
    : { criterio: 'recientes' as const, propiedades: [...disponibles].sort((a, b) => cuando(b) - cuando(a)).slice(0, 3).map(aTarjeta) }

  const tieneBusqueda = pref.operacion || pref.presupuestoMax || pref.zonas.length || pref.tipos.length

  const avisos: AvisoPortal[] = []
  for (const c of e.citas) {
    const titulo = c.propiedad?.titulo ?? 'tu visita'
    if (c.estado === 'PENDING_CONFIRMATION') {
      avisos.push({ id: `cita-${c.id}`, texto: `Confirma tu visita a ${titulo}`, enlace: rutaDeVisitas('cliente', c.id), en: c.actualizadaEn, urgente: true })
    } else if (c.estado === 'RESCHEDULE_REQUESTED' && c.propuesta && c.propuesta.por !== 'cliente') {
      avisos.push({ id: `cita-${c.id}`, texto: `Te proponen otro horario para ${titulo}`, enlace: rutaDeVisitas('cliente', c.id), en: c.actualizadaEn, urgente: true })
    }
  }
  if (nuevas.length) {
    avisos.push({
      id: 'nuevas',
      texto: nuevas.length === 1 ? 'Hay 1 propiedad nueva para tus búsquedas' : `Hay ${nuevas.length} propiedades nuevas para tus búsquedas`,
      enlace: '/portal/alertas',
      en: nuevas.map((p) => p.publicada_en).filter(Boolean).sort().at(-1) ?? null,
      urgente: false,
    })
  }

  return {
    citasEnLinea: e.citasEnLinea === true,
    tarjetas: {
      guardadas: e.favoritos.length,
      busquedas: e.busquedas.length,
      nuevas: nuevas.length,
      visitas: e.citas.length,
    },
    guardadas: e.favoritos.map((f) => f.propiedad_id),
    paraTi,
    tuBusqueda: tieneBusqueda ? { operacion: pref.operacion, presupuestoMax: pref.presupuestoMax, zonas: pref.zonas, tipos: pref.tipos } : null,
    consultas: e.solicitudes.slice(0, 3).map((s) => {
      const p = porId.get(s.propiedad_id)
      return {
        id: s.id,
        titulo: p ? aTarjeta(p).titulo : s.propiedad_titulo ?? 'Propiedad',
        tipo: s.tipo === 'visita' ? 'visita' : 'informacion',
        creadoEn: s.creado_en,
        propiedad: p && disponible(p) ? aTarjeta(p) : null,
      }
    }),
    proximasVisitas: e.citas.slice(0, 2),
    busquedas: e.busquedas.slice(0, 3).map((b) => {
      const c = contar(e.propiedades.filter(disponible), b.filtros, b.creado_en)
      return { id: b.id, nombre: b.nombre?.trim() || describir(b.filtros), href: aHref(b.filtros), total: c.total, nuevas: c.nuevas }
    }),
    avisos,
  }
}
