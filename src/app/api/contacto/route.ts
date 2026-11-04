import { NextResponse } from 'next/server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { verifyIdToken, getPerfil, supabaseAdmin, exigir } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { notificarAtencion } from '@/lib/whatsapp'
import { avisarDeLead } from '@/lib/aviso-lead'
import { despuesDeResponder } from '@/lib/correo/transaccionales'
import { avisarConsultaRecibida, avisarNuevoInteresado } from '@/lib/correo/eventos-cuenta'
import type { DbCorreo } from '@/lib/correo/enviar'
import {
  validarSolicitud,
  VERSION_CONSENTIMIENTO,
  MINUTOS_DEDUPE,
  LIMITE_POR_HORA,
} from '@/lib/contacto'
import { rutaDe, tituloReal } from '@/lib/propiedad-publica'
import { puede } from '@/lib/acceso/permisos'
import { aConsultaCliente, COLUMNAS_CONSULTA_CLIENTE, COLUMNAS_CONSULTA_EQUIPO, type FilaConsultaCliente } from '@/lib/consultas'

/**
 * POST /api/contacto — el cliente pide informes sobre una propiedad.
 *
 * Exige sesión: una solicitud tiene que poder vincularse a una persona,
 * o no hay a quién responderle ni de quién demostrar el consentimiento.
 *
 * La solicitud se considera exitosa en cuanto queda guardada. Si el aviso
 * por WhatsApp falla, se registra el fallo pero el cliente no ve un error:
 * él ya hizo su parte.
 *
 * V-1.1.77 (SEC-01, D-02, ADR-0006): la solicitud es de VIVE BIEN. El aviso va
 * a atención (correo + WhatsApp interno), nunca al dueño de la propiedad. El
 * `owner_id` se guarda sólo para la atribución interna
 * (propiedad → lead → visita → oferta → operación → comisión); no sale de aquí.
 */
export async function POST(req: Request) {
  // Tope por origen. Sin esto, cualquiera con la consola abierta llena
  // esta tabla en un minuto. Ver lib/limites.ts para lo que cubre y lo
  // que no.
  const frenado = await frenarAsync(`contacto:${origenDe(req)}`, TOPES.contacto)
  if (frenado) return frenado

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
    // V-1.1.82 (P3-02): columnas explícitas. La migración 10 (`slug`) ya está
    // aplicada, que era la razón de pedir `*`.
    .select('id, titulo, slug, owner_id, estado_pub')
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
        mensaje: 'Ya recibimos tu solicitud sobre esta propiedad. Un asesor de VIVE BIEN te contactará.',
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

  // Los avisos van después de guardar y nunca tumban la respuesta. Los dos
  // son para el equipo de VIVE BIEN; el dueño de la propiedad no recibe nada.
  const propiedadTitulo = tituloReal(prop) ?? 'una propiedad'
  await Promise.all([
    notificarAtencion({
      solicitudId: creada?.id ?? null,
      propiedadTitulo,
      propiedadId: propiedadId,
      ruta: rutaDe(prop as { id: string; slug?: string | null }),
      cliente: v.datos,
    }),
    avisarDeLead({
      nombre: v.datos.nombre,
      telefono: v.datos.telefono,
      email: v.datos.email,
      mensaje: v.datos.mensaje,
      interes: `${fila.tipo === 'visita' ? 'Quiere visitar' : 'Pide informes'}: ${propiedadTitulo}`,
      origen: 'solicitud',
      propiedadId,
    }),
  ])

  // Correos del evento (después de responder, apagados por defecto, sin tumbar la solicitud): confirmación a QUIEN consultó (solo a su correo verificado de sesión) y aviso al dueño
  // únicamente si puede ver los datos del interesado. Una sola vez por consulta.
  if (creada?.id) {
    const solicitudId = creada.id as string | number
    despuesDeResponder(() => avisarConsultaRecibida(db as unknown as DbCorreo, { solicitudId, propiedadId, correo: user.email, verificado: user.emailVerified, nombre: perfil.nombre }))
    despuesDeResponder(() => avisarNuevoInteresado(db as unknown as DbCorreo, { solicitudId, propiedadId, canal: 'formulario' }))
  }

  // Ni el estado del aviso ni ningún enlace de WhatsApp vuelven al navegador:
  // antes se devolvía uno al teléfono del dueño.
  return NextResponse.json({ ok: true, id: creada?.id ?? null })
}

/**
 * GET /api/contacto — el cliente ve SUS consultas, con el DTO de cliente
 * (sin dueño, sin estado de WhatsApp, sin nada interno: P3-02, V-1.1.82).
 * El equipo de VIVE BIEN (`leads.ver_todos`) ve todas, con columnas explícitas.
 * Nunca `select('*')`.
 */
export async function GET(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { perfil } = auth
  const db = supabaseAdmin()

  if (puede(perfil, 'leads.ver_todos')) {
    const { data, error } = await db.from('solicitudes_contacto')
      .select(COLUMNAS_CONSULTA_EQUIPO)
      .order('creado_en', { ascending: false })
    if (error) return NextResponse.json({ error: 'No se pudieron leer las consultas.' }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await db.from('solicitudes_contacto')
    .select(COLUMNAS_CONSULTA_CLIENTE)
    .eq('cliente_uid', perfil.uid)
    .order('creado_en', { ascending: false })
  if (error) return NextResponse.json({ error: 'No se pudieron leer tus consultas.' }, { status: 500 })
  return NextResponse.json(((data ?? []) as FilaConsultaCliente[]).map(aConsultaCliente))
}
