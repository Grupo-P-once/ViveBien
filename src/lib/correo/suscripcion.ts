import { urlDe } from '../sitio'
import { CORREO, entornoCorreo, SECRETO_MINIMO, TEXTO_CONSENTIMIENTO_MARKETING, VERSION_CONSENTIMIENTO_MARKETING, type EntornoCorreo } from './config'
import { TIPOS_RECOMENDACION } from './constantes'
import { enviarCorreo, type DbCorreo } from './enviar'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '../portal/tarjeta'
import { plantillaPrimerasPropiedades } from './plantillas'
import { aTarjetaCorreo, elegirPropiedades, leerPreferencias, resumenDe, type Preferencias } from './recomendaciones'
import { crearEnlace, leerEnlace, normalizarCorreo } from './seguridad'

/**
 * Suscripción, confirmación y baja (D-80). La LÓGICA vive en la base (funciones atómicas `correo_*`, probadas en PGlite);
 * aquí sólo se validan las entradas, se firman los enlaces y se manda el correo de confirmación.
 */

export { TEXTO_CONSENTIMIENTO_MARKETING, VERSION_CONSENTIMIENTO_MARKETING }

const secretoValido = (e: EntornoCorreo) => e.secreto.length >= SECRETO_MINIMO

export const urlBaja = (secreto: string, id: string) => urlDe(`/correo/baja#t=${encodeURIComponent(crearEnlace(secreto, 'baja', id))}`)
/** Para la cabecera de baja con un clic: un POST directo, sin página ni sesión. */
export const urlBajaUnClic = (secreto: string, id: string) => urlDe(`/api/correo/baja?t=${encodeURIComponent(crearEnlace(secreto, 'baja', id))}`)
export const urlPreferencias = () => urlDe('/portal/configuracion')

async function rpc(db: DbCorreo, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.rpc(fn, args)
  if (error || !data || typeof data !== 'object') return null
  return data as Record<string, unknown>
}

/** Lo que se acepta del formulario público; todo lo demás se descarta. */
export function leerFormulario(cuerpo: unknown): { correo: string | null; nombre: string | null; prefs: Preferencias; acepto: boolean; fuente: string } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const lista = (v: unknown) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : Array.isArray(v) ? v : [])
  const prefs = leerPreferencias({
    operacion: c.operacion,
    // Sólo los tipos que ofrece el formulario (el cuerpo lo puede escribir cualquiera).
    tipos: lista(c.tipos ?? c.tipo).filter((x): x is string => typeof x === 'string' && TIPOS_RECOMENDACION.some(([k]) => k === x.trim().toLowerCase())).map((x) => x.trim().toLowerCase()),
    zonas: lista(c.zonas ?? c.zona),
    presupuestoMax: c.presupuestoMax ?? c.presupuesto,
  })
  const fuentesOk = ['recomendaciones', 'pie', 'portada', 'ficha', 'catalogo']
  return {
    correo: normalizarCorreo(c.correo ?? c.email),
    nombre: texto(c.nombre, 120) || null,
    prefs,
    // Casilla EXPRESA y separada: sólo el booleano `true` cuenta (ni «on», ni «1», ni un valor por omisión).
    acepto: c.acepto === true,
    fuente: fuentesOk.includes(String(c.fuente)) ? String(c.fuente) : 'recomendaciones',
  }
}

export type ResultadoSuscribir = { ok: boolean; motivo?: 'invalido' | 'sin_consentimiento' | 'apagado' | 'error' }

/**
 * Registra la solicitud y manda el correo de confirmación. La respuesta a la persona es SIEMPRE la misma si todo es válido
 * (exista o no el correo, esté suprimido o ya activo): así el formulario no sirve para averiguar quién está en la lista.
 */
export async function suscribirVisitante(db: DbCorreo, cuerpo: unknown, o: { entorno?: EntornoCorreo; fetch?: typeof fetch; ahoraMs?: number } = {}): Promise<ResultadoSuscribir> {
  const env = o.entorno ?? entornoCorreo()
  if (!env.marketing || !secretoValido(env)) return { ok: false, motivo: 'apagado' }
  const f = leerFormulario(cuerpo)
  if (!f.correo) return { ok: false, motivo: 'invalido' }
  if (!f.acepto) return { ok: false, motivo: 'sin_consentimiento' }

  const r = await rpc(db, 'correo_suscribir', {
    p_email: f.correo,
    p_nombre: f.nombre,
    p_prefs: f.prefs,
    p_fuente: f.fuente,
    p_version: VERSION_CONSENTIMIENTO_MARKETING,
  })
  if (!r) return { ok: false, motivo: 'error' }

  if (r.accion === 'confirmar' && typeof r.id === 'string') {
    const ahora = o.ahoraMs ?? Date.now()
    const expira = ahora + CORREO.expiraConfirmacionDias * 86_400_000
    // Primero se entrega VALOR: las propiedades reales que encajan, ya. El «sí, quiero seguir recibiéndolas» va al final de ese correo.
    // Un catálogo que no se pueda leer no impide crear la alerta: se manda el aviso sin propiedades.
    const cat = await db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(500)
    const catalogo = cat.error ? [] : ((cat.data ?? []) as FilaPropiedadPortal[])
    const elegidas = elegirPropiedades(f.prefs, catalogo, new Set(), CORREO.propiedadesPorCorreo)
    const plantilla = plantillaPrimerasPropiedades({
      nombre: f.nombre,
      resumen: resumenDe(f.prefs),
      propiedades: elegidas.map(aTarjetaCorreo),
      urlConfirmar: urlDe(`/correo/confirmar#t=${encodeURIComponent(crearEnlace(env.secreto, 'confirmar', r.id, expira))}`),
      urlBaja: urlBaja(env.secreto, r.id),
      diasValidez: CORREO.expiraConfirmacionDias,
    })
    // Como mucho UN correo inicial por persona y día, aunque alguien pulse el botón diez veces.
    const dia = new Date(ahora).toISOString().slice(0, 10)
    await enviarCorreo(
      db,
      { clave: `inicial/${r.id}/${dia}`, categoria: 'transaccional', tipo: 'primeras_propiedades', para: f.correo, ...plantilla, suscriptorId: r.id, propiedades: elegidas.map((x) => x.id), urlBaja: urlBajaUnClic(env.secreto, r.id) },
      // Es la respuesta a lo que la persona pidió (transaccional), pero depende de la bandera de marketing: sin ella no existe el formulario.
      { entorno: { ...env, transaccional: true }, fetch: o.fetch },
    )
  }
  return { ok: true }
}

