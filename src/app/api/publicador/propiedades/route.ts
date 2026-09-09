import { NextResponse } from 'next/server'
import { requireRole, supabaseAdmin } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { calcularCompletitud, quitarCamposReservados } from '@/lib/publicacion'

/** GET /api/publicador/propiedades — sólo las del publicador de la sesión. */
export async function GET(req: Request) {
  const auth = await requireRole(req, ['publicador', 'admin'])
  if (auth.error) return auth.error
  const { perfil } = auth

  const db = supabaseAdmin()
  let q = db.from('propiedades').select('*').order('created_at', { ascending: false })

  // Un admin ve el inventario entero; un publicador, sólo lo suyo.
  if (perfil.rol !== 'admin') q = q.eq('owner_id', perfil.uid)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/**
 * POST /api/publicador/propiedades — crea un borrador.
 *
 * Nace siempre en 'borrador'. El dueño y el estado los pone el servidor:
 * si vinieran del cuerpo, cualquiera publicaría a nombre de otro.
 */
export async function POST(req: Request) {
  const auth = await requireRole(req, ['publicador', 'admin'])
  if (auth.error) return auth.error
  const { perfil } = auth

  const body = await req.json().catch(() => ({}))
  const datos = quitarCamposReservados(body as Record<string, unknown>)

  if (!datos.titulo || typeof datos.titulo !== 'string') {
    return NextResponse.json({ error: 'La propiedad necesita un título.' }, { status: 400 })
  }

  const id =
    String(datos.titulo)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || `prop-${Date.now()}`

  const fila = {
    ...datos,
    id: `${id}-${Date.now().toString(36).slice(-4)}`,
    owner_id: perfil.uid,
    estado_pub: 'borrador',
    estatus: 'disponible',
    completitud: calcularCompletitud(datos),
  }

  const { error } = await supabaseAdmin().from('propiedades').insert(fila)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrar({
    actor: perfil,
    accion: 'propiedad.crear',
    entidad: 'propiedades',
    entidadId: fila.id,
    despues: { estado_pub: 'borrador', titulo: datos.titulo },
  })

  return NextResponse.json({ ok: true, id: fila.id })
}
