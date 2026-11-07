import type { CitaVista } from '@/lib/citas/vista'

/**
 * Filtros de las pantallas de citas. Puros y probables: trabajan SOBRE las citas que el servidor ya recortó para esta persona,
 * así que un filtro nunca puede traer algo que el rol no puede ver; solo acota lo que ya se ve.
 */

export type GrupoEstado = 'todas' | 'pendientes' | 'confirmadas' | 'por_responder' | 'realizadas' | 'cerradas'

export type Filtros = {
  estado: GrupoEstado
  tipo: 'todos' | CitaVista['tipo']
  /** Título de la propiedad ('' = todas). */
  propiedad: string
  /** Nombre del responsable ('' = todos). Solo tiene sentido para quien ve a varios responsables. */
  responsable: string
  /** Texto libre sobre propiedad, lugar y —solo si la persona los ve— el nombre del interesado. */
  texto: string
  /** Solo las citas MÍAS (yo soy quien va a la visita). Para quien ve también las de otros (equipo, asociado). */
  mias: boolean
}

export const SIN_FILTROS: Filtros = { estado: 'todas', tipo: 'todos', propiedad: '', responsable: '', texto: '', mias: false }

export const ETIQUETA_GRUPO: Record<GrupoEstado, string> = {
  todas: 'Todos los estados',
  pendientes: 'Pendientes',
  confirmadas: 'Confirmadas',
  por_responder: 'Reprogramación por responder',
  realizadas: 'Realizadas y no asistió',
  cerradas: 'Canceladas, rechazadas y expiradas',
}

function coincideEstado(c: CitaVista, g: GrupoEstado): boolean {
  switch (g) {
    case 'todas': return true
    case 'pendientes': return c.estado === 'REQUESTED' || c.estado === 'PENDING_CONFIRMATION'
    case 'confirmadas': return c.estado === 'CONFIRMED' || c.estado === 'RESCHEDULED'
    case 'por_responder': return c.estado === 'RESCHEDULE_REQUESTED'
    case 'realizadas': return c.estado === 'COMPLETED' || c.estado === 'NO_SHOW'
    case 'cerradas': return c.estado === 'CANCELLED' || c.estado === 'REJECTED' || c.estado === 'EXPIRED'
  }
}

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function aplicarFiltros(citas: CitaVista[], f: Filtros): CitaVista[] {
  const q = norm(f.texto)
  return citas.filter((c) => {
    if (!coincideEstado(c, f.estado)) return false
    if (f.tipo !== 'todos' && c.tipo !== f.tipo) return false
    if (f.mias && c.mia !== true) return false
    if (f.propiedad && (c.propiedad?.titulo ?? '') !== f.propiedad) return false
    if (f.responsable && (c.asesor.nombre ?? '') !== f.responsable) return false
    if (q) {
      // El nombre del interesado solo cuenta si esta persona lo ve (si no, el servidor mandó «Interesado»: no se puede inferir quién es).
      const pajar = norm([c.propiedad?.titulo, c.lugar, c.cliente.nombre, c.asesor.nombre].filter(Boolean).join(' '))
      if (!pajar.includes(q)) return false
    }
    return true
  })
}

/** Valores únicos y ordenados para los selectores, tomados de lo que SÍ se ve. */
export function opcionesDe(citas: CitaVista[]) {
  const un = (xs: Array<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'))
  return { propiedades: un(citas.map((c) => c.propiedad?.titulo)), responsables: un(citas.map((c) => c.asesor.nombre)) }
}

export const hayFiltros = (f: Filtros) => JSON.stringify(f) !== JSON.stringify(SIN_FILTROS)
