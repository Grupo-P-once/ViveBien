/**
 * Google Analytics 4: eventos del sitio (24-oct-2026).
 *
 * Hasta hoy GA4 solo recibía las visitas básicas, mientras que el sitio registraba en su propia base acciones valiosas (ver una propiedad, buscar, guardar
 * favorito, usar el valuador) que no llegaban a Analytics. Este módulo traduce esas mismas acciones a los nombres que GA4 entiende y agrega los clics
 * en WhatsApp, teléfono y correo, que son lo que más importa a una inmobiliaria.
 *
 * REGLAS (las hace cumplir `tests/ga.test.ts`):
 *  · NUNCA datos personales: ni nombre, ni teléfono, ni correo, ni mensajes escritos por la persona. Solo categorías (tipo de propiedad, operación,
 *    zona) y valores numéricos. Un parámetro cuyo nombre sugiera un dato personal se descarta aunque alguien lo agregue por error.
 *  · Las áreas privadas (panel, cuenta, portal, citas, vista previa) no se miden.
 *  · Nunca lanza ni estorba: si GA no cargó (bloqueador de anuncios, sin conexión), no pasa nada.
 * Código puro salvo `enviarGa` y `desactivarEnRutaPrivada`, que tocan `window`.
 */
import type { NombreEvento } from './eventos'

export type ParamsGa = Record<string, string | number | boolean>

/** Áreas con sesión iniciada: no se miden. `/api` no se visita, pero se excluye por si acaso. */
export const RUTAS_PRIVADAS = ['/admin', '/dashboard', '/publicador', '/mi-cuenta', '/portal', '/citas', '/vista-previa', '/api'] as const

export function rutaPrivada(ruta: string | null | undefined): boolean {
  if (!ruta) return false
  return RUTAS_PRIVADAS.some((r) => ruta === r || ruta.startsWith(`${r}/`))
}

/** Nombres de parámetro que sugieren un dato personal: se descartan. */
const PARAM_PERSONAL = /(correo|e-?mail|mail|tel[eé]fono|phone|celular|whatsapp|nombre|name|mensaje|message|direcci[oó]n|address|curp|rfc|token|password|contrase)/i
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const DIGITOS = /\d[\d\s().-]{8,}\d/   // algo con pinta de teléfono

/**
 * Identificadores de propiedad: un UUID formado casi solo por dígitos y guiones (p. ej. «12345678-1234-…») PARECE un teléfono para el filtro de valores y
 * se descartaba en silencio, así que Analytics perdía el `item_id` de ~3 % de las propiedades. Un identificador no es un dato personal: se acepta si tiene
 * la forma de un identificador (letras, números, guion y guion bajo, hasta 64) y se descarta si no.
 */
const CLAVES_DE_IDENTIFICADOR = new Set(['item_id'])
const FORMA_DE_IDENTIFICADOR = /^[A-Za-z0-9_-]{1,64}$/

/** Deja solo valores simples y seguros: sin datos personales, con longitud acotada. */
export function paramsSeguros(entrada: Record<string, unknown> | null | undefined): ParamsGa {
  const salida: ParamsGa = {}
  for (const [k, v] of Object.entries(entrada ?? {})) {
    if (PARAM_PERSONAL.test(k) || !/^[a-z][a-z0-9_]{0,39}$/i.test(k)) continue
    if (typeof v === 'number' && Number.isFinite(v)) salida[k] = v
    else if (typeof v === 'boolean') salida[k] = v
    else if (typeof v === 'string') {
      const t = v.trim()
      if (CLAVES_DE_IDENTIFICADOR.has(k)) { if (FORMA_DE_IDENTIFICADOR.test(t)) salida[k] = t; continue }
      if (!t || EMAIL.test(t) || DIGITOS.test(t)) continue
      salida[k] = t.slice(0, 80)
    }
  }
  return salida
}

