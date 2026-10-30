/**
 * Las reglas del Centro de Ayuda (V-1.1.94, fase 3c-3).
 *
 * Código puro: sin React, sin DOM, sin base de datos. Aquí se decide y en
 * otro sitio se ejecuta, para que cada caso se pruebe de verdad.
 *
 * ─────────────────────────────────────────────────────────────
 * DOS ESTADOS QUE NO SON LO MISMO
 *
 *   estado           dónde está el ARTÍCULO en el flujo editorial
 *   estadoDelProducto  si la FUNCIÓN que describe existe hoy
 *
 * Confundirlos es la forma más fácil de mentir sin querer. Un artículo
 * PUBLICADO puede describir algo `futuro` —la gente pregunta por lo que
 * viene— siempre que lo diga. Lo que no puede pasar nunca es que una función
 * que no existe parezca disponible.
 *
 * Por eso `puedePublicarse` exige un aviso cuando la función no está
 * disponible del todo, y la base lo exige también con un CHECK: si alguien
 * escribe directo en SQL, tampoco cuela.
 *
 * LA IA NO PUBLICA
 *
 * Puede redactar, resumir y proponer versiones. La transición a PUBLICADO la
 * autoriza una persona con `ayuda.publicar`. Esa regla vive en
 * `transicionValida` y en el servidor, no en la interfaz.
 * ─────────────────────────────────────────────────────────────
 */

/** Dónde está el artículo en el flujo editorial. */
export type Estado =
  | 'BORRADOR'
  | 'EN_REVISION'
  | 'APROBADO'
  | 'PUBLICADO'
  | 'DESACTUALIZADO'
  | 'ARCHIVADO'

/** Si la funcionalidad que el artículo describe existe hoy. */
export type EstadoDelProducto = 'disponible' | 'parcial' | 'futuro' | 'no_disponible'

/**
 * Quién puede leerlo. **Nunca se mezclan.** Lo público es lo que puede saber
 * cualquiera; los otros tres son internos y no salen del panel.
 */
export type Ambito = 'publica' | 'publicador' | 'administrativa' | 'tecnica'

/** De dónde sale la verdad de un artículo. */
export type TipoDeFuente =
  | 'product' | 'route' | 'component' | 'api'
  | 'permission' | 'documentation' | 'legal' | 'test' | 'migration'

export type Fuente = { tipo: TipoDeFuente; clave: string; version?: string; detalle?: string }

export type Articulo = {
  slug: string
  titulo: string
  resumen?: string
  cuerpo?: string
  ambito: Ambito
  estado: Estado
  estadoDelProducto: EstadoDelProducto
  /** Obligatorio si la función no está disponible del todo. */
  aviso?: string
  prioridad: number
}

/* ─── El flujo editorial ─────────────────────────────────────────────── */

/**
 * Qué transiciones existen. Lo que no está aquí, no pasa.
 *
 * `DESACTUALIZADO` no es un callejón sin salida: de ahí se vuelve a revisión
 * cuando alguien se pone con ello. Y un artículo publicado puede quedarse
 * desactualizado **solo**, cuando el producto cambia — pero eso lo marca el
 * motor, no publica nada por su cuenta.
 */
export const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  BORRADOR: ['EN_REVISION', 'ARCHIVADO'],
  EN_REVISION: ['BORRADOR', 'APROBADO', 'ARCHIVADO'],
  APROBADO: ['PUBLICADO', 'EN_REVISION', 'ARCHIVADO'],
  PUBLICADO: ['DESACTUALIZADO', 'EN_REVISION', 'ARCHIVADO'],
  DESACTUALIZADO: ['EN_REVISION', 'ARCHIVADO'],
  ARCHIVADO: ['BORRADOR'],
}

export function transicionValida(de: Estado, a: Estado): boolean {
  return TRANSICIONES[de]?.includes(a) ?? false
}

/**
 * ¿Publicar requiere aprobación humana? **Siempre.**
 *
 * Está como función y no como comentario para que se pueda probar: si algún
 * día alguien añade un camino automático a PUBLICADO, la prueba se rompe.
 */
