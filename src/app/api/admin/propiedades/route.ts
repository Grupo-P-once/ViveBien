import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Para lecturas: anon key (ya funciona con RLS de lectura pública)
function readClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Para escrituras: service role key (bypasea RLS)
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/admin/propiedades
export async function GET() {
  const { data, error } = await readClient()
    .from('propiedades')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/propiedades  — crear nueva
export async function POST(req: Request) {
  const body = await req.json()
  const { error } = await adminClient().from('propiedades').insert(body)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
