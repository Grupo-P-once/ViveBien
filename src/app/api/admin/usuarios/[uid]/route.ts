import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'
import { capacidadesEfectivas, normalizarOverrides, tipoDe } from '@/lib/acceso/capacidades'
import { leerExtrasDePublicadores } from '@/lib/citas/asesores'
import { flagEncendido } from '@/lib/config/flags-servidor'

/**
 * GET /api/admin/usuarios/[uid] — una cuenta y, si es publicador, su modalidad,
 * sus overrides y sus permisos EFECTIVOS (calculados aquí, con la misma función
 * que usa el resto del servidor: la pantalla no recalcula nada que decida).
 *
 * Sólo lectura. Cambiar algo es `PATCH /api/admin/usuarios` (una sola puerta
 * para escribir, con sus reglas, su motivo y su bitácora).
 *
 * Sólo administradores. Un uid que no existe es 404.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { uid } = await params
  if (!uid || uid.length > 128) return NextResponse.json({ error: 'Ese usuario no existe.' }, { status: 404 })

  const db = supabaseAdmin()
  const { data: u, error } = await db
    .from('usuarios')
    .select('uid, email, nombre, telefono, whatsapp, rol, estado, completitud, creado_en, ultimo_acceso')
    .eq('uid', uid)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo leer la cuenta.' }, { status: 500 })
  if (!u) return NextResponse.json({ error: 'Ese usuario no existe.' }, { status: 404 })

  const citasEnLinea = await flagEncendido('citasEnLinea')
  const base = {
    usuario: { ...u, esYo: u.uid === auth.perfil.uid },
    citasEnLinea,
  }
  if (u.rol !== 'publicador') return NextResponse.json({ ...base, permisos: null })

  // Modalidad y overrides (migración 28): si no se pueden leer, se dice. Los
  // permisos efectivos que se muestran son entonces los más restrictivos
  // (modalidad normal, sin overrides) y la pantalla no deja guardar.
  const extras = await leerExtrasDePublicadores(db, [uid])
  const e = extras.mapa.get(uid)
  const tipo = tipoDe(e?.tipo_publicador)
  const overrides = normalizarOverrides(e?.permisos_override)
  return NextResponse.json({
    ...base,
    permisos: {
      disponibles: extras.ok,
      tipoPublicador: tipo,
      overrides,
      efectivos: capacidadesEfectivas({ rol: 'publicador', tipo, overrides }),
    },
  })
}
