import { NextResponse } from 'next/server'
import { requireRole, supabaseAdmin } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import {
  esEstadoPub,
  puedeTransicionar,
  listaParaRevision,
  calcularCompletitud,
  type EstadoPub,
} from '@/lib/publicacion'

/**
 * POST /api/propiedades/[id]/estado — mueve una propiedad por su ciclo de vida.
 *
 * Un solo sitio para todas las transiciones: enviar a revisión, aprobar,
 * rechazar, pedir cambios y despublicar. Concentrarlas aquí evita que cada
 * pantalla invente su propia regla.
 *
 * Cuerpo: { estado: EstadoPub, nota?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ['publicador', 'admin'])
  if (auth.error) return auth.error
  const { perfil } = auth

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const destino = body?.estado

  if (!esEstadoPub(destino)) {
    return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: prop, error: errLectura } = await db
    .from('propiedades')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (errLectura) return NextResponse.json({ error: errLectura.message }, { status: 500 })
  if (!prop) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })

  // Un publicador sólo mueve lo suyo. Las propiedades sin dueño son de la
  // casa: las gestiona un administrador.
  const esDueno = prop.owner_id && prop.owner_id === perfil.uid
  if (perfil.rol !== 'admin' && !esDueno) {
    return NextResponse.json({ error: 'Esa propiedad no es tuya.' }, { status: 403 })
  }

  const origen: EstadoPub = esEstadoPub(prop.estado_pub) ? prop.estado_pub : 'publicada'

  const permiso = puedeTransicionar(origen, destino, perfil.rol)
  if (!permiso.ok) {
    return NextResponse.json({ error: permiso.motivo }, { status: 403 })
  }

  // No se manda a revisar un anuncio a medias.
  if (destino === 'en_revision') {
    const listo = listaParaRevision(prop)
    if (!listo.ok) return NextResponse.json({ error: listo.motivo }, { status: 400 })
  }

  const ahora = new Date().toISOString()
  const cambios: Record<string, unknown> = {
    estado_pub: destino,
    completitud: calcularCompletitud(prop),
  }

  if (destino === 'en_revision') cambios.enviada_en = ahora
  if (destino === 'publicada') cambios.publicada_en = ahora

  if (perfil.rol === 'admin' && ['publicada', 'rechazada', 'cambios_solicitados'].includes(destino)) {
    cambios.revisado_por = perfil.email ?? perfil.uid
    cambios.revisado_en = ahora
    cambios.nota_moderacion = typeof body.nota === 'string' ? body.nota.slice(0, 1000) : null
  }

  const { error } = await db.from('propiedades').update(cambios).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrar({
    actor: perfil,
    accion: `propiedad.${destino}`,
    entidad: 'propiedades',
    entidadId: id,
    antes: { estado_pub: origen },
    despues: { estado_pub: destino, nota: cambios.nota_moderacion ?? null },
  })

  return NextResponse.json({ ok: true, estado: destino })
}
