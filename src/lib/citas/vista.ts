import { accionesDisponibles, esFirme, ETIQUETA_ESTADO, type AccionCita, type EstadoCita, type PapelVista } from './estados'
import { puede } from '../acceso/permisos'
import { atiendeCitas, type MapaCapacidades } from '../acceso/capacidades'

/**
 * Lo que cada quien puede ver de una cita.
 *
 * La API arma la respuesta según el papel de quien pregunta: un campo que no
 * le toca **no se manda**, en vez de mandarlo para que la pantalla lo esconda.
 * Ver docs/permissions.md.
 */

/** La fila tal como está en `citas`. */
export type CitaFila = {
  id: string
  propiedad_id: string | null
  cliente_uid: string
  asesor_uid: string
  inicio: string
  fin: string
  margen_min: number
  ocupa_desde: string
  ocupa_hasta: string
  zona_horaria: string
  estado: EstadoCita
  estado_previo: EstadoCita | null
  version: number
  propuesta_inicio: string | null
  propuesta_fin: string | null
  propuesta_por: 'cliente' | 'asesor' | 'admin' | null
  cliente_nombre: string
  cliente_telefono: string
  cliente_email: string | null
  consentimiento_version: string
  consentimiento_en: string
  propiedad_titulo: string | null
  lugar: string | null
  notas_cliente: string | null
  notas_internas: string | null
  motivo_cancelacion: string | null
  google_event_id: string | null
  google_sync: 'no_aplica' | 'pendiente' | 'ok' | 'error' | 'desincronizada'
  google_error: string | null
  google_intentos: number
  clave_idempotencia: string | null
  creada_por: string
  creada_en: string
  actualizada_en: string
  /** `solicitada`: la pidió un cliente. `propia`: un publicador, asociado o miembro del equipo la agendó para ir a ver la propiedad. */
  tipo: 'solicitada' | 'propia'
  /** Dueño de la propiedad al crear la cita: la VE (sin acciones); la gestiona el responsable (D-1). */
  propietario_uid: string | null
}

/** Lo público de la propiedad, para pintar la tarjeta. */
export type PropiedadDeCita = {
  id: string
  titulo: string
  tipo: string | null
  ruta: string | null
  foto: string | null
}

export type CitaVista = {
  id: string
  version: number
  estado: EstadoCita
  etiqueta: string
  papel: PapelVista
  tipo: CitaFila['tipo']
  /** La cita está acordada y aparta horario (confirmada, o con un cambio pedido sobre una confirmada). Solo entonces es un evento de calendario. */
  firme: boolean
  /**
   * Una solicitud PENDIENTE cuyo horario ya ocupa otra cita confirmada del mismo responsable (D-2/D-12): ya no se puede
   * confirmar; se ofrecen alternativas o se rechaza. Solo lo calcula el servicio para quien atiende; nunca para el cliente.
   */
  conflicto?: boolean
  inicio: string
  fin: string
  zona: string
  lugar: string | null
  propiedad: PropiedadDeCita | null
  propuesta: { inicio: string; fin: string; por: 'cliente' | 'asesor' | 'admin' } | null
  cliente: { nombre: string; telefono?: string; email?: string | null }
  asesor: { nombre: string | null; telefono?: string | null }
  notasCliente: string | null
  notasInternas?: string | null
  motivoCancelacion: string | null
  google?: { estado: CitaFila['google_sync']; error: string | null }
  acciones: AccionCita[]
  creadaEn: string
  actualizadaEn: string
}

export type Extras = {
  propiedad: PropiedadDeCita | null
  asesorNombre: string | null
  asesorTelefono: string | null
  /**
   * Presente sólo cuando quien mira es un PUBLICADOR en el papel de asesor
   * (ADR-0013). Sin él, la vista es la de siempre (equipo o cliente).
   *
   *  · `verInteresado`: si NO tiene `ver_datos_interesado`, nombre, teléfono,
   *    correo y notas del interesado **no se mandan** (no se mandan para que la
   *    pantalla los esconda: se omiten aquí).
   *  · Las notas internas y el estado de Google son del equipo: no los recibe.
   *  · `puedeAccion`: sólo se ofrecen las acciones para las que tiene permiso.
   */
  publicador?: { verInteresado: boolean; puedeAccion: (a: AccionCita) => boolean }
  /**
   * Presente sólo cuando quien mira es el PROPIETARIO de la propiedad y no la atiende (D-1): solo lectura.
   * Sin `verInteresado` (permiso `ver_datos_interesado`, apagado por defecto) no se manda nombre, teléfono, correo ni notas.
   */
  propietario?: { verInteresado: boolean }
}

