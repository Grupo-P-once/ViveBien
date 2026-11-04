import { urlDe } from '../sitio'
import { NEGOCIO } from '../config/negocio'
import type { FilaPropiedadPortal } from '../portal/tarjeta'
import { enviarCorreo, type DbCorreo, type ResultadoEnvio } from './enviar'
import { cuentasDeCitas } from '../citas/asesores'
import { veDatosDelInteresado } from '../acceso/capacidades'
import { plantillaBajaCuenta, plantillaConsultaRespuesta, plantillaContactoWhatsApp, plantillaDisponibilidadFavorita, plantillaEstatusPropiedad, plantillaInvitacionEstado, plantillaNuevoInteresado, plantillaPropiedadEnRevision, plantillaPropiedadRecibida, plantillaPropiedadRechazada, plantillaPublicadorPublicada, type Correo, type EstatusAviso } from './plantillas'
import { aTarjetaCorreo } from './recomendaciones'
import { normalizarCorreo } from './seguridad'
import { urlPreferencias } from './suscripcion'

/**
 * Correos de EVENTOS dirigidos a una cuenta (4-nov-2026): propiedad recibida, en revisión, publicada y rechazada, y los que siguen en este módulo.
 *
 * Reglas (las mismas de la bienvenida y la solicitud de publicador, `transaccionales.ts`):
 *  · solo al correo VERIFICADO de la cuenta destinataria (columnas `usuarios.email_verificado` y `email_verificado_para`, migración 69: la marca vale solo para la dirección verificada), con la cuenta activa. Quien dispara el evento puede ser otra persona
 *    (un administrador, un visitante): su sesión nunca decide a dónde va el correo ni si está verificado;
 *  · una sola vez por hecho: clave idempotente `propiedad/<id>/<estado>/<versión del hecho>`; un reintento o un doble clic no duplican;
 *  · sin la migración, sin la marca o con la cuenta suspendida no sale nada (falla cerrado) y el flujo que lo dispara sigue igual;
 *  · apagados por defecto (`CORREO_TRANSACCIONAL`) y bajo la compuerta `CORREO_ENVIO`: esas reglas viven en `enviarCorreo`;
 *  · un fallo NUNCA tumba el flujo que lo dispara (se llama con `despuesDeResponder`).
 */

export type Persona = { uid: string; correo: string; nombre: string | null }

/** La persona destinataria de un correo de evento, o `null` si no se le puede escribir (sin cuenta, suspendida, correo sin verificar o migración 69 sin aplicar). */
export async function personaVerificada(db: DbCorreo, uid: string | null | undefined): Promise<Persona | null> {
  if (!uid || typeof uid !== 'string') return null
  try {
    const { data, error } = await db.from('usuarios').select('uid, email, nombre, estado, email_verificado, email_verificado_para').eq('uid', uid).maybeSingle()
    if (error || !data) return null
    const f = data as { email?: unknown; nombre?: unknown; estado?: unknown; email_verificado?: unknown; email_verificado_para?: unknown }
    if (f.email_verificado !== true) return null
    if (typeof f.estado === 'string' && f.estado !== 'activo') return null
    const correo = normalizarCorreo(typeof f.email === 'string' ? f.email : null)
    if (!correo) return null
    // La verificación vale SOLO para la dirección que se verificó: si el correo de la cuenta cambió después, la marca vieja no sirve.
    if (normalizarCorreo(typeof f.email_verificado_para === 'string' ? f.email_verificado_para : null) !== correo) return null
    return { uid, correo, nombre: typeof f.nombre === 'string' && f.nombre.trim() ? f.nombre : null }
  } catch {
    return null
  }
}

type Opciones = Parameters<typeof enviarCorreo>[2]

/** Arma y manda UN correo transaccional a la cuenta `uid`. Nunca lanza. */
export async function mandarAPersona(db: DbCorreo, o: { uid: string | null | undefined; clave: string; tipo: string; armar: (p: Persona) => Correo }, opciones: Opciones = {}): Promise<ResultadoEnvio> {
  const persona = await personaVerificada(db, o.uid)
  if (!persona) return { estado: 'omitido', motivo: 'correo_sin_verificar' }
  try {
    return await enviarCorreo(db, { clave: o.clave, categoria: 'transaccional', tipo: o.tipo, para: persona.correo, ...o.armar(persona) }, opciones)
  } catch {
    console.error('[correo] un correo de evento falló sin afectar el flujo', o.tipo)
    return { estado: 'error', motivo: 'excepcion' }
  }
}

export type EventoPropiedad = 'recibida' | 'en_revision' | 'publicada' | 'rechazada' | 'cambios_solicitados'

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Avisa al DUEÑO de una propiedad de lo que pasó con ella. `prop` es la fila completa (`select('*')`); `version` identifica el hecho (la fecha de envío, de publicación o de revisión) para
 * que volver a mandar a revisión después de cambios sí avise de nuevo y un reintento no duplique.
 */
