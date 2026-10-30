/**
 * Qué sitio se puede auditar desde el panel. Solo DOS orígenes: el propio despliegue donde corre el panel, o producción. Nunca una URL que escriba la
 * persona (eso sería una puerta para que el servidor pida cualquier dirección, incluidas las internas).
 */
import { origenValido } from './rastreador'

export type Cual = 'propio' | 'produccion'

export function origenPropio(req: Request): string | null {
  const h = req.headers
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim()
  if (!host) return null
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  const proto = (h.get('x-forwarded-proto') ?? (local ? 'http' : 'https')).split(',')[0].trim()
  return origenValido(`${proto}://${host}`)
}

export function resolverOrigen(req: Request, cual: string | null, sitioProduccion: string): { origen: string; cual: Cual } | { error: string } {
  if (cual === 'produccion') {
    const o = origenValido(sitioProduccion)
    return o ? { origen: o, cual: 'produccion' } : { error: 'No se pudo determinar el sitio de producción.' }
  }
  if (cual && cual !== 'propio') return { error: 'Origen no permitido. Usa «propio» o «produccion».' }
  const o = origenPropio(req)
  return o ? { origen: o, cual: 'propio' } : { error: 'No se pudo determinar el origen de este despliegue.' }
}
