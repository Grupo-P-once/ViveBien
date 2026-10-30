import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Enlace de BAJA de avisos por correo (28-oct-2026): «dejar de recibirlos» con un clic, sin iniciar sesión. Un token firmado (HMAC-SHA256) que lleva la cuenta y el propósito;
 * no caduca (el derecho de oposición no debe vencer) pero solo sirve para APAGAR los avisos: nunca da acceso a la cuenta ni a datos. Falla cerrado: sin secreto no hay token.
 *
 * El secreto es `AVISOS_SECRETO` y, si no existe, `CRON_SECRET` (ya configurado para las tareas programadas). Cambiarlo invalida los enlaces ya enviados: en ese caso la persona
 * puede apagar los avisos desde «Configuración» (iniciando sesión).
 */
const PROPOSITO = 'baja-avisos'
const b64 = (t: string | Buffer) => Buffer.from(t).toString('base64url')
const secreto = () => (process.env.AVISOS_SECRETO || process.env.CRON_SECRET || '').trim()

function firmar(uid: string, clave: string): string {
  return createHmac('sha256', clave).update(`${PROPOSITO}\n${uid}`).digest('base64url')
}

export function crearTokenDeBaja(uid: string): string | null {
  const clave = secreto()
  if (!clave || !uid || uid.length > 200) return null
  return `${b64(uid)}.${firmar(uid, clave)}`
}

export function verificarTokenDeBaja(token: unknown): { ok: true; uid: string } | { ok: false } {
  const clave = secreto()
  if (!clave || typeof token !== 'string' || token.length > 600) return { ok: false }
  const partes = token.split('.')
  if (partes.length !== 2) return { ok: false }
  let uid = ''
  try { uid = Buffer.from(partes[0], 'base64url').toString('utf8') } catch { return { ok: false } }
  if (!uid || uid.length > 200) return { ok: false }
  const esperada = Buffer.from(firmar(uid, clave)); const recibida = Buffer.from(partes[1])
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return { ok: false }
  return { ok: true, uid }
}
