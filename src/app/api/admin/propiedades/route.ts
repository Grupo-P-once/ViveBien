import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'

// Para lecturas: anon key (sujeta a las políticas RLS de lectura pública)
function readClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Para escrituras: service role key. IGNORA RLS por completo, así que sólo puede
// usarse después de que requireAdmin() haya validado la sesión.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/admin/propiedades — listado para el panel
export async function GET() {
  const { data, error } = await readClient()
    .from('propiedades')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/propiedades — crear nueva
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const body = await req.json()
  const { error } = await adminClient().from('propiedades').insert(body)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
