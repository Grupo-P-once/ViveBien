import { NextResponse } from 'next/server'
import { verifyIdToken, getPerfil, supabaseAdmin, isAdminEmail, type Rol } from '@/lib/auth-server'

/**
 * GET /api/usuarios/me — perfil del usuario de la sesión.
 *
 * Crea la fila la primera vez que alguien entra, para que no haga falta un
 * paso de alta separado ni migrar a los usuarios que ya existen en Firebase.
 */
export async function GET(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })

  const perfil = await getPerfil(user)

  // Alta silenciosa en el primer acceso. Si la tabla aún no existe, se ignora:
  // el perfil de arriba ya trae valores por defecto utilizables.
  try {
    await supabaseAdmin()
      .from('usuarios')
      .upsert(
        {
          uid: user.uid,
          email: user.email ?? '',
          rol: perfil.rol,
          estado: perfil.estado,
        },
        { onConflict: 'uid', ignoreDuplicates: true },
      )
  } catch {
    // Migración sin aplicar todavía.
  }

  return NextResponse.json({
    uid: perfil.uid,
    email: perfil.email,
    nombre: perfil.nombre,
    rol: perfil.rol,
    estado: perfil.estado,
  })
}

const ROLES_ELEGIBLES: Rol[] = ['cliente', 'publicador']

/**
 * PATCH /api/usuarios/me — el usuario edita su propio perfil.
 *
 * Puede cambiar su nombre, su teléfono y elegir entre buscar o publicar.
 * No puede concederse el rol de administrador: eso sólo se otorga desde
 * ADMIN_EMAILS o editando la tabla directamente.
 */
export async function PATCH(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })

  const perfil = await getPerfil(user)
  if (perfil.estado === 'suspendido') {
    return NextResponse.json({ error: 'Tu cuenta está suspendida.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const cambios: Record<string, unknown> = {}

  if (typeof body.nombre === 'string') cambios.nombre = body.nombre.trim().slice(0, 120)
  if (typeof body.telefono === 'string') cambios.telefono = body.telefono.trim().slice(0, 40)

  if (typeof body.rol === 'string') {
    if (!ROLES_ELEGIBLES.includes(body.rol as Rol)) {
      return NextResponse.json({ error: 'Ese rol no se puede elegir.' }, { status: 400 })
    }
    // Un administrador no se degrada a sí mismo sin querer al guardar el perfil.
    if (!isAdminEmail(user.email)) cambios.rol = body.rol
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ ok: true, sinCambios: true })
  }

  const { error } = await supabaseAdmin()
    .from('usuarios')
    .upsert({ uid: user.uid, email: user.email ?? '', ...cambios }, { onConflict: 'uid' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
