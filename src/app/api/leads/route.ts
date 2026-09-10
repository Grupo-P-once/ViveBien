import { NextResponse } from 'next/server'
import { frenar, origenDe, TOPES } from '@/lib/limites'
import { verifyIdToken, isAdminEmail, supabaseAdmin } from '@/lib/auth-server'

/**
 * GET /api/leads — solicitudes de contacto.
 *
 * Un admin recibe todas; cualquier otro usuario autenticado recibe únicamente
 * las suyas. El filtro usa el email del token verificado, nunca un parámetro
 * de la petición: si viniera de la URL, cualquiera podría pedir los leads de
 * otra persona escribiendo su correo.
 *
 * Antes el dashboard leía la tabla directamente con la anon key, que viaja en
 * el bundle del navegador.
 */
export async function GET(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) {
    return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })
  }

  const db = supabaseAdmin()
  let q = db.from('leads').select('*').order('created_at', { ascending: false })

  if (!isAdminEmail(user.email)) {
    if (!user.email) return NextResponse.json([])
    q = q.eq('email', user.email)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
