import { diaLocal, fechaLarga, horaCorta } from '@/lib/citas/zona'
import type { CitaVista } from '@/lib/citas/vista'

/**
 * Ayudantes de presentación de las pantallas de citas. Todo en hora de León (`America/Mexico_City`), aunque el navegador esté en
 * otra zona: la hora de una visita es la del lugar, no la de quien la mira.
 */

/** «Visita propia» (alguien del equipo, un publicador o un asociado que va a ver una propiedad) o «Solicitud de cliente». Texto Y color: el color solo no basta. */
export const TEXTO_DE_TIPO: Record<CitaVista['tipo'], string> = { solicitada: 'Solicitud de cliente', propia: 'Visita propia' }
/** Colores (tokens de la marca y un azul distinto) con contraste suficiente sobre blanco. */
export const COLOR_DE_TIPO: Record<CitaVista['tipo'], string> = { solicitada: '#8B1A1A', propia: '#1d4f91' }

/** «Quién va» a la visita, según lo que la persona tiene permitido ver. */
export function quienVa(c: CitaVista): string {
  if (c.papel === 'cliente') return 'Tú'
  return c.cliente.nombre
}

export function cuando(c: Pick<CitaVista, 'inicio'>): string {
  const d = new Date(c.inicio)
  return `${fechaLarga(d)}, ${horaCorta(d)}`
}

/** `AAAA-MM-DD` en León: la clave para agrupar por día. */
export const claveDeDia = (iso: string) => diaLocal(new Date(iso))

export type GrupoDeDia = { dia: string; citas: CitaVista[] }

/** Agrupa por día (en orden) sin perder el orden por hora dentro del día. */
export function agruparPorDia(citas: CitaVista[], orden: 'asc' | 'desc' = 'asc'): GrupoDeDia[] {
  const mapa = new Map<string, CitaVista[]>()
  for (const c of [...citas].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const k = claveDeDia(c.inicio)
    mapa.set(k, [...(mapa.get(k) ?? []), c])
  }
  const grupos = [...mapa.entries()].map(([dia, cs]) => ({ dia, citas: cs }))
  return orden === 'asc' ? grupos : grupos.reverse()
}

/** Títulos de día legibles: «martes, 22 de septiembre» (primera letra en mayúscula la pone el CSS). */
export function tituloDeDia(dia: string): string {
  // Se arma a mediodía de León para que ninguna zona horaria lo corra de día.
  return fechaLarga(new Date(`${dia}T18:00:00Z`))
}

export const ESTADOS_ABIERTOS = ['REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED'] as const
export const ESTADOS_CERRADOS = ['CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'] as const

/** Los indicadores de arriba, calculados SOBRE lo que el servidor ya recortó para esta persona. */
export function indicadores(citas: CitaVista[], ahora: Date = new Date()) {
  return {
    /** Las que siguen abiertas y todavía no pasan: lo que la persona tiene «programado». */
    programadas: citas.filter((c) => (ESTADOS_ABIERTOS as readonly string[]).includes(c.estado) && new Date(c.fin) > ahora).length,
    pendientes: citas.filter((c) => c.estado === 'REQUESTED' || c.estado === 'PENDING_CONFIRMATION').length,
    confirmadas: citas.filter((c) => c.estado === 'CONFIRMED' || c.estado === 'RESCHEDULED').length,
    porResponder: citas.filter((c) => c.acciones.includes('aceptar_cambio') || c.acciones.includes('rechazar_cambio')).length,
    conflictos: citas.filter((c) => c.conflicto === true).length,
  }
}

/** ¿La cita necesita algo de esta persona? (para resaltarla en la lista). */
export const requiereRespuesta = (c: CitaVista) =>
  c.acciones.includes('confirmar') || c.acciones.includes('aceptar_cambio') || c.acciones.includes('rechazar_cambio')

/** Las próximas citas abiertas (acordadas o que esperan respuesta), de la más cercana a la más lejana. */
export function proximas(citas: CitaVista[], max = 4, ahora: Date = new Date()): CitaVista[] {
  return citas
    .filter((c) => (ESTADOS_ABIERTOS as readonly string[]).includes(c.estado) && new Date(c.fin) > ahora)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, max)
}

/** «Hoy», «Mañana» o el día corto en hora de León (nunca la hora del navegador). */
export function diaRelativo(iso: string, ahora: Date = new Date()): string {
  const d = claveDeDia(iso)
  const hoy = diaLocal(ahora)
  if (d === hoy) return 'Hoy'
  if (d === diaLocal(new Date(ahora.getTime() + 86_400_000))) return 'Mañana'
  return fechaLarga(new Date(iso), ahora)
}

/**
 * Una celda de CSV a salvo de la «inyección de fórmulas» de las hojas de cálculo: lo que empieza con = + - @ (o tabulador / retorno) se antepone con una comilla simple,
 * y todo se encierra entre comillas dobles duplicando las internas. Excel y Google Sheets abrirían como fórmula, por ejemplo, una nota que alguien escribió como «=HYPERLINK(...)».
 */
export function celdaCsv(valor: string | null | undefined): string {
  let v = valor ?? ''
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return `"${v.replace(/"/g, '""')}"`
}

/**
 * El reporte de las citas VISIBLES como CSV. Solo trae lo que el servidor ya recortó para esta persona (nada se amplía aquí): si no ve el teléfono, la columna sale vacía.
 * Con BOM para que Excel lo abra en UTF-8 y con saltos CRLF.
 */
export function aCsv(citas: CitaVista[], opciones: { conTipos: boolean }): string {
  const columnas = ['Fecha', 'Hora', 'Propiedad', 'Lugar', 'Estado', ...(opciones.conTipos ? ['Tipo'] : []), 'Responsable', 'Quién va', 'Teléfono', 'Notas del interesado', 'Motivo']
  const filas = citas.map((c) => {
    const d = new Date(c.inicio)
    return [
      fechaLarga(d), horaCorta(d), c.propiedad?.titulo ?? '', c.lugar ?? '', c.etiqueta,
      ...(opciones.conTipos ? [TEXTO_DE_TIPO[c.tipo]] : []),
      c.asesor.nombre ?? '', quienVa(c), c.cliente.telefono ?? '', c.notasCliente ?? '', c.motivoCancelacion ?? '',
    ].map(celdaCsv).join(',')
  })
  return '﻿' + [columnas.map(celdaCsv).join(','), ...filas].join('\r\n') + '\r\n'
}
