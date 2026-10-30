/**
 * Fase C del apartado SEO: historial, tareas («Qué hacer») y registro de prompts de IA. Código PURO: valida lo que llega del navegador y arma las filas.
 * El navegador solo PROPONE; el servidor decide qué se guarda. Las cifras del historial las calcula el servidor desde Search Console, nunca llegan en el cuerpo.
 * Los catálogos repiten los `check` de la migración 37 (una prueba los compara).
 */
import type { FilaGsc } from './gsc'

export const AREAS = ['tecnico', 'contenido', 'local', 'indexacion', 'ia', 'otro'] as const
export const PRIORIDADES = ['alta', 'media', 'baja'] as const
export const ESTADOS = ['pendiente', 'en_curso', 'hecha', 'descartada'] as const
export const MOTORES = ['chatgpt', 'gemini', 'perplexity', 'copilot', 'claude', 'otro'] as const
export const PERIODOS = [7, 28, 90] as const

export type Area = (typeof AREAS)[number]
export type Prioridad = (typeof PRIORIDADES)[number]
export type EstadoTarea = (typeof ESTADOS)[number]
export type Motor = (typeof MOTORES)[number]

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }
const falla = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Texto de una persona: sin caracteres de control, espacios recortados. */
function texto(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim() : ''
}
function enCatalogo<T extends string>(v: unknown, catalogo: readonly T[]): T | null {
  return typeof v === 'string' && (catalogo as readonly string[]).includes(v) ? (v as T) : null
}
const opcional = (v: unknown, max: number): Resultado<string | null> => {
  if (v === undefined || v === null || v === '') return { ok: true, valor: null }
  const t = texto(v)
  return t.length > max ? falla(`Máximo ${max} caracteres.`) : { ok: true, valor: t || null }
}

export type TareaNueva = { titulo: string; detalle: string | null; area: Area; prioridad: Prioridad; evidencia: string | null }

export function validarTarea(b: unknown): Resultado<TareaNueva> {
  const o = (b ?? {}) as Record<string, unknown>
  const titulo = texto(o.titulo)
  if (titulo.length < 3 || titulo.length > 200) return falla('El título debe tener entre 3 y 200 caracteres.')
  const detalle = opcional(o.detalle, 1000); if (!detalle.ok) return falla(`Detalle: ${detalle.error}`)
  const evidencia = opcional(o.evidencia, 500); if (!evidencia.ok) return falla(`Evidencia: ${evidencia.error}`)
  const area = o.area === undefined ? 'tecnico' : enCatalogo(o.area, AREAS)
  if (!area) return falla('Área no válida.')
  const prioridad = o.prioridad === undefined ? 'media' : enCatalogo(o.prioridad, PRIORIDADES)
  if (!prioridad) return falla('Prioridad no válida.')
  return { ok: true, valor: { titulo, detalle: detalle.valor, area, prioridad, evidencia: evidencia.valor } }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export function validarCambioDeTarea(b: unknown): Resultado<{ id: string; estado: EstadoTarea }> {
  const o = (b ?? {}) as Record<string, unknown>
  if (!esUuid(o.id)) return falla('Identificador no válido.')
  const estado = enCatalogo(o.estado, ESTADOS)
  if (!estado) return falla('Estado no válido.')
  return { ok: true, valor: { id: o.id, estado } }
}

export type PromptNuevo = { prompt: string; motor: Motor; aparece: boolean; cita_url: string | null; nota: string | null; observado_en: string }

/** `hoy` se inyecta para poder probar: una observación no puede ser del futuro. */
export function validarPrompt(b: unknown, hoy: Date = new Date()): Resultado<PromptNuevo> {
  const o = (b ?? {}) as Record<string, unknown>
  const prompt = texto(o.prompt)
  if (prompt.length < 5 || prompt.length > 300) return falla('La pregunta debe tener entre 5 y 300 caracteres.')
  const motor = enCatalogo(o.motor, MOTORES); if (!motor) return falla('Elige el asistente de IA.')
  if (typeof o.aparece !== 'boolean') return falla('Indica si VIVE BIEN aparece o no.')
  const nota = opcional(o.nota, 500); if (!nota.ok) return falla(`Nota: ${nota.error}`)
  let cita: string | null = null
  if (o.cita_url !== undefined && o.cita_url !== null && o.cita_url !== '') {
    const u = texto(o.cita_url)
    let ok = u.length <= 300
    try { ok = ok && new URL(u).protocol === 'https:' } catch { ok = false }
    if (!ok) return falla('La dirección citada debe empezar con https:// y tener máximo 300 caracteres.')
    cita = u
  }
  const hoyIso = hoy.toISOString().slice(0, 10)
  const fecha = o.observado_en === undefined || o.observado_en === '' ? hoyIso : texto(o.observado_en)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0, 10) !== fecha) return falla('Fecha no válida (AAAA-MM-DD).')
  if (fecha > hoyIso) return falla('La fecha no puede ser futura.')
  return { ok: true, valor: { prompt, motor, aparece: o.aparece, cita_url: cita, nota: nota.valor, observado_en: fecha } }
}

export function validarPeriodo(v: unknown): 7 | 28 | 90 | null {
  const n = Number(v)
  return (PERIODOS as readonly number[]).includes(n) ? (n as 7 | 28 | 90) : null
}

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d
/** Resumen de una pasada de Search Console: totales de las fechas y el top 10 de consultas y páginas. CTR en %, posición ponderada por impresiones. */
export function armarFoto(fechas: FilaGsc[], consultas: FilaGsc[], paginas: FilaGsc[]) {
  const clics = fechas.reduce((s, f) => s + f.clics, 0)
  const impresiones = fechas.reduce((s, f) => s + f.impresiones, 0)
  const pos = impresiones ? fechas.reduce((s, f) => s + f.posicion * f.impresiones, 0) / impresiones : 0
  const top = (l: FilaGsc[]) => [...l].sort((a, b) => b.clics - a.clics || b.impresiones - a.impresiones).slice(0, 10)
    .map((f) => ({ clave: f.clave.slice(0, 300), clics: f.clics, impresiones: f.impresiones, ctr: redondear(f.ctr, 2), posicion: redondear(f.posicion, 1) }))
  return {
    clics, impresiones,
    ctr: impresiones ? redondear((clics / impresiones) * 100, 3) : 0,
    posicion: redondear(pos, 2),
    top_consultas: top(consultas), top_paginas: top(paginas),
  }
}
