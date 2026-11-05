import { createHash, randomUUID } from 'node:crypto'
import { NEGOCIO } from '../config/negocio'
import { DESTINO_PRUEBAS, entornoDeCupo } from './config'

/**
 * ÚNICO punto del sitio que llama a la API de Resend (D-80, modo de pruebas).
 *
 * Los CINCO emisores (correo D-80, aviso de leads, citas, invitaciones y avisos a clientes) arman su cuerpo y llegan aquí
 * (los cuatro últimos a través de `emisor.ts`, que además reserva el cupo del plan antes de llamar). Con `CORREO_MODO_PRUEBAS=1`
 * el cuerpo se RECONSTRUYE desde una lista blanca —no se «limpia»—, de modo que lo que el emisor haya puesto en `to`, `cc`, `bcc`, `cco`,
 * `reply_to`, adjuntos o cabeceras de destinatarios no existe para el proveedor. Después una barrera independiente vuelve a revisar el
 * resultado y lanza si algo quedó fuera de lugar. Una prueba estática obliga a que ningún otro archivo hable con la API.
 *
 * Sin el modo activo, el cuerpo pasa tal cual: producción no cambia.
 */
export const URL_RESEND = 'https://api.resend.com/emails'

/** Inicio del asunto en modo de pruebas: se ve a simple vista que no es un correo real. El prefijo completo lleva un ID: `[PRUEBA VB · ID] `. */
export const MARCA_PRUEBA = '[PRUEBA VB'

/** ID corto y estable del correo de prueba (8 caracteres del hash de su clave de idempotencia; sin datos personales). Sin clave, uno al azar. */
export function idDePrueba(clave?: string): string {
  const base = clave && clave.length > 0 ? clave : randomUUID()
  return createHash('sha256').update(base).digest('hex').slice(0, 8).toUpperCase()
}
export const prefijoDePrueba = (id: string) => `${MARCA_PRUEBA} · ${id}] `

/** Hacia dónde apuntan los enlaces sensibles en un correo de pruebas: a una página cualquiera del sitio, sin efecto. */
export const ENLACE_INERTE = 'https://vivebienn.com/?enlace=deshabilitado-en-pruebas'

export function modoPruebasActivo(env: Record<string, string | undefined> = process.env): boolean {
  return env.CORREO_MODO_PRUEBAS === '1'
}

// Rutas que actúan sobre datos reales con sólo abrirse (confirmar o dar de baja una suscripción, aceptar/cancelar una cita) y cualquier
// enlace con un parámetro `t=` (token). En un correo de pruebas se sustituyen por `ENLACE_INERTE`: el token real ni siquiera sale.
const ENLACE_SENSIBLE = /https?:\/\/[^\s"'<>)]*(?:\/citas\/accion|\/correo\/(?:confirmar|baja|preferencias)|\/api\/correo\/|\/api\/citas\/|[?#&]t=)[^\s"'<>)]*/gi
export function neutralizarEnlaces(texto: unknown): string {
  return typeof texto === 'string' ? texto.replace(ENLACE_SENSIBLE, ENLACE_INERTE) : ''
}

/** Cabeceras que se conservan: sólo las que no son de destinatarios ni de baja (la baja de un correo de pruebas no debe poder actuar). */
const CABECERA_PROHIBIDA = /^(to|cc|bcc|cco|reply-to|list-unsubscribe|list-unsubscribe-post)$/i

/**
 * Reconstruye el cuerpo para el modo de pruebas desde una lista blanca: remitente, asunto y contenido del emisor; destinatario y
 * respuesta fijos; cabeceras seguras; enlaces sensibles neutralizados; sin adjuntos (un .ics lleva organizador y asistentes, y aceptarlo
 * enviaría una respuesta a una dirección real).
 */
export type OpcionesPrueba = {
  /** Tipo del mensaje (p. ej. `cita`): es lo único que se conserva del mensaje original. */
  tipo?: string
  /** `true` SOLO si quien llama garantiza que html/texto ya son sintéticos (p. ej. la vista previa del diseñador). Por omisión el contenido real se DESCARTA. */
  sintetico?: boolean
}
const etiquetaTipo = (t?: string) => (t ?? '').replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 40) || 'desconocido'

/** Contenido de reemplazo del modo de pruebas: sin nombres, teléfonos, mensajes, búsquedas, tokens ni enlaces. Depende SOLO del tipo. */
export function textoSinteticoDePrueba(tipo?: string): string {
  return `Correo de PRUEBA (contenido sintético). Tipo de mensaje: ${etiquetaTipo(tipo)}. En modo de pruebas el contenido real del mensaje (nombres, teléfonos, mensajes, búsquedas y enlaces) NO se envía.`
}

