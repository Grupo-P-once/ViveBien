import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '@/lib/portal/tarjeta'
import { guardadasVista, type FilaFavoritoPortal } from '@/lib/portal/pantallas'

/**
 * GET /api/portal/guardadas — las propiedades que esta persona guardó, ya
 * listas para pintarse (V-1.1.85).
 *
 * `/api/favoritos` sólo devuelve identificadores, que servían para pintar el
 * corazón pero no una lista. Aquí salen tarjetas completas, y sólo con columnas
 * públicas: el portal nunca ve el dueño ni nada interno.
 *
 * Las suyas y nada más: `eq('uid', perfil.uid)`.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  try {
    const db = supabaseAdmin()
    const [favs, props] = await Promise.all([
      db.from('favoritos').select('propiedad_id, creado_en').eq('uid', perfil.uid).order('creado_en', { ascending: false }),
      db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(1000),
    ])
    for (const r of [favs, props]) if (r.error) throw r.error

    const guardadas = guardadasVista(
      (favs.data ?? []) as FilaFavoritoPortal[],
      (props.data ?? []) as FilaPropiedadPortal[],
    )
    return NextResponse.json({ guardadas })
  } catch (e) {
    console.error('[portal] guardadas', e)
    return NextResponse.json({ error: 'No se pudieron cargar tus propiedades guardadas.' }, { status: 500 })
  }
}
