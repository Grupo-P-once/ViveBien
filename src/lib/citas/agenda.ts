import { minutosDe } from './zona'
import type { AjustesCitas, BloqueHorario } from './ajustes'

/**
 * Validación de la agenda que un responsable guarda (horario semanal, ajustes y bloqueos). Código puro: lo prueban los tests y
 * lo usa la ruta `/api/citas/ajustes`. Los mismos límites que las restricciones de las tablas (`check` de la migración 15), para
 * que el error llegue como un mensaje claro y no como una violación de la base.
 *
 * Horas en hora de León (`America/Mexico_City`), como el resto del módulo.
 */

export type BloqueoEntrada = { desde: string; hasta: string; motivo: string | null }
export type EntradaAgenda = { horario: BloqueHorario[]; ajustes: AjustesCitas; bloqueos: BloqueoEntrada[] }

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_BLOQUES = 28
const MAX_BLOQUEOS = 60
const MAX_BLOQUEO_DIAS = 366

const entero = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null

export type ResultadoAgenda = { ok: true; valor: EntradaAgenda } | { ok: false; error: string }
const no = (error: string): ResultadoAgenda => ({ ok: false, error })

export function validarAgenda(raw: unknown, ahora: Date = new Date()): ResultadoAgenda {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no('Los datos de la agenda no son válidos.')
  const o = raw as Record<string, unknown>

  // ── Horario semanal ──
  if (!Array.isArray(o.horario)) return no('Falta el horario semanal.')
  if (o.horario.length === 0) {
    // «Sin filas» significa «usa el horario por defecto»: dejar la agenda vacía daría horas que la persona nunca eligió.
    return no('Agrega al menos un horario. Si no quieres recibir citas por un tiempo, usa un bloqueo.')
  }
  if (o.horario.length > MAX_BLOQUES) return no(`Demasiados horarios (máximo ${MAX_BLOQUES}).`)
  const horario: BloqueHorario[] = []
  for (const b of o.horario) {
    if (!b || typeof b !== 'object') return no('Hay un horario que no es válido.')
    const { dia, desde, hasta } = b as Record<string, unknown>
    const d = entero(dia, 0, 6)
    if (d === null) return no('El día de la semana no es válido.')
    if (typeof desde !== 'string' || typeof hasta !== 'string' || !RE_HORA.test(desde) || !RE_HORA.test(hasta)) return no('Las horas deben tener el formato 09:00.')
    if (minutosDe(hasta) <= minutosDe(desde)) return no('En cada horario, la hora final debe ser posterior a la inicial.')
    horario.push({ dia: d, desde, hasta })
  }
  // Dos horarios del mismo día no se encimen (daría el mismo horario dos veces al cliente).
  const ordenado = [...horario].sort((a, b) => a.dia - b.dia || minutosDe(a.desde) - minutosDe(b.desde))
  for (let i = 1; i < ordenado.length; i++) {
    const a = ordenado[i - 1], b = ordenado[i]
    if (a.dia === b.dia && minutosDe(b.desde) < minutosDe(a.hasta)) return no('Dos horarios del mismo día se empalman.')
    if (a.dia === b.dia && a.desde === b.desde) return no('Hay dos horarios que empiezan a la misma hora el mismo día.')
  }

  // ── Ajustes ──
  const a = (o.ajustes && typeof o.ajustes === 'object' ? o.ajustes : {}) as Record<string, unknown>
  const duracionMin = entero(a.duracionMin, 15, 240)
  const margenMin = entero(a.margenMin, 0, 120)
  const anticipacionHoras = entero(a.anticipacionHoras, 0, 168)
  const ventanaDias = entero(a.ventanaDias, 1, 180)
  if (duracionMin === null) return no('La duración de la visita debe estar entre 15 y 240 minutos.')
  if (margenMin === null) return no('El tiempo de traslado entre visitas debe estar entre 0 y 120 minutos.')
  if (anticipacionHoras === null) return no('La anticipación mínima debe estar entre 0 y 168 horas.')
  if (ventanaDias === null) return no('Los días hacia adelante deben estar entre 1 y 180.')
  if (a.confirmacion !== 'manual' && a.confirmacion !== 'automatica') return no('Elige cómo se confirman las solicitudes.')
  // Que al menos un horario quepa una visita completa: si no, la agenda no ofrecería nada.
  if (!horario.some((b) => minutosDe(b.hasta) - minutosDe(b.desde) >= duracionMin)) {
    return no('Ningún horario alcanza para una visita de esa duración.')
  }

  // ── Bloqueos (vacaciones, festivos, pausas) ──
  const bloqueosRaw = o.bloqueos == null ? [] : o.bloqueos
  if (!Array.isArray(bloqueosRaw)) return no('Los bloqueos no son válidos.')
  if (bloqueosRaw.length > MAX_BLOQUEOS) return no(`Demasiados bloqueos (máximo ${MAX_BLOQUEOS}).`)
  const bloqueos: BloqueoEntrada[] = []
  for (const x of bloqueosRaw) {
    if (!x || typeof x !== 'object') return no('Hay un bloqueo que no es válido.')
    const { desde, hasta, motivo } = x as Record<string, unknown>
    const d = typeof desde === 'string' ? new Date(desde) : null
    const h = typeof hasta === 'string' ? new Date(hasta) : null
    if (!d || !h || Number.isNaN(d.getTime()) || Number.isNaN(h.getTime())) return no('Las fechas de un bloqueo no son válidas.')
    if (h.getTime() <= d.getTime()) return no('En un bloqueo, el final debe ser posterior al inicio.')
    if (h.getTime() - d.getTime() > MAX_BLOQUEO_DIAS * 86_400_000) return no('Un bloqueo no puede durar más de un año.')
    if (motivo != null && (typeof motivo !== 'string' || motivo.length > 200)) return no('El motivo del bloqueo es demasiado largo (máximo 200 caracteres).')
    // Lo que ya terminó no se guarda: la base conserva su historia y solo reemplaza lo vigente y lo futuro.
    if (h.getTime() <= ahora.getTime()) continue
    bloqueos.push({ desde: d.toISOString(), hasta: h.toISOString(), motivo: typeof motivo === 'string' && motivo.trim() ? motivo.trim() : null })
  }

  return { ok: true, valor: { horario: ordenado, ajustes: { duracionMin, margenMin, anticipacionHoras, ventanaDias, confirmacion: a.confirmacion }, bloqueos } }
}

/** El formato que espera `citas_guardar_agenda` (columnas de la base). */
export function paraLaBase(v: EntradaAgenda) {
  return {
    horario: v.horario.map((b) => ({ dia: b.dia, desde: b.desde, hasta: b.hasta })),
    ajustes: {
      duracion_min: v.ajustes.duracionMin, margen_min: v.ajustes.margenMin, anticipacion_horas: v.ajustes.anticipacionHoras,
      ventana_dias: v.ajustes.ventanaDias, confirmacion: v.ajustes.confirmacion,
    },
    bloqueos: v.bloqueos,
  }
}
