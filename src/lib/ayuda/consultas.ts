import { clienteServidor } from '../supabase-servidor'
import type { Ambito, Estado, EstadoDelProducto } from './modelo'

/**
 * Lecturas del Centro de Ayuda (V-1.1.94, fase 3c-3).
 *
 * ─────────────────────────────────────────────────────────────
 * SE LEE CON LA CLAVE ANÓNIMA, A PROPÓSITO
 *
 * Podría leerse con la clave de servicio y filtrar en el código. No se hace:
 * con la anónima, quien decide qué sale es el **RLS de la migración 27**, y
 * un descuido aquí no puede filtrar un artículo interno. La barrera está en
 * la base, no en un `where` que alguien puede olvidar.
 *
 * Aun así, cada consulta repite el filtro. Dos barreras para lo mismo no
 * sobran cuando lo que hay detrás son procedimientos internos.
 *
 * LA CAÍDA NO PUEDE DEJAR EL CENTRO EN BLANCO
 *
 * Mismo amortiguador que `/api/catalogo`: tiempo límite propio y última copia
 * buena en memoria. Alguien que busca ayuda porque algo no le funciona es la
 * peor persona a la que enseñarle una página vacía.
 * ─────────────────────────────────────────────────────────────
 */

const LIMITE_MS = 4_000

export type Categoria = {
  slug: string
  nombre: string
  descripcion: string | null
  icono: string | null
  orden: number
}

export type ArticuloPublico = {
  slug: string
  titulo: string
  resumen: string | null
  cuerpo: string | null
  estado_producto: EstadoDelProducto
  aviso: string | null
  prioridad: number
  categoria_slug?: string
  categoria_nombre?: string
}

type Fila = Record<string, unknown>

/**
 * Última respuesta buena por consulta. Amortiguador, no base de repuesto.
 *
 * **Con tope**, y no por elegancia: la clave de `buscar()` incluye el término
 * que escribe la persona, así que cada búsqueda distinta dejaba una entrada
 * para siempre en un `Map` de módulo. En un proceso de servidor que vive
 * horas, eso es memoria que sólo crece — y basta con que alguien pasee por el
 * buscador para alimentarlo.
 *
 * El tope es generoso frente a lo que el Centro necesita de verdad —las
 * categorías, el árbol, el sitemap y los artículos son un puñado de claves
 * fijas— y acota lo único ilimitado, que son las búsquedas. Al llegar al tope
 * se descarta la entrada más antigua: lo que se pierde es el amortiguador de
 * una búsqueda rara, no el de las pantallas que se usan.
 */
const TOPE_COPIAS = 200

const ultimaBuena = new Map<string, { datos: Fila[]; cuando: number }>()

function guardarCopia(clave: string, datos: Fila[]): void {
  // Volver a insertar mueve la clave al final en un Map de JS, así que lo que
  // se desaloja es de verdad lo menos usado recientemente.
  ultimaBuena.delete(clave)
  ultimaBuena.set(clave, { datos, cuando: Date.now() })
  while (ultimaBuena.size > TOPE_COPIAS) {
    const masVieja = ultimaBuena.keys().next().value
    if (masVieja === undefined) break
    ultimaBuena.delete(masVieja)
  }
}

export type Resultado<T> = { datos: T[]; desactualizado: boolean }

function cliente() {
  return clienteServidor(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'publico',
  )
}

