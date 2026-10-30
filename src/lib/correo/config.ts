/**
 * Correo de VIVE BIEN (D-80): límites, textos de consentimiento y banderas de activación.
 *
 * **Todo viene APAGADO.** Desplegar este código no envía nada nuevo: los correos nuevos (bienvenida, confirmación de
 * publicador, suscripción, recomendaciones) sólo salen cuando el propietario activa las variables de entorno
 * `CORREO_TRANSACCIONAL=1` y/o `CORREO_MARKETING=1` Y existen `RESEND_API_KEY` y `CORREO_SECRETO`.
 *
 * Límites internos (Resend Free, comprobado el 8-oct-2026 en resend.com/pricing y en el panel: 100 correos/día,
 * 3,000/mes, 1,000 contactos, 10 peticiones/segundo, 1 endpoint de webhook): quedan POR DEBAJO del plan a propósito,
 * para no depender de que el proveedor corte y para dejar margen a lo transaccional.
 */

export type LimitesCorreo = {
  diaMax: number
  mesMax: number
  reservaTransaccional: number
  entreMarketingDias: number
  loteMarketing: number
  propiedadesPorCorreo: number
  memoriaEnvios: number
  expiraConfirmacionDias: number
  pausa: { quejas7d: number; rebotePorcentaje: number; minimoEnvios: number }
}

export const CORREO: LimitesCorreo = {
  /** Tope diario interno (el plan permite 100). */
  diaMax: 70,
  /** Tope mensual interno, contado en los últimos 30 días (el plan permite 3,000). */
  mesMax: 2000,
  /** Cuánto del tope diario queda SIEMPRE libre para lo transaccional (el marketing no lo toca). */
  reservaTransaccional: 20,
  /** Un correo comercial por persona, como máximo, cada tantos días. Es un MÁXIMO, no una obligación de enviar. */
  entreMarketingDias: 3,
  /** Cuántas personas procesa una ejecución diaria (cabe holgadamente en el tiempo de una función). */
  loteMarketing: 25,
  /** Propiedades por correo de recomendaciones. */
  propiedadesPorCorreo: 3,
  /** Cuántos envíos anteriores se miran para no repetir propiedades. */
  memoriaEnvios: 3,
  /** Días de validez del enlace de confirmación. */
  expiraConfirmacionDias: 7,
  /** Salud: una queja en 7 días, o más de este % de rebotes (con un mínimo de envíos), pausa el marketing. */
  pausa: { quejas7d: 1, rebotePorcentaje: 5, minimoEnvios: 20 },
}

/** Versión y texto EXACTOS que ve la persona al aceptar. Si cambia el texto, cambia la versión (queda la prueba de qué aceptó). */
export const VERSION_CONSENTIMIENTO_MARKETING = 'marketing-2026-10-v2'
export const TEXTO_CONSENTIMIENTO_MARKETING =
  'Al pedirlo, aceptas recibir por correo propiedades de VIVE BIEN que se ajusten a lo que elegiste, como máximo una cada tres días. Si no te interesan, te das de baja con un clic desde cualquier correo. Usamos tu correo sólo para esto.'

/**
 * MODO DE PRUEBAS (D-80). Con `CORREO_MODO_PRUEBAS=1`, TODO correo que sale por `enviarCorreo` se redirige a este único destino,
 * sea cual sea el destinatario original (y no se admiten copias): ningún cliente, usuario ni propietario real recibe nada.
 * El destino es una CONSTANTE de código (no una variable de entorno) a propósito: nadie lo puede apuntar a otra dirección por error.
 * Apagado por defecto; no cambia ni activa nada del envío real (sigue mandando `CORREO_TRANSACCIONAL` / `CORREO_MARKETING`).
 */
export const DESTINO_PRUEBAS = 'jemilianoponceperez@gmail.com'

export type EntornoCorreo = {
  transaccional: boolean
  marketing: boolean
  resendKey: string
  secreto: string
  webhookSecret: string
  remitente: string | null
  /** Remitente SÓLO del correo comercial (por ejemplo, desde un subdominio dedicado). Si no existe, se usa el normal. */
  remitenteMarketing: string | null
  /** Modo de pruebas: redirige TODO envío a `DESTINO_PRUEBAS`. Ausente = apagado. */
  modoPruebas?: boolean
}

/** Lee las variables en el momento de usarlas (no al importar), para poder probar y para que un cambio de variable se note. */
export function entornoCorreo(env: Record<string, string | undefined> = process.env): EntornoCorreo {
  return {
    transaccional: env.CORREO_TRANSACCIONAL === '1',
    marketing: env.CORREO_MARKETING === '1',
    resendKey: (env.RESEND_API_KEY ?? '').trim(),
    secreto: (env.CORREO_SECRETO ?? '').trim(),
    webhookSecret: (env.RESEND_WEBHOOK_SECRET ?? '').trim(),
    remitente: (env.RESEND_FROM ?? '').trim() || null,
    remitenteMarketing: (env.RESEND_FROM_MARKETING ?? '').trim() || null,
    modoPruebas: env.CORREO_MODO_PRUEBAS === '1',
  }
}

/** El secreto de los enlaces firmados debe ser largo: uno corto o ausente deja el marketing apagado. */
export const SECRETO_MINIMO = 32
