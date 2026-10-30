import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Normalización de correos, enlaces firmados (confirmar / baja) y verificación de la firma del webhook de Resend.
 * Sin dependencias: sólo `node:crypto`. Código de servidor.
 */

const RE_CORREO = /^[^\s@,;<>()[\]\\"]+@[^\s@,;<>()[\]\\"]+\.[^\s@,;<>()[\]\\"]{2,}$/

/** Correo en minúsculas y sin espacios, o `null` si no es UNA dirección válida (sin comas, punto y coma ni nombres). */
export function normalizarCorreo(entrada: unknown): string | null {
  if (typeof entrada !== 'string') return null
  const c = entrada.trim().toLowerCase()
  if (c.length < 5 || c.length > 254) return null
  return RE_CORREO.test(c) ? c : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x)

function firma(secreto: string, tipo: string, id: string, expira: number): string {
  return createHmac('sha256', secreto).update(`${tipo}|${id}|${expira}`).digest('base64url')
}

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export type TipoEnlace = 'baja' | 'confirmar'

/**
 * Enlace firmado: `<id>.<expira>.<firma>`. NO se guarda en la base: se recalcula con `CORREO_SECRETO`, de modo que el
 * correo comercial puede llevar la baja de cada persona sin tener que recordar un token. La baja no caduca (expira = 0);
 * la confirmación sí.
 */
export function crearEnlace(secreto: string, tipo: TipoEnlace, id: string, expira = 0): string {
  return `${id}.${expira}.${firma(secreto, tipo, id, expira)}`
}

export function leerEnlace(secreto: string, tipo: TipoEnlace, token: unknown, ahoraMs = Date.now()): { id: string } | null {
  if (!secreto || typeof token !== 'string' || token.length > 200) return null
  const [id, exp, sig, resto] = token.split('.')
  if (resto !== undefined || !esUuid(id) || !/^\d{1,15}$/.test(exp ?? '') || !sig) return null
  const expira = Number(exp)
  if (tipo === 'baja' && expira !== 0) return null
  if (tipo === 'confirmar' && (expira <= 0 || expira < ahoraMs)) return null
  return igual(sig, firma(secreto, tipo, id, expira)) ? { id: id.toLowerCase() } : null
}

/**
 * Verifica la firma de un webhook de Resend (Svix): HMAC-SHA256 de `<svix-id>.<svix-timestamp>.<cuerpo EXACTO>` con la
 * clave base64 del secreto `whsec_…`. El cuerpo debe ser el TEXTO CRUDO recibido (no un JSON reserializado).
 * Rechaza marcas de tiempo fuera de la tolerancia (anti-repetición).
 */
export function verificarWebhook(args: {
  secreto: string
  id: string | null
  marcaTiempo: string | null
  firma: string | null
  cuerpo: string
  ahoraMs?: number
  toleranciaSeg?: number
}): boolean {
  const { secreto, id, marcaTiempo, firma: cabecera, cuerpo } = args
  if (!secreto || !id || !marcaTiempo || !cabecera) return false
  const ts = Number(marcaTiempo)
  if (!Number.isFinite(ts)) return false
  const ahora = Math.floor((args.ahoraMs ?? Date.now()) / 1000)
  if (Math.abs(ahora - ts) > (args.toleranciaSeg ?? 300)) return false
  let clave: Buffer
  try {
    clave = Buffer.from(secreto.replace(/^whsec_/, ''), 'base64')
  } catch {
    return false
  }
  if (clave.length === 0) return false
  const esperada = createHmac('sha256', clave).update(`${id}.${marcaTiempo}.${cuerpo}`).digest('base64')
  return cabecera.split(' ').some((par) => {
    const [version, valor] = par.split(',')
    return version === 'v1' && !!valor && igual(valor, esperada)
  })
}