export async function confirmarSuscripcion(db: DbCorreo, token: unknown, o: { entorno?: EntornoCorreo; ahoraMs?: number } = {}): Promise<{ estado: 'activa' | 'invalido' | 'bloqueada' | 'error' }> {
  const env = o.entorno ?? entornoCorreo()
  if (!secretoValido(env)) return { estado: 'error' }
  const t = leerEnlace(env.secreto, 'confirmar', token, o.ahoraMs)
  if (!t) return { estado: 'invalido' }
  const r = await rpc(db, 'correo_confirmar', { p_id: t.id })
  if (!r) return { estado: 'error' }
  if (r.estado === 'activa') return { estado: 'activa' }
  if (r.estado === 'bloqueada') return { estado: 'bloqueada' }
  return { estado: 'invalido' }
}

/** La baja NO depende de ninguna bandera ni de presupuesto: siempre debe poder ejecutarse. */
export async function darDeBaja(db: DbCorreo, token: unknown, o: { entorno?: EntornoCorreo } = {}): Promise<{ ok: boolean }> {
  const env = o.entorno ?? entornoCorreo()
  if (!secretoValido(env)) return { ok: false }
  const t = leerEnlace(env.secreto, 'baja', token)
  if (!t) return { ok: false }
  const r = await rpc(db, 'correo_baja', { p_id: t.id, p_motivo: 'enlace' })
  return { ok: !!r }
}

/** Cuenta con sesión (correo VERIFICADO): aceptar o retirar el marketing, aparte de haber creado la cuenta. */
export async function fijarMarketingDeCuenta(
  db: DbCorreo,
  cuenta: { uid: string; correo: string; verificado: boolean },
  decision: { aceptar: boolean; prefs?: Preferencias },
): Promise<{ estado: 'activa' | 'baja' | 'bloqueada' | 'invalido' | 'correo_sin_verificar' | 'error' }> {
  const correo = normalizarCorreo(cuenta.correo)
  if (!correo) return { estado: 'invalido' }
  // Retirar el marketing siempre se permite; aceptarlo exige un correo verificado (si no, cualquiera suscribiría a otra persona).
  if (decision.aceptar && !cuenta.verificado) return { estado: 'correo_sin_verificar' }
  const r = await rpc(db, 'correo_cuenta_marketing', {
    p_uid: cuenta.uid,
    p_email: correo,
    p_aceptar: decision.aceptar,
    p_prefs: decision.prefs ?? {},
    p_version: decision.aceptar ? VERSION_CONSENTIMIENTO_MARKETING : null,
  })
  if (!r) return { estado: 'error' }
  const e = String(r.estado)
  return { estado: e === 'activa' || e === 'baja' || e === 'bloqueada' ? e : 'invalido' }
}

/** Evento ya verificado del proveedor → la base lo aplica una sola vez. */
export type ResultadoEvento = 'aplicado' | 'pendiente' | 'duplicado' | 'ignorado' | 'sin_identidad' | 'descartado' | 'error'
export async function aplicarEventoProveedor(db: DbCorreo, svixId: string, evento: unknown): Promise<ResultadoEvento> {
  const e = (evento && typeof evento === 'object' ? evento : {}) as { type?: unknown; data?: Record<string, unknown> }
  const tipo = typeof e.type === 'string' ? e.type : ''
  // Aperturas y clics (email.opened / email.clicked) NO se guardan a propósito: el seguimiento es opcional en Resend, está apagado por omisión y es aproximado.
  if (!['email.bounced', 'email.complained', 'email.suppressed', 'email.delivered', 'email.failed'].includes(tipo)) return 'ignorado'
  const d = e.data ?? {}
  const para = Array.isArray(d.to) ? d.to[0] : d.to
  const bounce = (d.bounce && typeof d.bounce === 'object' ? d.bounce : {}) as Record<string, unknown>
  const permanente = String(bounce.type ?? '').toLowerCase() === 'permanent'
  const r = await rpc(db, 'correo_evento', {
    p_svix_id: svixId,
    p_tipo: tipo,
    p_email: normalizarCorreo(para) ?? '',
    p_resend_id: typeof d.email_id === 'string' ? d.email_id : null,
    p_rebote_permanente: permanente,
  })
  if (!r) return 'error'
  // «pendiente»: llegó antes de que el envío tuviera su resend_id (o es de otra aplicación): queda en cuarentena SIN efectos y se aplica al anotarse el ID (migración 67).
  // «sin_identidad»: no trae resend_id, no se puede atribuir. Todos responden 200 a Resend: no hay nada que reintentar.
  const x = String(r.resultado)
  return x === 'duplicado' || x === 'pendiente' || x === 'sin_identidad' || x === 'descartado' || x === 'ignorado' ? x : 'aplicado'
}
