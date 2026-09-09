import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'

// service role key: IGNORA RLS. Sólo tras validar la sesión con requireAdmin().
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// PATCH /api/admin/propiedades/[id] — actualizar
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()

  // Intentar update completo primero
  const { error } = await adminClient()
    .from('propiedades')
    .update(body)
    .eq('id', id)

  // Si falla por columna que no existe (ej. precio_incluye_iva),
  // reintentar sin ese campo para no bloquear el resto de los cambios
  if (error) {
    if (error.message.includes('precio_incluye_iva')) {
      const { precio_incluye_iva: _omitido, ...bodyFallback } = body
      const { error: err2 } = await adminClient()
        .from('propiedades')
        .update(bodyFallback)
        .eq('id', id)
      if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })
      return NextResponse.json({ ok: true, warning: 'precio_incluye_iva no guardado: columna pendiente de migración' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/propiedades/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { id } = await params
  const { error } = await adminClient()
    .from('propiedades')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
