/**
 * Estados de una cita y quién puede moverla a dónde.
 *
 * ─────────────────────────────────────────────────────────────
 * DÓNDE MANDA ESTO
 *
 * Quien decide de verdad es la función `cita_transicionar` de Postgres
 * (supabase/15-citas.sql): comprueba estado, papel, hora y versión en la misma
 * transacción que hace el cambio. Esta copia en TypeScript sirve para que la
 * pantalla ofrezca sólo los botones que van a funcionar y para explicar por
 * qué no.
 *
 * Las dos tienen que decir lo mismo. `tests/citas-db.test.ts` recorre TODAS
 * las combinaciones estado × acción × papel contra la función real y compara.
 * Si cambias una regla aquí, cámbiala allá (o la prueba te lo recuerda).
 *
 * Ver docs/appointment-state-machine.md.
 * ─────────────────────────────────────────────────────────────
 */

export const ESTADOS = [
  'REQUESTED',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'RESCHEDULE_REQUESTED',
  'RESCHEDULED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
] as const
export type EstadoCita = (typeof ESTADOS)[number]

/** Los que apartan horario en la agenda (la restricción de exclusión usa los mismos). */
export const ESTADOS_ACTIVOS: readonly EstadoCita[] = [
  'REQUESTED',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'RESCHEDULE_REQUESTED',
  'RESCHEDULED',
]

export const ESTADOS_FINALES: readonly EstadoCita[] = ['CANCELLED', 'COMPLETED', 'NO_SHOW']

export function esEstado(v: unknown): v is EstadoCita {
  return typeof v === 'string' && (ESTADOS as readonly string[]).includes(v)
}

export function esActiva(estado: EstadoCita): boolean {
  return ESTADOS_ACTIVOS.includes(estado)
}

/** Cómo se llama cada estado en pantalla. */
export const ETIQUETA_ESTADO: Record<EstadoCita, string> = {
  REQUESTED: 'Por confirmar',
  PENDING_CONFIRMATION: 'Por confirmar',
  CONFIRMED: 'Confirmada',
  RESCHEDULE_REQUESTED: 'Cambio propuesto',
  RESCHEDULED: 'Reprogramada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Visitada',
  NO_SHOW: 'No asistió',
}

export type PapelCita = 'cliente' | 'asesor' | 'admin' | 'sistema'

export const ACCIONES = [
  'confirmar',
  'proponer',
  'aceptar_cambio',
  'rechazar_cambio',
  'retirar_cambio',
  'cancelar',
  'vencer',
  'completar',
  'no_asistio',
  'corregir',
] as const
export type AccionCita = (typeof ACCIONES)[number]

export function esAccion(v: unknown): v is AccionCita {
  return typeof v === 'string' && (ACCIONES as readonly string[]).includes(v)
}

export const ETIQUETA_ACCION: Record<AccionCita, string> = {
  confirmar: 'Confirmar visita',
  proponer: 'Proponer otro horario',
  aceptar_cambio: 'Aceptar el nuevo horario',
  rechazar_cambio: 'Rechazar el cambio',
  retirar_cambio: 'Retirar mi propuesta',
  cancelar: 'Cancelar visita',
  vencer: 'Vencer',
  completar: 'Marcar como visitada',
  no_asistio: 'No asistió',
  corregir: 'Corregir resultado',
}

/** Lo mínimo de una cita que hace falta para aplicar las reglas. */
export type CitaParaReglas = {
  estado: EstadoCita
  inicio: string | Date
  estado_previo?: EstadoCita | null
  propuesta_inicio?: string | Date | null
  propuesta_por?: 'cliente' | 'asesor' | 'admin' | null
}

export type MotivoRechazo = 'transicion_invalida' | 'no_permitido' | 'fuera_de_tiempo'

export type Evaluacion =
  | { ok: true; destino: EstadoCita }
  | { ok: false; motivo: MotivoRechazo }

const t = (v: string | Date) => (v instanceof Date ? v.getTime() : new Date(v).getTime())

const no = (motivo: MotivoRechazo): Evaluacion => ({ ok: false, motivo })
const si = (destino: EstadoCita): Evaluacion => ({ ok: true, destino })

/** ¿Es la parte que NO propuso el cambio? (el admin cuenta siempre). */
function esLaOtraParte(cita: CitaParaReglas, papel: PapelCita): boolean {
  return (
    papel === 'admin' ||
    (cita.propuesta_por === 'cliente' && papel === 'asesor') ||
    ((cita.propuesta_por === 'asesor' || cita.propuesta_por === 'admin') && papel === 'cliente')
  )
}

/**
 * ¿Puede este papel hacer esta acción sobre esta cita ahora?
 *
 * El orden de las comprobaciones es el mismo que en la función SQL, para que
 * las dos den el mismo motivo cuando algo no se puede.
 *
 * `nuevoInicio` sólo aplica a «proponer».
 */
