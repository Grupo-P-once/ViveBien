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
export const VERSION_CONSENTIMIENTO = '2026-09-09'

export const TEXTO_CONSENTIMIENTO =
  'Acepto que Vive Bien comparta mi nombre, teléfono y correo con el ' +
  'anunciante de esta propiedad para atender mi solicitud.'

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
export const CORREO_CONTACTO =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim() || 'joseponcer@vivebienn.com'

/** `mailto:` con asunto opcional, ya codificado. */
export function mailtoDe(asunto?: string): string {
  return asunto
    ? `mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent(asunto)}`
    : `mailto:${CORREO_CONTACTO}`
}
