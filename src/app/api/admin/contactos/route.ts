import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'

/**
 * GET /api/admin/contactos — mensajes del formulario de contacto.
 *
 * Sólo administradores: son datos personales de personas que escribieron al
 * sitio. Antes se leían con la anon key desde el navegador.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin()
    .from('contactos')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
