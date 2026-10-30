import type { Rol } from './auth-server'
import { MINIMO_FOTOS as MINIMO_FOTOS_ESQUEMA } from './esquemas/propiedad'
import { esRelleno } from './slug'

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
    // V-1.1.50 — un administrador publica directo. Antes tenía que mandarse a
    // revisión a sí mismo y aprobarse después desde otra pantalla: dos pasos
    // en dos sitios para la misma persona. Eso es lo que hacía que «no se
    // pueda publicar» siendo admin. Las comprobaciones de contenido se siguen
    // aplicando: lo que se salta es el trámite, no la calidad.
    { a: 'publicada', roles: ['admin'] },
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
    { a: 'publicada', roles: ['admin'] },
  ],
  rechazada: [
    { a: 'borrador', roles: ['publicador', 'admin'] },
    { a: 'publicada', roles: ['admin'] },
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
  /**
   * Capacidad `publicar_sin_revision` (ADR-0013), ya calculada por el servidor.
   * Un publicador con ella publica SU borrador sin que lo apruebe un admin;
   * todo lo demás de la máquina de estados le sigue aplicando igual.
   */
  publicaSinRevision = false,
): ResultadoTransicion {
  if (desde === hacia) return { ok: false, motivo: 'La propiedad ya está en ese estado.' }

  const salidas = TRANSICIONES[desde] ?? []
  const permitida = salidas.find((t) => t.a === hacia)

  if (!permitida) {
    return { ok: false, motivo: `No se puede pasar de "${desde}" a "${hacia}".` }
  }
  // Sin revisión no es sin reglas: sólo borrador → publicada, y sólo de un publicador.
  const autopublica = rol === 'publicador' && publicaSinRevision && desde === 'borrador' && hacia === 'publicada'
  if (!permitida.roles.includes(rol) && !autopublica) {
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
  // El folio lo asigna la base y no cambia nunca; el slug lo asigna el servidor
  // al publicar. Si un publicador pudiera escribirlos, podría poner a su anuncio
  // la dirección o el folio que quisiera.
  'folio',
  'slug',
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
  // V-1.1.77 (SEC-01, D-02): el contacto público es siempre el de VIVE BIEN.
  // Estas columnas se conservan (no se borra nada) pero ya no las escribe
  // nadie desde el asistente ni se muestran en el sitio.
  'whatsapp',
  'telefono',
] as const

/**
 * Los campos reservados cuyo intento de escritura se AUDITA (02.03, §60.4):
 * dueño, estado publicado, moderación y contadores. Los demás reservados
 * (id, created_at, completitud…) viajan a veces sin mala intención.
 */
export const CAMPOS_PROTEGIDOS_AUDITADOS = [
  'owner_id', 'estado_pub', 'publicada_en', 'revisado_por', 'revisado_en',
  'nota_moderacion', 'folio', 'slug', 'vistas', 'favoritos_n', 'contactos_n',
] as const

export function camposProtegidosEn(body: Record<string, unknown>): string[] {
  return CAMPOS_PROTEGIDOS_AUDITADOS.filter((c) => c in body)
}

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

// Una sola cifra para todo el sitio. Aquí valía 3 y en el esquema 5: el
// asistente decía «mínimo 3» y la especificación pedía 5 (Inmuebles24 pide 5).
// Con dos números, alguno de los dos mentía.
const MINIMO_FOTOS = MINIMO_FOTOS_ESQUEMA

/**
 * ¿Hay fotos suficientes? UN solo criterio (el del servidor: `MINIMO_FOTOS`). El asistente marcaba el paso como completo con 3 mientras
 * el servidor exigía 5 (E-48): ahora el paso, `calcularCompletitud`, `faltantes` y el esquema usan la misma constante.
 */
export function fotosSuficientes(p: { fotos?: unknown }): boolean {
  return Array.isArray(p.fotos) && p.fotos.length >= MINIMO_FOTOS
}
const PESO_FOTOS = 15
export const COMPLETITUD_MINIMA = 80

type PropiedadParcial = Record<string, unknown>

/**
 * Si un campo está de verdad rellenado.
 *
 * El título necesita una comprobación propia: 'Propiedad sin título' es una
 * cadena no vacía, así que antes contaba como título. Sumaba 15 puntos de
 * completitud, `faltantes()` nunca listaba «Título», y la vista previa del
 * asistente enseñaba «Propiedad sin título» como titular del anuncio en vez
 * del aviso «Falta el título», que existía y no se disparaba nunca.
 */
function campoLleno(campo: string, v: unknown): boolean {
  if (campo === 'titulo' && typeof v === 'string' && esRelleno(v)) return false
  return tieneValor(v)
}

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
    if (campoLleno(r.campo, p[r.campo])) puntos += r.peso
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
    if (!campoLleno(r.campo, p[r.campo])) falta.push(r.etiqueta)
  }
  const fotos = Array.isArray(p.fotos) ? p.fotos : []
  if (fotos.length < MINIMO_FOTOS) {
    falta.push(`${MINIMO_FOTOS} fotos como mínimo (llevas ${fotos.length})`)
  }
  return falta
}