export async function avisarPropiedad(db: DbCorreo, o: { evento: EventoPropiedad; prop: Record<string, unknown>; version: string; motivo?: string | null }, opciones: Opciones = {}): Promise<ResultadoEnvio> {
  const id = texto(o.prop.id)
  if (!id) return { estado: 'omitido', motivo: 'sin_propiedad' }
  const propiedad = aTarjetaCorreo(o.prop as unknown as FilaPropiedadPortal)
  const folio = texto(o.prop.folio) || id.slice(0, 8).toUpperCase()
  const panel = urlDe('/portal/mis-propiedades')
  const version = o.version.replace(/[^0-9A-Za-z:.+-]/g, '').slice(0, 40) || '1'
  const base = `propiedad/${id}/${o.evento}`
  const armar: Record<EventoPropiedad, { clave: string; tipo: string; armar: (p: Persona) => Correo }> = {
    recibida: { clave: base, tipo: 'propiedad_recibida', armar: (p) => plantillaPropiedadRecibida({ nombre: p.nombre, propiedad, folio, porcentaje: Number(o.prop.completitud) || 0, urlPanel: urlDe(`/portal/mis-propiedades/${id}/editar`) }) },
    en_revision: { clave: `${base}/${version}`, tipo: 'propiedad_en_revision', armar: (p) => plantillaPropiedadEnRevision({ nombre: p.nombre, propiedad, folio, urlPanel: panel }) },
    publicada: { clave: `${base}/${version}`, tipo: 'propiedad_aprobada', armar: (p) => plantillaPublicadorPublicada({ nombre: p.nombre, propiedad, folio, urlPanel: panel }) },
    rechazada: { clave: `${base}/${version}`, tipo: 'propiedad_rechazada', armar: (p) => plantillaPropiedadRechazada({ nombre: p.nombre, propiedad, folio, motivo: o.motivo ?? '', pideCambios: false, urlEditar: urlDe(`/portal/mis-propiedades/${id}/editar`) }) },
    cambios_solicitados: { clave: `${base}/${version}`, tipo: 'propiedad_rechazada', armar: (p) => plantillaPropiedadRechazada({ nombre: p.nombre, propiedad, folio, motivo: o.motivo ?? '', pideCambios: true, urlEditar: urlDe(`/portal/mis-propiedades/${id}/editar`) }) },
  }
  const e = armar[o.evento]
  return mandarAPersona(db, { uid: texto(o.prop.owner_id) || null, clave: e.clave, tipo: e.tipo, armar: e.armar }, opciones)
}

/**
 * «Recibimos tu consulta»: a QUIEN consultó, solo al correo de su SESIÓN y solo si está verificado (nunca al que escribió en el formulario: sería una vía para mandarle correo a un tercero).
 * El contacto lo atiende el equipo de VIVE BIEN (el dueño no recibe los datos), así que el correo dice «VIVE BIEN» y no el nombre del dueño.
 */
export async function avisarConsultaRecibida(db: DbCorreo, o: { solicitudId: string | number; propiedadId: string; correo: string | null | undefined; verificado: boolean | undefined; nombre?: string | null }, opciones: Opciones = {}): Promise<ResultadoEnvio> {
  const correo = normalizarCorreo(o.correo)
  if (!correo || o.verificado !== true) return { estado: 'omitido', motivo: 'correo_sin_verificar' }
  try {
    const { data } = await db.from('propiedades').select('*').eq('id', o.propiedadId).maybeSingle()
    if (!data) return { estado: 'omitido', motivo: 'sin_propiedad' }
    const c = plantillaConsultaRespuesta({ nombre: o.nombre, propiedad: aTarjetaCorreo(data as unknown as FilaPropiedadPortal), anunciante: 'VIVE BIEN', similares: [], urlConsultas: urlDe('/portal/consultas'), urlCatalogo: urlDe('/propiedades'), urlPreferencias: urlPreferencias() })
    return await enviarCorreo(db, { clave: `consulta/${o.solicitudId}`, categoria: 'transaccional', tipo: 'consulta_respuesta', para: correo, ...c }, opciones)
  } catch {
    console.error('[correo] la confirmación de consulta falló sin afectar la solicitud')
    return { estado: 'error', motivo: 'excepcion' }
  }
}

/**
 * «Hay un nuevo interesado»: al DUEÑO de la propiedad, solo si es un publicador con el permiso `ver_datos_interesado` (si no puede ver ni atender la consulta, el correo no le sirve y
 * la atiende el equipo). El correo no lleva datos de la persona. Una sola vez por consulta.
 */
