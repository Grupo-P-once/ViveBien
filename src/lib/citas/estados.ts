/**
 * Estados de una cita y quién puede moverla a dónde.
 *
 * ─────────────────────────────────────────────────────────────
 * DÓNDE MANDA ESTO
 *
 * Quien decide de verdad es la función `cita_transicionar` de Postgres
 * (supabase/70-citas-v2.sql, que reemplaza a la de la 15): comprueba estado,
 * papel, hora y versión en la misma transacción que hace el cambio. Esta copia
 * en TypeScript sirve para que la pantalla ofrezca sólo los botones que van a
 * funcionar y para explicar por qué no.
 *
 * Las dos tienen que decir lo mismo. `tests/citas-db.test.ts` recorre TODAS
 * las combinaciones estado × acción × papel contra la función real y compara.
 * Si cambias una regla aquí, cámbiala allá (o la prueba te lo recuerda).
 *
 * Decisiones del dueño (5-nov-2026) que viven aquí:
 *   · D-2  sólo la cita CONFIRMADA ocupa horario (`ocupaHorario`);
 *   · D-5  el cliente cancela o pide otro horario hasta 2 h antes (`HORAS_MINIMAS_CLIENTE`);
 *   · D-7  vocabulario: Pendiente, Confirmada, Rechazada, Cancelada, Reprogramación solicitada,
 *          Realizada, No asistió y Expirada.
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
  'REJECTED',
  'EXPIRED',
  'COMPLETED',
  'NO_SHOW',
] as const
export type EstadoCita = (typeof ESTADOS)[number]

/** Los que siguen vivos para la persona que pidió la visita (una persona no puede estar en dos visitas a la vez). */
export const ESTADOS_ACTIVOS: readonly EstadoCita[] = [
  'REQUESTED',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'RESCHEDULE_REQUESTED',
  'RESCHEDULED',
]

export const ESTADOS_FINALES: readonly EstadoCita[] = ['CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW']

/** Estados que apartan horario en la agenda del responsable (D-2). Una solicitud pendiente NO lo aparta. */
export const ESTADOS_QUE_OCUPAN: readonly EstadoCita[] = ['CONFIRMED', 'RESCHEDULED', 'PENDING_CONFIRMATION']

/** Estados «firmes» antes de que un cambio de horario esté a prueba: los mismos que ocupan. */
const FIRMES: readonly EstadoCita[] = ESTADOS_QUE_OCUPAN

/** Horas mínimas de anticipación para que el CLIENTE cancele o pida otro horario de una cita firme (D-5). */
export const HORAS_MINIMAS_CLIENTE = 2

export function esEstado(v: unknown): v is EstadoCita {
  return typeof v === 'string' && (ESTADOS as readonly string[]).includes(v)
}

export function esActiva(estado: EstadoCita): boolean {
  return ESTADOS_ACTIVOS.includes(estado)
}

/** Cómo se llama cada estado en pantalla (vocabulario del dueño, D-7). */
export const ETIQUETA_ESTADO: Record<EstadoCita, string> = {
  REQUESTED: 'Pendiente',
  PENDING_CONFIRMATION: 'Pendiente',
  CONFIRMED: 'Confirmada',
  RESCHEDULE_REQUESTED: 'Reprogramación solicitada',
  // Una cita cuyo horario cambió y fue aceptado es, para quien la ve, una cita confirmada.
  RESCHEDULED: 'Confirmada',
  CANCELLED: 'Cancelada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Expirada',
  COMPLETED: 'Realizada',
  NO_SHOW: 'No asistió',
}

/** Papeles que ACTÚAN sobre una cita (los que escribe `cita_transicionar`). */
export type PapelCita = 'cliente' | 'asesor' | 'admin' | 'sistema'

/** Papeles que VEN una cita: los de arriba (menos el sistema) y el propietario de la propiedad, que sólo lee (D-1). */
export type PapelVista = Exclude<PapelCita, 'sistema'> | 'propietario'