export function evaluar(
  accion: AccionCita,
  cita: CitaParaReglas,
  papel: PapelCita,
  ahora: Date,
  nuevoInicio?: string | Date | null,
): Evaluacion {
  const yaEmpezo = t(cita.inicio) <= ahora.getTime()

  switch (accion) {
    case 'confirmar': {
      const puede =
        (cita.estado === 'REQUESTED' && (papel === 'asesor' || papel === 'admin')) ||
        (cita.estado === 'PENDING_CONFIRMATION' && (papel === 'cliente' || papel === 'admin'))
      if (!puede) {
        return cita.estado === 'REQUESTED' || cita.estado === 'PENDING_CONFIRMATION'
          ? no('no_permitido')
          : no('transicion_invalida')
      }
      return yaEmpezo ? no('fuera_de_tiempo') : si('CONFIRMED')
    }

    case 'proponer': {
      if (!['REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED'].includes(cita.estado)) {
        return no('transicion_invalida')
      }
      if (papel === 'sistema') return no('no_permitido')
      if (yaEmpezo) return no('fuera_de_tiempo')
      if (nuevoInicio != null && t(nuevoInicio) <= ahora.getTime()) return no('fuera_de_tiempo')
      return si('RESCHEDULE_REQUESTED')
    }

    case 'aceptar_cambio': {
      if (cita.estado !== 'RESCHEDULE_REQUESTED') return no('transicion_invalida')
      if (!esLaOtraParte(cita, papel)) return no('no_permitido')
      if (cita.propuesta_inicio != null && t(cita.propuesta_inicio) <= ahora.getTime()) return no('fuera_de_tiempo')
      return si('RESCHEDULED')
    }

    case 'rechazar_cambio':
    case 'retirar_cambio': {
      if (cita.estado !== 'RESCHEDULE_REQUESTED') return no('transicion_invalida')
      const puede = accion === 'rechazar_cambio'
        ? esLaOtraParte(cita, papel)
        : papel === 'admin' || cita.propuesta_por === papel
      if (!puede) return no('no_permitido')
      return cita.estado_previo ? si(cita.estado_previo) : no('transicion_invalida')
    }

    case 'cancelar': {
      if (!esActiva(cita.estado)) return no('transicion_invalida')
      if (papel === 'sistema') return no('no_permitido')
      return si('CANCELLED')
    }

    case 'vencer': {
      if (papel !== 'sistema') return no('no_permitido')
      if ((cita.estado === 'REQUESTED' || cita.estado === 'PENDING_CONFIRMATION') && yaEmpezo) {
        return si('CANCELLED')
      }
      if (cita.estado === 'RESCHEDULE_REQUESTED') {
        const propuestaVencida = cita.propuesta_inicio != null && t(cita.propuesta_inicio) <= ahora.getTime()
        if (propuestaVencida || yaEmpezo) {
          const previaSinConfirmar = cita.estado_previo === 'REQUESTED' || cita.estado_previo === 'PENDING_CONFIRMATION'
          if (previaSinConfirmar && yaEmpezo) return si('CANCELLED')
          return cita.estado_previo ? si(cita.estado_previo) : no('transicion_invalida')
        }
      }
      return no('transicion_invalida')
    }

    case 'completar':
    case 'no_asistio': {
      if (cita.estado !== 'CONFIRMED' && cita.estado !== 'RESCHEDULED') return no('transicion_invalida')
      if (papel !== 'asesor' && papel !== 'admin') return no('no_permitido')
      if (!yaEmpezo) return no('fuera_de_tiempo')
      return si(accion === 'completar' ? 'COMPLETED' : 'NO_SHOW')
    }

    case 'corregir': {
      if (cita.estado !== 'COMPLETED' && cita.estado !== 'NO_SHOW') return no('transicion_invalida')
      if (papel !== 'admin') return no('no_permitido')
      return si(cita.estado === 'COMPLETED' ? 'NO_SHOW' : 'COMPLETED')
    }
  }
}

/** Las acciones que la pantalla debe ofrecer a este papel (nunca «vencer», que es del sistema). */
export function accionesDisponibles(cita: CitaParaReglas, papel: PapelCita, ahora: Date): AccionCita[] {
  return ACCIONES.filter((a) => a !== 'vencer' && evaluar(a, cita, papel, ahora).ok)
}

/** El motivo, dicho para una persona. Depende de la acción cuando se trata del tiempo. */
export function explicar(motivo: MotivoRechazo | 'version' | 'horario_ocupado' | 'motivo_requerido' | 'no_encontrada', accion?: AccionCita): string {
  switch (motivo) {
    case 'version':
      return 'La visita cambió mientras la veías. Ya te mostramos cómo quedó.'
    case 'horario_ocupado':
      return 'Ese horario se acaba de ocupar. Elige otro.'
    case 'motivo_requerido':
      return 'Escribe el motivo de la cancelación: el cliente lo va a leer.'
    case 'no_encontrada':
      return 'No encontramos esa visita.'
    case 'no_permitido':
      return 'No puedes hacer eso con esta visita.'
    case 'transicion_invalida':
      return 'Esa acción ya no aplica a esta visita.'
    case 'fuera_de_tiempo':
      return accion === 'completar' || accion === 'no_asistio'
        ? 'Todavía no llega la hora de la visita.'
        : 'Ya pasó la hora de esa visita.'
  }
}
