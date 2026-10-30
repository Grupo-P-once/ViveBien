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
    // V-1.1.82 (P3-07): el modelo único usa listas.
    { campo: 'busca_zonas', peso: 15, etiqueta: 'Zonas que te interesan' },
  ],
  // Un administrador es personal de VIVE BIEN: no tiene ficha que llenar.
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

/**
 * Qué campos puede escribir cada rol (03.08).
 *
 * ─────────────────────────────────────────────────────────────
 * LISTA BLANCA, Y EN EL SERVIDOR
 *
 * Antes `CAMPOS_EDITABLES` era una sola lista para todos, y el PATCH la
 * recorría entera sin mirar quién escribía. Consecuencia: un administrador
 * podía guardar `busca_operacion` o `presupuesto_max` —campos de cliente— y un
 * cliente podía guardar `inmobiliaria` o `biografia`, que son de publicador.
 *
 * Esconder esos campos en React no arregla nada: cualquiera puede mandar el
 * PATCH a mano. La separación tiene que estar aquí.
 *
 * Un Super Admin **no es un rol aparte**: llega con rol efectivo `admin` y
 * `superAdmin: true` (V-1.1.79), así que entra por la rama de `admin` y tiene
 * exactamente su mismo alcance. No se añade un rol nuevo ni un segundo sistema
 * de permisos.
 * ─────────────────────────────────────────────────────────────
 */

/** Lo que cualquiera necesita para que se le pueda contactar. */
const CONTACTO = ['nombre', 'telefono', 'whatsapp', 'foto_url'] as const

/** "Qué estoy buscando": sólo tiene sentido para quien busca. */
const BUSQUEDA = ['busca_operacion', 'busca_zonas', 'busca_tipos', 'presupuesto_max'] as const

/** Lo que exige publicar: de quién es el anuncio y dónde opera. */
const PUBLICACION = ['inmobiliaria', 'zonas', 'biografia'] as const

const POR_ROL: Record<Rol, readonly string[]> = {
  cliente: [...CONTACTO, ...BUSQUEDA],
  publicador: [...CONTACTO, ...PUBLICACION],
  // Personal de VIVE BIEN: cuenta y seguridad, nada de ficha. Sin `whatsapp`,
  // que es un canal de atención al público, no de la persona que administra.
  admin: ['nombre', 'telefono', 'foto_url'],
}

/**
 * La lista blanca de un rol, o `null` si el rol no se reconoce.
 *
 * **`null` no es "ninguno", es "rechaza la petición".** Quien llame debe
 * responder 403, no seguir con la lista vacía. Y el valor por defecto NO es
 * `cliente`: un rol que no entendemos no puede heredar los permisos de nadie,
 * porque eso es justo como admin acabó editando campos de cliente.
 */
export function camposEditablesPara(rol: string): readonly string[] | null {
  return Object.prototype.hasOwnProperty.call(POR_ROL, rol)
    ? POR_ROL[rol as Rol]
    : null
}

/**
 * Todos los campos editables por alguien. Sirve para validar longitudes y para
 * las pruebas; **no vale como permiso**: para eso está `camposEditablesPara`.
 */
export const CAMPOS_EDITABLES = [
  'nombre',
  'telefono',
  'whatsapp',
  'foto_url',
  'inmobiliaria',
  'zonas',
  'biografia',
  // «Qué estoy buscando» (P3-07, V-1.1.82): un solo modelo, ver lib/cliente/busqueda.ts.
  'busca_operacion',
  'busca_zonas',
  'busca_tipos',
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
