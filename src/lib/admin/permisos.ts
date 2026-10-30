import {
  CAPACIDADES,
  DEFAULTS_POR_TIPO,
  capacidadesEfectivas,
  normalizarOverrides,
  tipoDe,
  type Capacidad,
  type MapaCapacidades,
  type Overrides,
  type TipoPublicador,
} from '../acceso/capacidades'

/**
 * Cómo se PRESENTAN los permisos de un publicador en el panel de administración.
 * Funciones puras; nada de esto autoriza nada (eso lo hace el servidor con
 * `tieneCapacidad`).
 *
 * Los valores por defecto NO se repiten aquí: salen de `DEFAULTS_POR_TIPO`.
 * Lo único que vive en este archivo es el texto y el agrupado, y una prueba
 * obliga a que toda capacidad del catálogo tenga el suyo: si mañana se añade
 * una capacidad y nadie escribe su etiqueta, falla la suite en vez de quedar
 * una fila sin nombre en la pantalla.
 *
 * NO existe una capacidad «contacto público» suelta: el catálogo separa la
 * identidad (perfil, nombre, foto) de los datos de contacto (teléfono,
 * WhatsApp, correo), y aquí se respeta esa separación.
 */

export type GrupoDePermisos = 'publicacion' | 'solicitudes' | 'citas' | 'identidad' | 'contacto'

export const GRUPOS: Record<GrupoDePermisos, { titulo: string; descripcion: string }> = {
  publicacion: { titulo: 'Publicación', descripcion: 'Qué puede hacer con sus propiedades sin pasar por revisión.' },
  solicitudes: { titulo: 'Solicitudes y datos del interesado', descripcion: 'Recibir un aviso no es lo mismo que ver los datos de quien preguntó.' },
  citas: { titulo: 'Citas recibidas', descripcion: 'Las visitas que piden a sus propiedades. «Recibir citas» es la puerta de las otras cuatro.' },
  identidad: { titulo: 'Identidad pública', descripcion: 'Quién aparece ante el cliente. Por defecto, VIVE BIEN.' },
  contacto: { titulo: 'Datos de contacto públicos', descripcion: 'Teléfono, WhatsApp y correo propios. Se habilitan por separado de la identidad.' },
}

export const ORDEN_DE_GRUPOS: GrupoDePermisos[] = ['publicacion', 'solicitudes', 'citas', 'identidad', 'contacto']

type Ficha = {
  grupo: GrupoDePermisos
  etiqueta: string
  descripcion: string
  /** Entrega datos personales (de terceros o propios) a otras personas. */
  sensible?: boolean
  /**
   * Si hoy NINGUNA función usa este permiso, qué falta. Se enseña tal cual: no
   * se promete un efecto que no existe (el permiso queda guardado y se aplicará
   * cuando la función exista).
   */
  sinEfectoHoy?: string
}

export const FICHAS: Record<Capacidad, Ficha> = {
  publicar_sin_revision: { grupo: 'publicacion', etiqueta: 'Publicar sin revisión', descripcion: 'Pasa sus borradores a «publicada» sin que un administrador los apruebe antes.' },
  editar_publicadas: { grupo: 'publicacion', etiqueta: 'Corregir lo ya publicado', descripcion: 'Edita sus propiedades publicadas sin devolverlas a borrador. Lo que está en revisión nunca se edita.' },
  sin_comision: { grupo: 'publicacion', etiqueta: 'Sin comisión', descripcion: 'No tiene que aceptar la propuesta de comisión para enviar o publicar sus propiedades. La modalidad asociado la trae encendida.', sinEfectoHoy: 'Solo actúa cuando el módulo «Motor de comisiones» está encendido, y hoy está apagado.' },
  recibir_solicitudes: { grupo: 'solicitudes', etiqueta: 'Recibir aviso de solicitudes', descripcion: 'Aviso de que hay un interesado, sin datos personales.', sinEfectoHoy: 'El aviso automático todavía no está construido.' },
  ver_datos_interesado: { grupo: 'solicitudes', etiqueta: 'Ver los datos del interesado', descripcion: 'Nombre, teléfono, correo y notas de quien pide una visita. Apagado por defecto en ambas modalidades.', sensible: true },
  recibir_citas: { grupo: 'citas', etiqueta: 'Recibir citas', descripcion: 'Ser el asesor de las citas de sus propias propiedades. Sin esto, las otras cuatro quedan apagadas.' },
  aceptar_citas: { grupo: 'citas', etiqueta: 'Aceptar citas', descripcion: 'Confirmar una solicitud de visita.' },
  rechazar_citas: { grupo: 'citas', etiqueta: 'Rechazar citas', descripcion: 'Rechazar una solicitud que todavía no está confirmada.' },
  reprogramar_citas: { grupo: 'citas', etiqueta: 'Reprogramar citas', descripcion: 'Proponer otro horario.' },
  cancelar_citas: { grupo: 'citas', etiqueta: 'Cancelar citas', descripcion: 'Cancelar una visita ya confirmada.' },
  mostrar_perfil: { grupo: 'identidad', etiqueta: 'Mostrar perfil', descripcion: 'Condición para que su identidad pueda mostrarse. No incluye datos de contacto.' },
  mostrar_nombre: { grupo: 'identidad', etiqueta: 'Mostrar nombre', descripcion: 'Su nombre aparece como quien atiende la visita del cliente. Necesita también «Mostrar perfil»; si no, el cliente ve «Vive Bien».' },
  mostrar_foto: { grupo: 'identidad', etiqueta: 'Mostrar foto', descripcion: 'Su foto aparece en su perfil público.', sinEfectoHoy: 'Todavía no hay perfil público donde mostrarla.' },
  mostrar_telefono: { grupo: 'contacto', etiqueta: 'Mostrar teléfono', descripcion: 'Su teléfono puede aparecer públicamente.', sensible: true, sinEfectoHoy: 'Ninguna pantalla pública lo usa todavía: el contacto sigue siendo el de VIVE BIEN.' },
  mostrar_whatsapp: { grupo: 'contacto', etiqueta: 'Mostrar WhatsApp', descripcion: 'Su WhatsApp puede aparecer públicamente.', sensible: true, sinEfectoHoy: 'Ninguna pantalla pública lo usa todavía: el contacto sigue siendo el de VIVE BIEN.' },
  mostrar_email: { grupo: 'contacto', etiqueta: 'Mostrar correo', descripcion: 'Su correo puede aparecer públicamente.', sensible: true, sinEfectoHoy: 'Ninguna pantalla pública lo usa todavía: el contacto sigue siendo el de VIVE BIEN.' },
}