export function cuerpoDePruebas(c: Record<string, unknown>, id: string = idDePrueba(), o: OpcionesPrueba = {}): Record<string, unknown> {
  // PRIVACIDAD (F1): salvo que se garantice contenido sintético, el asunto y el cuerpo originales —que pueden traer datos reales— se descartan.
  const real = o.sintetico === true
  const asunto = real ? (typeof c.subject === 'string' ? c.subject : '') : etiquetaTipo(o.tipo)
  const cab: Record<string, string> = {}
  if (c.headers && typeof c.headers === 'object') {
    for (const [k, v] of Object.entries(c.headers as Record<string, unknown>)) {
      if (!CABECERA_PROHIBIDA.test(k.trim()) && typeof v === 'string' && !/[\r\n]/.test(v) && !/[\r\n]/.test(k)) cab[k] = neutralizarEnlaces(v)
    }
  }
  cab['X-Vive-Bien-Modo'] = 'pruebas'
  return {
    from: c.from,
    to: [DESTINO_PRUEBAS],
    reply_to: NEGOCIO.email,
    subject: asunto.startsWith(MARCA_PRUEBA) ? asunto : `${prefijoDePrueba(id)}${asunto.replace(/[\r\n]+/g, ' ')}`,
    html: real ? neutralizarEnlaces(c.html) : `<p>${textoSinteticoDePrueba(o.tipo)}</p>`,
    text: real ? neutralizarEnlaces(c.text) : textoSinteticoDePrueba(o.tipo),
    headers: cab,
  }
}

const CLAVES_PERMITIDAS = new Set(['from', 'to', 'reply_to', 'subject', 'html', 'text', 'headers'])

/**
 * Última barrera: el cuerpo que va al proveedor sólo puede tener UN destinatario (el de pruebas) y ninguna clave fuera de la lista
 * (copias, adjuntos, programación…). Se llama justo antes de enviar, sobre el objeto ya armado. Lanza si algo se escapó.
 */
export function exigirSoloDestinoDePruebas(cuerpo: Record<string, unknown>): void {
  const to = cuerpo.to
  if (!Array.isArray(to) || to.length !== 1 || to[0] !== DESTINO_PRUEBAS) throw new Error('fuga_modo_pruebas')
  if (Object.keys(cuerpo).some((k) => !CLAVES_PERMITIDAS.has(k))) throw new Error('fuga_modo_pruebas')
  // Las respuestas tampoco pueden irse a otra dirección: en modo de pruebas el «reply_to» es siempre el institucional.
  if (cuerpo.reply_to !== NEGOCIO.email) throw new Error('fuga_modo_pruebas')
  const cab = cuerpo.headers
  if (cab !== undefined && (!cab || typeof cab !== 'object' || Array.isArray(cab))) throw new Error('fuga_modo_pruebas')
  if (cab) {
    // Ni una cabecera de destinatarios o de baja, ni un salto de línea en una cabecera (así no se inyecta «Bcc:» dentro de otra).
    for (const [k, v] of Object.entries(cab as Record<string, unknown>)) {
      if (CABECERA_PROHIBIDA.test(k.trim()) || /[\r\n]/.test(k) || typeof v !== 'string' || /[\r\n]/.test(v)) throw new Error('fuga_modo_pruebas')
    }
  }
}

type Llamada = {
  apiKey: string
  cuerpo: Record<string, unknown>
  /** Cabecera `Idempotency-Key` (sólo la usan los emisores que ya la usaban). */
  idempotencia?: string
  fetch?: typeof fetch
  /** Para pruebas; por defecto se lee `CORREO_MODO_PRUEBAS`. */
  modoPruebas?: boolean
  /** Tipo del mensaje y si su contenido ya es sintético (ver `OpcionesPrueba`). Sólo se usan en modo de pruebas. */
  tipo?: string
  sintetico?: boolean
}

