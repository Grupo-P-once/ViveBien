import { contar, medir } from '@/lib/metricas'
import { registrarError, registrarEvento } from '@/lib/registro-seguro'

/**
 * Envuelve un manejador de ruta para medir lo que importa sin tocar su lógica (E-38):
 *  · `http.<nombre>.2xx|3xx|4xx|5xx` (contadores) y `http.<nombre>` (latencia, ventana de 200) → p50/p95/p99 en `/api/admin/salud`;
 *  · una respuesta 5xx deja UNA línea de aviso; una excepción deja UNA línea de error SANEADA (ver `registro-seguro.ts`) y se relanza igual.
 * El nombre es FIJO (nunca viene de la petición), así que no puede inflar la memoria con valores del usuario. Las métricas viven en la
 * memoria de la instancia: orientativas, no un sistema de monitorización.
 */
export function conMetricas<A extends unknown[]>(
  nombre: string,
  manejador: (req: Request, ...resto: A) => Response | Promise<Response>,
) {
  // `req` opcional: Next siempre lo pasa; las pruebas llaman a `GET()` sin argumentos.
  return async (req?: Request, ...resto: A): Promise<Response> => {
    const t0 = performance.now()
    try {
      const res = await manejador(req as Request, ...resto)
      medir(`http.${nombre}`, performance.now() - t0)
      contar(`http.${nombre}.${Math.floor(res.status / 100)}xx`)
      if (res.status >= 500) registrarEvento('http.respuesta_5xx', { req, extra: { nombre, estado: res.status } })
      return res
    } catch (e) {
      medir(`http.${nombre}`, performance.now() - t0)
      contar(`http.${nombre}.5xx`)
      registrarError('http.excepcion', e, { req, extra: { nombre } })
      throw e
    }
  }
}
