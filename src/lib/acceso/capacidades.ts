/**
 * Modalidad de publicador y permisos efectivos por usuario (ADR-0013).
 *
 * Código puro: sin base ni red. Lo prueban los tests y lo aplica el servidor.
 *
 * ─────────────────────────────────────────────────────────────
 * EL MODELO
 *
 *   role = publicador                       ← el ROL de seguridad (uno solo)
 *   tipo_publicador = publicador | asociado ← la MODALIDAD comercial
 *
 *   permisos efectivos = defaults de la modalidad + overrides individuales
 *
 * · `publicador`: modalidad normal, CON comisión. Sus propiedades pasan por
 *   revisión de un admin.
 * · `asociado`: modalidad premium, SIN comisión. Puede publicar sin revisión
 *   previa, atender citas y tener perfil público.
 *
 * La modalidad NO es la autorización: es sólo la fuente de los valores por
 * defecto. Un admin puede encender o apagar cualquier capacidad de un usuario
 * concreto (`usuarios.permisos_override`), de modo que un publicador puede
 * tener una capacidad premium y un asociado puede no tener alguna.
 *
 * Nada de esto vive en componentes: la pantalla sólo *enseña* lo que el
 * servidor calcula con esta tabla. Quien autoriza es siempre el servidor.
 *
 * «Sin revisión» NO es «sin seguridad»: el dueño, los campos protegidos, el
 * folio, el slug, los estados y la auditoría se siguen validando igual.
 *
 * Falla cerrado: sin modalidad o sin overrides legibles, vale `publicador`
 * sin overrides (lo más restrictivo).
 * ─────────────────────────────────────────────────────────────
 */

export const TIPOS_PUBLICADOR = ['publicador', 'asociado'] as const
export type TipoPublicador = (typeof TIPOS_PUBLICADOR)[number]

export const CAPACIDADES = [
  /** Pasar de borrador a publicada sin que un admin la apruebe antes. */
  'publicar_sin_revision',
  /**
   * Corregir sus propiedades YA PUBLICADAS sin devolverlas a borrador. Independiente
   * de la anterior: una cosa es publicar sin revisión previa y otra cambiar lo que ya
   * está en el sitio. Lo que está EN REVISIÓN no se toca nunca: es lo que mira el equipo.
   */
  'editar_publicadas',
  /**
   * No tiene que aceptar la propuesta de comisión para enviar o publicar. Solo actúa con el módulo «Motor de comisiones»
   * (flag `commissionEngine`) encendido. La modalidad asociado la trae encendida (sin comisión); el publicador, no.
   */
  'sin_comision',
  /** Recibir el aviso de una solicitud sobre sus propiedades (SIN datos personales). */
  'recibir_solicitudes',
  /** Ver nombre, teléfono y correo del interesado. Permiso aparte: recibir ≠ ver. */
  'ver_datos_interesado',
  /** Citas con sus propias propiedades. `recibir_citas` es la puerta de las otras cuatro. */
  'recibir_citas',
  'aceptar_citas',
  'rechazar_citas',
  'reprogramar_citas',
  'cancelar_citas',
  /** Contacto público: por defecto el contacto es VIVE BIEN. */
  'mostrar_perfil',
  'mostrar_nombre',
  'mostrar_foto',
  'mostrar_telefono',
  'mostrar_whatsapp',
  'mostrar_email',
] as const
export type Capacidad = (typeof CAPACIDADES)[number]

export type MapaCapacidades = Record<Capacidad, boolean>
export type Overrides = Partial<Record<Capacidad, boolean>>

const TODO_APAGADO = Object.fromEntries(CAPACIDADES.map((c) => [c, false])) as MapaCapacidades

