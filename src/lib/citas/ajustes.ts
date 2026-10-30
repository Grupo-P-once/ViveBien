/**
 * Horario de visitas por defecto.
 *
 * Aprobado el 18-sep-2026 («vas con tus recomendaciones»). Vale para cualquier
 * asesor que no haya guardado el suyo en `disponibilidad_asesores` /
 * `ajustes_citas`. La duración de 1 hora sale del mockup del portal
 * («11:00 AM (1 hora aprox.)»).
 */

export type BloqueHorario = {
  /** 0 = domingo … 6 = sábado. */
  dia: number
  /** `HH:MM`, hora de León. */
  desde: string
  hasta: string
}

export type AjustesCitas = {
  duracionMin: number
  /** Tiempo libre que queda después de cada visita (traslado, imprevistos). */
  margenMin: number
  /** No se puede agendar con menos de estas horas de aviso. */
  anticipacionHoras: number
  /** Hasta cuántos días adelante se puede agendar. */
  ventanaDias: number
  /** `manual`: el asesor confirma cada solicitud. `automatica`: queda confirmada al pedirla. */
  confirmacion: 'manual' | 'automatica'
}

export const HORARIO_POR_DEFECTO: readonly BloqueHorario[] = [
  { dia: 1, desde: '09:00', hasta: '18:00' },
  { dia: 2, desde: '09:00', hasta: '18:00' },
  { dia: 3, desde: '09:00', hasta: '18:00' },
  { dia: 4, desde: '09:00', hasta: '18:00' },
  { dia: 5, desde: '09:00', hasta: '18:00' },
  { dia: 6, desde: '10:00', hasta: '14:00' },
]

export const AJUSTES_POR_DEFECTO: Readonly<AjustesCitas> = {
  duracionMin: 60,
  margenMin: 15,
  anticipacionHoras: 2,
  ventanaDias: 30,
  confirmacion: 'manual',
}

/** Cada cuánto empieza un horario posible: 9:00, 9:30, 10:00… */
export const PASO_MIN = 30
