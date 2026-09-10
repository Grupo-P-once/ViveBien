import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin, isAdminEmail, type Rol, type Estado } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'

/**
 * Gestión de usuarios. Sólo administradores.
 *
 * La tabla `usuarios` tiene `estado: activo | suspendido | pendiente` desde la
 * Fase 1, y **nunca hubo pantalla para usarlo**. Suspender a alguien requería
 * entrar a Supabase a mano, así que en la práctica no se podía.
 *
 * La idea de tener esto viene de `zexahq/better-auth-starter` — ver el registro
 * de repos.
 */

const ROLES: Rol[] = ['cliente', 'publicador', 'admin']
const ESTADOS: Estado[] = ['activo', 'suspendido', 'pendiente']

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin()
    .from('usuarios')
    .select('uid, email, nombre, telefono, whatsapp, rol, estado, completitud, creado_en')
    .order('creado_en', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ usuarios: data ?? [] })
}

/**
 * PATCH — cambiar rol o estado. Cuerpo: { uid, rol?, estado? }
 *
 * Tres candados, y los tres existen porque el fallo que evitan es irreversible
 * desde la propia interfaz:
 *
 *  1. **Nadie se cambia a sí mismo.** Un admin que se degrada por error se
 *     queda fuera y ya no puede volver a entrar a arreglarlo.
 *  2. **Nadie se suspende a sí mismo.** Mismo razonamiento.
 *  3. **No se toca a quien está en `ADMIN_EMAILS`.** Esa lista es el modo de
 *     recuperación del sistema: si se pudiera degradar desde aquí a alguien que
 *     está en ella, la interfaz y la variable de entorno se contradirían, y
 *     gana la variable — así que el cambio parecería aplicado y no lo estaría.
 */
export async function PATCH(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const uid = typeof body.uid === 'string' ? body.uid : ''
  if (!uid) return NextResponse.json({ error: 'Falta el usuario.' }, { status: 400 })

  if (uid === perfil.uid) {
    return NextResponse.json(
      { error: 'No puedes cambiar tu propia cuenta desde aquí. Pídeselo a otro administrador.' },
      { status: 400 },
    )
  }

  const db = supabaseAdmin()
  const { data: objetivo } = await db
    .from('usuarios')
    .select('uid, email, rol, estado')
    .eq('uid', uid)
    .maybeSingle()

  if (!objetivo) return NextResponse.json({ error: 'Ese usuario no existe.' }, { status: 404 })

  if (isAdminEmail(objetivo.email)) {
    return NextResponse.json(
      {
        error:
          'Esa cuenta está en ADMIN_EMAILS. Esa lista manda sobre la tabla, así que el ' +
          'cambio no tendría efecto. Quítala de la variable de entorno primero.',
      },
      { status: 409 },
    )
  }

  const cambios: Record<string, unknown> = {}

  if (typeof body.rol === 'string') {
    if (!ROLES.includes(body.rol as Rol)) {
      return NextResponse.json({ error: 'Ese rol no existe.' }, { status: 400 })
    }
    cambios.rol = body.rol
  }

  if (typeof body.estado === 'string') {
    if (!ESTADOS.includes(body.estado as Estado)) {
      return NextResponse.json({ error: 'Ese estado no existe.' }, { status: 400 })
    }
    cambios.estado = body.estado
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 })
  }

  const { error } = await db.from('usuarios').update(cambios).eq('uid', uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrar({
    actor: perfil,
    accion: 'usuario.editar',
    entidad: 'usuarios',
    entidadId: uid,
    antes: { rol: objetivo.rol, estado: objetivo.estado },
    despues: cambios,
  })

  return NextResponse.json({ ok: true })
}
