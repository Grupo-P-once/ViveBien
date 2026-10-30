/**
 * Entrar con Google: las reglas, sin Firebase dentro (V-1.1.83).
 *
 * Aquí sólo se decide; `entrar-google.ts` ejecuta. Así cada caso —ventana
 * bloqueada, persona que cierra la ventana, navegador de Instagram— se prueba
 * sin navegador ni cuenta real.
 *
 * Lo que se aprendió del incidente (19–22 sep 2026):
 *  · La persona NUNCA ve un código de Firebase («auth/popup-blocked…»). Ve una
 *    frase que le dice qué hacer; el código va a la bitácora.
 *  · La ventana emergente (`signInWithPopup`) es el camino principal: funciona
 *    en todos los navegadores normales aunque bloqueen el almacenamiento de
 *    terceros.
 *  · La redirección (`signInWithRedirect`) SÓLO es fiable si el `authDomain`
 *    de Firebase es el mismo dominio del sitio (con el proxy `/__/auth/*` de
 *    next.config.ts). Con `vivebien-84685.firebaseapp.com`, Chrome 115+ y
 *    Safari 16.1+ separan el almacenamiento y el resultado se pierde en
 *    silencio: la persona vuelve de Google sin sesión. Por eso el plan B se
 *    enciende solo cuando el dominio coincide, y nunca antes.
 */

/** Lo que pasó al intentar entrar, ya traducido para la pantalla. */
export type ResultadoEntrada =
  | { estado: 'dentro' }
  | { estado: 'redirigiendo' }
  | { estado: 'cancelado' }
  | { estado: 'error'; motivo: MotivoError; mensaje: string }
  | { estado: 'navegador-incrustado'; app: string; mensaje: string }

export type MotivoError =
  | 'ventana-bloqueada'
  | 'no-disponible'
  | 'dominio-no-autorizado'
  | 'sesion-caducada'
  | 'sin-conexion'
  | 'demasiados-intentos'
  | 'cuenta-desactivada'
  | 'otra-forma-de-entrar'
  | 'desconocido'

/** Frases para la persona. Ninguna menciona códigos ni a Firebase. */
export const MENSAJES: Record<MotivoError, string> = {
  'ventana-bloqueada':
    'Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes para vivebienn.com y vuelve a intentarlo, o entra con tu correo.',
  'no-disponible':
    'Este navegador no permite entrar con Google. Abre vivebienn.com en Chrome o Safari, o entra con tu correo.',
  'dominio-no-autorizado':
    'Desde esta dirección no se puede entrar con Google. Entra desde https://vivebienn.com.',
  'sesion-caducada': 'Tu sesión caducó. Vuelve a entrar.',
  'sin-conexion': 'No hubo conexión con Google. Revisa tu internet e inténtalo otra vez.',
  'demasiados-intentos': 'Hubo demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.',
  'cuenta-desactivada': 'Esta cuenta está desactivada. Escríbenos y lo revisamos.',
  'otra-forma-de-entrar':
    'Ya tienes una cuenta con ese correo creada de otra forma. Entra con tu correo y contraseña.',
  desconocido: 'No se pudo entrar con Google. Inténtalo de nuevo en un momento.',
}

/**
 * Cerrar la ventana no es un error, pero se dice algo: Firebase también lo
 * reporta así cuando la ventana se cierra sola sin terminar.
 */
/**
 * «Sin conexión» para los flujos que NO son Google (correo y contraseña, alta,
 * recuperación). `MENSAJES['sin-conexion']` nombra a Google, que es correcto
 * cuando se estaba entrando con Google y absurdo cuando no.
 */
export const SIN_CONEXION = 'No hubo conexión. Revisa tu internet e inténtalo otra vez.'

export const MENSAJE_CANCELADO =
  'Se cerró la ventana de Google antes de terminar. Puedes intentarlo de nuevo cuando quieras.'

/** La persona cerró la ventana o la sustituyó por otra: no es un error. */
const CANCELACIONES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
  'auth/redirect-cancelled-by-user',
])

const MOTIVOS: Record<string, MotivoError> = {
  'auth/popup-blocked': 'ventana-bloqueada',
  'auth/operation-not-supported-in-this-environment': 'no-disponible',
  'auth/web-storage-unsupported': 'no-disponible',
  'auth/operation-not-allowed': 'no-disponible',
  'auth/unauthorized-domain': 'dominio-no-autorizado',
  'auth/invalid-oauth-client-id': 'dominio-no-autorizado',
  'auth/user-token-expired': 'sesion-caducada',
  'auth/id-token-expired': 'sesion-caducada',
  'auth/requires-recent-login': 'sesion-caducada',
  'auth/invalid-user-token': 'sesion-caducada',
  'auth/network-request-failed': 'sin-conexion',
  'auth/timeout': 'sin-conexion',
  'auth/too-many-requests': 'demasiados-intentos',
  'auth/user-disabled': 'cuenta-desactivada',
  'auth/account-exists-with-different-credential': 'otra-forma-de-entrar',
}

