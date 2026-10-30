import { createHash, randomBytes } from 'node:crypto'

/**
 * Enlaces de acción de los correos («Confirmar visita», «Cancelar»…).
 *
 * ─────────────────────────────────────────────────────────────
 * Nunca `/confirmar?id=123`. Cada enlace lleva un token:
 *
 *   · 32 bytes aleatorios → imposible de adivinar;
 *   · en la base sólo va su hash SHA-256 → quien lea la base no puede usarlo;
 *   · va DESPUÉS del `#` → no llega al servidor, ni a los registros de Vercel,
 *     ni al encabezado Referer;
 *   · sirve para UNA acción, UNA cita, UNA persona; caduca, y deja de valer en
 *     cuanto la cita cambia (la función SQL revoca los vigentes);
 *   · abrirlo no hace nada: la acción exige pulsar el botón. Los escáneres de
 *     correo que abren enlaces solos no confirman nada.
 *
 * Ver docs/email-flow.md §2.
 * ─────────────────────────────────────────────────────────────
 */

export const HORAS_VIGENCIA = 72

const RE_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function nuevoToken(): { plano: string; hash: string } {
  const plano = randomBytes(32).toString('base64url')
  return { plano, hash: hashDe(plano) }
}

export function hashDe(plano: string): string {
  return createHash('sha256').update(plano, 'utf8').digest('hex')
}

/** ¿Tiene forma de token? (antes de ir a la base). */
export function pareceToken(v: unknown): v is string {
  return typeof v === 'string' && RE_TOKEN.test(v)
}

/** Vence a las 72 h o a la hora de la visita, lo que llegue antes. */
export function caducidad(inicioCita: Date, ahora: Date): Date {
  return new Date(Math.min(ahora.getTime() + HORAS_VIGENCIA * 3_600_000, inicioCita.getTime()))
}
