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

import { NEGOCIO } from '../config/negocio'

/**
 * CUPO DURO del plan gratuito de Resend (F0, 29-oct-2026). Regla del dueño: usar SIEMPRE el límite gratuito y NO pasarlo
 * (100 correos/día, 3,000/mes). Se deja un margen: 90 al día y 2,700 al mes, de los cuales 30 diarios (300 al mes) quedan
 * reservados a lo transaccional (citas, invitaciones, avisos internos): lo opcional (alertas, marketing) nunca los toca.
 *
 * Estas cifras NO son configurables: no hay variable de entorno ni parámetro que las cambie. Viven aquí (para el texto y las
 * pruebas) y, con los MISMOS valores, dentro de la función SQL `correo_reservar_envio` (migración 62), que es quien decide
 * de verdad y de forma atómica. Una prueba compara ambos lados.
 *
 * Una sola cuenta de Resend sirve a producción, a los Preview, a staging y a las pruebas locales, pero cada base de datos
 * sólo ve sus propios envíos. Para que la SUMA no pase del plan, el cupo se reparte en dos rebanadas fijas:
 *   · `produccion`: 80/día y 2,400/mes (30/día y 300/mes de reserva transaccional dentro de esa rebanada).
 *   · `pruebas`: 10/día y 300/mes (todo lo demás: Preview, staging, local).   80 + 10 = 90 y 2,400 + 300 = 2,700.
 */
export const CUPO_TOTAL = { dia: 90, mes: 2700, reservaDia: 30, reservaMes: 300 } as const
export const CUPO_POR_ENTORNO = {
  produccion: { dia: 80, mes: 2400, reservaDia: 30, reservaMes: 300 },
  pruebas: { dia: 10, mes: 300, reservaDia: 0, reservaMes: 0 },
} as const
export type EntornoDeCupo = keyof typeof CUPO_POR_ENTORNO
/** El plan de Resend cuenta el mes por ciclo de facturación (día 23) y reinicia el día a las 23:59:59 UTC. */
export const DIA_DE_CICLO = 23

/**
 * Qué rebanada usa este proceso. SOLO el despliegue de producción de Vercel usa `produccion`; Preview, desarrollo, pruebas y
 * cualquier otra cosa usan `pruebas` (la rebanada pequeña): equivocarse hacia ese lado sólo deja sin cupo, nunca lo excede.
 */
export function entornoDeCupo(env: Record<string, string | undefined> = process.env): EntornoDeCupo {
  return env.VERCEL_ENV === 'production' ? 'produccion' : 'pruebas'
}

/**
 * BARRERA contra el límite agregado (auditoría del 29-oct): cada base de datos cuenta sólo lo suyo, así que varias bases "de pruebas" no se pueden sumar
 * como un límite global. En vez de fingir que lo son, FUERA DE PRODUCCIÓN no sale ningún correo real: sólo se permite con el modo de pruebas
 * (destino único, `informes@`, y rebanada chica). Mientras RESEND_API_KEY exista sólo en Production, eso es todo el riesgo de esas bases.
 */
export const envioPermitido = (entornoCupo: EntornoDeCupo, modoPruebas: boolean): boolean => entornoCupo === 'produccion' || modoPruebas

/**
 * Texto de consentimiento promocional APROBADO por quien corresponda (abogado/dueño). Mientras sea `false`, ninguna variable de
 * entorno puede encender el correo promocional: es una barrera de código, no una bandera que alguien cambie por descuido.
 * Se cambia en una revisión de código, junto con el texto aprobado y su versión.
 */
export const MARKETING_AUTORIZADO = false

export type LimitesCorreo = {
  entreMarketingDias: number
  loteMarketing: number
  propiedadesPorCorreo: number
  memoriaEnvios: number
  expiraConfirmacionDias: number
  pausa: { quejas7d: number; rebotePorcentaje: number; minimoEnvios: number }
}

