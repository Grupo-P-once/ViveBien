/**
 * Reglas de la auditoría técnica del sitio público. Código puro: recibe lo que el rastreador leyó de cada página y devuelve hallazgos con
 * gravedad, evidencia y cómo corregirlos. NO inventa métricas: el «índice» es solo un resumen orientativo de esta lista, no una medida de Google.
 *
 * Qué NO se exige aquí a propósito: un solo H1 (Google admite varios), longitudes exactas de título/descripción (son orientativas), FAQPage,
 * `llms.txt`. Ver la skill `vivebien-seo` y la guía oficial de Google.
 */
import type { HechosPagina } from './html'
import type { ResultadoJsonLd } from './jsonld'

export type Gravedad = 'critica' | 'alta' | 'media' | 'baja'
export type Hallazgo = { id: string; gravedad: Gravedad; ruta: string; mensaje: string; evidencia: string; correccion: string }

export type PaginaRastreada = {
  url: string
  ruta: string
  /** Código HTTP final de la primera respuesta (sin seguir redirecciones). null = no respondió. */
  estado: number | null
  /** A dónde redirige (cabecera Location), si lo hace. */
  redireccion: string | null
  ms: number
  hechos: HechosPagina | null
  jsonld: ResultadoJsonLd | null
  /** null = no se pudo comprobar; true/false = la imagen para compartir responde 200 y es imagen. */
  ogImagenOk: boolean | null
  enSitemap: boolean
  error: string | null
}