export function requiereAprobacionHumana(a: Estado): boolean {
  return a === 'PUBLICADO'
}

export type Veredicto = { ok: true } | { ok: false; motivo: string }

/**
 * ¿Se puede publicar este artículo?
 *
 * Tres cosas, y la tercera es la que importa: **una función que no está
 * disponible del todo tiene que avisarlo**. Sin eso, publicar el artículo
 * sería prometer algo que no existe.
 */
export function puedePublicarse(a: Articulo): Veredicto {
  if (!a.titulo?.trim()) return { ok: false, motivo: 'Un artículo sin título no se publica.' }
  if (!a.cuerpo?.trim()) return { ok: false, motivo: 'Un artículo sin cuerpo no se publica.' }
  if (a.estadoDelProducto !== 'disponible' && !a.aviso?.trim()) {
    return {
      ok: false,
      motivo: `La función que describe está «${a.estadoDelProducto}». Sin un aviso que lo diga, `
        + 'el artículo la haría parecer disponible.',
    }
  }
  return { ok: true }
}

/* ─── Lo que ve quien no ha entrado ──────────────────────────────────── */

/**
 * ¿Sale al público?
 *
 * Dos condiciones **a la vez**: ámbito público y publicado. Está aquí, en
 * código puro, además de en el RLS. Dos barreras para lo mismo no sobran
 * cuando lo que hay detrás son procedimientos internos.
 */
export function esVisiblePublicamente(a: Pick<Articulo, 'ambito' | 'estado'>): boolean {
  return a.ambito === 'publica' && a.estado === 'PUBLICADO'
}

/* ─── URLs ───────────────────────────────────────────────────────────── */

export const RAIZ = '/ayuda'

/** Sólo minúsculas, números y guiones. Igual que el CHECK de la base. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugValido(s: string): boolean {
  return SLUG.test(s)
}

/**
 * De un título a un slug. Sin acentos, sin eñes perdidas, sin signos de
 * interrogación: «¿Cómo guardar una propiedad?» → `como-guardar-una-propiedad`.
 */
export function slugDe(titulo: string): string {
  return titulo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

/**
 * La ruta de un artículo. Devuelve `null` si algún slug no es válido: antes
 * de escribir una URL rota, mejor no escribirla.
 */
export function rutaDelArticulo(categoria: string, articulo: string): string | null {
  if (!slugValido(categoria) || !slugValido(articulo)) return null
  return `${RAIZ}/${categoria}/${articulo}`
}

export function rutaDeCategoria(categoria: string): string | null {
  return slugValido(categoria) ? `${RAIZ}/${categoria}` : null
}

/** La ruta de búsqueda, con la consulta codificada. */
export function rutaDeBusqueda(consulta: string): string {
  const q = consulta.trim().slice(0, 200)
  return q ? `${RAIZ}/buscar?q=${encodeURIComponent(q)}` : `${RAIZ}/buscar`
}

/* ─── Búsqueda ───────────────────────────────────────────────────────── */

/**
 * Normaliza lo que se teclea antes de buscar o de guardarlo.
 *
 * Sin acentos y en minúsculas, porque nadie escribe «valuación» con tilde en
 * un buscador. Se recorta a 200 caracteres: lo que llega de fuera se acota
 * siempre.
 */
export function normalizarConsulta(q: string): string {
  return q
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** Una consulta de una sola letra no busca nada útil. */
export function consultaBuscable(q: string): boolean {
  return normalizarConsulta(q).length >= 2
}

/* ─── Etiquetas para la pantalla ─────────────────────────────────────── */

/**
 * Cómo se le dice a la persona que algo todavía no existe.
 *
 * En su idioma y sin rodeos. «No disponible» a secas deja a alguien
 * preguntándose si es un error suyo.
 */
export const ETIQUETA_DEL_PRODUCTO: Record<EstadoDelProducto, string | null> = {
  disponible: null,
  parcial: 'Disponible en parte',
  futuro: 'Todavía no disponible',
  no_disponible: 'No disponible',
}