export const CORREO: LimitesCorreo = {
  /** Un correo comercial por persona, como máximo, cada tantos días. Es un MÁXIMO, no una obligación de enviar. */
  entreMarketingDias: 7,
  /** Cuántas personas procesa una ejecución diaria (cabe holgadamente en el tiempo de una función). */
  loteMarketing: 50,
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
export const VERSION_CONSENTIMIENTO_MARKETING = 'marketing-2026-11-v3'
export const TEXTO_CONSENTIMIENTO_MARKETING =
  'Al pedirlo, aceptas recibir por correo propiedades nuevas de VIVE BIEN que se ajusten a lo que elegiste o que se parezcan a la última propiedad que consultaste en nuestro sitio, como máximo una cada siete días. Si no te interesan, te das de baja con un clic desde cualquier correo. Usamos tu correo y tu actividad en el sitio sólo para esto.'

/**
 * MODO DE PRUEBAS (D-80). Con `CORREO_MODO_PRUEBAS=1`, TODO correo que sale por `enviarCorreo` se redirige a este único destino,
 * sea cual sea el destinatario original (y no se admiten copias): ningún cliente, usuario ni propietario real recibe nada.
 * El destino es una CONSTANTE de código (no una variable de entorno) a propósito: nadie lo puede apuntar a otra dirección por error.
 * Apagado por defecto; no cambia ni activa nada del envío real (sigue mandando `CORREO_TRANSACCIONAL` / `CORREO_MARKETING`).
 */
export const DESTINO_PRUEBAS: string = NEGOCIO.email // la dirección oficial vive en un solo lugar (lib/config/negocio.ts)

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
    // Dos llaves: la variable Y la autorización de texto legal (constante de código). Sin la segunda no hay correo promocional.
    marketing: env.CORREO_MARKETING === '1' && MARKETING_AUTORIZADO,
    resendKey: (env.RESEND_API_KEY ?? '').trim(),
    secreto: (env.CORREO_SECRETO ?? '').trim(),
    webhookSecret: (env.RESEND_WEBHOOK_SECRET ?? '').trim(),
    remitente: (env.RESEND_FROM ?? '').trim() || null,
    remitenteMarketing: (env.RESEND_FROM_MARKETING ?? '').trim() || null,
    modoPruebas: env.CORREO_MODO_PRUEBAS === '1',
  }
}

/**
 * COMPUERTA COMÚN DE ENVÍO (MKT-60, 2-nov-2026). Lo decide `CORREO_ENVIO`, leída en el momento de usarla. La lectura de uso de Resend
 * (el cupo) NO enciende nada por sí sola: antes de esta compuerta, `enviarPorEmisorUnico` solo estaba frenado por la falta de esa lectura,
 * así que guardarla abría el aviso de contacto, las invitaciones, las citas y los avisos a clientes sin que nadie lo hubiera pedido.
 */
// Cierre seguro: solo el valor exacto '1' enciende; ausente, vacío o cualquier otra cosa = apagada. Se lee SIEMPRE de la variable de entorno real:
// ningún objeto ni parámetro de entorno inyectado (`Opciones.entorno`, pedidos del emisor) puede encenderla.
export const envioHabilitado = (env: Record<string, string | undefined> = process.env): boolean => env.CORREO_ENVIO === '1'

/** El secreto de los enlaces firmados debe ser largo: uno corto o ausente deja el marketing apagado. */
export const SECRETO_MINIMO = 32

/**
 * Llave de Resend de ACCESO COMPLETO, guardada aparte y usada SOLO para consultar `GET /usage` (D-83). Resend no ofrece una llave de solo lectura: esta llave podría
 * crear, modificar y borrar recursos de la cuenta, así que NO es parte de `EntornoCorreo` (el objeto que ven los emisores) y una prueba impide que cualquier archivo
 * distinto de la lectura de consumo la pida. Sin la variable, la lectura automática simplemente no corre.
 */
export function claveDeUsoResend(env: Record<string, string | undefined> = process.env): string {
  return (env.RESEND_USAGE_KEY ?? '').trim()
}
