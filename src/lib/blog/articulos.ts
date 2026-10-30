import { ARTICULOS_POR_PAGINA, categoriaDe, type Articulo, type Categoria } from './modelo'
import { COMPRAR } from './contenido/comprar'
import { VENDER } from './contenido/vender'
import { RENTAR } from './contenido/rentar'
import { NAVES_Y_TERRENOS } from './contenido/naves-y-terrenos'
import { INVERSION_Y_FINANCIAMIENTO } from './contenido/inversion-y-financiamiento'
import { LEON_Y_EL_BAJIO } from './contenido/leon-y-el-bajio'
import { AMPLIACIONES } from './contenido/ampliaciones'

/**
 * Artículos del blog: FUENTE DE VERDAD de los artículos FIJOS (archivos del repositorio, 3 por categoría = 18).
 *
 * Los textos viven en `contenido/<categoria>.ts`. Reglas (las comprueba `tests/blog.test.ts`): una palabra clave por artículo en título y primer párrafo;
 * título ≤ 60 y resumen de 120–160 caracteres; mínimo de palabras y de subtítulos; enlaces internos que existen; referencias APA con la fuente citada
 * en el texto; NINGUNA cifra, plazo o tasa sin fuente (si no se pudo verificar, no se afirma); temas legales/fiscales/de crédito con `orientacionGeneral`.
 * Los artículos semanales (fase 6) usarán este mismo formato desde la base de datos.
 *
 * `muestra: true` queda como mecanismo para maquetas de diseño: nunca se muestran en producción (ver `visibles`).
 */
/** Inserta las secciones de profundidad (`ampliaciones.ts`) justo antes de las preguntas frecuentes del artículo. */
function conAmpliacion(a: Articulo): Articulo {
  const extra = AMPLIACIONES[a.slug]
  if (!extra) return a
  const i = a.cuerpo.findIndex((b) => b.tipo === 'preguntas')
  const cuerpo = i < 0 ? [...a.cuerpo, ...extra] : [...a.cuerpo.slice(0, i), ...extra, ...a.cuerpo.slice(i)]
  return { ...a, cuerpo }
}

const REALES: readonly Articulo[] = [
  ...COMPRAR.map((a, i) => (i === 0 ? { ...a, destacado: true } : a)),
  ...VENDER,
  ...RENTAR,
  ...NAVES_Y_TERRENOS,
  ...INVERSION_Y_FINANCIAMIENTO,
  ...LEON_Y_EL_BAJIO,
].map(conAmpliacion)

const MUESTRAS: readonly Articulo[] = []

/** La lista visible: primero el destacado y luego por fecha (la más reciente primero; a igual fecha, el orden del archivo). */
export function ordenar(lista: readonly Articulo[]): Articulo[] {
  return [...lista].sort((a, b) => Number(!!b.destacado) - Number(!!a.destacado) || b.publicado.localeCompare(a.publicado))
}

/**
 * Qué se muestra. Las maquetas se ven en local y en los Preview, pero NUNCA en producción: `VERCEL_ENV` solo vale `production` allí.
 * (Un artículo de maqueta en producción sería publicar texto de relleno.)
 */
export function visibles(env: string | undefined = process.env.VERCEL_ENV): readonly Articulo[] {
  return ordenar(env === 'production' ? REALES : [...REALES, ...MUESTRAS])
}

export const TODOS_LOS_ARTICULOS: readonly Articulo[] = [...REALES, ...MUESTRAS]

export function articuloPorSlug(slug: string, env?: string): Articulo | undefined {
  return visibles(env).find((a) => a.slug === slug)
}

export function deCategoria(cat: Categoria, env?: string): Articulo[] {
  return visibles(env).filter((a) => a.categoria === cat)
}

export function relacionados(a: Articulo, cuantos = 3, env?: string): Articulo[] {
  const otros = visibles(env).filter((x) => x.slug !== a.slug)
  return [...otros.filter((x) => x.categoria === a.categoria), ...otros.filter((x) => x.categoria !== a.categoria)].slice(0, cuantos)
}

/** Lo mínimo que necesita la portada (serializable: viaja del servidor al componente de cliente). */
export type ArticuloInicio = { slug: string; titulo: string; resumen: string; categoria: string; portada: Articulo['portada']; publicado: string; autor: string; muestra?: boolean }

/**
 * Los 4 artículos para la portada: a lo sumo UNO por categoría (variedad), empezando por el destacado. En producción solo los reales;
 * sin ninguno, la sección no se pinta.
 */
export function paraInicio(env?: string, cuantos = 4): ArticuloInicio[] {
  const vistas = new Set<string>()
  const elegidos: Articulo[] = []
  for (const a of visibles(env)) {
    if (vistas.has(a.categoria)) continue
    vistas.add(a.categoria); elegidos.push(a)
    if (elegidos.length === cuantos) break
  }
  return elegidos.map((a) => ({
    slug: a.slug, titulo: a.titulo, resumen: a.resumen, categoria: categoriaDe(a.categoria)?.nombre ?? '', portada: a.portada, publicado: a.publicado, autor: a.autor, muestra: a.muestra,
  }))
}

export function pagina<T>(lista: readonly T[], n: number): { items: T[]; actual: number; total: number } {
  const total = Math.max(1, Math.ceil(lista.length / ARTICULOS_POR_PAGINA))
  const actual = Math.min(Math.max(1, Math.floor(n) || 1), total)
  return { items: lista.slice((actual - 1) * ARTICULOS_POR_PAGINA, actual * ARTICULOS_POR_PAGINA), actual, total }
}