/** Llama a Resend. En modo de pruebas redirige y revisa el cuerpo; si algo no cuadra lanza `fuga_modo_pruebas` SIN llamar al proveedor. */
export async function llamarResend(l: Llamada): Promise<Response> {
  const pruebas = l.modoPruebas ?? modoPruebasActivo()
  let cuerpo = l.cuerpo
  if (pruebas) {
    cuerpo = cuerpoDePruebas(l.cuerpo, idDePrueba(l.idempotencia), { tipo: l.tipo, sintetico: l.sintetico })
    exigirSoloDestinoDePruebas(cuerpo)
    // El asunto de una prueba SIEMPRE empieza por `[PRUEBA VB · ID]`: sin eso no se manda (no se puede confundir con un correo real).
    if (!/^\[PRUEBA VB · [0-9A-F]{8}\] /.test(String(cuerpo.subject))) throw new Error('fuga_modo_pruebas')
  }
  // BARRERA DE SALIDA (servidor, F2): FUERA DE PRODUCCIÓN esta función NO toca la red del proveedor, pase lo que pase (ruta, cron, reintento o lo que sea):
  // devuelve una respuesta SIMULADA. No depende de ninguna variable visual ni de que haya o no clave; ni siquiera un `fetch` inyectado se llama.
  // Producción es lo único que puede salir, y sólo si `VERCEL_ENV` lo dice (Preview, desarrollo y pruebas son otra cosa).
  if (entornoDeCupo() !== 'produccion') {
    return new Response(JSON.stringify({ id: `simulado_${idDePrueba(l.idempotencia).toLowerCase()}` }), { status: 200, headers: { 'content-type': 'application/json', 'x-vive-bien-simulado': '1' } })
  }
  return (l.fetch ?? fetch)(URL_RESEND, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${l.apiKey}`,
      'Content-Type': 'application/json',
      ...(l.idempotencia ? { 'Idempotency-Key': l.idempotencia } : {}),
    },
    body: JSON.stringify(cuerpo),
  })
}

/**
 * Lectura AUTOMÁTICA del consumo de Resend (D-82). La llave de la aplicación es de SOLO ENVÍO: la API de uso (`GET /usage`) exige acceso completo, y una llave así
 * (que puede borrar dominios y llaves) no se guarda en el servidor para esto. Lo que SÍ devuelve Resend son las cabeceras de cuota `x-resend-daily-quota` (día UTC;
 * sólo plan gratuito) y `x-resend-monthly-quota` (ciclo mensual): el consumo YA usado de la cuenta, de TODOS sus servicios.
 *
 * Se piden con un `POST /emails` de cuerpo VACÍO: Resend lo rechaza por validación (faltan remitente, destinatario y asunto) ANTES de enviar nada, así que no
 * sale ningún correo ni se gasta cupo. FUERA DE PRODUCCIÓN no toca la red (misma barrera que `llamarResend`). Si falta una cabecera o no es un entero, NO inventa
 * nada: devuelve el motivo y los nombres de cabecera vistos (sin valores sensibles) para poder corregir.
 */
export type MotivoSinLectura = 'fuera_de_produccion' | 'sin_llave' | 'red' | 'sin_cabecera_diaria' | 'sin_cabecera_mensual' | 'cabecera_invalida'
export type LecturaDeCuota =
  | { ok: true; dia: number; mes: number }
  | { ok: false; motivo: MotivoSinLectura; estado?: number; cabeceras?: string[]; crudo?: { dia: string | null; mes: string | null } }

const ENTERO_DE_CUOTA = /^\d{1,7}$/
// Sólo para diagnóstico: lo que hay en la cabecera, recortado y sin nada que no sea un número o su separador.
const muestraDeCabecera = (v: string | null) => (v === null ? null : v.replace(/[^0-9a-zA-Z/.,; -]/g, '?').slice(0, 24))

export async function leerCuotaDeResend(l: { apiKey?: string; fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<LecturaDeCuota> {
  if (entornoDeCupo(l.env) !== 'produccion') return { ok: false, motivo: 'fuera_de_produccion' }
  const apiKey = (l.apiKey ?? '').trim()
  if (!apiKey) return { ok: false, motivo: 'sin_llave' }
  let r: Response
  try {
    r = await (l.fetch ?? fetch)(URL_RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    })
    await r.arrayBuffer().catch(() => null)
  } catch {
    return { ok: false, motivo: 'red' }
  }
  return cuotaDeCabeceras(r.headers, r.status)
}

/**
 * Interpreta las cabeceras de cuota de CUALQUIER respuesta de Resend (la sonda de arriba o la de un envío real). Pura: no toca la red ni la base.
 * Sólo acepta enteros limpios; cualquier otra cosa es «sin lectura» con el motivo, nunca un número inventado.
 */
export function cuotaDeCabeceras(h: Headers, estado?: number): LecturaDeCuota {
  const cabeceras = [...h.keys()].filter((k) => /^(x-resend|ratelimit|retry-after)/i.test(k)).sort()
  const dia = h.get('x-resend-daily-quota')
  const mes = h.get('x-resend-monthly-quota')
  const base = { estado, cabeceras }
  if (dia === null) return { ok: false, motivo: 'sin_cabecera_diaria', ...base }
  if (mes === null) return { ok: false, motivo: 'sin_cabecera_mensual', ...base }
  if (!ENTERO_DE_CUOTA.test(dia.trim()) || !ENTERO_DE_CUOTA.test(mes.trim())) return { ok: false, motivo: 'cabecera_invalida', ...base, crudo: { dia: muestraDeCabecera(dia), mes: muestraDeCabecera(mes) } }
  return { ok: true, dia: Number(dia.trim()), mes: Number(mes.trim()) }
}
