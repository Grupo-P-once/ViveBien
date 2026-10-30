import type { SupabaseClient } from '@supabase/supabase-js'
import { idPresentable, slugUnico } from './slug'
import { lugarDe } from './ubicacion'

/**
 * Darle nombre público a una propiedad en el momento de publicarla.
 *
 * Es el momento correcto porque es el primero en que el nombre se puede
 * construir con datos de verdad: para publicar hacen falta tipo, operación,
 * ubicación y título. Antes, el nombre se decidía al pulsar «Nueva propiedad»,
 * cuando no había nada — y así acabó una nave industrial en
 * `/propiedades/propiedad-sin-titulo-d52n`.
 *
 * Reglas:
 *
 *  · **Una vez asignado, no se toca.** Un slug que cambia cada vez que alguien
 *    corrige una coma es una URL que se rompe en Google cada semana.
 *  · **Si el id ya es presentable, no hace falta** (`sanjuan`): no se crea una
 *    dirección nueva para redirigir una que ya estaba bien.
 *  · **Nunca falla la publicación.** Si la columna `slug` aún no existe o el
 *    nombre no se puede construir, la propiedad se publica igual con su id —
 *    que es exactamente lo que pasaba antes—. Un nombre bonito no vale una
 *    publicación perdida.
 *
 * Devuelve la ruta pública con la que queda la propiedad.
 */
export async function asignarSlugAlPublicar(
  db: SupabaseClient,
  prop: Record<string, unknown>,
): Promise<string> {
  const id = String(prop.id)
  const yaTiene = typeof prop.slug === 'string' && prop.slug.trim() ? prop.slug.trim() : null
  if (yaTiene) return `/propiedades/${yaTiene}`
  if (idPresentable(id)) return `/propiedades/${id}`

  const fuente = {
    titulo: prop.titulo as string | null,
    tipo: prop.tipo as string | null,
    operacion: prop.operacion as string | null,
    ciudad: lugarDe(prop as { ubicacion?: string | null; ciudad?: string | null }).ciudad,
  }
  if (!slugUnico(fuente, id)) return `/propiedades/${id}`

  /* Protección real = el índice único `propiedades_slug_unico` (supabase/10): la base NO deja dos propiedades con el mismo
     slug, pase lo que pase entre la comprobación y la escritura. Aquí se maneja el choque: antes la propiedad se quedaba con
     su id como dirección para siempre (cada intento recalculaba el MISMO candidato y volvía a chocar); ahora cada reintento
     usa un sufijo más largo y distinto. */
  const MAX_INTENTOS = 4
  try {
    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      const candidato = slugUnico(fuente, id, intento)!

      // Choque con otro slug o con el id de otra propiedad. Lo segundo importa:
      // la ficha busca primero por slug, así que un slug igual al id de otra
      // propiedad la dejaría inaccesible por su dirección de siempre.
      const [porSlug, porId] = await Promise.all([
        db.from('propiedades').select('id').eq('slug', candidato).neq('id', id).limit(1),
        db.from('propiedades').select('id').eq('id', candidato).limit(1),
      ])
      if (porSlug.error && porSlug.error.code === '42703') {
        console.warn('[slug] la columna slug no existe: aplicar supabase/10-slug-publico.sql')
        return `/propiedades/${id}`
      }
      if ((porSlug.data?.length ?? 0) > 0 || (porId.data?.length ?? 0) > 0) {
        console.warn(`[slug] «${candidato}» ya está en uso (intento ${intento + 1}/${MAX_INTENTOS})`)
        continue
      }

      // Escritura directa, no tolerante: con una sola columna, «tolerar» que
      // falte sería reintentar con un PATCH vacío. Y `.is('slug', null)` evita
      // pisar un nombre que otra petición haya puesto mientras tanto.
      const { data, error } = await db
        .from('propiedades')
        .update({ slug: candidato })
        .eq('id', id)
        .is('slug', null)
        .select('slug')
      if (error) {
        // 23505 = el índice único lo rechazó: otra publicación simultánea tomó ese nombre entre la comprobación y la escritura.
        if (error.code === '23505' || /duplicate key|propiedades_slug_unico/i.test(error.message ?? '')) {
          console.warn(`[slug] «${candidato}» lo tomó otra propiedad a la vez (intento ${intento + 1}/${MAX_INTENTOS})`)
          continue
        }
        console.error('[slug] no se pudo guardar:', error.message)
        return `/propiedades/${id}`
      }
      const guardado = data?.[0]?.slug
      return `/propiedades/${typeof guardado === 'string' && guardado ? guardado : id}`
    }
    console.warn(`[slug] ${id} se publica con su id: ${MAX_INTENTOS} nombres seguidos estaban en uso`)
    return `/propiedades/${id}`
  } catch (e) {
    console.error('[slug] fallo inesperado:', e instanceof Error ? e.message : e)
    return `/propiedades/${id}`
  }
}

/**
 * Si la propiedad está publicada y aún no tiene nombre público, se lo pone.
 *
 * Existe porque publicar no ocurre en un solo sitio: además de
 * `/api/propiedades/[id]/estado`, el panel clásico escribe directo en la tabla
 * (`/api/admin/propiedades`). Por ese camino se publicaron dos terrenos que
 * quedaron en `/propiedades/propiedad-sin-titulo-…` (V-1.1.84). Llamarla
 * después de escribir cierra el hueco sin cambiar cómo se publica.
 *
 * Nunca estorba: si no está publicada, si ya tiene nombre o si algo falla,
 * no hace nada y no revienta la petición que la llamó.
 */
export async function nombrarSiEstaPublicada(db: SupabaseClient, id: string): Promise<void> {
  if (!id) return
  try {
    const { data } = await db
      .from('propiedades')
      .select('id, slug, titulo, tipo, operacion, ubicacion, ciudad, estado_pub')
      .eq('id', id)
      .maybeSingle()
    if (!data || data.estado_pub !== 'publicada' || (typeof data.slug === 'string' && data.slug.trim())) return
    await asignarSlugAlPublicar(db, data as Record<string, unknown>)
  } catch (e) {
    console.error('[slug] no se pudo nombrar %s:', id, e instanceof Error ? e.message : e)
  }
}