/**
 * Lo que una EDICIÓN dejaría sin cumplir en un anuncio que ya está publicado.
 *
 * `/estado` no deja publicar un anuncio a medias, pero editar uno ya publicado (admin, Super Admin o un publicador con
 * `editar_publicadas`) no volvía a mirar lo mínimo: se podía dejar el anuncio público con 0 fotos, sin precio o sin título. Solo cuentan
 * los requisitos que la edición INCUMPLE y antes se cumplían: un anuncio heredado que ya estaba incompleto sigue pudiéndose corregir
 * campo por campo, y una edición que no lo empeora no se bloquea.
 */
export function faltantesNuevos(antes: PropiedadParcial, despues: PropiedadParcial): string[] {
  const clave = (t: string) => t.replace(/s*(llevas d+)/, '')
  const yaFaltaba = new Set(faltantes(antes).map(clave))
  return faltantes(despues).filter((t) => !yaFaltaba.has(clave(t)))
}

/**
 * ¿Tiene el anuncio OBSERVACIONES del revisor sin resolver (rechazo o cambios solicitados)?
 *
 * El servidor guarda la nota del revisor al rechazar o pedir cambios (≥10 caracteres, `notaDeRevisionValida`) y la reescribe —con `null`
 * si no hay nota— cuando un revisor APRUEBA. Mientras la nota siga ahí, el anuncio todavía no pasó la revisión que lo observó.
 * Un publicador puede devolver su anuncio rechazado a borrador, pero eso no borra la nota: sin esta regla, `rechazada → borrador →
 * publicada` (con `publicar_sin_revision`) se saltaba al revisor. Decisión conservadora (no había ninguna que lo permitiera, ADR-0013:
 * «sin revisión no es sin reglas»): con observaciones pendientes la publicación directa se cierra y el anuncio tiene que pasar por revisión.
 */
export function tieneObservacionesDelRevisor(p: { nota_moderacion?: unknown } | null | undefined): boolean {
  return typeof p?.nota_moderacion === 'string' && p.nota_moderacion.trim().length > 0
}

/** La capacidad `publicar_sin_revision` solo vale si el anuncio no tiene observaciones del revisor sin resolver. */
export function publicaSinRevisionEfectiva(capacidad: boolean, p: { nota_moderacion?: unknown } | null | undefined): boolean {
  return capacidad && !tieneObservacionesDelRevisor(p)
}

/** ¿Está lista para enviarse a revisión? */
export function listaParaRevision(p: PropiedadParcial): ResultadoTransicion {
  const falta = faltantes(p)
  if (falta.length > 0) {
    return { ok: false, motivo: `Falta completar: ${falta.join(', ')}.` }
  }
  return { ok: true }
}

/**
 * ¿Puede esta persona cambiar el anuncio desde el asistente?
 *
 * Para un publicador, una propiedad **en revisión** o **ya publicada** está
 * cerrada: si pudiera cambiarla después de aprobarla, la revisión no serviría
 * de nada y el anuncio del sitio dejaría de ser el que se revisó.
 *
 * El **administrador** sí puede, siempre. Antes no: la pantalla le decía
 * «pídele a un administrador que la pase a borrador» —a sí mismo—, y como casi
 * todo el inventario está publicado, el asistente salía en gris y parecía que
 * la edición estaba rota (V-1.1.72). El servidor nunca lo impidió: `PATCH
 * /api/admin/propiedades/[id]` sólo comprueba el dueño cuando NO es admin.
 */
export function puedeEditarAnuncio(
  estadoPub: string | null | undefined,
  esAdmin: boolean,
  /** Capacidad `editar_publicadas` (ADR-0013): corregir lo YA publicado. Lo que está en revisión, nunca. */
  editaPublicadas = false,
): boolean {
  if (esAdmin) return true
  if (estadoPub === 'en_revision') return false
  if (estadoPub === 'publicada') return editaPublicadas
  return true
}

/**
 * Columnas de `propiedades` que un publicador NO recibe en las lecturas
 * (ADR-0006, D-02): el correo de quien revisó y el contacto interno. Se
 * conservan en la base; sólo dejan de salir hacia cuentas sin `propiedad.moderar`.
 */
export const COLUMNAS_SOLO_DE_LA_CASA = ['revisado_por', 'whatsapp', 'telefono'] as const

export function paraPublicador<T extends Record<string, unknown>>(prop: T): Partial<T> {
  const limpio: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(prop)) {
    if (!(COLUMNAS_SOLO_DE_LA_CASA as readonly string[]).includes(k)) limpio[k] = v
  }
  return limpio as Partial<T>
}

