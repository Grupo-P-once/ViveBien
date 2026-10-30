/**
 * Modelo del blog de VIVE BIEN (21-oct-2026). Código puro: sin React ni base de datos.
 * Plan: Obsidian «Investigación y plan — Blog inmobiliario para SEO» y «Plan — Blog automático con aprobación por Telegram».
 *
 * Un artículo es una lista de BLOQUES tipados (no HTML crudo, no Markdown): así el diseño lo controla la plantilla, el índice de contenido sale
 * solo de los `h2`, y nada del contenido puede inyectar marcado. Los artículos fijos son archivos del repositorio; los semanales (fase 6) usarán
 * este mismo formato desde la base de datos, para que el diseño, el SEO y las pruebas sean los mismos.
 */

export type Categoria = 'comprar' | 'vender' | 'rentar' | 'naves-y-terrenos' | 'inversion-y-financiamiento' | 'leon-y-el-bajio'

export const CATEGORIAS: readonly { slug: Categoria; nombre: string; descripcion: string }[] = [
  { slug: 'comprar', nombre: 'Comprar', descripcion: 'Guías para comprar casa, departamento o terreno en León y el Bajío con seguridad.' },
  { slug: 'vender', nombre: 'Vender', descripcion: 'Cómo preparar, valorar y vender tu propiedad al mejor precio y sin sorpresas.' },
  { slug: 'rentar', nombre: 'Rentar', descripcion: 'Rentar o dar en renta: contratos, requisitos y qué revisar antes de firmar.' },
  { slug: 'naves-y-terrenos', nombre: 'Naves y terrenos', descripcion: 'Naves industriales, bodegas, locales y terrenos: lo que hay que verificar.' },
  { slug: 'inversion-y-financiamiento', nombre: 'Inversión y financiamiento', descripcion: 'Crédito, escrituración e inversión inmobiliaria explicados en claro.' },
  { slug: 'leon-y-el-bajio', nombre: 'León y el Bajío', descripcion: 'Zonas, colonias y parques industriales de León, Silao y el Bajío.' },
] as const

/** Bloques de contenido. `texto` admite **negritas** y [enlaces](/ruta) y nada más. */
export type Bloque =
  | { tipo: 'h2'; texto: string }
  | { tipo: 'h3'; texto: string }
  | { tipo: 'p'; texto: string }
  | { tipo: 'lista'; items: readonly string[] }
  | { tipo: 'pasos'; items: readonly string[] }
  | { tipo: 'aviso'; titulo?: string; texto: string }
  | { tipo: 'preguntas'; items: readonly { p: string; r: string }[] }
  /** Comparativo: la primera columna son los encabezados de fila. Sirve para fragmentos destacados y se lee bien en móvil (desplazamiento horizontal). */
  | { tipo: 'tabla'; titulo: string; encabezados: readonly string[]; filas: readonly (readonly string[])[] }

/**
 * Una referencia de página web o documento en línea, formato APA 7:
 *   Autor. (Año, día de mes). *Título*. Sitio. URL
 * `autor` es la organización («Instituto Nacional de Estadística y Geografía») o «Apellido, N.»; `fecha` es el año o «2026, 15 de octubre»,
 * y «s. f.» cuando la página no trae fecha. `sitio` solo si difiere del autor. La URL es https y es la que se enlaza.
 */
export type Referencia = { autor: string; fecha: string; titulo: string; sitio?: string; url: string }

/** Orden alfabético por autor, como pide APA (sin acentos ni mayúsculas); a igual autor, la más reciente primero. */
export function ordenarReferencias(lista: readonly Referencia[]): Referencia[] {
  return [...lista].sort((a, b) => normalizar(a.autor).localeCompare(normalizar(b.autor), 'es') || b.fecha.localeCompare(a.fecha))
}

/** Cita corta en el texto, APA: (Autor, Año). */
export function citaCorta(r: Referencia): string {
  const anio = r.fecha.match(/\d{4}/)?.[0] ?? 's. f.'
  return `(${r.autor}, ${anio})`
}

