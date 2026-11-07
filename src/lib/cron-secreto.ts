import { timingSafeEqual } from 'node:crypto'

/**
 * ¿La petición trae `Authorization: Bearer <CRON_SECRET>`? Comparación en TIEMPO CONSTANTE (OWASP: no comparar secretos con `===`) y falla
 * cerrado: sin secreto configurado, nadie pasa. Las tareas programadas de Vercel mandan esa cabecera.
 */
export function autorizadoPorCron(req: Request): boolean {
  const secreto = process.env.CRON_SECRET?.trim()
  if (!secreto) return false
  const esperado = Buffer.from(`Bearer ${secreto}`)
  const recibido = Buffer.from(req.headers.get('authorization') ?? '')
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}