/**
 * Qué estado pedir al pulsar el botón del asistente, según dónde está.
 *
 * `null` = no hay nada que pedir: la propiedad YA está en ese estado y sólo se
 * estaban guardando cambios. Antes se mandaba igual y el servidor respondía
 * 403 «La propiedad ya está en ese estado» sobre una edición que sí se había
 * guardado; parecía que el guardado fallaba (V-1.1.84).
 */
export function destinoDePublicacion(
  estadoPub: string | null | undefined,
  esAdmin: boolean,
  publicaSinRevision = false,
): EstadoPub | null {
  // El admin y quien tiene `publicar_sin_revision` saltan la revisión; el resto manda a revisar.
  const destino: EstadoPub = esAdmin || publicaSinRevision ? 'publicada' : 'en_revision'
  return estadoPub === destino ? null : destino
}

/**
 * Situación comercial (`propiedades.estatus`), aparte de `estado_pub`. Una propiedad puede estar publicada y pausada a la vez.
 * `eliminada` es lo que el panel llama «archivada». El servidor valida contra esta lista: antes aceptaba cualquier texto.
 */
export const ESTATUS_COMERCIALES = ['disponible', 'pausada', 'vendida', 'rentada', 'eliminada'] as const
export type EstatusComercial = (typeof ESTATUS_COMERCIALES)[number]

export function esEstatusComercial(v: unknown): v is EstatusComercial {
  return typeof v === 'string' && (ESTATUS_COMERCIALES as readonly string[]).includes(v)
}

/** Rechazar o pedir cambios sin decir por qué deja al publicador a ciegas: el servidor exige la nota (no sólo la pantalla). */
export const MINIMO_NOTA_REVISION = 10

export function notaDeRevisionValida(destino: EstadoPub, nota: unknown): { ok: true; nota: string | null } | { ok: false; motivo: string } {
  const texto = typeof nota === 'string' ? nota.trim() : ''
  if (destino === 'rechazada' || destino === 'cambios_solicitados') {
    if (texto.length < MINIMO_NOTA_REVISION) {
      return { ok: false, motivo: `Escribe el motivo para el publicador (mínimo ${MINIMO_NOTA_REVISION} caracteres): es lo que va a leer.` }
    }
  }
  return { ok: true, nota: texto ? texto.slice(0, 1000) : null }
}

/**
 * Publicación que NO pasa por la pantalla ni por `/estado` (el asistente de Telegram, el alta heredada del panel clásico):
 * se decide con LA MISMA regla que `POST /api/propiedades/[id]/estado`, no con una paralela.
 *
 *  · el anuncio tiene que estar completo (`faltantes`: los mismos campos y las mismas fotos que para enviar a revisión);
 *  · `publicada` sólo si la máquina de estados lo permite a ese rol (admin, o publicador con `publicar_sin_revision`);
 *  · si no, se manda `en_revision` (nunca se publica «de más»);
 *  · sin cuenta que firme (`rol: null`) o con la cuenta suspendida/eliminada: `en_revision` / nada — falla cerrado.
 */
export type DecisionAutomatica =
  | { ok: true; destino: 'publicada' | 'en_revision'; autopublica: boolean }
  | { ok: false; falta: string[]; motivo: string }

export function decidirPublicacionAutomatica(opts: {
  /** Rol efectivo de la cuenta que firma, o `null` si no hay cuenta (propiedad «de la casa»). */
  rol: Rol | null
  /** La cuenta puede entrar (activa o pendiente). Una suspendida o eliminada no publica ni envía nada. */
  activa: boolean
  /** Capacidad `publicar_sin_revision`, ya calculada por el servidor. */
  publicaSinRevision: boolean
  prop: PropiedadParcial
}): DecisionAutomatica {
  const falta = faltantes(opts.prop)
  if (falta.length > 0) return { ok: false, falta, motivo: `Falta completar: ${falta.join(', ')}.` }

  if (opts.rol === null) {
    // Sin cuenta no se puede saber qué capacidades tiene: no se publica solo, lo revisa la casa.
    return { ok: true, destino: 'en_revision', autopublica: false }
  }
  if (!opts.activa) {
    return { ok: false, falta: ['una cuenta activa'], motivo: 'La cuenta dueña de esta propiedad no está activa: no puede publicar ni enviar a revisión.' }
  }
  const publica = puedeTransicionar('borrador', 'publicada', opts.rol, publicaSinRevisionEfectiva(opts.publicaSinRevision, opts.prop))
  if (publica.ok) return { ok: true, destino: 'publicada', autopublica: opts.rol !== 'admin' }
  const revisa = puedeTransicionar('borrador', 'en_revision', opts.rol, false)
  if (revisa.ok) return { ok: true, destino: 'en_revision', autopublica: false }
  return { ok: false, falta: ['permiso para publicar'], motivo: revisa.motivo }
}

/** Borradores abiertos (borrador / cambios solicitados / rechazada) que puede tener a la vez una cuenta que NO modera. Sin tope, un script llena la base de borradores. */
export const MAXIMO_BORRADORES_POR_CUENTA = 30