/** Evento interno del sitio → evento de GA4 (nombres recomendados por Google cuando existen). */
export function traducirEvento(nombre: NombreEvento, extra: { propiedadId?: string | null; datos?: Record<string, unknown> | null } = {}): { nombre: string; params: ParamsGa } | null {
  const id: ParamsGa = extra.propiedadId ? { item_id: extra.propiedadId } : {}
  const datos = paramsSeguros(extra.datos)
  switch (nombre) {
    case 'property_view': return { nombre: 'view_item', params: { ...id } }
    case 'property_favorite': return { nombre: 'add_to_wishlist', params: { ...id } }
    case 'property_unfavorite': return { nombre: 'remove_from_wishlist', params: { ...id } }
    case 'search_performed': {
      const termino = Object.values(datos).filter((v) => typeof v === 'string').join(' ').slice(0, 80)
      return { nombre: 'search', params: { ...datos, ...(termino ? { search_term: termino } : {}), filtros_activos: Object.keys(datos).length } }
    }
    case 'contact_started': return { nombre: 'contact_started', params: { ...id } }
    case 'valuation_calculated': return { nombre: 'valuation_calculated', params: { ...datos } }
    case 'blog_view': return { nombre: 'select_content', params: { content_type: 'articulo' } }
    case 'property_card_click': return { nombre: 'select_item', params: { ...id } }
    case 'property_share': return { nombre: 'share', params: { ...id, content_type: 'propiedad', method: String(extra.datos?.canal ?? 'otro') } }
    case 'property_contact_click': {
      const canal = String(extra.datos?.canal ?? '')
      const lugar: ParamsGa = typeof extra.datos?.lugar === 'string' ? { link_location: extra.datos.lugar } : {}
      const ga = canal === 'whatsapp' ? 'click_whatsapp' : canal === 'telefono' ? 'click_phone' : canal === 'correo' ? 'click_email' : null
      return ga ? { nombre: ga, params: { ...id, ...lugar } } : null
    }
    default: return null
  }
}

export type ClicDeContacto = 'click_whatsapp' | 'click_phone' | 'click_email'

/** ¿Este enlace es un contacto directo? Mira solo el esquema y el host: nunca guarda el número ni el correo. */
export function tipoDeEnlace(href: string | null | undefined): ClicDeContacto | null {
  if (!href) return null
  const h = href.trim().toLowerCase()
  if (h.startsWith('tel:')) return 'click_phone'
  if (h.startsWith('mailto:')) return 'click_email'
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)(\/|\?|$)/.test(h)) return 'click_whatsapp'
  return null
}

type Gtag = (...args: unknown[]) => void
const gtag = (): Gtag | null => (typeof window !== 'undefined' && typeof (window as unknown as { gtag?: Gtag }).gtag === 'function' ? (window as unknown as { gtag: Gtag }).gtag : null)

/** Manda un evento a GA4. Nunca lanza. En rutas privadas no hace nada. */
export function enviarGa(nombre: string, params: Record<string, unknown> = {}): void {
  try {
    if (typeof window === 'undefined' || rutaPrivada(window.location.pathname)) return
    gtag()?.('event', nombre, paramsSeguros(params))
  } catch { /* la analítica nunca estorba */ }
}

/** Apaga o enciende la medición según la ruta (GA lo respeta con `window['ga-disable-ID']`). */
export function desactivarEnRutaPrivada(ruta: string | null | undefined, ids: readonly string[]): void {
  try { for (const id of ids) (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = rutaPrivada(ruta) } catch { /* nada */ }
}

/** Texto para el `<script>` del `<head>`: si la primera carga ya es una ruta privada, GA nace apagado. Cadena fija y sin datos del usuario. */
export function guardiaInicial(ids: readonly string[]): string {
  const patron = RUTAS_PRIVADAS.map((r) => r.slice(1)).join('|')
  return `if(new RegExp('^/(${patron})(/|$)').test(location.pathname)){${ids.map((id) => `window['ga-disable-${id}']=true;`).join('')}}`
}

/** `gtag('config', …)` para cada propiedad. */
export function configuracionGtag(ids: readonly string[]): string {
  return ids.map((id) => `gtag('config','${id}');`).join('')
}
