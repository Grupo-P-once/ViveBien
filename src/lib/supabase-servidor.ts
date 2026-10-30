import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { contar } from './metricas'

/**
 * ÚNICA fábrica de clientes de Supabase para código que corre en el SERVIDOR (D-62 · QA-001/R-01 y QA-006/R-06).
 *
 * R-01 — POR QUÉ SIN AUTO-REFRESCO: `createClient(url, clave)` con las opciones por defecto activa el auto-refresco de sesión de
 * `auth-js`. En un entorno que no es el navegador, `GoTrueClient._handleVisibilityChange()` arranca SIEMPRE un `setInterval` que nunca se
 * detiene y que retiene el cliente y el contexto asíncrono de la petición (ServerResponse, Socket, decenas de closures). Como el servidor
 * crea un cliente por petición, cada petición dinámica dejaba ~30–80 KB vivos para siempre (medido: +117 MB de heap tras GC por 1 500
 * fichas; con esto, +25 MB incluido el calentamiento y plano después). Un cliente de servidor no tiene sesión de usuario de Supabase que
 * refrescar: la identidad la valida `verifyIdToken` con las claves públicas de Firebase.
 *
 * R-06 — TIEMPO LÍMITE (solo LECTURAS): `supabase-js` no trae ninguno. Con la base «colgada» una ficha o un `/api/*` esperaban hasta que Vercel mataba la
 * función (>45 s observados). Cada cliente corta sus peticiones a `TIMEOUTS_MS[tipo]` (la conexión se aborta de verdad, no solo se deja de
 * esperar) y deja un contador (`supabase.timeout.<tipo>`) y una línea en el log SIN la consulta ni parámetros.
 *   · `publico`: lecturas que ve una persona esperando (ficha, ayuda, catálogo, feedback): 4 s. El catálogo conserva además su copia
 *     «última buena»; la ficha cae a su carga desde el navegador.
 *   · `api`: APIs (lecturas del panel, publicador, portal): 10 s.
 *   · REINTENTO (27-oct-2026, incidente «tiempo agotado» con la base sana): una LECTURA que se corta por tiempo o por un fallo de red (conexión reutilizada que el otro lado ya cerró,
 *     reinicio de la función…) se repite UNA vez con un tiempo nuevo. Las lecturas no cambian nada, así que repetirlas es seguro; las escrituras nunca se repiten. Cada reintento deja
 *     el contador `supabase.reintento.<tipo>`.
 *   · ESCRITURAS (POST/PATCH/PUT/DELETE: inserts, updates y RPC) NO se cortan en el cliente (Codex L1 de R-06): una escritura abortada tras
 *     confirmarse tiene resultado DESCONOCIDO y varias rutas (favoritos, contacto) no son idempotentes, así que reintentar podría invertir un
 *     favorito o duplicar una solicitud. Siguen limitadas solo por la plataforma, como antes de R-06. Cortarlas bien exige claves de idempotencia
 *     por ruta (pendiente, QA-006 residual → plan).
 *
 * REGLA (la hace cumplir `tests/supabase-servidor-barrera.test.ts`): en `src` solo se llama a `createClient` aquí y en `lib/supabase.ts`
 * (el cliente del NAVEGADOR, que sí necesita su sesión). Cualquier otro uso rompe la prueba.
 */
export const OPCIONES_SERVIDOR = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
} as const

export const TIMEOUTS_MS = { publico: 4_000, api: 10_000 } as const
export type TipoCliente = keyof typeof TIMEOUTS_MS

function conTiempoLimite(ms: number, tipo: string): typeof fetch {
  return async (input, init) => {
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (metodo !== 'GET' && metodo !== 'HEAD') return fetch(input, init) // escrituras: sin corte (ver arriba)
    for (let intento = 1; ; intento++) {
      const limite = AbortSignal.timeout(ms)
      const senal = init?.signal ? AbortSignal.any([init.signal, limite]) : limite
      try {
        return await fetch(input, { ...init, signal: senal })
      } catch (e) {
        if (init?.signal?.aborted) throw e // lo canceló quien llamó: no es un fallo ni se repite
        const porTiempo = limite.aborted
        if (porTiempo) {
          contar(`supabase.timeout.${tipo}`)
          let ruta = '?'
          try { ruta = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url).pathname } catch { /* sin ruta */ }
          console.warn(`[supabase] tiempo agotado (${tipo}, ${ms} ms, intento ${intento}): ${ruta}`) // sin query string: puede llevar datos de la persona
        }
        if ((porTiempo || e instanceof TypeError) && intento < 2) { contar(`supabase.reintento.${tipo}`); continue }
        throw e
      }
    }
  }
}

/** `tipo` elige el tiempo límite; para pruebas se acepta `{ timeoutMs }`. Por defecto `api`. */
export function clienteServidor(url: string, clave: string, tipo: TipoCliente | { timeoutMs: number } = 'api'): SupabaseClient {
  const ms = typeof tipo === 'string' ? TIMEOUTS_MS[tipo] : tipo.timeoutMs
  const etiqueta = typeof tipo === 'string' ? tipo : 'prueba'
  return createClient(url, clave, { ...OPCIONES_SERVIDOR, global: { fetch: conTiempoLimite(ms, etiqueta) } })
}
