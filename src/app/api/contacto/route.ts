import { NextResponse } from 'next/server'
import { verifyIdToken, getPerfil, supabaseAdmin, isAdminEmail } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { notificarPublicador } from '@/lib/whatsapp'
import {
  validarSolicitud,
  VERSION_CONSENTIMIENTO,
  MINUTOS_DEDUPE,
  LIMITE_POR_HORA,
} from '@/lib/contacto'

/**
 * POST /api/contacto — el cliente pide informes sobre una propiedad.
 *
 * Exige sesión: una solicitud tiene que poder vincularse a una persona,
 * o no hay a quién responderle ni de quién demostrar el consentimiento.
 *
 * La solicitud se considera exitosa en cuanto queda guardada. Si el aviso
 * por WhatsApp falla, se registra el fallo pero el cliente no ve un error:
 * él ya hizo su parte.
 */
export async function POST(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) {
    return NextResponse.json(
      { error: 'Inicia sesión para enviar tu solicitud.', requiereSesion: true },
      { status: 401 },
    )
  }

  const perfil = await getPerfil(user)
  if (perfil.estado === 'suspendido') {
    return NextResponse.json({ error: 'Tu cuenta está suspendida.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const v = validarSolicitud(body as Record<string, unknown>)
  if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: 400 })

  const propiedadId = typeof body.propiedadId === 'string' ? body.propiedadId : ''
  if (!propiedadId) {
    return NextResponse.json({ error: 'Falta indicar la propiedad.' }, { status: 400 })
  }

  const db = supabaseAdmin()

  const { data: prop } = await db
    .from('propiedades')
    .select('id, titulo, owner_id, estado_pub')
    .eq('id', propiedadId)
    .maybeSingle()

  if (!prop) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })

  // No se contacta sobre algo que el público no debería estar viendo.
  if (prop.estado_pub && prop.estado_pub !== 'publicada') {
    return NextResponse.json({ error: 'Esa propiedad no está disponible.' }, { status: 409 })
  }

  const ahora = Date.now()

  // Anti-abuso. Si la tabla aún no existe, no se bloquea el envío: el
  // límite es una protección, no un requisito para operar.
  try {
    const desdeHora = new Date(ahora - 60 * 60 * 1000).toISOString()
    const { count } = await db
      .from('solicitudes_contacto')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_uid', user.uid)
      .gte('creado_en', desdeHora)

    if ((count ?? 0) >= LIMITE_POR_HORA) {
      return NextResponse.json(
        { error: 'Has enviado varias solicitudes seguidas. Intenta de nuevo en un rato.' },
        { status: 429 },
      )
    }

    const desdeDedupe = new Date(ahora - MINUTOS_DEDUPE * 60 * 1000).toISOString()
    const { data: repetida } = await db
      .from('solicitudes_contacto')
      .select('id')
      .eq('cliente_uid', user.uid)
      .eq('propiedad_id', propiedadId)
      .gte('creado_en', desdeDedupe)
      .limit(1)
      .maybeSingle()

    if (repetida) {
      return NextResponse.json({
        ok: true,
        duplicada: true,
        mensaje: 'Ya recibimos tu solicitud sobre esta propiedad. El anunciante fue avisado.',
      })
    }
  } catch {
    // Migración sin aplicar: se sigue adelante.
  }

  const fila = {
    cliente_uid: user.uid,
    propiedad_id: propiedadId,
    owner_id: prop.owner_id ?? null,
    nombre: v.datos.nombre,
    telefono: v.datos.telefono,
    email: v.datos.email,
    mensaje: v.datos.mensaje,
    propiedad_titulo: prop.titulo ?? null,
    tipo: body.tipo === 'visita' ? 'visita' : 'informacion',
    visita_preferida: typeof body.visitaPreferida === 'string' ? body.visitaPreferida : null,
    consentimiento_version: VERSION_CONSENTIMIENTO,
    origen: 'web',
  }

  const { data: creada, error } = await db
    .from('solicitudes_contacto')
    .insert(fila)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[contacto] no se pudo guardar la solicitud:', error.message)
    return NextResponse.json(
      { error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo.' },
      { status: 500 },
    )
  }

  await registrar({
    actor: perfil,
    accion: 'contacto.crear',
    entidad: 'solicitudes_contacto',
    entidadId: String(creada?.id ?? ''),
    despues: { propiedad_id: propiedadId, tipo: fila.tipo },
  })

  // El aviso al publicador va después de guardar y nunca tumba la respuesta.
  const aviso = await notificarPublicador({
    solicitudId: creada?.id ?? null,
    ownerId: prop.owner_id ?? null,
    propiedadTitulo: prop.titulo ?? 'una propiedad',
    propiedadId: propiedadId,
    cliente: v.datos,
  })

  return NextResponse.json({
    ok: true,
    id: creada?.id ?? null,
    notificacion: aviso.estado,
    // Enlace de respaldo para que el cliente pueda escribir él mismo
    // mientras la integración oficial no está aprobada.
    whatsappRespaldo: aviso.enlaceRespaldo,
  })
}

/** GET /api/contacto — el cliente ve sus solicitudes; el admin, todas. */
export async function GET(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })

  const db = supabaseAdmin()
  let q = db.from('solicitudes_contacto').select('*').order('creado_en', { ascending: false })

  if (!isAdminEmail(user.email)) q = q.eq('cliente_uid', user.uid)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