/**
 * Qué papel tiene esta persona en esta cita, o null si no tiene nada que ver.
 *
 * Orden: admin > asesor (responsable) > cliente (quien va a la visita) > propietario (solo lectura).
 * El PROPIETARIO es el dueño de la propiedad que no la atiende: ve la cita, no la gestiona (D-1).
 */
export function papelEn(
  cita: Pick<CitaFila, 'cliente_uid' | 'asesor_uid'> & { propietario_uid?: string | null },
  perfil: { uid: string; rol: 'cliente' | 'publicador' | 'admin'; capacidades?: Partial<MapaCapacidades> },
): PapelVista | null {
  if (puede(perfil, 'citas.ver_todas')) return 'admin'
  // Asesor: el equipo, o un publicador CON `recibir_citas`. Quien dejó de poder
  // atender citas (rol cambiado, permiso apagado) no las ve como asesor.
  if (perfil.uid === cita.asesor_uid && atiendeCitas(perfil)) return 'asesor'
  if (perfil.uid === cita.cliente_uid) return 'cliente'
  // Solo un publicador es «propietario» en este sentido; falla cerrado para cualquier otro rol.
  if (perfil.rol === 'publicador' && cita.propietario_uid && perfil.uid === cita.propietario_uid) return 'propietario'
  return null
}

export function recortar(fila: CitaFila, papel: PapelVista, extras: Extras, ahora: Date): CitaVista {
  const equipo = papel === 'asesor' || papel === 'admin'
  const pub = papel === 'asesor' ? extras.publicador : undefined
  const prop = papel === 'propietario' ? (extras.propietario ?? { verInteresado: false }) : undefined
  const verInteresado = prop ? prop.verInteresado : !pub || pub.verInteresado
  // ASOCIADO que ATIENDE la cita (tabla del dueño, 6-nov-2026): ve lo NECESARIO para coordinar la visita: nombre, teléfono y las notas que la persona escribió para ella (lo que aceptó compartir
  // con la casilla de la tarjeta). El CORREO y todo lo demás siguen con el permiso `ver_datos_interesado`; nunca ve las notas internas del equipo ni el estado de Google. El PROPIETARIO que no atiende
  // (publicador: lo coordina VIVE BIEN) no ve ningún dato personal salvo ese mismo permiso.
  const contactoBasico = papel === 'asesor' && !!pub
  // El propietario no tiene ninguna acción: las solicitudes de sus propiedades las administra VIVE BIEN.
  const acciones = papel === 'propietario' ? [] : accionesDisponibles(fila, papel, ahora)
  return {
    id: fila.id,
    version: fila.version,
    estado: fila.estado,
    etiqueta: ETIQUETA_ESTADO[fila.estado],
    papel,
    tipo: fila.tipo,
    firme: esFirme(fila),
    inicio: fila.inicio,
    fin: fila.fin,
    zona: fila.zona_horaria,
    lugar: fila.lugar,
    propiedad: extras.propiedad ?? (fila.propiedad_titulo
      ? { id: fila.propiedad_id ?? '', titulo: fila.propiedad_titulo, tipo: null, ruta: null, foto: null }
      : null),
    propuesta: fila.propuesta_inicio && fila.propuesta_fin && fila.propuesta_por
      ? { inicio: fila.propuesta_inicio, fin: fila.propuesta_fin, por: fila.propuesta_por }
      : null,
    // El cliente ve sus propios datos; el equipo, los que el cliente aceptó compartir.
    cliente: verInteresado
      ? { nombre: fila.cliente_nombre, telefono: fila.cliente_telefono, email: fila.cliente_email }
      : contactoBasico ? { nombre: fila.cliente_nombre, telefono: fila.cliente_telefono } : { nombre: 'Interesado' },
    // El cliente sólo ve el nombre del asesor; el contacto es el de Vive Bien.
    asesor: equipo
      ? { nombre: extras.asesorNombre, telefono: extras.asesorTelefono }
      : { nombre: extras.asesorNombre },
    notasCliente: verInteresado || contactoBasico ? fila.notas_cliente : null,
    ...(equipo && !pub ? { notasInternas: fila.notas_internas } : {}),
    motivoCancelacion: fila.motivo_cancelacion,
    ...(equipo && !pub ? { google: { estado: fila.google_sync, error: fila.google_error } } : {}),
    acciones: pub ? acciones.filter(pub.puedeAccion) : acciones,
    creadaEn: fila.creada_en,
    actualizadaEn: fila.actualizada_en,
  }
}