/** Los valores por defecto de cada modalidad. La única tabla de verdad. */
export const DEFAULTS_POR_TIPO: Record<TipoPublicador, MapaCapacidades> = {
  publicador: {
    ...TODO_APAGADO,
    // Se le avisa de que hay un interesado; sin nombre ni teléfono (ADR-0006).
    recibir_solicitudes: true,
  },
  asociado: {
    ...TODO_APAGADO,
    publicar_sin_revision: true,
    editar_publicadas: true,
    sin_comision: true,
    recibir_solicitudes: true,
    recibir_citas: true,
    aceptar_citas: true,
    rechazar_citas: true,
    reprogramar_citas: true,
    cancelar_citas: true,
    mostrar_perfil: true,
    mostrar_nombre: true,
    mostrar_foto: true,
    // Teléfono, WhatsApp y correo: «cuando esté habilitado». Los enciende un admin.
    // Datos del interesado: permiso aparte, apagado también para el asociado.
  },
}

/** Capacidades que sólo tienen sentido si `recibir_citas` está encendida. */
const DEPENDEN_DE_RECIBIR_CITAS: readonly Capacidad[] = ['aceptar_citas', 'rechazar_citas', 'reprogramar_citas', 'cancelar_citas']

export function esTipoPublicador(v: unknown): v is TipoPublicador {
  return typeof v === 'string' && (TIPOS_PUBLICADOR as readonly string[]).includes(v)
}

export function esCapacidad(v: unknown): v is Capacidad {
  return typeof v === 'string' && (CAPACIDADES as readonly string[]).includes(v)
}

/**
 * Regla CONFIRMADA por el propietario (19-oct-2026): el publicador (con comisión) depende de la revisión y tiene el acceso
 * «En revisión» a sus propiedades; el asociado publica sin revisión y NO lo tiene.
 *
 * ES SOLO PRESENTACIÓN DEL MENÚ. No autoriza nada (ADR-0013: «la modalidad no es la autorización»): publicar, editar y ver
 * propiedades siguen decidiéndose en el servidor con las capacidades efectivas y el dueño. Por eso vive aquí, junto a la
 * tabla de modalidades, y no en un componente que compare nombres. El valor por defecto de `publicar_sin_revision` del
 * asociado (tabla de arriba) coincide con esta regla; un ajuste individual (override) cambia lo que PUEDE hacer, no este menú.
 */
export const MODALIDAD_SIN_REVISION: TipoPublicador = TIPOS_PUBLICADOR[1]
export function ofreceAccesoEnRevision(tipo: unknown): boolean {
  return tipoDe(tipo) !== MODALIDAD_SIN_REVISION
}

/** Cómo se NOMBRA cada modalidad en pantalla. Solo presentación: nada se autoriza con esto (ADR-0013). */
export const ETIQUETA_MODALIDAD: Record<TipoPublicador, string> = { publicador: 'Publicador', asociado: 'Asociado' }
export function etiquetaDeModalidad(tipo: unknown): string {
  return ETIQUETA_MODALIDAD[tipoDe(tipo)]
}

/** Modalidad con lista blanca: cualquier cosa rara vale como la normal (la más restrictiva). */
export function tipoDe(v: unknown): TipoPublicador {
  return esTipoPublicador(v) ? v : 'publicador'
}

/**
 * Overrides leídos de la base o del cuerpo de una petición: sólo claves
 * conocidas con valor booleano. Lo demás se descarta, nunca se interpreta.
 */
export function normalizarOverrides(raw: unknown): Overrides {
  const limpio: Overrides = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return limpio
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (esCapacidad(k) && typeof v === 'boolean') limpio[k] = v
  }
  return limpio
}

/**
 * Deja en los overrides SÓLO lo que se aparta de los defaults de la modalidad
 * resultante (sin redundancias): un `true` donde el default ya es `true`
 * no dice nada y estorba al cambiar de modalidad más adelante.
 */
export function compactarOverrides(tipo: unknown, overrides: unknown): Overrides {
  const base = DEFAULTS_POR_TIPO[tipoDe(tipo)]
  const limpio: Overrides = {}
  for (const [k, v] of Object.entries(normalizarOverrides(overrides)) as Array<[Capacidad, boolean]>) {
    if (base[k] !== v) limpio[k] = v
  }
  return limpio
}

