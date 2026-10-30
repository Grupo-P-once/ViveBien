import { esRelleno } from './slug'

/**
 * Cómo se nombra y cómo se enlaza una propiedad, en un solo sitio.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA
 *
 * Había al menos ocho pantallas que decidían por su cuenta qué enseñar cuando
 * una propiedad no tenía título, y casi todas hacían lo mismo:
 *
 *     {p.titulo ?? p.id}
 *
 * Es decir: si no hay nombre, se enseña la clave interna. En el comparador, en
 * el mapa, en las gráficas del panel y en los favoritos, una nave industrial se
 * llamaba literalmente «propiedad-sin-titulo-d52n». Y el mensaje de WhatsApp
 * de la ficha le mandaba al cliente «(ID: propiedad-sin-titulo-d52n)».
 *
 * Además 'Propiedad sin título' —el relleno que ponía el panel— pasaba por un
 * título de verdad, así que ni siquiera se activaba el «?? p.id»: se enseñaba
 * el relleno como si alguien lo hubiera escrito a propósito.
 * ─────────────────────────────────────────────────────────────
 *
 * Regla: **una clave interna no se le enseña nunca a una persona**.
 */

/** Lo que hace falta para nombrarla. El id no: un nombre nunca sale del id. */
export type PropiedadNombrable = {
  titulo?: string | null
  tipo?: string | null
  operacion?: string | null
  ubicacion?: string | null
}

const TIPOS: Record<string, string> = {
  casa: 'Casa',
  departamento: 'Departamento',
  terreno: 'Terreno',
  nave: 'Nave industrial',
  bodega: 'Bodega',
  local: 'Local comercial',
  comercial: 'Local comercial',
  oficina: 'Oficina',
}

/** Lo que se enseña cuando de verdad no hay nada con qué nombrarla. */
export const SIN_NOMBRE = 'Borrador sin título'

/**
 * El título que ya escribió alguien, o `null` si no lo hay.
 *
 * Distinto de `nombreDe`: sirve para saber si falta, no para enseñar algo.
 */
export function tituloReal(p: { titulo?: string | null }): string | null {
  const t = (p.titulo ?? '').trim()
  return t && !esRelleno(t) ? t : null
}

/**
 * El nombre de una propiedad para enseñárselo a alguien.
 *
 * 1. El título que escribió quien publicó, si es de verdad.
 * 2. Si no, uno armado con lo que sí se sabe: «Nave industrial en renta».
 * 3. Si no se sabe ni eso, `SIN_NOMBRE`.
 *
 * Nunca el id.
 */
export function nombreDe(p: PropiedadNombrable): string {
  const real = tituloReal(p)
  if (real) return real

  const tipo = TIPOS[(p.tipo ?? '').toLowerCase()]
  const op = p.operacion === 'venta' ? 'en venta' : p.operacion === 'renta' ? 'en renta' : null
  if (tipo) return [tipo, op].filter(Boolean).join(' ')

  return SIN_NOMBRE
}

/** `true` si el nombre que se enseña no es un título escrito por alguien. */
export function nombreProvisional(p: PropiedadNombrable): boolean {
  return tituloReal(p) === null
}

/**
 * La ruta pública de la ficha.
 *
 * Usa el `slug` cuando existe (migración 10) y cae al id cuando no. Las dos
 * funcionan: la ficha resuelve por cualquiera de las dos y, si llega por id
 * habiendo slug, redirige de forma permanente al slug. Así un enlace viejo
 * compartido por WhatsApp sigue llevando al sitio correcto.
 */
export function rutaDe(p: { id: string; slug?: string | null }): string {
  const nombre = (p.slug ?? '').trim() || p.id
  return `/propiedades/${encodeURIComponent(nombre)}`
}

/**
 * Las columnas de `propiedades` que el público puede leer.
 *
 * ─────────────────────────────────────────────────────────────
 * V-1.1.77 (fase 1 del PRD v2.0, hallazgo SEC-02)
 *
 * Con la clave anónima —que viaja en el navegador— se podían leer TODAS las
 * columnas de una publicada: el dueño, las notas de moderación, el WhatsApp y
 * el teléfono del anuncio, la calle y el CP. La migración 18 deja al rol
 * anónimo leer sólo estas. Por eso toda lectura anónima pide esta lista y
 * nunca `select('*')` (que con permisos por columna falla).
 *
 * Fuera a propósito: owner_id, whatsapp, telefono, calle, cp, completitud,
 * revisado_por, revisado_en, nota_moderacion, enviada_en y los contadores
 * internos (vistas, favoritos_n, contactos_n).
 *
 * Pendiente (fase 5, revisiones): coordenadas exactas de las marcadas
 * «aproximada». El mapa ya no las pinta, pero el dato viaja.
 * ─────────────────────────────────────────────────────────────
 */
export const COLUMNAS_PUBLICAS = [
  'id', 'slug', 'folio', 'titulo', 'tipo', 'subtipo', 'operacion',
  'precio', 'precio_incluye_iva', 'moneda', 'mantenimiento',
  'ubicacion', 'colonia', 'ciudad', 'estado_dir', 'lat', 'lng', 'precision_ubicacion',
  'metros', 'recamaras', 'banos', 'altura_libre', 'andenes',
  'estatus', 'estado_pub', 'descripcion', 'fotos', 'videos', 'planos', 'amenidades', 'extras',
  'created_at', 'publicada_en',
] as const

/**
 * Lo mismo, listo para `select()`. Escrito a mano (no con `join`) porque el
 * cliente de Supabase sólo entiende los tipos de un texto literal; una prueba
 * comprueba que diga exactamente lo mismo que `COLUMNAS_PUBLICAS`.
 */
export const SELECT_PUBLICO =
  'id, slug, folio, titulo, tipo, subtipo, operacion, precio, precio_incluye_iva, moneda, mantenimiento, ubicacion, colonia, ciudad, estado_dir, lat, lng, precision_ubicacion, metros, recamaras, banos, altura_libre, andenes, estatus, estado_pub, descripcion, fotos, videos, planos, amenidades, extras, created_at, publicada_en' as const

/** Columnas que nunca deben salir al público (se comprueba en las pruebas). */
export const COLUMNAS_INTERNAS = [
  'owner_id', 'whatsapp', 'telefono', 'calle', 'cp', 'completitud', 'revisado_por',
  'revisado_en', 'nota_moderacion', 'enviada_en', 'vistas', 'favoritos_n', 'contactos_n',
] as const
