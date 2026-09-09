import { NextResponse } from 'next/server'
import { verifyIdToken, supabaseAdmin } from '@/lib/auth-server'

/**
 * Favoritos del cliente.
 *
 * Antes vivían en localStorage: se perdían al cambiar de dispositivo o al
 * limpiar el navegador. Ahora van a la base, atados al uid del token —
 * nunca a un identificador que venga en la petición.
 */

/** GET /api/favoritos — ids de las propiedades guardadas. */
export async function GET(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })

  const { data, error } = await supabaseAdmin()
    .from('favoritos')
    .select('propiedad_id, creado_en')
    .eq('uid', user.uid)
    .order('creado_en', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(f => f.propiedad_id))
}

/** POST /api/favoritos — alterna una propiedad. Body: { propiedadId } */
export async function POST(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) return NextResponse.json({ error: 'Inicia sesión para guardar favoritos.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const propiedadId = typeof body.propiedadId === 'string' ? body.propiedadId : ''
  if (!propiedadId) return NextResponse.json({ error: 'Falta la propiedad.' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: existente } = await db
    .from('favoritos')
    .select('propiedad_id')
    .eq('uid', user.uid)
    .eq('propiedad_id', propiedadId)
    .maybeSingle()

  if (existente) {
    const { error } = await db
      .from('favoritos')
      .delete()
      .eq('uid', user.uid)
      .eq('propiedad_id', propiedadId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, guardado: false })
  }

  const { error } = await db
    .from('favoritos')
    .insert({ uid: user.uid, propiedad_id: propiedadId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, guardado: true })
}