/** Casos en que la ventana no pudo abrirse y la redirección sí serviría. */
const PIDEN_REDIRECCION = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

export function codigoDe(error: unknown): string {
  const c = (error as { code?: unknown } | null)?.code
  return typeof c === 'string' ? c : ''
}

export function esCancelacion(codigo: string): boolean {
  return CANCELACIONES.has(codigo)
}

export function motivoDe(codigo: string): MotivoError {
  return MOTIVOS[codigo] ?? 'desconocido'
}

export function pideRedireccion(codigo: string): boolean {
  return PIDEN_REDIRECCION.has(codigo)
}

/**
 * ¿Es fiable la redirección aquí? Sólo si Firebase atiende en el mismo dominio
 * que la página (proxy `/__/auth/*`). Ver la cabecera del archivo.
 */
export function redireccionDisponible(authDomain: string | undefined | null, anfitrion: string): boolean {
  if (!authDomain || !anfitrion) return false
  return authDomain.trim().toLowerCase() === anfitrion.trim().toLowerCase()
}

/**
 * Navegadores metidos dentro de otra app (Instagram, Facebook, WhatsApp…).
 * Google no deja entrar desde muchos de ellos («disallowed_useragent») y casi
 * todos bloquean ventanas. Devuelve el nombre de la app, o `null`.
 *
 * Chrome Custom Tabs y SFSafariViewController NO aparecen aquí: son el
 * navegador real y dejan entrar normal.
 */
export function navegadorIncrustado(agente: string | undefined | null): string | null {
  const ua = agente ?? ''
  if (!ua) return null
  const reglas: Array<[RegExp, string]> = [
    [/Instagram/i, 'Instagram'],
    [/FBAN|FBAV|FB_IAB|FBIOS|FB4A|\[FB/i, 'Facebook'],
    [/Messenger|MessengerForiOS|Orca-Android/i, 'Messenger'],
    [/WhatsApp/i, 'WhatsApp'],
    [/musical_ly|TikTok|BytedanceWebview|Bytedance/i, 'TikTok'],
    [/LinkedInApp/i, 'LinkedIn'],
    [/Twitter|TwitterAndroid/i, 'X'],
    [/Snapchat/i, 'Snapchat'],
    [/Pinterest/i, 'Pinterest'],
    [/MicroMessenger/i, 'WeChat'],
    [/\bLine\//i, 'Line'],
    [/Telegram/i, 'Telegram'],
  ]
  for (const [re, app] of reglas) if (re.test(ua)) return app
  // Android WebView genérico: «; wv)» en el agente.
  if (/Android/i.test(ua) && /;\s*wv\)/i.test(ua)) return 'esta aplicación'
  // iOS WebView genérico: iPhone/iPad sin «Safari/» y sin navegadores conocidos.
  if (/iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) {
    return 'esta aplicación'
  }
  return null
}

export function mensajeIncrustado(app: string): string {
  return `Estás viendo vivebienn.com dentro de ${app}, y ahí Google no deja entrar. Ábrelo en Chrome o Safari: toca el menú (⋯) y elige «Abrir en el navegador», o copia el enlace.`
}

/** Traduce un error de Firebase al resultado que ve la pantalla. */
export function resultadoDeError(error: unknown): ResultadoEntrada {
  const codigo = codigoDe(error)
  if (esCancelacion(codigo)) return { estado: 'cancelado' }
  const motivo = motivoDe(codigo)
  return { estado: 'error', motivo, mensaje: MENSAJES[motivo] }
}

/**
 * Lo único que viaja a la bitácora: el código (no el mensaje de Firebase, que
 * a veces trae el correo), dónde pasó, qué navegador y si hubo plan B.
 */
export type RegistroAcceso = {
  codigo: string
  donde: string
  paso: 'ventana' | 'redireccion' | 'regreso'
  incrustado: string | null
  planB: boolean
}

const CODIGO_VALIDO = /^[a-z]+\/[a-z0-9-]{1,80}$/
const DONDE_VALIDO = /^[a-z0-9-]{1,30}$/

/** Limpia lo que llega a `/api/acceso/registro`: nada libre, todo acotado. */
export function registroValido(cuerpo: unknown): RegistroAcceso | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const c = cuerpo as Record<string, unknown>
  const codigo = typeof c.codigo === 'string' && CODIGO_VALIDO.test(c.codigo) ? c.codigo : 'desconocido/sin-codigo'
  const donde = typeof c.donde === 'string' && DONDE_VALIDO.test(c.donde) ? c.donde : null
  const paso = c.paso === 'ventana' || c.paso === 'redireccion' || c.paso === 'regreso' ? c.paso : null
  if (!donde || !paso) return null
  const incrustado = typeof c.incrustado === 'string' && /^[\p{L} ]{1,30}$/u.test(c.incrustado) ? c.incrustado : null
  return { codigo, donde, paso, incrustado, planB: c.planB === true }
}

