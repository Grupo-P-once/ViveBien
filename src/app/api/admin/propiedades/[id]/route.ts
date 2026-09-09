import { NextResponse } from 'next/server'
import { requireRole, supabaseAdmin } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { calcularCompletitud, quitarCamposReservados } from '@/lib/publicacion'

/**
 * PATCH /api/admin/propiedades/[id] — editar el contenido de una propiedad.
 *
 * Un administrador edita cualquiera; un publicador, sólo la suya. El estado
 * de publicación NO se cambia aquí: para eso está
 * /api/propiedades/[id]/estado, que aplica la máquina de estados.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ['publicador', 'admin'])
  if (auth.error) return auth.error
  const { perfil } = auth

  const { id } = await params
  const db = supabaseAdmin()

  const { data: prop, error: errLectura } = await db
    .from('propiedades')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (errLectura) return NextResponse.json({ error: errLectura.message }, { status: 500 })
  if (!prop) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })

  const esDueno = prop.owner_id && prop.owner_id === perfil.uid
  if (perfil.rol !== 'admin' && !esDueno) {
    return NextResponse.json({ error: 'Esa propiedad no es tuya.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  // Un admin puede tocar el estatus comercial; nadie escribe owner_id ni
  // estado_pub por esta vía.
  const datos = quitarCamposReservados(body as Record<string, unknown>)
  if (perfil.rol !== 'admin') delete datos.estatus

  if (Object.keys(datos).length === 0) {
    return NextResponse.json({ ok: true, sinCambios: true })
  }

  const cambios = { ...datos, completitud: calcularCompletitud({ ...prop, ...datos }) }

  const { error } = await db.from('propiedades').update(cambios).eq('id', id)

  if (error) {
    // Columna que todavía no existe: reintentar sin ella en vez de bloquear
    // el resto de los cambios.
    const m = error.message.match(/'([a-z_]+)' column/) ?? error.message.match(/column "([a-z_]+)"/)
    const columna = m?.[1]
    if (columna && columna in cambios) {
      const { [columna]: _fuera, ...reintento } = cambios as Record<string, unknown>
      const { error: err2 } = await db.from('propiedades').update(reintento).eq('id', id)
      if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })
      return NextResponse.json({ ok: true, warning: `${columna} no guardado: columna pendiente de migración` })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrar({
    actor: perfil,
    accion: 'propiedad.editar',
    entidad: 'propiedades',
    entidadId: id,
    despues: { campos: Object.keys(datos) },
  })

  return NextResponse.json({ ok: true })
}

/** DELETE /api/admin/propiedades/[id] — borrado definitivo. Sólo admin. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ['admin'])
  if (auth.error) return auth.error

  const { id } = await params
  const db = supabaseAdmin()

  const { data: antes } = await db.from('propiedades').select('*').eq('id', id).maybeSingle()

  const { error } = await db.from('propiedades').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrar({
    actor: auth.perfil,
    accion: 'propiedad.borrar',
    entidad: 'propiedades',
    entidadId: id,
    antes: antes ? { titulo: antes.titulo, estado_pub: antes.estado_pub } : null,
  })

  return NextResponse.json({ ok: true })
}
