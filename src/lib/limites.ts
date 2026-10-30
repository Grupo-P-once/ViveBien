import { NextResponse } from 'next/server'
import { almacenActivo, memoria } from './limites-almacen'
import { contar } from './metricas'

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

/* El contador vive ahora en `limites-almacen.ts` (R-04): en memoria por defecto, compartido (Upstash) si hay variables. */

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
  return veredicto(memoria.contarSync(clave, ventanaMs), maximo)
}

function veredicto(c: { conteo: number; esperaMs: number }, maximo: number): Veredicto {
  return c.conteo <= maximo
    ? { ok: true, restantes: maximo - c.conteo }
    : { ok: false, esperaSegundos: Math.max(1, Math.ceil(c.esperaMs / 1000)) }
}

/** Igual que `permitir`, pero con el almacén configurado (compartido entre instancias si hay Upstash; si no, memoria). */
export async function permitirAlmacen(clave: string, maximo: number, ventanaMs: number): Promise<Veredicto> {
  return veredicto(await almacenActivo().contar(clave, ventanaMs), maximo)
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
  /** Guardar o borrar búsquedas: un gesto de vez en cuando, no un bucle. */
  busquedas: { maximo: 30, ventanaMs: 10 * 60 * 1000 },
  /** Agendar, confirmar, cancelar, proponer horario: gestos de persona, no de script. */
  citas: { maximo: 40, ventanaMs: 10 * 60 * 1000 },
  /** Firmas de subida: una por foto. Un anuncio lleva 30; nadie firma 150 en diez minutos. */
  medios: { maximo: 150, ventanaMs: 10 * 60 * 1000 },
  /** D-80: pedir recomendaciones por correo. Cada envío cuesta presupuesto y, si alguien escribe el correo de OTRA persona, le llega un mensaje: pocas veces por hora y por origen. */
  correo: { maximo: 5, ventanaMs: 60 * 60 * 1000 },
  /** D-80: confirmar o darse de baja desde un enlace firmado (el correo nunca se escribe aquí): un gesto de persona. */
  correoEnlaces: { maximo: 30, ventanaMs: 10 * 60 * 1000 },
  /** D-80: eventos del proveedor de correo; la firma es lo que manda, esto sólo acota un bucle. */
  correoWebhook: { maximo: 600, ventanaMs: 10 * 60 * 1000 },
  /** Fallos al entrar con Google (bitácora anónima): pocos por persona; lo demás es ruido. */
  acceso: { maximo: 20, ventanaMs: 10 * 60 * 1000 },
  /**
   * «¿Te sirvió este artículo?» (R-03 / QA-003, D-62): un gesto de persona, anónimo y que ESCRIBE en la base. Entre `busquedas` (30 por 10 min,
   * «un gesto de vez en cuando») y `contacto`: nadie lee 20 artículos distintos en diez minutos y los valora todos. Antes no tenía tope.
   */
  feedback: { maximo: 20, ventanaMs: 10 * 60 * 1000 },
  /** E-35: misma persona + MISMO artículo. Votar un artículo tres veces en diez minutos ya es corregirse; más es inflar la puntuación. */
  feedbackArticulo: { maximo: 3, ventanaMs: 10 * 60 * 1000 },
  /** Valuador: lectura de comparables, sin escritura ni datos personales; un gesto de persona (varias pruebas seguidas), no un bucle. */
  valuador: { maximo: 40, ventanaMs: 10 * 60 * 1000 },
  /**
   * Cerrar la cuenta (D-38). Es un acto único: cinco por hora dejan sitio de
   * sobra a los reintentos legítimos tras un fallo de Firebase, y cortan un
   * bucle del navegador. No es una medida de autorización — eso lo hacen la
   * sesión y la reautenticación reciente.
   */
  bajaCuenta: { maximo: 5, ventanaMs: 60 * 60 * 1000 },
  /** Panel SEO (solo Super Admin): el rastreo del propio sitio pide ~80 páginas; cuatro por diez minutos sobran para una persona. */
  seoRastreo: { maximo: 4, ventanaMs: 10 * 60 * 1000 },
  /** Panel SEO: lecturas ligeras (robots y sitemap). */
  seoLectura: { maximo: 30, ventanaMs: 10 * 60 * 1000 },
  /** Panel SEO (Fase C): crear tareas, registrar prompts y guardar fotos del historial. */
  seoEscritura: { maximo: 60, ventanaMs: 10 * 60 * 1000 },
  /** Métricas de las propiedades propias (publicador y asociado): una pantalla que se abre y se refresca, no un panel de monitoreo. */
  metricasPropias: { maximo: 30, ventanaMs: 10 * 60 * 1000 },
  /**
   * Catálogo FILTRADO (28-oct-2026): cada cambio de filtro consulta la base. Es navegar, no abusar: se deja MUY holgado (300 por 10 min) porque el límite es por IP y una oficina
   * o una red móvil comparte una (ver auditoría: falsos positivos por IP compartida). Es un freno contra bucles y rastreadores, NO una frontera de seguridad: el contador vive en
   * la memoria de cada instancia. Sin filtros el catálogo sigue sin tope (respuesta cacheada en el borde).
   */
  catalogoFiltrado: { maximo: 300, ventanaMs: 10 * 60 * 1000 },
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

/**
 * Como `frenar`, pero con el almacén configurado (R-04). Úsalo en las rutas que escriben o se pueden abusar: si hay un contador
 * compartido (Upstash) el tope vale para TODAS las instancias; si no, se comporta igual que `frenar`.
 */
export async function frenarAsync(
  clave: string,
  tope: { maximo: number; ventanaMs: number },
): Promise<NextResponse | null> {
  const r = await permitirAlmacen(clave, tope.maximo, tope.ventanaMs)
  if (r.ok) return null
  contar('limite.429')
  return NextResponse.json(
    {
      error: 'Demasiadas peticiones seguidas. Espera un momento e inténtalo otra vez.',
      esperaSegundos: r.esperaSegundos,
    },
    { status: 429, headers: { 'Retry-After': String(r.esperaSegundos) } },
  )
}