/**
 * Crear cuenta con correo, en la misma pantalla que Google: tampoco aquí se
 * enseña «Firebase: Error (auth/email-already-in-use)».
 */
export function mensajeDeRegistro(error: unknown): string {
  // Admite el código suelto («auth/…») o el error entero de Firebase: los dos
  // sitios que la llaman pasaban cosas distintas y con el objeto nunca acertaba.
  const codigo = typeof error === 'string' ? error : codigoDe(error)
  switch (codigo) {
    case 'auth/email-already-in-use': return 'Ya existe una cuenta con ese correo. Entra en «Ingresar» o usa Google.'
    case 'auth/invalid-email': return 'Ese correo no parece válido. Revísalo.'
    case 'auth/weak-password': return 'La contraseña es muy corta: usa al menos 6 caracteres.'
    case 'auth/network-request-failed': return SIN_CONEXION
    case 'auth/too-many-requests': return MENSAJES['demasiados-intentos']
    default: return 'No se pudo crear la cuenta. Inténtalo de nuevo en un momento.'
  }
}

/**
 * Después de entrar en /dashboard: a dónde va cada quien.
 *
 * V-1.1.92 — la regla vive ahora en `acceso/destino-dashboard.ts`, junto a los
 * demás estados de esa pantalla. Aquí se reexporta para no romper a quien ya la
 * importaba, y sobre todo para que **no haya dos reglas que puedan discrepar**:
 * la que decide si se navega y la que decide qué se pinta son la misma.
 */
export { destinoTrasEntrar } from './destino-dashboard'

/**
 * Entrar con correo y contraseña. **Tiene su propia tabla, y no es un capricho.**
 *
 * Antes esto reutilizaba `mensajeDeAcceso`, que es la tabla de Google: como
 * `auth/invalid-credential` no está ahí, caía en «desconocido» y una contraseña
 * mal escrita respondía *«No se pudo entrar con Google»* a quien no había
 * tocado Google. Los códigos compartidos (sin conexión, demasiados intentos,
 * cuenta desactivada) siguen saliendo de `MENSAJES`: no se duplican.
 *
 * Firebase devuelve `auth/invalid-credential` tanto si la contraseña es
 * incorrecta como si el correo no existe, **a propósito**, para que nadie pueda
 * averiguar qué correos tienen cuenta. El mensaje respeta esa ambigüedad.
 */
export function mensajeDeContrasena(error: unknown): string {
  const codigo = typeof error === 'string' ? error : codigoDe(error)
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'El correo o la contraseña no coinciden. Revísalos e inténtalo otra vez.'
    case 'auth/invalid-email':
      return 'Ese correo no parece válido. Revísalo.'
    case 'auth/missing-password':
      return 'Escribe tu contraseña.'
    case 'auth/user-disabled': return MENSAJES['cuenta-desactivada']
    case 'auth/network-request-failed': return SIN_CONEXION
    case 'auth/too-many-requests': return MENSAJES['demasiados-intentos']
    default:
      return 'No pudimos iniciar tu sesión. Inténtalo de nuevo en un momento.'
  }
}

/**
 * Recuperar la contraseña.
 *
 * `auth/user-not-found` **no** se cuenta: decir «ese correo no existe» deja
 * comprobar uno a uno qué correos tienen cuenta. Quien la llama trata ese caso
 * como si el envío hubiera ido bien.
 */
export function mensajeDeRecuperacion(error: unknown): string {
  const codigo = typeof error === 'string' ? error : codigoDe(error)
  switch (codigo) {
    case 'auth/invalid-email':
      return 'Ese correo no parece válido. Revísalo.'
    case 'auth/missing-email':
      return 'Escribe tu correo y te mandamos el enlace.'
    case 'auth/network-request-failed': return SIN_CONEXION
    case 'auth/too-many-requests': return MENSAJES['demasiados-intentos']
    default:
      return 'No pudimos enviar el correo. Inténtalo de nuevo en un momento.'
  }
}

/** Con este código el enlace no se envía, pero no se dice: ver arriba. */
export function silencioPorPrivacidad(error: unknown): boolean {
  const codigo = typeof error === 'string' ? error : codigoDe(error)
  return codigo === 'auth/user-not-found'
}

/**
 * Frase para un fallo del acceso **con Google**. La persona nunca ve el código.
 *
 * Para el acceso con correo y contraseña está `mensajeDeContrasena`, y para el
 * enlace de recuperación `mensajeDeRecuperacion`. No son intercambiables: esta
 * habla de Google en el caso por defecto.
 */
export function mensajeDeAcceso(error: unknown): string {
  const r = resultadoDeError(error)
  if (r.estado === 'error') return r.mensaje
  return MENSAJES.desconocido
}
