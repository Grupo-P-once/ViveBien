import { NextResponse } from 'next/server'

/**
 * Límite de peticiones.
 *
 * Hoy `/api/leads`, `/api/favoritos` y `/api/eventos` aceptan escrituras sin
 * ningún tope. Cualquiera con la consola del navegador abierta puede meter diez
 * mil leads falsos en un minuto y dejar la bandeja inservible — o inflar las
 * vistas de un anuncio para que parezca más popular de lo que es.
 *
 * La idea viene del CRM de OTLI (V51c): allí, cinco intentos fallidos en quince
 * minutos bloquean la cuenta una hora, y salta un aviso. Aquí no hay cuentas
 * que bloquear en las rutas públicas, así que el tope va por origen.
 *
 * ─────────────────────────────────────────────────────────────
 * LO QUE ESTO NO ES
 *
 * Es un contador **en memoria del proceso**. Eso significa:
 *
 *   · Se reinicia con cada despliegue.
 *   · Cada instancia lleva su propia cuenta, así que con tres instancias el
 *     tope real es el triple.
 *   · No sobrevive a un arranque en frío.
 *
 * No es protección contra un ataque decidido; para eso hace falta un contador
 * compartido (Upstash Redis, o el WAF de Vercel). **Sí** para lo que de verdad
 * pasa: un script torpe, una pestaña en bucle, o alguien probando.
 *
 * Se documenta así de claro a propósito. Un límite que se cree infalible y no
 * lo es, es peor que no tenerlo: da confianza falsa.
 * ─────────────────────────────────────────────────────────────
 */

type Ventana = { conteo: number; desde: number }

const ventanas = new Map<string, Ventana>()

/** El mapa no puede crecer sin fin: en cada limpieza se tiran las caducadas. */
let ultimaLimpieza = Date.now()
const CADA_LIMPIEZA = 5 * 60 * 1000

function limpiar(ahora: number) {
  if (ahora - ultimaLimpieza < CADA_LIMPIEZA) return
  ultimaLimpieza = ahora
  for (const [clave, v] of ventanas) {
    // Una hora es más que cualquier ventana que usemos.
    if (ahora - v.desde > 60 * 60 * 1000) ventanas.delete(clave)
  }
}

/**
 * Identifica al que llama.
 *
 * Detrás de Vercel, `x-forwarded-for` trae la cadena de proxies y **el primero
 * es el cliente real**. Usar el último daría siempre la IP del proxy y
 * limitaría a todo el mundo con el mismo contador.
 */
export function origenDe(req: Request): string {
  const cadena = req.headers.get('x-forwarded-for') ?? ''
  const primera = cadena.split(',')[0]?.trim()
  return primera || req.headers.get('x-real-ip') || 'desconocido'
}

export type Veredicto =
  | { ok: true; restantes: number }
  | { ok: false; esperaSegundos: number }

/**
 * ¿Puede pasar esta petición?
 *
 * @param clave  Qué se limita. Normalmente `ruta:origen`, o `ruta:uid` si hay
 *               sesión — limitar por uid es más justo que por IP cuando varias
 *               personas comparten salida a internet, que en México es común.
 */
export function permitir(clave: string, maximo: number, ventanaMs: number): Veredicto {
  const ahora = Date.now()
  limpiar(ahora)

  const v = ventanas.get(clave)

  if (!v || ahora - v.desde >= ventanaMs) {
    ventanas.set(clave, { conteo: 1, desde: ahora })
    return { ok: true, restantes: maximo - 1 }
  }

  if (v.conteo >= maximo) {
    return { ok: false, esperaSegundos: Math.ceil((v.desde + ventanaMs - ahora) / 1000) }
  }

  v.conteo += 1
  return { ok: true, restantes: maximo - v.conteo }
}

/** Topes por tipo de ruta. Generosos: molestar a un cliente real cuesta más. */
export const TOPES = {
  /** Dejar sus datos. Nadie legítimo lo hace seis veces en una hora. */
  contacto: { maximo: 6, ventanaMs: 60 * 60 * 1000 },
  /** Guardar y quitar favoritos es un gesto rápido y repetido. */
  favoritos: { maximo: 120, ventanaMs: 10 * 60 * 1000 },
  /** Telemetría: cara de inflar, barata de emitir. */
  eventos: { maximo: 300, ventanaMs: 10 * 60 * 1000 },
  /** Escrituras del publicador; el autoguardado dispara seguido. */
  edicion: { maximo: 240, ventanaMs: 10 * 60 * 1000 },
} as const

/**
 * Aplica un tope y, si se pasa, devuelve la respuesta 429 ya formada.
 * Devuelve `null` cuando puede continuar.
 *
 * El 429 lleva `Retry-After`, que es lo que un cliente bien hecho respeta. Y el
 * mensaje va en español y sin regañar: quien lo lea será casi siempre alguien
 * que pulsó dos veces, no un atacante.
 */
export function frenar(
  clave: string,
  tope: { maximo: number; ventanaMs: number },
): NextResponse | null {
  const r = permitir(clave, tope.maximo, tope.ventanaMs)
  if (r.ok) return null

  return NextResponse.json(
    {
      error: 'Demasiadas peticiones seguidas. Espera un momento e inténtalo otra vez.',
      esperaSegundos: r.esperaSegundos,
    },
    { status: 429, headers: { 'Retry-After': String(r.esperaSegundos) } },
  )
}