export async function avisarNuevoInteresado(db: DbCorreo, o: { solicitudId: string | number; propiedadId: string; canal: string }, opciones: Opciones = {}): Promise<ResultadoEnvio> {
  try {
    const { data } = await db.from('propiedades').select('*').eq('id', o.propiedadId).maybeSingle()
    const prop = data as Record<string, unknown> | null
    const dueno = texto(prop?.owner_id)
    if (!prop || !dueno) return { estado: 'omitido', motivo: 'sin_dueno' }
    const cuenta = (await cuentasDeCitas(db as never, [dueno])).get(dueno)
    if (!cuenta || cuenta.rol !== 'publicador' || !veDatosDelInteresado(cuenta)) return { estado: 'omitido', motivo: 'sin_permiso_para_ver_interesado' }
    return await mandarAPersona(db, { uid: dueno, clave: `consulta/${o.solicitudId}/dueno`, tipo: 'nuevo_interesado', armar: (p) => plantillaNuevoInteresado({ nombre: p.nombre, propiedad: aTarjetaCorreo(prop as unknown as FilaPropiedadPortal), canal: o.canal, urlPanel: urlDe('/portal/consultas') }) }, opciones)
  } catch {
    console.error('[correo] el aviso de nuevo interesado falló sin afectar la solicitud')
    return { estado: 'error', motivo: 'excepcion' }
  }
}

/**
 * Confirmación de la baja de cuenta. Se manda al correo y al nombre de la SESIÓN (la cuenta ya no existirá cuando salga), solo si el correo está verificado, y una vez por cuenta.
 * La baja ya olvidó el rastro de correo de la persona (`olvidarCorreoDeCuenta`): este envío registra únicamente la huella de la dirección, como todos.
 */
export async function avisarBajaDeCuenta(db: DbCorreo, o: { uid: string; correo: string | null | undefined; verificado: boolean | undefined; nombre?: string | null }, opciones: Opciones = {}): Promise<ResultadoEnvio> {
  const correo = normalizarCorreo(o.correo)
  if (!correo || o.verificado !== true) return { estado: 'omitido', motivo: 'correo_sin_verificar' }
  try {
    const fecha = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
    const c = plantillaBajaCuenta({ nombre: o.nombre, fecha, urlAyuda: urlDe('/ayuda') })
    return await enviarCorreo(db, { clave: `baja/${o.uid}/titular`, categoria: 'transaccional', tipo: 'baja_cuenta', para: correo, ...c }, opciones)
  } catch {
    console.error('[correo] la confirmación de baja falló sin afectar la baja')
    return { estado: 'error', motivo: 'excepcion' }
  }
}

/**
 * «Contacto por WhatsApp»: a QUIEN pulsó el botón (portal con sesión), solo al correo verificado de su sesión, con los datos de VIVE BIEN (el contacto lo atiende el equipo; nunca el
 * teléfono ni el nombre del dueño). Una sola vez por persona y propiedad: pulsar otra vez el botón no repite el correo.
 */
export async function avisarContactoWhatsApp(db: DbCorreo, o: { uid: string; propiedadId: string; correo: string | null | undefined; verificado: boolean | undefined; nombre?: string | null }, opciones: Opciones = {}): Promise<ResultadoEnvio> {
  const correo = normalizarCorreo(o.correo)
  if (!correo || o.verificado !== true) return { estado: 'omitido', motivo: 'correo_sin_verificar' }
  try {
    const { data } = await db.from('propiedades').select('*').eq('id', o.propiedadId).maybeSingle()
    const prop = data as Record<string, unknown> | null
    if (!prop) return { estado: 'omitido', motivo: 'sin_propiedad' }
    const c = plantillaContactoWhatsApp({
      nombre: o.nombre,
      propiedad: aTarjetaCorreo(prop as unknown as FilaPropiedadPortal),
      anunciante: { nombre: NEGOCIO.nombreCorto, telefono: NEGOCIO.telefonoInternacional, codigo: texto(prop.folio) || null },
      similares: [],
      urlCatalogo: urlDe('/propiedades'),
      urlPreferencias: urlPreferencias(),
    })
    return await enviarCorreo(db, { clave: `whatsapp/${o.uid}/${o.propiedadId}`, categoria: 'transaccional', tipo: 'contacto_whatsapp', para: correo, ...c }, opciones)
  } catch {
    console.error('[correo] el correo de contacto por WhatsApp falló sin afectar el contacto')
    return { estado: 'error', motivo: 'excepcion' }
  }
}

const ESTATUS_AVISABLES: readonly EstatusAviso[] = ['pausada', 'vendida', 'rentada', 'disponible']
export const estatusAvisable = (v: unknown): v is EstatusAviso => typeof v === 'string' && (ESTATUS_AVISABLES as readonly string[]).includes(v)

/** Tope de personas avisadas por un cambio de estatus (una propiedad con muchísimas guardadas no agota el cupo diario). */
export const MAX_AVISOS_DE_DISPONIBILIDAD = 50