/** ¿Dos juegos de overrides dicen lo mismo? (orden de claves irrelevante) */
export function mismosOverrides(a: unknown, b: unknown): boolean {
  const x = normalizarOverrides(a)
  const y = normalizarOverrides(b)
  const claves = new Set([...Object.keys(x), ...Object.keys(y)]) as Set<Capacidad>
  for (const k of claves) if (x[k] !== y[k]) return false
  return true
}

/** Claves que NO son una capacidad (para rechazar el cuerpo en vez de ignorarlo en silencio). */
export function clavesDesconocidas(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.keys(raw as Record<string, unknown>).filter((k) => !esCapacidad(k))
}

/**
 * Los permisos efectivos de una cuenta.
 *
 * Sólo un publicador los tiene: un cliente no tiene ninguno (todo apagado), y
 * un admin no depende de esta tabla (actúa por `PERMISOS`).
 */
export function capacidadesEfectivas(p: { rol: string; tipo?: unknown; overrides?: unknown }): MapaCapacidades {
  if (p.rol !== 'publicador') return { ...TODO_APAGADO }
  const base = DEFAULTS_POR_TIPO[tipoDe(p.tipo)]
  const efectivo: MapaCapacidades = { ...base, ...normalizarOverrides(p.overrides) }
  if (!efectivo.recibir_citas) {
    for (const c of DEPENDEN_DE_RECIBIR_CITAS) efectivo[c] = false
  }
  return efectivo
}

/** Lo mínimo de un perfil para decidir una capacidad. */
export type QuienConCapacidades = { rol: string; superAdmin?: boolean; capacidades?: Partial<MapaCapacidades> }

/**
 * ¿Tiene esta cuenta la capacidad? Lee las ya calculadas en el perfil: una
 * cuenta que no las trae (perfil viejo, base sin migrar) no tiene ninguna.
 */
export function tieneCapacidad(p: QuienConCapacidades, cap: Capacidad): boolean {
  if (p.rol !== 'publicador') return false
  return p.capacidades?.[cap] === true
}

// ── Citas: independientes entre sí ─────────────────────────────

/**
 * La capacidad que autoriza una acción sobre una cita cuando quien actúa es un
 * publicador en el papel de asesor. `null` = no la hace un publicador (la
 * hacen el sistema o un admin).
 *
 * «Rechazar» una solicitud todavía sin confirmar es `cancelar` en la máquina de
 * estados; «cancelar» una ya firme es la misma acción con otro estado. Por eso
 * el estado entra en la decisión.
 */
export function capacidadDeAccionDeCita(accion: string, estado: string): Capacidad | null {
  switch (accion) {
    case 'confirmar':
    case 'aceptar_cambio':
      return 'aceptar_citas'
    case 'rechazar_cambio':
    case 'rechazar':
      return 'rechazar_citas'
    case 'proponer':
    case 'retirar_cambio':
      return 'reprogramar_citas'
    case 'cancelar':
      return estado === 'REQUESTED' || estado === 'PENDING_CONFIRMATION' ? 'rechazar_citas' : 'cancelar_citas'
    case 'completar':
    case 'no_asistio':
      return 'recibir_citas'
    default:
      return null
  }
}

// ── Citas recibidas: quién atiende y qué ve ────────────────────

/** Una cuenta tal como la ve el servicio de citas: su rol y sus permisos ya calculados. */
export type CuentaDeCitas = { rol: string; capacidades?: Partial<MapaCapacidades> }

const esEquipo = (c: CuentaDeCitas) => c.rol === 'admin'

/**
 * ¿Puede esta cuenta ser el «asesor» de una cita, es decir, recibirlas?
 * El equipo de VIVE BIEN siempre; un publicador sólo con `recibir_citas`.
 * Un cliente, nunca (aunque en el pasado haya sido asesor: falla cerrado).
 */