export type Articulo = {
  slug: string
  titulo: string
  /** Descripción para buscadores y tarjetas (≤ 155 caracteres). */
  resumen: string
  /** La búsqueda que el artículo quiere responder (una sola por artículo). Debe aparecer en el título, en el primer párrafo y en algún subtítulo (lo comprueba la guardia). */
  palabraClave: string
  categoria: Categoria
  /** ISO 8601 con zona. */
  publicado: string
  actualizado?: string
  autor: string
  portada: { src: string; alt: string; ancho: number; alto: number; credito?: CreditoFoto }
  cuerpo: readonly Bloque[]
  /** Referencias en formato APA 7 (obligatorias si el texto da cifras, plazos o normas). Solo se CITA: nunca se copia el texto de otros. */
  referencias?: readonly Referencia[]
  /** Aviso de «orientación general» para temas legales, fiscales o de crédito. */
  orientacionGeneral?: boolean
  /** Maqueta para ver el diseño: NUNCA se publica en producción ni entra al sitemap. */
  muestra?: boolean
  /** Sale primero en el listado (la guía principal del blog). Uno solo. */
  destacado?: boolean
}

export const AUTOR_EQUIPO = 'Equipo Vive Bien'
export const ARTICULOS_POR_PAGINA = 9

/** Palabras por minuto de lectura en pantalla (español). */
const PPM = 200

function textoPlano(b: Bloque): string {
  switch (b.tipo) {
    case 'h2': case 'h3': case 'p': return b.texto
    case 'aviso': return `${b.titulo ?? ''} ${b.texto}`
    case 'lista': case 'pasos': return b.items.join(' ')
    case 'preguntas': return b.items.map((i) => `${i.p} ${i.r}`).join(' ')
    case 'tabla': return `${b.titulo} ${b.encabezados.join(' ')} ${b.filas.map((f) => f.join(' ')).join(' ')}`
  }
}

export function palabras(a: Pick<Articulo, 'cuerpo'>): number {
  return a.cuerpo.map(textoPlano).join(' ').split(/\s+/).filter(Boolean).length
}

export function minutosDeLectura(a: Pick<Articulo, 'cuerpo'>): number {
  return Math.max(1, Math.round(palabras(a) / PPM))
}

/** Slug estable para los encabezados (índice y anclas): sin acentos, minúsculas, guiones. */
export function anclaDe(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function indiceDe(a: Pick<Articulo, 'cuerpo'>): { ancla: string; texto: string }[] {
  return a.cuerpo.flatMap((b) => (b.tipo === 'h2' ? [{ ancla: anclaDe(b.texto), texto: b.texto }] : []))
}

export function categoriaDe(slug: string) {
  return CATEGORIAS.find((c) => c.slug === slug)
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** «21 de octubre de 2026». Se calcula en UTC-6 (León no usa horario de verano desde 2022) para que servidor y navegador coincidan. */
export function fechaLarga(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3600_000)
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

/** Minúsculas y sin acentos: «León» y «leon» se encuentran entre sí. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Texto de la consulta tal como se usa: recortado y con tope (la URL la puede escribir cualquiera). */
export function limpiarConsulta(q: string | undefined): string {
  return (q ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** Búsqueda local sin servidor ni índice: todas las palabras deben aparecer en título, resumen, categoría o cuerpo. */
export function buscarArticulos<T extends Pick<Articulo, 'titulo' | 'resumen' | 'categoria' | 'cuerpo'>>(lista: readonly T[], consulta: string): T[] {
  const palabras = normalizar(limpiarConsulta(consulta)).split(' ').filter((p) => p.length > 1)
  if (palabras.length === 0) return [...lista]
  return lista.filter((a) => {
    const pajar = normalizar(`${a.titulo} ${a.resumen} ${categoriaDe(a.categoria)?.nombre ?? ''} ${a.cuerpo.map(textoPlano).join(' ')}`)
    return palabras.every((p) => pajar.includes(p))
  })
}

/** «21 OCT 2026» (la hoja de estilo lo pone en versales). Misma zona que `fechaLarga`. */
export function fechaCorta(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3600_000)
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`
}

export function slugValido(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 90
}

/** Crédito de una fotografía de terceros (licencia verificada en la ficha de origen). Obligatorio mostrarlo junto a la imagen. */
export interface CreditoFoto {
  autor: string
  titulo: string
  fuenteUrl: string
  licencia: string
  licenciaUrl?: string
  sitio: string
  /** Aviso honesto cuando la foto es ilustrativa (p. ej. «no es una propiedad de León»). */
  nota?: string
  adaptacion: string
}