export const ETIQUETA_TIPO: Record<TipoPublicador, string> = { publicador: 'Publicador', asociado: 'Asociado' }
export const NOTA_TIPO: Record<TipoPublicador, string> = {
  publicador: 'Modalidad normal, con comisión. Sus propiedades pasan por revisión.',
  asociado: 'Modalidad premium, sin comisión. Publica sin revisión previa y puede atender citas.',
}

/** Las capacidades de un grupo, en el orden del catálogo. */
export function capacidadesDelGrupo(g: GrupoDePermisos): Capacidad[] {
  return CAPACIDADES.filter((c) => FICHAS[c].grupo === g)
}

const DEPENDEN_DE_RECIBIR_CITAS: readonly Capacidad[] = ['aceptar_citas', 'rechazar_citas', 'reprogramar_citas', 'cancelar_citas']

export type FilaDePermiso = {
  capacidad: Capacidad
  /** Lo que da la modalidad. */
  defecto: boolean
  /** El override individual, o `null` si no hay (vale el default). */
  override: boolean | null
  /** El resultado que de verdad aplica el servidor. */
  efectivo: boolean
  /** Si está apagada aunque default u override digan que sí: de qué depende. */
  bloqueadaPor: Capacidad | null
}

/** Una capacidad vista con sus tres capas: default, override y resultado. */
export function filaDePermiso(tipo: unknown, overrides: unknown, capacidad: Capacidad): FilaDePermiso {
  const t = tipoDe(tipo)
  const ov = normalizarOverrides(overrides)
  const defecto = DEFAULTS_POR_TIPO[t][capacidad]
  const override = capacidad in ov ? (ov[capacidad] as boolean) : null
  const efectivo = capacidadesEfectivas({ rol: 'publicador', tipo: t, overrides: ov })[capacidad]
  const pedida = override ?? defecto
  const bloqueadaPor = pedida && !efectivo && DEPENDEN_DE_RECIBIR_CITAS.includes(capacidad) ? 'recibir_citas' : null
  return { capacidad, defecto, override, efectivo, bloqueadaPor }
}

export type CambioDePermiso = { capacidad: Capacidad; de: boolean; a: boolean }

/** Qué cambia, en términos de lo EFECTIVO, entre dos configuraciones. Es lo que se le enseña al administrador antes de confirmar. */
export function cambiosEfectivos(
  antes: { tipo: unknown; overrides: unknown },
  despues: { tipo: unknown; overrides: unknown },
): CambioDePermiso[] {
  const a = capacidadesEfectivas({ rol: 'publicador', tipo: antes.tipo, overrides: antes.overrides })
  const d = capacidadesEfectivas({ rol: 'publicador', tipo: despues.tipo, overrides: despues.overrides })
  return CAPACIDADES.filter((c) => a[c] !== d[c]).map((c) => ({ capacidad: c, de: a[c], a: d[c] }))
}

/** Los overrides como los pide la API: `true | false | null` (null = volver al default). */
export function cuerpoDePermisos(actuales: unknown, deseados: Record<Capacidad, boolean | null>): Record<string, boolean | null> {
  const ya = normalizarOverrides(actuales)
  const cuerpo: Record<string, boolean | null> = {}
  for (const c of CAPACIDADES) {
    const quiere = deseados[c]
    const tiene = c in ya ? (ya[c] as boolean) : null
    if (quiere !== tiene) cuerpo[c] = quiere
  }
  return cuerpo
}

/**
 * El cuerpo EXACTO que la pantalla manda a `PATCH /api/admin/usuarios`. Vive aquí
 * (y no dentro del componente) para poder probar, con la ruta real, que lo que
 * la pantalla pide es lo que el servidor entiende. El servidor no se fía de
 * este cuerpo: lo valida entero.
 */
export function cuerpoDeGuardado(o: {
  uid: string
  motivo: string
  tipoInicial: TipoPublicador
  tipo: TipoPublicador
  overridesIniciales: unknown
  deseados: Record<Capacidad, boolean | null>
}): Record<string, unknown> {
  const permisos = cuerpoDePermisos(o.overridesIniciales, o.deseados)
  return {
    uid: o.uid,
    motivo: o.motivo.trim(),
    ...(o.tipo !== o.tipoInicial ? { tipo_publicador: o.tipo } : {}),
    ...(Object.keys(permisos).length ? { permisos } : {}),
  }
}

export type { MapaCapacidades, Overrides }
