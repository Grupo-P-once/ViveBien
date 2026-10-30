import { NEGOCIO } from './config/negocio'

/**
 * Reglas del contacto entre cliente y publicador.
 *
 * Compartir el teléfono de una persona con un tercero es una transferencia
 * de datos personales: hay que poder demostrar que hubo consentimiento y
 * de qué texto. Por eso la versión del aviso viaja con cada solicitud.
 */

/**
 * Versión del aviso de privacidad que el cliente acepta al contactar.
 *
 * Subir esta fecha cuando cambie el texto del aviso. Las solicitudes
 * viejas conservan la versión que aceptaron en su momento, que es
 * justamente lo que permite demostrar qué se consintió.
 */
export const VERSION_CONSENTIMIENTO = '2026-09-16'

/**
 * El texto exacto que se acepta, y que queda asociado a la versión.
 *
 * 2026-09-16 — empieza por «Acepto el aviso de privacidad», que es lo que la
 * persona reconoce de un vistazo. El texto anterior («…con el anunciante de
 * esta propiedad») sólo tenía sentido en la ficha, y se usaba también en el
 * formulario general y en el valuador, donde no hay anunciante.
 */
export const TEXTO_CONSENTIMIENTO =
  'Acepto el aviso de privacidad. Mis datos se usarán para atender mi ' +
  'solicitud y, si es sobre una propiedad, se compartirán con su anunciante.'

/** Ventana en la que dos solicitudes iguales se consideran la misma. */
export const MINUTOS_DEDUPE = 30

/** Máximo de solicitudes por cliente en una hora. */
export const LIMITE_POR_HORA = 5

/**
 * Normaliza a E.164 mexicano.
 *
 * Acepta lo que la gente escribe de verdad: con espacios, guiones,
 * paréntesis, con o sin lada, con o sin +52.
 * Devuelve null si no parece un número utilizable.
 */
export function normalizarTelefono(entrada: string): string | null {
  const digitos = (entrada || '').replace(/\D/g, '')
  if (!digitos) return null

  // Ya viene con código de país
  if (digitos.length === 12 && digitos.startsWith('52')) return `+${digitos}`
  // 52 + 1 + 10 dígitos: forma antigua de los móviles mexicanos
  if (digitos.length === 13 && digitos.startsWith('521')) return `+52${digitos.slice(3)}`
  // 10 dígitos nacionales
  if (digitos.length === 10) return `+52${digitos}`
  // Con 00 o + delante de otro país
  if (digitos.length > 10 && digitos.length <= 15) return `+${digitos}`

  return null
}

/**
 * El teléfono como se lee en México mientras se escribe: `(477) 810-8559`.
 *
 * Sólo cambia lo que se ve. Lo que se guarda son los dígitos: un número con
 * paréntesis y guiones rompería el enlace de WhatsApp (`wa.me/52…`), que
 * necesita dígitos a secas.
 *
 * Se formatea por tramos, para que el cursor no salte mientras se teclea:
 *   «477»         → «(477»
 *   «4778»        → «(477) 8»
 *   «4778108559»  → «(477) 810-8559»
 */
export function mascaraTelefono(entrada: string): string {
  const d = soloDigitosTelefono(entrada)
  if (!d) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/**
 * Los 10 dígitos nacionales de lo que se haya escrito o pegado.
 *
 * Quien pega «+52 477 810 8559» o «52 1 477…» no debe ver su número cortado
 * por la mitad: se quita el prefijo del país antes de tomar diez dígitos.
 */
export function soloDigitosTelefono(entrada: string): string {
  let d = (entrada || '').replace(/\D/g, '')
  if (d.length > 10 && d.startsWith('521')) d = d.slice(3)
  else if (d.length > 10 && d.startsWith('52')) d = d.slice(2)
  return d.slice(0, 10)
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type Validacion =
  | { ok: true; datos: { nombre: string; telefono: string; email: string; mensaje: string | null } }
  | { ok: false; motivo: string }

export function validarSolicitud(body: Record<string, unknown>): Validacion {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const telefonoBruto = typeof body.telefono === 'string' ? body.telefono : ''
  const mensaje = typeof body.mensaje === 'string' ? body.mensaje.trim().slice(0, 1000) : ''

  if (nombre.length < 2) return { ok: false, motivo: 'Escribe tu nombre.' }
  if (!RE_EMAIL.test(email)) return { ok: false, motivo: 'Revisa tu correo electrónico.' }

  const telefono = normalizarTelefono(telefonoBruto)
  if (!telefono) return { ok: false, motivo: 'Revisa tu teléfono: necesitamos 10 dígitos.' }

  if (body.consentimiento !== true) {
    return { ok: false, motivo: 'Necesitamos tu autorización para compartir tus datos con el anunciante.' }
  }

  return {
    ok: true,
    datos: { nombre: nombre.slice(0, 120), telefono, email: email.slice(0, 160), mensaje: mensaje || null },
  }
}

/* ── Dirección de contacto pública ──────────────────────────────
 *
 * Estaba escrita a mano en **siete sitios**, incluidos el aviso de privacidad y
 * los términos. Cuando `grupo.p.11.ee@gmail.com` desapareció al convertirse la
 * cuenta a Google Workspace, quedaron siete direcciones muertas repartidas por
 * producción — y dos de ellas eran el canal legal:
 *
 *   · Aviso de privacidad §5, **Derechos ARCO**: «para ejercerlos, envíe una
 *     solicitud a…», con promesa de responder en 20 días hábiles.
 *   · Términos: la solicitud de eliminación de datos.
 *
 * Bajo la LFPDPPP el canal para ejercer derechos ARCO tiene que funcionar. Un
 * buzón que rebota no es un canal.
 *
 * Ahora sale de una variable de entorno y cae a una dirección **del dominio
 * propio**: un correo en `vivebienn.com` sobrevive a que alguien cambie de
 * cuenta personal; un Gmail no.
 */
/**
 * La dirección oficial. **Constante, no variable de entorno**, y a propósito.
 *
 * Estuvo saliendo de `NEXT_PUBLIC_ADMIN_EMAIL`, y en Vercel esa variable
 * apuntaba a un Gmail personal. Resultado: el aviso de privacidad **en
 * producción** daba como canal ARCO una dirección que no era la oficial, y el
 * código «funcionaba» — respetaba la variable, sólo que la variable estaba mal.
 *
 * Una dirección legal no debe depender de que alguien se acuerde de actualizar
 * una variable. Es del dominio propio, así que sobrevive a los cambios de
 * cuenta personal que ya rompieron la anterior. Cambiarla es una línea aquí.
 */
export const CORREO_CONTACTO = NEGOCIO.email

/** `mailto:` con asunto opcional, ya codificado. */
export function mailtoDe(asunto?: string): string {
  return asunto
    ? `mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent(asunto)}`
    : `mailto:${CORREO_CONTACTO}`
}