export const ACCIONES = [
  'confirmar',
  'rechazar',
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
  confirmar: 'Confirmar cita',
  rechazar: 'Rechazar solicitud',
  proponer: 'Proponer otro horario',
  aceptar_cambio: 'Aceptar el nuevo horario',
  rechazar_cambio: 'Rechazar el cambio',
  retirar_cambio: 'Retirar mi propuesta',
  cancelar: 'Cancelar cita',
  vencer: 'Expirar',
  completar: 'Marcar como realizada',
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

export type MotivoRechazo = 'transicion_invalida' | 'no_permitido' | 'fuera_de_tiempo' | 'menos_de_2_horas'

export type Evaluacion =
  | { ok: true; destino: EstadoCita }
  | { ok: false; motivo: MotivoRechazo }

const t = (v: string | Date) => (v instanceof Date ? v.getTime() : new Date(v).getTime())

const no = (motivo: MotivoRechazo): Evaluacion => ({ ok: false, motivo })
const si = (destino: EstadoCita): Evaluacion => ({ ok: true, destino })

/** ¿Está la cita acordada? (confirmada, o a la espera de que el cliente confirme lo que registró el equipo). Un cambio pedido sobre una cita firme no le quita lo firme. */
export function esFirme(cita: Pick<CitaParaReglas, 'estado' | 'estado_previo'>): boolean {
  return FIRMES.includes(cita.estado) || (cita.estado === 'RESCHEDULE_REQUESTED' && !!cita.estado_previo && FIRMES.includes(cita.estado_previo))
}

/**
 * ¿Aparta esta cita el horario del responsable? (D-2). Sólo la firme. Una solicitud pendiente, aunque
 * esté en `RESCHEDULE_REQUESTED` sobre una solicitud, no aparta nada.
 */
export const ocupaHorario = esFirme

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

  // D-5: el cliente cancela o pide otro horario hasta 2 horas antes de una cita firme. Va primero, igual que en SQL.
  if (papel === 'cliente' && (accion === 'cancelar' || accion === 'proponer') && esFirme(cita)
      && t(cita.inicio) < ahora.getTime() + HORAS_MINIMAS_CLIENTE * 3_600_000) {
    return no('menos_de_2_horas')
  }

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

    case 'rechazar': {
      if (cita.estado !== 'REQUESTED') return no('transicion_invalida')
      if (papel !== 'asesor' && papel !== 'admin') return no('no_permitido')
      return si('REJECTED')
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
        return si('EXPIRED')
      }
      if (cita.estado === 'RESCHEDULE_REQUESTED') {
        const propuestaVencida = cita.propuesta_inicio != null && t(cita.propuesta_inicio) <= ahora.getTime()
        if (propuestaVencida || yaEmpezo) {
          const previaSinConfirmar = cita.estado_previo === 'REQUESTED' || cita.estado_previo === 'PENDING_CONFIRMATION'
          if (previaSinConfirmar && yaEmpezo) return si('EXPIRED')
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

/**
 * Las acciones que la pantalla debe ofrecer a este papel (nunca «vencer», que es del sistema).
 * Para el equipo, una solicitud pendiente se RECHAZA (con motivo) y no se «cancela»: un solo botón por idea.
 */
export function accionesDisponibles(cita: CitaParaReglas, papel: PapelCita, ahora: Date): AccionCita[] {
  return ACCIONES.filter((a) => {
    if (a === 'vencer') return false
    if (a === 'cancelar' && cita.estado === 'REQUESTED' && (papel === 'asesor' || papel === 'admin')) return false
    return evaluar(a, cita, papel, ahora).ok
  })
}

/** El motivo, dicho para una persona. Depende de la acción cuando se trata del tiempo. */
export function explicar(motivo: MotivoRechazo | 'version' | 'horario_ocupado' | 'motivo_requerido' | 'no_encontrada', accion?: AccionCita): string {
  switch (motivo) {
    case 'version':
      return 'La cita cambió mientras la veías. Ya te mostramos cómo quedó.'
    case 'horario_ocupado':
      return 'Ese horario ya no está disponible. Elige otro.'
    case 'motivo_requerido':
      return 'Escribe el motivo: la otra persona lo va a leer.'
    case 'no_encontrada':
      return 'No encontramos esa cita.'
    case 'no_permitido':
      return 'No puedes hacer eso con esta cita.'
    case 'transicion_invalida':
      return 'Esa acción ya no aplica a esta cita.'
    case 'menos_de_2_horas':
      return 'Faltan menos de 2 horas para la cita. Para cambiarla o cancelarla, contacta a VIVE BIEN.'
    case 'fuera_de_tiempo':
      return accion === 'completar' || accion === 'no_asistio'
        ? 'Todavía no llega la hora de la cita.'
        : 'Ya pasó la hora de esa cita.'
  }
}

/**
 * Estado con el que NACE una cita (D-8, decidida por el dueño el 5-nov-2026). Código puro: lo prueba `tests/citas-estado-inicial.test.ts`.
 *
 *  · Quien agenda PARA SÍ MISMO y es el responsable asignado de la propiedad no necesita la autorización de nadie: si el horario está
 *    disponible (se comprobó antes contra la oferta del responsable) la cita nace CONFIRMADA.
 *  · Si el responsable es otra persona, necesita su aprobación: nace PENDIENTE (`REQUESTED`).
 *  · Un cliente corriente: PENDIENTE, salvo que el responsable haya elegido confirmar automáticamente.
 *  · Lo que el equipo registra PARA otra persona nace «por confirmar» por esa persona (`PENDING_CONFIRMATION`).
 */
export function estadoInicialDeCita(o: {
  creador: 'cliente' | 'asesor' | 'admin'
  /** La cita es para otra persona (la registra el equipo en nombre de un cliente). */
  paraOtro: boolean
  clienteUid: string
  asesorUid: string
  confirmacion: 'manual' | 'automatica'
}): 'CONFIRMED' | 'REQUESTED' | 'PENDING_CONFIRMATION' {
  if (o.creador !== 'cliente') return 'PENDING_CONFIRMATION'
  const seAgendaASiMismo = !o.paraOtro && o.clienteUid === o.asesorUid
  return seAgendaASiMismo || o.confirmacion === 'automatica' ? 'CONFIRMED' : 'REQUESTED'
}

/**
 * ¿Puede esta cuenta agendar una visita A SÍ MISMA sobre esta propiedad? (D-8 + regla del dueño). Devuelve el motivo del rechazo o null si puede.
 *  · El RESPONSABLE de la cita (equipo, asociado o quien el admin asignó) puede agendarse a sí mismo: D-8 lo confirma si el horario está disponible.
 *  · El equipo siempre puede ir a ver cualquier propiedad.
 *  · Un dueño que NO atiende sus propias citas (p. ej. un Publicador, cuyas citas administra VIVE BIEN) no se agenda sobre su propia propiedad.
 */
export function motivoParaNoAgendarse(o: { clienteUid: string; propietarioUid: string | null; asesorUid: string; esDelEquipo: boolean }): 'propiedad_propia' | null {
  if (o.esDelEquipo || o.clienteUid === o.asesorUid) return null
  return o.propietarioUid !== null && o.clienteUid === o.propietarioUid ? 'propiedad_propia' : null
}
