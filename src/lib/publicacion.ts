import type { Rol } from './auth-server'

/**
 * Ciclo de vida de una publicación.
 *
 *   borrador ──enviar──▶ en_revision ──aprobar──▶ publicada
 *      ▲                     │                        │
 *      │                     ├──rechazar──▶ rechazada │
 *      └──corregir───────────┴──pedir cambios──▶ cambios_solicitados
 *                                                     │
 *                            publicada ──despublicar──┘
 *
 * La regla que da sentido a todo esto: un publicador nunca escribe
 * 'publicada' por su cuenta. Sólo un administrador aprueba.
 */

export type EstadoPub =
  | 'borrador'
  | 'en_revision'
  | 'cambios_solicitados'
  | 'rechazada'
  | 'publicada'

export const ESTADOS_PUB: EstadoPub[] = [
  'borrador',
  'en_revision',
  'cambios_solicitados',
  'rechazada',
  'publicada',
]

export function esEstadoPub(v: unknown): v is EstadoPub {
  return typeof v === 'string' && (ESTADOS_PUB as string[]).includes(v)
}

/** Transiciones permitidas por rol. Lo que no está aquí, no se puede. */
const TRANSICIONES: Record<EstadoPub, { a: EstadoPub; roles: Rol[] }[]> = {
  borrador: [
    { a: 'en_revision', roles: ['publicador', 'admin'] },
  ],
  en_revision: [
    { a: 'publicada', roles: ['admin'] },
    { a: 'rechazada', roles: ['admin'] },
    { a: 'cambios_solicitados', roles: ['admin'] },
    // Retirar el envío mientras nadie lo ha revisado todavía.
    { a: 'borrador', roles: ['publicador', 'admin'] },
  ],
  cambios_solicitados: [
    { a: 'en_revision', roles: ['publicador', 'admin'] },
    { a: 'borrador', roles: ['publicador', 'admin'] },
  ],
  rechazada: [
    { a: 'borrador', roles: ['publicador', 'admin'] },
  ],
  publicada: [
    { a: 'borrador', roles: ['admin'] },
    { a: 'cambios_solicitados', roles: ['admin'] },
  ],
}

export type ResultadoTransicion =
  | { ok: true }
  | { ok: false; motivo: string }

export function puedeTransicionar(
  desde: EstadoPub,
  hacia: EstadoPub,
  rol: Rol,
): ResultadoTransicion {
  if (desde === hacia) return { ok: false, motivo: 'La propiedad ya está en ese estado.' }

  const salidas = TRANSICIONES[desde] ?? []
  const permitida = salidas.find((t) => t.a === hacia)

  if (!permitida) {
    return { ok: false, motivo: `No se puede pasar de "${desde}" a "${hacia}".` }
  }
  if (!permitida.roles.includes(rol)) {
    return {
      ok: false,
      motivo: hacia === 'publicada'
        ? 'Sólo un administrador puede publicar una propiedad.'
        : 'Tu cuenta no puede hacer ese cambio.',
    }
  }
  return { ok: true }
}

/** Campos que un publicador nunca escribe: los fija el servidor. */
export const CAMPOS_RESERVADOS = [
  'id',
  'owner_id',
  'estado_pub',
  'completitud',
  'revisado_por',
  'revisado_en',
  'nota_moderacion',
  'publicada_en',
  'enviada_en',
  'created_at',
  // Contadores: los sube el servidor al registrar el evento. Si un
  // publicador pudiera escribirlos, inflaria las vistas de su anuncio.
  'vistas',
  'favoritos_n',
  'contactos_n',
] as const

export function quitarCamposReservados<T extends Record<string, unknown>>(datos: T): Partial<T> {
  const limpio: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(datos)) {
    if (!(CAMPOS_RESERVADOS as readonly string[]).includes(k)) limpio[k] = v
  }
  return limpio as Partial<T>
}

/** Lo que un anuncio necesita para poder enviarse a revisión. */
const REQUISITOS: { campo: string; peso: number; etiqueta: string }[] = [
  { campo: 'titulo', peso: 15, etiqueta: 'Título' },
  { campo: 'descripcion', peso: 15, etiqueta: 'Descripción' },
  { campo: 'ubicacion', peso: 15, etiqueta: 'Ubicación' },
  { campo: 'precio', peso: 15, etiqueta: 'Precio' },
  { campo: 'tipo', peso: 10, etiqueta: 'Tipo de inmueble' },
  { campo: 'operacion', peso: 10, etiqueta: 'Operación' },
  { campo: 'metros', peso: 5, etiqueta: 'Superficie' },
]

const MINIMO_FOTOS = 3
const PESO_FOTOS = 15
export const COMPLETITUD_MINIMA = 80

type PropiedadParcial = Record<string, unknown>

function tieneValor(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return v > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

/**
 * Puntúa qué tan completo está el anuncio, de 0 a 100.
 * Se calcula en servidor: si lo mandara el cliente, cualquiera publicaría
 * un anuncio vacío con un 100 escrito a mano.
 */
export function calcularCompletitud(p: PropiedadParcial): number {
  let puntos = 0
  for (const r of REQUISITOS) {
    if (tieneValor(p[r.campo])) puntos += r.peso
  }
  const fotos = Array.isArray(p.fotos) ? p.fotos : []
  if (fotos.length >= MINIMO_FOTOS) puntos += PESO_FOTOS
  else if (fotos.length > 0) puntos += Math.round((fotos.length / MINIMO_FOTOS) * PESO_FOTOS)
  return Math.min(100, puntos)
}

/** Qué le falta al anuncio, en lenguaje que el publicador entiende. */
export function faltantes(p: PropiedadParcial): string[] {
  const falta: string[] = []
  for (const r of REQUISITOS) {
    if (!tieneValor(p[r.campo])) falta.push(r.etiqueta)
  }
  const fotos = Array.isArray(p.fotos) ? p.fotos : []
  if (fotos.length < MINIMO_FOTOS) {
    falta.push(`${MINIMO_FOTOS} fotos como mínimo (llevas ${fotos.length})`)
  }
  return falta
}

/** ¿Está lista para enviarse a revisión? */
export function listaParaRevision(p: PropiedadParcial): ResultadoTransicion {
  const falta = faltantes(p)
  if (falta.length > 0) {
    return { ok: false, motivo: `Falta completar: ${falta.join(', ')}.` }
  }
  return { ok: true }
}
