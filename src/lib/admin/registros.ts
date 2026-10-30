import { claveDeZona } from '../zonas-buscadas'
import { contarEn, enVentana, tramos, variacionPorcentual, type Variacion } from './periodo'

/**
 * Los números y los filtros de la pantalla de registros, sin tocar la base.
 *
 * Los registros llegan de cuatro tablas ya unificados por
 * `/api/admin/registros`. Aquí sólo se cuentan, se filtran y se exportan —todo
 * funciones puras, probadas con datos de ejemplo.
 */

export type Registro = {
  id: string
  tipo: string
  nombre: string | null
  email: string | null
  telefono: string | null
  mensaje: string | null
  propiedad: string | null
  fuente: string
  origen?: string | null
  consentimiento: string | null
  creado: string | null
}

const DIA_MS = 86_400_000

export type KpiRegistros = {
  clave: 'total' | 'semana' | 'telefono' | 'interes'
  valor: number
  variacion: Variacion
  nota: string
  linea: { anterior: (number | null)[]; actual: (number | null)[] }
}

/** Cuántos había antes de la ventana: la base con la que se compara el total. */
function antesDe(fechas: (string | null)[], limite: Date): number {
  return fechas.filter((f) => {
    const t = f ? Date.parse(f) : NaN
    return Number.isFinite(t) && t < limite.getTime()
  }).length
}

function lineaDe(fechas: (string | null)[], ahora: Date, dias: number, acumulado: boolean) {
  const desde = new Date(ahora.getTime() - dias * DIA_MS)
  const anteriorDesde = new Date(desde.getTime() - dias * DIA_MS)
  return {
    anterior: tramos(fechas, anteriorDesde, desde, 12, acumulado),
    actual: tramos(fechas, desde, ahora, 12, acumulado),
  }
}

/**
 * Los cuatro indicadores de la cabecera.
 *
 * El total, el teléfono y el interés son **cuántos hay hoy**, y se comparan con
 * cuántos había hace 30 días: eso es crecimiento, y se dice así. «Nuevos esta
 * semana» sí es del período, y se compara con la semana anterior.
 *
 * Si no había nada con qué comparar, no se inventa un porcentaje.
 */
export function kpisRegistros(registros: Registro[], ahora: Date): KpiRegistros[] {
  const fechas = registros.map((r) => r.creado)
  const hace30 = new Date(ahora.getTime() - 30 * DIA_MS)
  const hace7 = new Date(ahora.getTime() - 7 * DIA_MS)
  const hace14 = new Date(ahora.getTime() - 14 * DIA_MS)

  const conTelefono = registros.filter((r) => (r.telefono ?? '').trim() !== '')
  const conInteres = registros.filter((r) => (r.propiedad ?? '').trim() !== '')

  const semana = contarEn(fechas, hace7, ahora)
  const semanaAnterior = contarEn(fechas, hace14, hace7)

  // Para el crecimiento siempre hay «historial» —los propios registros—, así que
  // cuando no había ninguno hace 30 días se dice eso y no «faltan datos».
  const crecimiento = (lista: Registro[]): { variacion: Variacion; nota: string } => {
    const previo = antesDe(lista.map((r) => r.creado), hace30)
    return { variacion: variacionPorcentual(lista.length, previo, true), nota: 'vs. hace 30 días' }
  }

  // «Nuevos esta semana» sí puede no tener con qué comparar: si el sitio no
  // tenía ningún registro antes de esta semana, no hay semana anterior.
  const huboAntesDeLaSemana = antesDe(fechas, hace7) > 0

  return [
    { clave: 'total', valor: registros.length, ...crecimiento(registros), linea: lineaDe(fechas, ahora, 30, true) },
    {
      clave: 'semana',
      valor: semana,
      variacion: variacionPorcentual(semana, semanaAnterior, huboAntesDeLaSemana),
      nota: 'vs. semana anterior',
      linea: lineaDe(fechas, ahora, 7, false),
    },
    { clave: 'telefono', valor: conTelefono.length, ...crecimiento(conTelefono), linea: lineaDe(conTelefono.map((r) => r.creado), ahora, 30, true) },
    { clave: 'interes', valor: conInteres.length, ...crecimiento(conInteres), linea: lineaDe(conInteres.map((r) => r.creado), ahora, 30, true) },
  ]
}

export type Filtros = { tipo: string; texto: string; dias: number | null }

/** Filtra por tipo, por texto (nombre, correo o teléfono) y por antigüedad. */
export function filtrarRegistros(registros: Registro[], f: Filtros, ahora: Date): Registro[] {
  const clave = claveDeZona(f.texto)
  const digitos = f.texto.replace(/\D/g, '')
  const desde = f.dias === null ? null : new Date(ahora.getTime() - f.dias * DIA_MS)

  return registros.filter((r) => {
    if (f.tipo !== 'todos' && r.tipo !== f.tipo) return false
    if (desde && !enVentana(r.creado, desde, ahora)) return false
    if (!clave && !digitos) return true
    const texto = claveDeZona([r.nombre, r.email, r.mensaje].filter(Boolean).join(' '))
    const tel = (r.telefono ?? '').replace(/\D/g, '')
    return (clave !== '' && texto.includes(clave)) || (digitos !== '' && tel.includes(digitos))
  })
}

export function conteosPorTipo(registros: Registro[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const r of registros) c[r.tipo] = (c[r.tipo] ?? 0) + 1
  return c
}

/* ── Exportar a CSV ─────────────────────────────────────────── */

/**
 * Una celda de CSV.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ LLEVA UNA COMILLA DELANTE
 *
 * Excel y Google Sheets tratan como **fórmula** cualquier celda que empiece por
 * `=`, `+`, `-`, `@` o un tabulador. Un nombre escrito como
 * `=HYPERLINK("http://…")` en un formulario del sitio se ejecutaría al abrir el
 * archivo en la computadora de quien atiende los leads. Se le pone una comilla
 * delante: el texto se ve igual y deja de ser fórmula.
 * ─────────────────────────────────────────────────────────────
 */
export function celdaCsv(valor: string | null | undefined): string {
  const texto = (valor ?? '').replace(/\r?\n/g, ' ').trim()
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
  return `"${seguro.replace(/"/g, '""')}"`
}

export const COLUMNAS_CSV = ['Tipo', 'Nombre', 'Correo', 'Teléfono', 'Interés', 'Mensaje', 'Propiedad', 'Aviso de privacidad', 'Fecha', 'Fuente'] as const

/**
 * El CSV de los registros, tal como se ven en la tabla.
 *
 * Lleva BOM y saltos CRLF porque el destino es Excel en español: sin el BOM,
 * «León» se abre como «LeÃ³n».
 */
export function aCsv(
  registros: Registro[],
  etiquetaTipo: (tipo: string) => string,
  fecha: (iso: string | null) => string,
): string {
  const filas = registros.map((r) => [
    etiquetaTipo(r.tipo),
    r.nombre,
    r.email,
    r.telefono,
    r.propiedad ? 'Propiedad concreta' : '',
    r.mensaje,
    r.propiedad,
    r.consentimiento ? `aceptado ${r.consentimiento}` : 'sin registrar',
    fecha(r.creado),
    r.fuente,
  ].map(celdaCsv).join(','))

  return `﻿${[COLUMNAS_CSV.map(celdaCsv).join(','), ...filas].join('\r\n')}\r\n`
}

/** `registros-vivebien-2026-09-17.csv` */
export function nombreArchivoCsv(ahora: Date): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(ahora)
  return `registros-vivebien-${dia}.csv`
}