/** Ejecuta con tiempo límite y, si falla, devuelve la última copia buena. */
async function conRed<T extends Fila>(
  clave: string,
  consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Resultado<T>> {
  try {
    const datos = await Promise.race([
      Promise.resolve(consulta).then(({ data, error }) => {
        if (error) throw new Error(error.message)
        return (data ?? []) as Fila[]
      }),
      new Promise<never>((_, rechaza) =>
        setTimeout(() => rechaza(new Error('El Centro de Ayuda tardó demasiado.')), LIMITE_MS)),
    ])
    guardarCopia(clave, datos)
    return { datos: datos as T[], desactualizado: false }
  } catch {
    const copia = ultimaBuena.get(clave)
    // Enseñar lo de hace unos minutos es mejor que enseñar nada, **siempre
    // que se diga**: por eso `desactualizado` viaja hasta la pantalla.
    return { datos: (copia?.datos ?? []) as T[], desactualizado: true }
  }
}

/* ─── Lo que lee el Centro público ───────────────────────────────────── */

export async function categoriasPublicas(): Promise<Resultado<Categoria>> {
  return conRed<Categoria>('categorias', cliente()
    .from('knowledge_categories')
    .select('slug, nombre, descripcion, icono, orden')
    .eq('ambito', 'publica')
    .order('orden', { ascending: true }))
}

export async function articulosDeCategoria(categoria: string): Promise<Resultado<ArticuloPublico>> {
  return conRed<ArticuloPublico>(`cat:${categoria}`, cliente()
    .from('knowledge_articles')
    .select('slug, titulo, resumen, estado_producto, aviso, prioridad, knowledge_categories!inner(slug)')
    .eq('ambito', 'publica')
    .eq('estado', 'PUBLICADO')
    .eq('knowledge_categories.slug', categoria)
    .order('prioridad', { ascending: true }))
}

/**
 * Un artículo, **con su marca de frescura**.
 *
 * Devuelve `{ articulo, desactualizado }` y no el artículo a secas. La
 * primera versión descartaba el `desactualizado` que `conRed` ya calculaba, y
 * eso rompía la regla que esta misma unidad declara arriba: si la base no
 * responde y se sirve la copia guardada, **hay que decirlo**. La categoría y
 * la búsqueda sí lo decían; el artículo no, que es justo donde están las
 * instrucciones que alguien va a seguir paso a paso.
 *
 * `articulo: null` con `desactualizado: true` es un caso real y distinto de
 * «no existe»: la base cayó y de ESTE artículo no había copia. La página lo
 * trata como 404 igualmente —no hay nada que enseñar—, pero la diferencia
 * queda expresada en el tipo en vez de perderse.
 */
export type ArticuloConFrescura = {
  articulo: ArticuloPublico | null
  desactualizado: boolean
}

export async function articulo(
  categoria: string,
  slug: string,
): Promise<ArticuloConFrescura> {
  const { datos, desactualizado } = await conRed<ArticuloPublico>(`art:${categoria}/${slug}`, cliente()
    .from('knowledge_articles')
    .select('slug, titulo, resumen, cuerpo, estado_producto, aviso, prioridad, knowledge_categories!inner(slug, nombre)')
    .eq('ambito', 'publica')
    .eq('estado', 'PUBLICADO')
    .eq('slug', slug)
    .eq('knowledge_categories.slug', categoria)
    .limit(1))
  return { articulo: datos[0] ?? null, desactualizado }
}

/** Los más útiles de todo el Centro, para la portada. */
export async function articulosDestacados(cuantos = 4): Promise<Resultado<ArticuloPublico>> {
  return conRed<ArticuloPublico>('destacados', cliente()
    .from('knowledge_articles')
    .select('slug, titulo, resumen, estado_producto, aviso, prioridad, knowledge_categories!inner(slug, nombre)')
    .eq('ambito', 'publica')
    .eq('estado', 'PUBLICADO')
    .order('prioridad', { ascending: true })
    .order('vistas', { ascending: false })
    .limit(cuantos))
}

/**
 * Buscar. Sobre el título, el resumen y el cuerpo.
 *
 * `ilike` y no búsqueda de texto completo: con unas decenas de artículos es
 * suficiente y no obliga a mantener un índice ni a elegir configuración de
 * idioma. Cuando el Centro crezca, esto se cambia — y la prueba lo dirá.
 */
/**
 * Las vocales, con y sin acento, para buscar sin que importe.
 *
 * `normalizarConsulta` quita los acentos de lo que escribe la persona, pero el
 * texto guardado SÍ los lleva, y `ilike` distingue. Resultado medido en
 * producción el 1-oct-2026: «valuación» y «valuacion» no encontraban nada,
 * mientras «valua» sí. Fallaban **las dos** formas, incluida la correcta.
 *
 * Se arregla en la consulta y no en la base: `unaccent` exigiría una extensión
 * y una migración, y aquí no se toca Supabase.
 */
const VOCALES: Record<string, string> = {
  a: '[aáà]', e: '[eéè]', i: '[iíì]', o: '[oóò]', u: '[uúùü]', n: '[nñ]',
  // También las formas ACENTUADAS como entrada. Sin esto, el arreglo sólo
  // funcionaba en un sentido: quien escribía «valuación» tal cual seguía sin
  // encontrar «valuacion». Lo cazó la prueba de ida y vuelta.
  á: '[aáà]', à: '[aáà]',
  é: '[eéè]', è: '[eéè]',
  í: '[iíì]', ì: '[iíì]',
  ó: '[oóò]', ò: '[oóò]',
  ú: '[uúùü]', ù: '[uúùü]', ü: '[uúùü]',
  ñ: '[nñ]',
}

/** Metacaracteres de regex POSIX, que en un término de búsqueda son literales. */
function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * El término, como patrón que ignora acentos.
 *
 * Se escapa primero y se expanden las vocales después, para que la expansión
 * no toque lo ya escapado.
 */
export function patronSinAcentos(consulta: string): string {
  return escaparRegex(consulta)
    .split('')
    .map((c) => VOCALES[c.toLowerCase()] ?? c)
    .join('')
}

/**
 * Buscar. Sobre el título, el resumen y el cuerpo.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ EL VALOR VA ENTRE COMILLAS
 *
 * `.or()` recibe una cadena con la gramática de filtros de PostgREST, donde la
 * **coma separa condiciones** y los paréntesis agrupan. Interpolar el término
 * crudo hacía que una coma partiera el filtro: buscar «cuenta,casa» —algo que
 * cualquiera escribe— producía un filtro inválido y la pantalla caía al estado
 * degradado «No pudimos consultar el Centro». Verificado en producción.
 *
 * Entre comillas dobles, la coma y los paréntesis son parte del valor. Dentro
 * de las comillas hay que escapar `"` y `\`, que si no cierran el valor antes
 * de tiempo.
 *
 * Se usa `imatch` (regex sin distinguir mayúsculas) en vez de `ilike` porque el
 * patrón de vocales lo necesita. Por eso ya no hacen falta los `%`.
 *
 * **`imatch`, no `~*`.** PostgREST sólo acepta el nombre del operador en la
 * cadena de filtro: `~*` devuelve 400 con «unexpected "~"». Lo descubrí
 * probando contra la API real, porque las pruebas de texto no podían verlo —
 * comprobaban el código fuente, y el código fuente estaba escrito sin faltas.
 * ─────────────────────────────────────────────────────────────
 */
function entrecomillar(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export async function buscar(consulta: string, tope = 20): Promise<Resultado<ArticuloPublico>> {
  const q = entrecomillar(patronSinAcentos(consulta))
  return conRed<ArticuloPublico>(`buscar:${consulta}`, cliente()
    .from('knowledge_articles')
    .select('slug, titulo, resumen, estado_producto, aviso, prioridad, knowledge_categories!inner(slug, nombre)')
    .eq('ambito', 'publica')
    .eq('estado', 'PUBLICADO')
    .or(`titulo.imatch.${q},resumen.imatch.${q},cuerpo.imatch.${q}`)
    .order('prioridad', { ascending: true })
    .limit(tope))
}

/**
 * El Centro entero: cada categoría pública con sus artículos publicados.
 *
 * Es lo que alimenta la barra lateral. Va en **una sola lectura** y no en una
 * por categoría: con nueve categorías serían diez viajes a Supabase en cada
 * pintado de cada página, y el amortiguador de `conRed` guardaría diez copias
 * que pueden quedar desparejas entre sí.
 *
 * El orden importa y es el mismo que ya usan las otras pantallas: las
 * categorías por `orden`, los artículos por `prioridad`. Así la barra enseña
 * lo mismo, y en el mismo sitio, que la portada y la página de categoría.
 *
 * Las categorías vacías **se conservan**: la página de categoría ya tiene un
 * estado para ellas («todavía no hay artículos publicados»), y esconderlas de
 * la barra haría desaparecer de la navegación una categoría que sí existe y
 * sí responde 200.
 */
export type RamaDelArbol = Categoria & {
  articulos: { slug: string; titulo: string; estado_producto: EstadoDelProducto }[]
}

export async function arbolPublico(): Promise<Resultado<RamaDelArbol>> {
  const cats = await categoriasPublicas()

  const arts = await conRed<Fila>('arbol:articulos', cliente()
    .from('knowledge_articles')
    .select('slug, titulo, estado_producto, prioridad, knowledge_categories!inner(slug)')
    .eq('ambito', 'publica')
    .eq('estado', 'PUBLICADO')
    .order('prioridad', { ascending: true }))

  const porCategoria = new Map<string, RamaDelArbol['articulos']>()
  for (const f of arts.datos) {
    const cat = (f.knowledge_categories as { slug?: string } | null)?.slug
    if (!cat || typeof f.slug !== 'string' || typeof f.titulo !== 'string') continue
    const lista = porCategoria.get(cat) ?? []
    lista.push({
      slug: f.slug,
      titulo: f.titulo,
      estado_producto: (f.estado_producto as EstadoDelProducto) ?? 'disponible',
    })
    porCategoria.set(cat, lista)
  }

  return {
    datos: cats.datos.map((c) => ({ ...c, articulos: porCategoria.get(c.slug) ?? [] })),
    // Si cualquiera de las dos lecturas vino de la copia, hay que decirlo.
    desactualizado: cats.desactualizado || arts.desactualizado,
  }
}

/** Todas las rutas publicadas, para el sitemap. */
export async function rutasPublicadas(): Promise<{ categoria: string; articulo: string }[]> {
  const { datos } = await conRed<Fila>('sitemap', cliente()
    .from('knowledge_articles')
    .select('slug, knowledge_categories!inner(slug)')
    .eq('ambito', 'publica')
    .eq('estado', 'PUBLICADO'))
  return datos.flatMap((f) => {
    const cat = (f.knowledge_categories as { slug?: string } | null)?.slug
    return cat && typeof f.slug === 'string' ? [{ categoria: cat, articulo: f.slug }] : []
  })
}

/** El nombre de la categoría sale anidado; se aplana para la pantalla. */
export function conCategoria(f: ArticuloPublico & { knowledge_categories?: { slug?: string; nombre?: string } }): ArticuloPublico {
  const c = f.knowledge_categories
  return { ...f, categoria_slug: c?.slug, categoria_nombre: c?.nombre }
}

export type { Ambito, Estado }
