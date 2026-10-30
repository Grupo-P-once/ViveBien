import type { AjustesCitas, BloqueHorario } from './ajustes'
import { PASO_MIN } from './ajustes'
import { diaLocal, diaSemana, diasEntre, instanteLocal, minutosDe, sumarDias } from './zona'

/**
 * Qué horarios puede ofrecer un asesor. Cálculo puro: la base y Google se
 * consultan antes y llegan aquí ya como rangos.
 *
 * Un horario es libre si:
 *   · cae dentro del horario semanal del asesor ese día (empieza y TERMINA dentro);
 *   · empieza con al menos `anticipacionHoras` de aviso y dentro de `ventanaDias`;
 *   · no choca con una cita activa del asesor, contando el margen (la cita
 *     aparta de su inicio a su fin + margen, igual que la restricción de la base);
 *   · no choca con un bloqueo del asesor ni con lo ocupado en su Google Calendar;
 *   · no choca con otra visita del mismo cliente.
 *
 * Lo que diga aquí es una oferta: quien garantiza que no haya empalmes es la
 * restricción de exclusión de la base al guardar.
 */

export type Rango = { desde: Date; hasta: Date }
export type Horario = { inicio: Date; fin: Date }

export type EntradaDisponibilidad = {
  horario: readonly BloqueHorario[]
  ajustes: AjustesCitas
  /** Citas activas del asesor: [ocupa_desde, ocupa_hasta). */
  ocupadoAsesor: readonly Rango[]
  /** Bloqueos del asesor y ocupado en Google: se comparan con [inicio, fin). */
  bloqueos: readonly Rango[]
  /** Visitas activas del cliente que pide: [inicio, fin). */
  ocupadoCliente?: readonly Rango[]
  ahora: Date
}

const choca = (a0: number, a1: number, b: Rango) => a0 < b.hasta.getTime() && b.desde.getTime() < a1

/** Horarios libres de un día civil (`AAAA-MM-DD`, en León). */
export function horariosDelDia(dia: string, e: EntradaDisponibilidad): Horario[] {
  const { ajustes, ahora } = e
  const hoy = diaLocal(ahora)
  const adelanto = diasEntre(hoy, dia)
  if (adelanto < 0 || adelanto > ajustes.ventanaDias) return []

  const minimo = ahora.getTime() + ajustes.anticipacionHoras * 3_600_000
  const duracion = ajustes.duracionMin * 60_000
  const margen = ajustes.margenMin * 60_000
  const dow = diaSemana(dia)

  const libres: Horario[] = []
  for (const bloque of e.horario) {
    if (bloque.dia !== dow) continue
    const finBloque = minutosDe(bloque.hasta)
    for (let m = minutosDe(bloque.desde); m + ajustes.duracionMin <= finBloque; m += PASO_MIN) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      const inicio = instanteLocal(dia, hhmm)
      const i = inicio.getTime()
      const f = i + duracion
      if (i < minimo) continue
      if (e.ocupadoAsesor.some((r) => choca(i, f + margen, r))) continue
      if (e.bloqueos.some((r) => choca(i, f, r))) continue
      if (e.ocupadoCliente?.some((r) => choca(i, f, r))) continue
      libres.push({ inicio, fin: new Date(f) })
    }
  }
  libres.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
  // Dos bloques del mismo día que se enciman darían el mismo horario dos veces.
  return libres.filter((h, k) => k === 0 || h.inicio.getTime() !== libres[k - 1].inicio.getTime())
}

/** Horarios libres de `dias` días seguidos a partir de `desde`. */
export function horariosDelRango(desde: string, dias: number, e: EntradaDisponibilidad): { dia: string; horarios: Horario[] }[] {
  return Array.from({ length: dias }, (_, k) => {
    const dia = sumarDias(desde, k)
    return { dia, horarios: horariosDelDia(dia, e) }
  })
}

/** ¿Este inicio exacto es uno de los horarios que se ofrecerían? */
export function esHorarioOfrecido(inicio: Date, e: EntradaDisponibilidad): boolean {
  return horariosDelDia(diaLocal(inicio), e).some((h) => h.inicio.getTime() === inicio.getTime())
}
