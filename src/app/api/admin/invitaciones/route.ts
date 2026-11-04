import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin, registrarIntentoDenegado } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { enviarInvitacion } from '@/lib/invitacion-correo'
import { decidirInvitacion, esAscenso } from '@/lib/acceso/roles'
import { escaparLike, normalizarCorreo } from '@/lib/invitaciones'
import { despuesDeResponder } from '@/lib/correo/transaccionales'
import { avisarInvitacion } from '@/lib/correo/eventos-cuenta'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * Invitaciones al panel. Sólo administradores.
 *
 * ─────────────────────────────────────────────────────────────
 * CÓMO FUNCIONA, Y POR QUÉ ASÍ
 *
 * El sitio valida las sesiones contra las claves públicas de Google: no tiene
 * `firebase-admin` ni cuenta de servicio, así que **no puede crear cuentas ni
 * contraseñas**. Una invitación, entonces, es una **reserva de rol para un
 * correo**: cuando esa persona entra por primera vez con ese correo, el rol se
 * le aplica solo (ver `GET /api/usuarios/me`).
 *
 * Y se aplica **sólo si el correo está verificado**. Si no, cualquiera podría
 * registrarse con el correo de otro —sin comprobarlo— y quedarse con el rol que
 * se invitó. Entrar con Google llega verificado; el registro con contraseña, no.
 * ─────────────────────────────────────────────────────────────
 */

export const dynamic = 'force-dynamic'

// V-1.1.81: también 'super_admin' (sólo lo invita un Super Admin: decidirInvitacion).

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin()
    .from('invitaciones')
    .select('id, email, nombre, rol, estado, invitado_por, creado_en, enviado_en, aceptada_en')
    .order('creado_en', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invitaciones: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const email = typeof cuerpo.email === 'string' ? cuerpo.email.trim().toLowerCase().slice(0, 160) : ''
  const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim().slice(0, 120) : ''
  const rol = typeof cuerpo.rol === 'string' ? cuerpo.rol : ''

  if (!CORREO.test(email)) return NextResponse.json({ error: 'Escribe un correo válido.' }, { status: 400 })
  // V-1.1.79 (tarea 02.02): invitar como admin es dar admin → sólo Super Admin.
  const permiso = decidirInvitacion({ actor: { uid: perfil.uid, superAdmin: perfil.superAdmin }, rol })
  if (!permiso.ok) {
    if (permiso.status === 403) await registrarIntentoDenegado(perfil, req, 'invitaciones.admin')
    return NextResponse.json({ error: permiso.motivo }, { status: permiso.status })
  }

  const db = supabaseAdmin()

  // E-30: quien YA tiene cuenta puede recibir una invitación de rango MAYOR (se aplica en su próximo acceso con ese correo
  // verificado); si su rol ya es igual o superior, la invitación no haría nada y su rol se cambia desde la lista de usuarios.
  // El correo se compara como texto LITERAL (comodines escapados) y por igualdad exacta una vez normalizado.
  const { data: candidatos } = await db.from('usuarios').select('uid, email, rol, estado').ilike('email', escaparLike(email)).limit(5)
  const usuario = (candidatos ?? []).find((u) => normalizarCorreo(u.email as string | null) === email)
  if (usuario) {
    if (usuario.estado === 'suspendido' || usuario.estado === 'eliminada') {
      return NextResponse.json({ error: 'Esa cuenta no está activa: reactívala desde la lista de usuarios.' }, { status: 409 })
    }
    if (!esAscenso(usuario.rol, rol)) {
      return NextResponse.json(
        { error: 'Esa persona ya tiene cuenta con un rol igual o superior. Cámbiale el rol desde la lista de usuarios.' },
        { status: 409 },
      )
    }
  }

  // Una sola invitación pendiente por correo: se reusa la fila si ya había.
  // (comparación por igualdad del correo normalizado; las filas antiguas con otras mayúsculas también cuentan)
  const { data: pendientes } = await db
    .from('invitaciones')
    .select('id, email')
    .eq('estado', 'pendiente')
    .ilike('email', escaparLike(email))
    .limit(5)
  const previa = (pendientes ?? []).find((i) => normalizarCorreo(i.email as string | null) === email) ?? null

  const ahora = new Date().toISOString()
  const fila = { email, nombre: nombre || null, rol, invitado_por: perfil.uid, enviado_en: ahora }

  // E-30: reenviar NUNCA reabre una invitación. El UPDATE solo toca una fila que SIGUE pendiente y NO escribe `estado`:
  // si la persona la aceptó (o se canceló) entre la lectura y la escritura, no se toca y se responde 409 en vez de dejar
  // «pendiente» una invitación ya consumida (que podría aplicarse otra vez).
  const escrito = previa
    ? await db.from('invitaciones').update(fila).eq('id', previa.id).eq('estado', 'pendiente').select('id').maybeSingle()
    : await db.from('invitaciones').insert({ ...fila, estado: 'pendiente' }).select('id').maybeSingle()

  if (escrito.error) return NextResponse.json({ error: escrito.error.message }, { status: 500 })
  if (previa && !escrito.data) {
    return NextResponse.json({ error: 'Esa invitación ya se aceptó o se canceló mientras la reenviabas. Revisa la lista de usuarios.' }, { status: 409 })
  }

  const correo = await enviarInvitacion({ email, nombre, rol, invitadoPor: perfil.email })

  await registrar({
    actor: perfil,
    accion: previa ? 'invitacion.reenviar' : 'invitacion.crear',
    entidad: 'invitaciones',
    entidadId: String(escrito.data?.id ?? ''),
    despues: { email, rol, correo: correo.enviado ? 'enviado' : correo.motivo },
  })

  return NextResponse.json({
    ok: true,
    id: escrito.data?.id ?? null,
    reenviada: Boolean(previa),
    correoEnviado: correo.enviado,
    motivoCorreo: correo.enviado ? null : correo.motivo,
  })
}

/** PATCH — cancelar una invitación pendiente. Cuerpo: `{ id }`. */
export async function PATCH(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(cuerpo.id)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Falta la invitación.' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: invitacion } = await db.from('invitaciones').select('id, email, rol, estado, invitado_por').eq('id', id).maybeSingle()
  if (!invitacion) return NextResponse.json({ error: 'Esa invitación no existe.' }, { status: 404 })
  if (invitacion.estado !== 'pendiente') {
    return NextResponse.json({ error: 'Esa invitación ya no está pendiente.' }, { status: 409 })
  }

  const { error } = await db.from('invitaciones').update({ estado: 'cancelada' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Correo a quien invitó (si no es quien la canceló): después de responder, a su correo verificado, una vez por invitación.
  despuesDeResponder(() => avisarInvitacion(db as unknown as DbCorreo, { invitacionId: id, estado: 'cancelada', correoInvitado: String(invitacion.email), rol: String(invitacion.rol), invitadoPor: invitacion.invitado_por as string | null, actorUid: perfil.uid }))

  await registrar({
    actor: perfil,
    accion: 'invitacion.cancelar',
    entidad: 'invitaciones',
    entidadId: String(id),
    antes: { email: invitacion.email, rol: invitacion.rol },
  })

  return NextResponse.json({ ok: true })
}
