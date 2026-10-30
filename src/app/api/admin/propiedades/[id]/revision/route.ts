import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir } from '@/lib/auth-server'

/**
 * GET /api/admin/propiedades/[id]/revision — todo lo que el equipo necesita para REVISAR una propiedad que todavía no es pública.
 *
 * Antes, el botón «Vista previa» de la cola de revisión abría la ficha pública, que solo existe para lo ya publicado: una propiedad en
 * revisión daba 404. Esta ruta devuelve, solo a quien puede moderar: la propiedad completa, quién la sube, y la aceptación de la
 * propuesta de comisión de esa cuenta (versión, huella y fecha). El origen, la comisión pactada y las notas siguen saliendo por
 * `/api/propiedades/[id]/interno` y la acreditación por `/api/propiedades/[id]/acreditacion`, cada una con sus propias reglas.
 *
 * Lo que falte (cuenta sin fila, aceptación sin migración 39) no rompe la revisión: llega como `null`.
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'propiedad.moderar')
  if (auth.error) return auth.error
  const { id } = await params
  const db = supabaseAdmin()

  const p = await db.from('propiedades').select('*').eq('id', id).maybeSingle()
  if (p.error) return NextResponse.json({ error: 'No se pudo leer la propiedad.' }, { status: 500 })
  if (!p.data) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })
  const prop = p.data as Record<string, unknown> & { owner_id?: string | null }

  let dueno: Record<string, unknown> | null = null
  let aceptacion: Record<string, unknown> | null = null
  if (prop.owner_id) {
    const u = await db.from('usuarios').select('nombre, email, telefono, whatsapp, rol, tipo_publicador, estado').eq('uid', prop.owner_id).maybeSingle()
    if (!u.error && u.data) dueno = u.data as Record<string, unknown>
    const a = await db.from('comision_aceptaciones').select('version, hash, aceptado_en').eq('uid', prop.owner_id).order('aceptado_en', { ascending: false }).limit(1).maybeSingle()
    if (!a.error && a.data) aceptacion = a.data as Record<string, unknown>
  }
  return NextResponse.json({ propiedad: prop, dueno, aceptacion })
}
