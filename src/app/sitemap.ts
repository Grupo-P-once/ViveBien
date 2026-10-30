import type { MetadataRoute } from 'next'
import { SITIO } from '@/lib/sitio'
import { clienteServidor } from '@/lib/supabase-servidor'
import { rutaDe, SELECT_PUBLICO } from '@/lib/propiedad-publica'
import { idPresentable } from '@/lib/slug'
import { rutasPublicadas as rutasDeAyuda } from '@/lib/ayuda/consultas'
import { esVisibleAlPublico } from '@/lib/visibilidad-publica'
import { visibles as visiblesDelBlog } from '@/lib/blog/articulos'
import { CATEGORIAS } from '@/lib/blog/modelo'

/**
 * El sitemap.
 *
 * ─────────────────────────────────────────────────────────────
 * DOS FALLOS QUE ESTE ARCHIVO TENÍA
 *
 * 1. Filtraba por `estatus = 'disponible'`. Ese campo no dice si una propiedad
 *    está publicada: dice si sigue disponible en el mercado, y vale
 *    'disponible' en las 15 filas de la base — incluidas las 8 en borrador.
 *    El estado de publicación es `estado_pub`. Resultado: el sitemap le ofrecía
 *    a Google seis páginas «Propiedad sin título», vacías, y dos pruebas del
 *    bot de Telegram.
 *
 * 2. Se generaba una sola vez, en el build. Una propiedad publicada el martes
 *    no aparecía hasta el siguiente despliegue. El sitemap desplegado tenía 3
 *    propiedades cuando ya había 7 publicadas.
 *
 * Las dos cosas empujaban en la misma dirección: un índice que no se parecía al
 * sitio.
 * ─────────────────────────────────────────────────────────────
 */

const BASE = SITIO

/** Cada hora. Una propiedad nueva no debería esperar a un despliegue. */
export const revalidate = 3600

const supabase = clienteServidor(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const estaticas: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/propiedades`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/contacto`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/nosotros`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/valuador`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/terminos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/privacidad`, changeFrequency: 'yearly', priority: 0.3 },
    // El Centro de Ayuda SÍ se indexa, al contrario que el portal: que la
    // gente encuentre la respuesta en un buscador es justo el objetivo.
    // `/ayuda/buscar` NO entra: una URL por cada cosa que alguien teclee
    // sería basura, y dejaría rastro público de lo que se pregunta.
    { url: `${BASE}/ayuda`, changeFrequency: 'weekly', priority: 0.8 },
  ]

  // Sólo lo PUBLICADO y de ámbito público: lo decide el RLS de la migración
  // 27, pero el filtro se repite aquí. Un artículo interno en el sitemap lo
  // anunciaría al mundo aunque su página devolviera 404.
  let ayuda: MetadataRoute.Sitemap = []
  try {
    const rutas = await rutasDeAyuda()
    ayuda = rutas.map(({ categoria, articulo }) => ({
      url: `${BASE}/ayuda/${categoria}/${articulo}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  } catch {
    // Un sitemap sin los artículos es peor que uno completo, pero mucho mejor
    // que un sitemap que falla entero.
    ayuda = []
  }

  let fichas: MetadataRoute.Sitemap = []
  try {
    const { data, error } = await supabase
      .from('propiedades')
      // `estado_pub`, no `estatus`: publicada es publicada.
      // V-1.1.77: columnas públicas (el rol anónimo ya no lee `*`).
      .select(SELECT_PUBLICO)
      .eq('estado_pub', 'publicada')

    if (error) {
      // Sin esto, un sitemap recortado se veía igual que uno correcto.
      console.error('[sitemap] no se pudieron leer las propiedades:', error.message)
    }

    fichas = (data ?? [])
      // Pausada o archivada: fuera del sitemap (regla única, D-59).
      .filter(esVisibleAlPublico)
      // Nunca se le ofrece a Google una dirección que dice «propiedad sin
      // título»: si una publicada se quedó sin nombre público (pasó con dos
      // terrenos, V-1.1.84), se queda fuera del sitemap hasta que lo tenga.
      // La ficha sigue abierta; lo que no se hace es invitar a indexarla así.
      .filter((p) => {
        const presentable = idPresentable(rutaDe(p).replace('/propiedades/', ''))
        if (!presentable) console.warn('[sitemap] fuera, sin nombre público:', p.id)
        return presentable
      })
      .map((p) => ({
      // El nombre público si lo tiene. Mandar a Google la dirección vieja sería
      // pedirle que indexe una URL que responde con una redirección.
      url: `${BASE}${rutaDe(p)}`,
      // `lastmod` sólo si hay una fecha real detrás. Poner `new Date()` en cada
      // generación sería decirle a Google que todo cambió hoy, cada hora, para
      // siempre — y es la forma más rápida de que deje de creerse el dato.
      lastModified: p.publicada_en
        ? new Date(p.publicada_en)
        : p.created_at
          ? new Date(p.created_at)
          : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch (e) {
    console.error('[sitemap] fallo al consultar:', e instanceof Error ? e.message : e)
  }

  // Blog: solo artículos reales (las maquetas nunca entran) y las categorías que ya tienen contenido.
  const reales = visiblesDelBlog().filter((a) => !a.muestra)
  const blog: MetadataRoute.Sitemap = reales.length === 0 ? [] : [
    { url: `${BASE}/blog`, changeFrequency: 'weekly', priority: 0.8 },
    ...CATEGORIAS.filter((c) => reales.some((a) => a.categoria === c.slug)).map((c) => ({ url: `${BASE}/blog/categoria/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...reales.map((a) => ({ url: `${BASE}/blog/${a.slug}`, lastModified: new Date(a.actualizado ?? a.publicado), changeFrequency: 'monthly' as const, priority: 0.7 })),
  ]

  return [...estaticas, ...blog, ...ayuda, ...fichas]
}
