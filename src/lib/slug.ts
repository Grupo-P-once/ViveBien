/**
 * El nombre que una propiedad lleva en su URL.
 *
 * ─────────────────────────────────────────────────────────────
 * DE DÓNDE VIENE EL PROBLEMA
 *
 * El id de la tabla es también el slug de la URL, y se generaba **en el momento
 * de crear la fila**, a partir del título. Pero el panel crea el borrador
 * mandando un título de relleno:
 *
 *     body: JSON.stringify({ titulo: 'Propiedad sin título' })
 *
 * Así que la URL quedaba sellada antes de que nadie hubiera escrito nada. Una
 * nave industrial de verdad, publicada y con ocho fotos, vive hoy en
 * `/propiedades/propiedad-sin-titulo-d52n`.
 *
 * El título se corrige después; la URL no, porque nunca se volvía a mirar.
 * ─────────────────────────────────────────────────────────────
 *
 * Este módulo no decide cuándo renombrar —eso tiene consecuencias y se decide
 * fuera—; sólo sabe construir un nombre bueno cuando se le pide.
 */

/** Los datos con los que se puede construir un nombre. Todos opcionales. */
export type FuenteSlug = {
  titulo?: string | null
  tipo?: string | null
  operacion?: string | null
  ciudad?: string | null
  ubicacion?: string | null
}

const TIPOS: Record<string, string> = {
  casa: 'casa',
  departamento: 'departamento',
  terreno: 'terreno',
  nave: 'nave-industrial',
  bodega: 'bodega',
  local: 'local-comercial',
  comercial: 'local-comercial',
  oficina: 'oficina',
}

/** Títulos que no son títulos. Si el nombre saliera de aquí, no vale. */
const RELLENO = [
  /^propiedad sin t[ií]tulo$/i,
  /^borrador( desde telegram)?$/i,
  /^sin t[ií]tulo$/i,
  /^nueva propiedad$/i,
  /^prop(iedad)?[\s-]*\d*$/i,
]

export function esRelleno(titulo?: string | null): boolean {
  const t = (titulo ?? '').trim()
  return !t || RELLENO.some((re) => re.test(t))
}

/** Texto libre → trozo de URL: sin acentos, sin símbolos, sin dobles guiones. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // La ñ se pierde en NFD como «n» + tilde, que ya se quitó arriba. Pero hay
    // textos que llegan sin descomponer, así que se traduce explícitamente.
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Corta por guion entero: `nave-industrial-en-ven` no es media palabra útil. */
function recortarEnGuion(s: string, tope: number): string {
  if (s.length <= tope) return s
  const corte = s.slice(0, tope)
  const ultimo = corte.lastIndexOf('-')
  return (ultimo > tope * 0.5 ? corte.slice(0, ultimo) : corte).replace(/-+$/, '')
}

/**
 * El nombre de una propiedad para su URL, **sin sufijo único**.
 *
 *     casa-en-venta-canada-del-refugio-leon
 *     nave-industrial-en-renta-leon
 *
 * Se arma de tipo + operación + lo que el título aporte + ciudad, en ese orden,
 * porque es el orden en que la gente busca. Si el título es de relleno se
 * ignora, que es justo lo que no se hacía.
 *
 * Devuelve `null` cuando no hay nada real con lo que construirlo. Un `null`
 * explícito obliga a quien llama a decidir; un `'propiedad'` silencioso es
 * cómo se llegó hasta aquí.
 */
export function slugDe(p: FuenteSlug): string | null {
  const tipo = TIPOS[(p.tipo ?? '').toLowerCase().trim()] ?? null
  const op = p.operacion === 'venta' ? 'en-venta' : p.operacion === 'renta' ? 'en-renta' : null

  const propio = esRelleno(p.titulo) ? '' : normalizar(p.titulo!)
  const ciudad = p.ciudad ? normalizar(p.ciudad) : ''

  const trozos: string[] = []
  const yaDicho = new Set<string>()

  for (const trozo of [tipo, op, propio, ciudad]) {
    if (!trozo) continue
    // Sin repetir palabras: «casa-en-venta-casa-en-venta-leon-leon» sale solo
    // en cuanto el título ya dice el tipo, y es lo normal que lo diga.
    const nuevas = trozo.split('-').filter((w) => w && !yaDicho.has(w))
    if (!nuevas.length) continue
    nuevas.forEach((w) => yaDicho.add(w))
    trozos.push(nuevas.join('-'))
  }

  const slug = recortarEnGuion(trozos.join('-'), 70)
  return slug || null
}

/**
 * El nombre definitivo, con un sufijo corto que lo hace único.
 *
 * El sufijo hace falta de verdad: dos terrenos del mismo parque, los dos de
 * 600 m², la misma operación y la misma ciudad, producen el mismo nombre. Sin
 * sufijo, el segundo pisaría al primero.
 *
 * `semilla` debe ser algo estable de la propiedad —su id interno—, nunca la
 * hora: un nombre que cambia cada vez que se recalcula no es un nombre.
 */
export function slugUnico(p: FuenteSlug, semilla: string, intento = 0): string | null {
  const base = slugDe(p)
  if (!base) return null
  return `${base}-${sufijo(intento === 0 ? semilla : `${semilla}#${intento}`, intento === 0 ? 4 : 4 + 2 * intento)}`
}

/**
 * Caracteres estables a partir de un texto. El intento 0 son cuatro y es el que ya tienen las propiedades publicadas (no se
 * cambia: un slug que cambia es una URL rota). Si choca con otro, cada reintento usa más caracteres y otra semilla: el mismo
 * nombre que choca ya no se reintenta idéntico para siempre.
 */
function sufijo(semilla: string, largo = 4): string {
  let h = 5381
  let h2 = 52711
  for (let i = 0; i < semilla.length; i++) {
    h = ((h << 5) + h + semilla.charCodeAt(i)) >>> 0
    h2 = ((h2 << 5) ^ (h2 >>> 2) ^ semilla.charCodeAt(i)) >>> 0
  }
  const texto = largo <= 4 ? h.toString(36) : h.toString(36) + h2.toString(36)
  return texto.slice(-largo).padStart(largo, '0')
}

/**
 * Si un id ya sirve tal cual como dirección pública.
 *
 * `sanjuan` y `tzula-castillos` se crearon a mano con buen nombre y llevan
 * tiempo publicadas: darles un slug nuevo sería redirigir URLs que están bien,
 * y cada redirección cuesta algo de señal. Sólo necesitan nombre público los ids
 * que nunca debieron verse:
 *
 *   · `propiedad-sin-titulo-d52n` — el relleno sellado como URL
 *   · `borrador-mf3k8x2p`        — la clave interna de las altas nuevas
 *   · `tg-n1003782780222-mf3k8x` — el id del chat de Telegram, en la barra de direcciones
 *   · `prop-1726…`               — el respaldo numérico del generador viejo
 */
export function idPresentable(id: string): boolean {
  // Un UUID es la clave técnica de las altas nuevas: nunca es una dirección pública (el nombre sale del slug).
  return !/(^|-)sin-titulo(-|$)|^borrador-|^tg-|^prop-\d|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
}