/** Al DUEÑO: su propiedad se pausó, se marcó vendida o rentada, o volvió a estar disponible. `version` distingue un cambio de otro (la hora del cambio). */
export async function avisarEstatusPropiedad(db: DbCorreo, o: { prop: Record<string, unknown>; estatus: EstatusAviso; version: string }, opciones: Opciones = {}): Promise<ResultadoEnvio> {
  const id = texto(o.prop.id)
  if (!id) return { estado: 'omitido', motivo: 'sin_propiedad' }
  const propiedad = aTarjetaCorreo(o.prop as unknown as FilaPropiedadPortal)
  const folio = texto(o.prop.folio) || id.slice(0, 8).toUpperCase()
  const version = o.version.replace(/[^0-9A-Za-z:.+-]/g, '').slice(0, 40) || '1'
  return mandarAPersona(db, { uid: texto(o.prop.owner_id) || null, clave: `propiedad/${id}/estatus/${o.estatus}/${version}`, tipo: 'propiedad_estatus', armar: (p) => plantillaEstatusPropiedad({ nombre: p.nombre, propiedad, folio, estatus: o.estatus, urlPanel: urlDe('/portal/mis-propiedades') }) }, opciones)
}

/**
 * A quienes GUARDARON la propiedad (favoritos): cambió su disponibilidad. Solo a quien activó los avisos de propiedades guardadas (`preferencias_notificacion.correo_precio`, apagado por
 * omisión), con correo verificado, sin el dueño, y a lo sumo `MAX_AVISOS_DE_DISPONIBILIDAD` personas por cambio. Cada persona recibe un solo correo por cambio.
 */
export async function avisarDisponibilidadDeFavorita(db: DbCorreo, o: { prop: Record<string, unknown>; estatus: EstatusAviso; version: string }, opciones: Opciones = {}): Promise<{ enviados: number; omitidos: number }> {
  const id = texto(o.prop.id)
  const resumen = { enviados: 0, omitidos: 0 }
  if (!id) return resumen
  try {
    const fav = await db.from('favoritos').select('uid').eq('propiedad_id', id).limit(500)
    const uids = [...new Set(((fav.data ?? []) as Array<{ uid?: unknown }>).map((f) => texto(f.uid)).filter((u) => u && u !== texto(o.prop.owner_id)))]
    if (fav.error || uids.length === 0) return resumen
    const pref = await db.from('preferencias_notificacion').select('uid, correo_precio').in('uid', uids).eq('correo_precio', true)
    if (pref.error) return resumen
    const quieren = ((pref.data ?? []) as Array<{ uid?: unknown }>).map((p) => texto(p.uid)).filter(Boolean).slice(0, MAX_AVISOS_DE_DISPONIBILIDAD)
    const propiedad = aTarjetaCorreo(o.prop as unknown as FilaPropiedadPortal)
    const version = o.version.replace(/[^0-9A-Za-z:.+-]/g, '').slice(0, 40) || '1'
    for (const uid of quieren) {
      const r = await mandarAPersona(db, { uid, clave: `favorita/${id}/${o.estatus}/${version}/${uid}`, tipo: 'aviso_disponibilidad', armar: (p) => plantillaDisponibilidadFavorita({ nombre: p.nombre, propiedad, estatus: o.estatus, similares: [], urlFavoritos: urlDe('/portal/propiedades'), urlCatalogo: urlDe('/propiedades'), urlPreferencias: urlPreferencias() }) }, opciones)
      if (r.estado === 'enviado') resumen.enviados++
      else resumen.omitidos++
    }
  } catch {
    console.error('[correo] el aviso de disponibilidad falló sin afectar el cambio')
  }
  return resumen
}

/** A QUIEN INVITÓ: la invitación se aceptó o se canceló. No se avisa a quien hizo la acción (ya lo sabe). `invitadoPor` es el uid de quien invitó. */
export async function avisarInvitacion(db: DbCorreo, o: { invitacionId: string | number; estado: 'aceptada' | 'cancelada'; correoInvitado: string; rol: string; invitadoPor: string | null | undefined; actorUid?: string | null }, opciones: Opciones = {}): Promise<ResultadoEnvio> {
  if (!o.invitadoPor || o.invitadoPor === o.actorUid) return { estado: 'omitido', motivo: 'sin_destinatario' }
  return mandarAPersona(db, { uid: o.invitadoPor, clave: `invitacion/${o.invitacionId}/${o.estado}`, tipo: 'invitacion_estado', armar: (p) => plantillaInvitacionEstado({ nombre: p.nombre, correoInvitado: o.correoInvitado, rol: o.rol, estado: o.estado, urlPanel: urlDe('/admin/usuarios') }) }, opciones)
}