/** Rutas que NO deben indexarse (el robots.txt las bloquea o llevan noindex): no se exige título, descripción ni canónica. */
export const RUTAS_INTERNAS = [/^\/admin/, /^\/dashboard/, /^\/publicador/, /^\/mi-cuenta/, /^\/portal/, /^\/citas/, /^\/vista-previa/, /^\/api\//, /^\/comparar/, /^\/entrar/, /^\/p\//]
export const esInterna = (ruta: string) => RUTAS_INTERNAS.some((r) => r.test(ruta))

const PESO: Record<Gravedad, number> = { critica: 15, alta: 6, media: 2, baja: 0.5 }
const h = (id: string, gravedad: Gravedad, ruta: string, mensaje: string, evidencia: string, correccion: string): Hallazgo => ({ id, gravedad, ruta, mensaje, evidencia, correccion })

const sinHashNiConsulta = (u: string) => u.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/'
const rutaDe = (u: string) => { try { return sinHashNiConsulta(new URL(u).pathname) } catch { return sinHashNiConsulta(u) } }

export function auditarPagina(p: PaginaRastreada): Hallazgo[] {
  const out: Hallazgo[] = []
  const r = p.ruta
  if (p.estado == null) { out.push(h('sin-respuesta', 'critica', r, 'La página no respondió.', p.error ?? 'Sin respuesta o tiempo agotado.', 'Revisar el despliegue y el servidor; una URL que no responde no se indexa.')); return out }
  if (p.estado >= 500) out.push(h('http-5xx', 'critica', r, `Error del servidor (${p.estado}).`, `HTTP ${p.estado}`, 'Corregir el error; Google deja de indexar páginas que fallan de forma repetida.'))
  else if (p.estado === 404 && p.enSitemap) out.push(h('sitemap-404', 'alta', r, 'Una URL del sitemap responde 404.', 'HTTP 404 y está en sitemap.xml', 'Quitarla del sitemap o restaurar la página.'))
  else if (p.estado >= 300 && p.estado < 400 && p.enSitemap) out.push(h('sitemap-redirige', 'media', r, 'Una URL del sitemap redirige.', `HTTP ${p.estado} → ${p.redireccion ?? '?'}`, 'El sitemap debe listar solo las URL finales (canónicas).'))
  if (p.ms > 2500) out.push(h('lenta', p.ms > 5000 ? 'media' : 'baja', r, 'La respuesta del servidor es lenta.', `${Math.round(p.ms)} ms hasta recibir la página`, 'Revisar caché y consultas del servidor; afecta la experiencia y el rastreo.'))
  if (p.estado !== 200 || !p.hechos) return out
  if (esInterna(r)) return out   // páginas internas: aquí no se exigen requisitos de indexación

  const f = p.hechos
  if (f.noindex && p.enSitemap) out.push(h('noindex-en-sitemap', 'critica', r, 'La página está en el sitemap pero tiene «noindex».', `robots: ${f.robotsMeta}`, 'Quitar el noindex o sacarla del sitemap: Google recibe órdenes contradictorias.'))
  else if (f.noindex) out.push(h('noindex', 'media', r, 'Página pública con «noindex».', `robots: ${f.robotsMeta}`, 'Confirmar que es a propósito; si debe posicionar, quitar el noindex.'))
  if (!f.titulo) out.push(h('sin-titulo', 'alta', r, 'Falta el título (<title>).', 'No hay <title>', 'Añadir un título único que describa la página.'))
  else if (f.titulo.length > 70) out.push(h('titulo-largo', 'baja', r, 'Título largo: Google puede recortarlo (referencia orientativa, no regla).', `${f.titulo.length} caracteres`, 'Acortar manteniendo lo esencial al principio.'))
  if (!f.descripcion) out.push(h('sin-descripcion', 'media', r, 'Falta la meta descripción.', 'No hay <meta name="description">', 'Escribir un resumen único de 70–160 caracteres (orientativo).'))
  if (f.h1.length === 0) out.push(h('sin-h1', 'alta', r, 'La página no tiene encabezado principal (H1).', 'Cero <h1> visibles', 'Añadir un H1 que describa el tema.'))
  if (!f.canonica) out.push(h('sin-canonica', 'alta', r, 'Falta la URL canónica.', 'No hay <link rel="canonical">', 'Declarar la canónica propia de cada página (nunca heredada del layout).'))
  else if (rutaDe(f.canonica) !== sinHashNiConsulta(r) && !/^\/blog\?/.test(r)) out.push(h('canonica-distinta', 'media', r, 'La canónica apunta a otra URL.', `canónica ${rutaDe(f.canonica)} ≠ página ${r}`, 'Si la página debe indexarse por sí misma, que su canónica sea ella misma.'))
  if (!f.viewport) out.push(h('sin-viewport', 'alta', r, 'Falta el viewport para móviles.', 'No hay <meta name="viewport">', 'Añadir width=device-width, initial-scale=1.'))
  if (!f.lang) out.push(h('sin-lang', 'baja', r, 'La etiqueta <html> no declara el idioma.', 'Sin atributo lang', 'Añadir lang="es-MX".'))
  if (!f.ogImagen) out.push(h('sin-og-imagen', 'media', r, 'Falta la imagen para compartir (og:image).', 'No hay og:image', 'Declarar una imagen 1200×630 (se ve al compartir en WhatsApp y redes).'))
  else if (p.ogImagenOk === false) out.push(h('og-imagen-rota', 'media', r, 'La imagen para compartir no responde.', f.ogImagen, 'Corregir la ruta o subir la imagen.'))
  if (f.imagenes.sinAlt > 0) out.push(h('imagenes-sin-alt', 'media', r, 'Imágenes sin atributo alt.', `${f.imagenes.sinAlt} de ${f.imagenes.total}`, 'Describir las imágenes con contenido; usar alt="" solo en las decorativas.'))
  if (p.jsonld) {
    if (p.jsonld.invalidos > 0) out.push(h('jsonld-invalido', 'alta', r, 'Datos estructurados con JSON inválido.', `${p.jsonld.invalidos} de ${p.jsonld.bloques} bloques`, 'Corregir el JSON-LD: Google lo ignora.'))
    for (const a of p.jsonld.avisos.filter((x) => !/no es JSON válido/.test(x))) out.push(h('jsonld-aviso', 'baja', r, a, 'Revisión del JSON-LD', 'Revisar con la prueba de resultados enriquecidos de Google.'))
  }
  const contenidoLargo = /^\/(blog\/[^/]+|propiedades\/[^/]+)$/.test(r)
  if (contenidoLargo && f.palabras < 150) out.push(h('contenido-escaso', 'baja', r, 'Poco texto visible (orientativo).', `${f.palabras} palabras`, 'Añadir información útil y verificable; no rellenar por rellenar.'))
  return out
}

/** Reglas que solo se ven mirando varias páginas a la vez. */
export function auditarSitio(paginas: PaginaRastreada[]): Hallazgo[] {
  const out: Hallazgo[] = []
  const indexables = paginas.filter((p) => p.estado === 200 && p.hechos && !esInterna(p.ruta) && !p.hechos.noindex)
  for (const [campo, etiqueta, id] of [['titulo', 'título', 'titulo-duplicado'], ['descripcion', 'meta descripción', 'descripcion-duplicada']] as const) {
    const grupos = new Map<string, string[]>()
    for (const p of indexables) { const v = p.hechos?.[campo]?.trim(); if (v) grupos.set(v, [...(grupos.get(v) ?? []), p.ruta]) }
    for (const [v, rutas] of grupos) if (rutas.length > 1) out.push(h(id, 'media', rutas[0], `${rutas.length} páginas comparten la misma ${etiqueta}.`, `«${v.slice(0, 80)}» en ${rutas.slice(0, 4).join(', ')}${rutas.length > 4 ? '…' : ''}`, 'Cada página debe tener la suya.'))
  }
  // Páginas indexables que no aparecen en el sitemap (se rastrearon por otro camino)
  const fuera = indexables.filter((p) => !p.enSitemap && !/^\/(blog\?|ayuda\/buscar)/.test(p.ruta))
  for (const p of fuera.slice(0, 20)) out.push(h('fuera-del-sitemap', 'baja', p.ruta, 'Página pública que no está en el sitemap.', 'Se alcanzó pero sitemap.xml no la lista', 'Añadirla si debe posicionar.'))
  return out
}

export function resumir(hallazgos: Hallazgo[], paginas: PaginaRastreada[]) {
  const por: Record<Gravedad, number> = { critica: 0, alta: 0, media: 0, baja: 0 }
  for (const x of hallazgos) por[x.gravedad]++
  const penalizacion = hallazgos.reduce((s, x) => s + PESO[x.gravedad], 0)
  const base = Math.max(1, paginas.filter((p) => !esInterna(p.ruta)).length)
  // Índice ORIENTATIVO de esta lista de hallazgos (no es una medida de Google): 100 menos la penalización repartida por página, con mínimo 0.
  const indice = Math.max(0, Math.round(100 - (penalizacion / base) * 10))
  const respuestas = paginas.filter((p) => p.estado != null)
  const ms = respuestas.length ? Math.round(respuestas.reduce((s, p) => s + p.ms, 0) / respuestas.length) : null
  return { paginas: paginas.length, porGravedad: por, indice, msMedio: ms, con200: paginas.filter((p) => p.estado === 200).length }
}
