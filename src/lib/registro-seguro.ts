/**
 * Registro SEGURO de errores (E-38 / observabilidad, D-70).
 *
 * Objetivo: que una línea del log permita CORRELACIONAR una petición y entender qué falló, sin llevarse nada sensible. Reglas:
 *  · una sola línea JSON por evento (la plataforma la indexa; Vercel Hobby conserva 1 hora);
 *  · identificador de petición (`x-vercel-id`) + despliegue para cruzar con los registros de la plataforma;
 *  · la ruta SIN consulta ni fragmento (las consultas llevan correos, teléfonos, tokens);
 *  · del error solo el nombre y un mensaje TRUNCADO y LIMPIO; nunca la pila (rutas del servidor) ni el objeto completo;
 *  · cualquier clave con pinta de secreto o de dato personal se redacta; cualquier texto con forma de JWT, Bearer, token de bot,
 *    correo, teléfono o parámetro `?token=` se sustituye por una etiqueta.
 * NO sustituye a un rastreador de errores (Sentry): es la base mínima y gratuita. No guarda cuerpos, cabeceras ni cookies.
 */

const CLAVE_SENSIBLE = /(authorization|cookie|token|password|passwd|secret|api[-_]?key|apikey|service[-_]?role|credential|bearer|jwt|sesion|session|email|correo|telefono|phone|whatsapp|direccion|curp|rfc|nombre|apellido)/i

const PATRONES: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redactado]'],
  [/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, '[token-bot]'],
  [/([?&](?:apikey|api_key|token|access_token|key|secret|password|code)=)[^&\s"']+/gi, '$1[redactado]'],
  [/(\b(?:apikey|api_key|access_token|token|secret|password)\s*[=:]\s*)[^&\s"',;]+/gi, '$1[redactado]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]'],
  [/(?<![\w.])\+?\d[\d\s().-]{8,}\d(?![\w.])/g, '[numero]'],
]

/** Texto sin secretos reconocibles y de largo acotado. */
export function limpiarTexto(valor: unknown, max = 300): string {
  let s: string
  if (typeof valor === 'string') s = valor
  else if (valor instanceof Error) s = valor.message
  else if (valor && typeof valor === 'object') { try { s = JSON.stringify(valor) } catch { s = '[objeto]' } }
  else s = String(valor ?? '')
  for (const [re, por] of PATRONES) s = s.replace(re, por)
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

/** Copia de un objeto sin valores sensibles: redacta por NOMBRE de clave y por FORMA del valor; acota profundidad y tamaño. */
export function redactar(valor: unknown, profundidad = 0): unknown {
  if (valor == null || typeof valor === 'number' || typeof valor === 'boolean') return valor
  if (typeof valor === 'string') return limpiarTexto(valor)
  if (profundidad >= 3) return '[…]'
  if (Array.isArray(valor)) return valor.slice(0, 10).map((v) => redactar(v, profundidad + 1))
  if (typeof valor === 'object') {
    const salida: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>).slice(0, 20)) {
      salida[k] = CLAVE_SENSIBLE.test(k) ? '[redactado]' : redactar(v, profundidad + 1)
    }
    return salida
  }
  return String(typeof valor)
}

/** La ruta sin consulta ni fragmento: `/api/x?token=abc#y` → `/api/x`. */
export function rutaSinConsulta(url: string): string {
  try { return new URL(url, 'http://local').pathname } catch { return '[ruta-invalida]' }
}

/** Identificador para cruzar con los registros de la plataforma (no es un secreto). */
export function idPeticion(req?: Request): string | null {
  const id = req?.headers.get('x-vercel-id') ?? req?.headers.get('x-request-id')
  return id ? limpiarTexto(id, 80) : null
}

type Contexto = { req?: Request; extra?: Record<string, unknown> }

/** Una línea JSON con el error SANEADO. Nunca lanza. */
export function registrarError(evento: string, error: unknown, ctx: Contexto = {}): void {
  try {
    const e = error instanceof Error ? error : null
    console.error(JSON.stringify({
      nivel: 'error',
      evento: limpiarTexto(evento, 80),
      cuando: new Date().toISOString(),
      despliegue: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      id: idPeticion(ctx.req),
      metodo: ctx.req?.method ?? null,
      ruta: ctx.req ? rutaSinConsulta(ctx.req.url) : null,
      error: { nombre: e?.name ?? typeof error, mensaje: limpiarTexto(error) },
      extra: ctx.extra ? redactar(ctx.extra) : undefined,
    }))
  } catch { /* observar nunca debe romper la petición */ }
}

/** Una línea JSON informativa (p. ej. una respuesta 5xx que no lanzó). */
export function registrarEvento(evento: string, ctx: Contexto = {}): void {
  try {
    console.warn(JSON.stringify({
      nivel: 'aviso',
      evento: limpiarTexto(evento, 80),
      cuando: new Date().toISOString(),
      despliegue: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      id: idPeticion(ctx.req),
      metodo: ctx.req?.method ?? null,
      ruta: ctx.req ? rutaSinConsulta(ctx.req.url) : null,
      extra: ctx.extra ? redactar(ctx.extra) : undefined,
    }))
  } catch { /* idem */ }
}