export function atiendeCitas(c: CuentaDeCitas): boolean {
  return esEquipo(c) || tieneCapacidad(c, 'recibir_citas')
}

/**
 * ¿Ve nombre, teléfono, correo y notas del interesado? Recibir una cita NO
 * lo implica: es el permiso `ver_datos_interesado`, apagado por defecto.
 */
export function veDatosDelInteresado(c: CuentaDeCitas): boolean {
  return esEquipo(c) || tieneCapacidad(c, 'ver_datos_interesado')
}

/**
 * ¿Ve nombre, teléfono y notas de la visita del interesado en las citas de SUS propiedades que atiende otra persona (solo lectura)? Decisión del dueño, 9-nov-2026: sí, quien
 * tiene `recibir_citas` (el asociado, por defecto). Se autoriza con la capacidad, nunca con el nombre de la modalidad (ADR-0013). El correo sigue exigiendo `ver_datos_interesado`.
 */
export function veContactoBasicoDelInteresado(c: CuentaDeCitas): boolean {
  return tieneCapacidad(c, 'recibir_citas')
}

/**
 * ¿Aparece el nombre del asesor ante el cliente? Por defecto el contacto es
 * VIVE BIEN: un publicador sólo se nombra si un admin le dio perfil y nombre
 * públicos. El equipo se muestra como siempre.
 */
export function nombreDelAsesorVisible(c: CuentaDeCitas): boolean {
  return esEquipo(c) || (tieneCapacidad(c, 'mostrar_perfil') && tieneCapacidad(c, 'mostrar_nombre'))
}

/** ¿Puede este publicador-asesor hacer esta acción sobre una cita en este estado? El equipo, siempre. */
export function puedeActuarEnCita(c: CuentaDeCitas, accion: string, estado: string): boolean {
  if (esEquipo(c)) return true
  if (!atiendeCitas(c)) return false
  const cap = capacidadDeAccionDeCita(accion, estado)
  return cap !== null && tieneCapacidad(c, cap)
}

// ── Quién puede cambiar esto (sólo servidor) ───────────────────

type Actor = { uid: string }
type Objetivo = { uid: string; rol: string; estado?: string }
type Decision = { ok: true } | { ok: false; status: number; motivo: string }

export const MINIMO_MOTIVO_PERMISOS = 10

/**
 * Cambiar la modalidad o los overrides de alguien. Sólo llega aquí quien ya
 * pasó `usuarios.gestionar` (admin o super admin); aquí se decide el resto:
 *
 *  · nadie se cambia a sí mismo (un publicador no se da permisos);
 *  · el objetivo tiene que SER publicador: a un cliente no se le ponen
 *    permisos de publicador por la puerta de atrás (el rol es otra operación,
 *    con su propia regla y su bitácora);
 *  · con motivo, que queda en la bitácora.
 */
export function decidirCambioDePermisos(opts: { actor: Actor; objetivo: Objetivo; motivo?: string | null }): Decision {
  const no = (status: number, motivo: string): Decision => ({ ok: false, status, motivo })
  if (opts.actor.uid === opts.objetivo.uid) {
    return no(400, 'No puedes cambiar tus propios permisos. Pídeselo a otro administrador.')
  }
  if (opts.objetivo.estado === 'eliminada') {
    return no(409, 'Esa cuenta fue eliminada: la baja es definitiva y no se puede cambiar.')
  }
  if (opts.objetivo.rol !== 'publicador') {
    return no(409, 'Sólo se configuran los permisos de un publicador. Primero cambia su rol.')
  }
  if ((opts.motivo ?? '').trim().length < MINIMO_MOTIVO_PERMISOS) {
    return no(400, `Escribe el motivo del cambio (mínimo ${MINIMO_MOTIVO_PERMISOS} caracteres): queda en la bitácora.`)
  }
  return { ok: true }
}
