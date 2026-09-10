import type { Rol } from './auth-server'

/**
 * Completitud del perfil de una persona.
 *
 * Hermano de `publicacion.ts`, y a propósito: la propiedad tiene su barra de
 * progreso y la persona necesita la suya. Un anuncio al 100% cuyo dueño no ha
 * dado teléfono es un anuncio que nadie puede contactar — está completo en la
 * base de datos y roto en el negocio.
 *
 * Se calcula en servidor por la misma razón que la de las propiedades: si el
 * número lo mandara el navegador, cualquiera escribiría un 100 a mano.
 */

export type PerfilParcial = Record<string, unknown>

type Requisito = {
  campo: string
  peso: number
  etiqueta: string
  /** Sin esto no se puede publicar, por mucho que sume el porcentaje. */
  imprescindible?: boolean
}

/**
 * Lo que se le pide a cada rol.
 *
 * A un cliente no se le piden zonas de operación ni logo de inmobiliaria: no
 * publica nada. Preguntárselo hace que el formulario parezca de otro producto,
 * que es exactamente lo que se evitó en el asistente de propiedad.
 */
const REQUISITOS: Record<Rol, Requisito[]> = {
  publicador: [
    { campo: 'nombre', peso: 25, etiqueta: 'Tu nombre', imprescindible: true },
    { campo: 'telefono', peso: 25, etiqueta: 'Teléfono', imprescindible: true },
    { campo: 'whatsapp', peso: 20, etiqueta: 'WhatsApp', imprescindible: true },
    { campo: 'zonas', peso: 15, etiqueta: 'Zonas donde operas' },
    { campo: 'foto_url', peso: 10, etiqueta: 'Foto o logo' },
    { campo: 'biografia', peso: 5, etiqueta: 'Breve presentación' },
  ],
  cliente: [
    { campo: 'nombre', peso: 40, etiqueta: 'Tu nombre', imprescindible: true },
    { campo: 'telefono', peso: 30, etiqueta: 'Teléfono' },
    { campo: 'busca_operacion', peso: 15, etiqueta: '¿Compras o rentas?' },
    { campo: 'busca_zona', peso: 15, etiqueta: 'Zona que te interesa' },
  ],
  // Un administrador entra por ADMIN_EMAILS: no tiene ficha que llenar.
  admin: [
    { campo: 'nombre', peso: 100, etiqueta: 'Tu nombre' },
  ],
}

/** Porcentaje a partir del cual un publicador puede enviar a revisión. */
export const PERFIL_MINIMO = 70

function tieneValor(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return v > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

export function calcularCompletitudPerfil(p: PerfilParcial, rol: Rol): number {
  const reqs = REQUISITOS[rol] ?? REQUISITOS.cliente
  let puntos = 0
  for (const r of reqs) if (tieneValor(p[r.campo])) puntos += r.peso
  return Math.min(100, puntos)
}

/** Qué le falta al perfil, en el mismo lenguaje que ve el usuario. */
export function faltantesPerfil(p: PerfilParcial, rol: Rol): string[] {
  const reqs = REQUISITOS[rol] ?? REQUISITOS.cliente
  return reqs.filter((r) => !tieneValor(p[r.campo])).map((r) => r.etiqueta)
}

export type Veredicto = { ok: true } | { ok: false; motivo: string }

/**
 * ¿Puede este publicador sacar una propiedad al público?
 *
 * Comprueba los imprescindibles, no el porcentaje: el peso sirve para pintar
 * una barra, y una barra no es una regla de negocio. Sin teléfono ni WhatsApp
 * el anuncio es un callejón sin salida para el interesado.
 */
export function puedePublicar(p: PerfilParcial, rol: Rol): Veredicto {
  if (rol === 'admin') return { ok: true }

  const falta = (REQUISITOS[rol] ?? [])
    .filter((r) => r.imprescindible && !tieneValor(p[r.campo]))
    .map((r) => r.etiqueta)

  if (falta.length > 0) {
    return {
      ok: false,
      motivo: `Antes de publicar completa tu perfil: ${falta.join(', ')}. `
        + 'Sin datos de contacto, quien vea el anuncio no tiene a quién escribir.',
    }
  }
  return { ok: true }
}

/** Campos del perfil que el propio usuario sí puede escribir. */
export const CAMPOS_EDITABLES = [
  'nombre',
  'telefono',
  'whatsapp',
  'foto_url',
  'inmobiliaria',
  'zonas',
  'biografia',
  'busca_operacion',
  'busca_zona',
  'busca_tipo',
  'presupuesto_max',
] as const

/** Los que fija el servidor. `rol` va aparte: tiene su propia validación. */
export const CAMPOS_RESERVADOS_PERFIL = [
  'uid',
  'email',
  'estado',
  'completitud',
  'creado_en',
  'actualizado_en',
] as const
