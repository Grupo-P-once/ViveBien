import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { CATEGORIAS_DE_GASTO } from '@/lib/contabilidad'
import { esUuid, NO_DISPONIBLE, responderError } from '@/lib/contabilidad-servidor'

/**
 * PATCH /api/admin/contabilidad/cuentas/[id] — edita una cuenta de gasto. SOLO Super Admin (`contabilidad.registrar`).
 *   { nombre?: string, categoria?: string, identificador?: string | null, notas?: string | null, activa?: boolean }
 * Nunca se borra (el historial de gastos de esa cuenta debe seguir leyéndose). Cambiar el nombre, el tipo o el identificador NO toca los movimientos ya registrados: cada uno conserva
 * su propia categoría; solo cambia cómo se llama la cuenta al leerlos. Cada cambio queda en `audit_logs` con el antes y el después. Un nombre + identificador que ya usa otra cuenta → 409.
 */

const CAMPOS_DE_FONDO = ['nombre', 'categoria', 'identificador'] as const
const textoOpcional = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'Esa cuenta no existe.' }, { status: 404 })
  const c = (await req.json().catch(() => ({}))) as { activa?: unknown; notas?: unknown; nombre?: unknown; categoria?: unknown; identificador?: unknown }
  const cambios: Record<string, unknown> = {}
  if (c.activa !== undefined) {
    if (typeof c.activa !== 'boolean') return NextResponse.json({ error: 'Indica si la cuenta está activa (sí o no).' }, { status: 400 })
    cambios.activa = c.activa
  }
  if (c.notas !== undefined) {
    if (c.notas !== null && (typeof c.notas !== 'string' || c.notas.length > 500)) return NextResponse.json({ error: 'Las notas son de hasta 500 caracteres.' }, { status: 400 })
    cambios.notas = c.notas
  }
  if (c.nombre !== undefined) {
    const nombre = textoOpcional(c.nombre)
    if (nombre.length < 2 || nombre.length > 120) return NextResponse.json({ error: 'Escribe el nombre de la cuenta (de 2 a 120 caracteres).' }, { status: 400 })
    if (/@|\d{12,}/.test(nombre)) return NextResponse.json({ error: 'El nombre no lleva correos ni números largos: el identificador va en su propio campo.' }, { status: 400 })
    cambios.nombre = nombre
  }
  if (c.categoria !== undefined) {
    if (typeof c.categoria !== 'string' || !(CATEGORIAS_DE_GASTO as readonly string[]).includes(c.categoria)) return NextResponse.json({ error: 'Elige el tipo de gasto de la cuenta.' }, { status: 400 })
    cambios.categoria = c.categoria
  }
  if (c.identificador !== undefined) {
    const identificador = c.identificador === null ? '' : textoOpcional(c.identificador)
    if (identificador.length > 120 || identificador.includes('@')) return NextResponse.json({ error: 'El identificador es un código de hasta 120 caracteres, sin correos.' }, { status: 400 })
    cambios.identificador = identificador || null
  }
  if (!Object.keys(cambios).length) return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 })

  const db = supabaseAdmin()
  const antes = await db.from('contab_cuentas').select('nombre, categoria, identificador, activa').eq('id', id).maybeSingle()
  if (antes.error) return NO_DISPONIBLE()
  if (!antes.data) return NextResponse.json({ error: 'Esa cuenta no existe.' }, { status: 404 })
  const previo = antes.data as { nombre: string; categoria: string; identificador: string | null; activa: boolean }

  // Bitácora: solo lo que cambió (antes y después). Las notas son texto libre: van como marcador.
  const antesAudit: Record<string, unknown> = {}
  const despuesAudit: Record<string, unknown> = {}
  for (const k of CAMPOS_DE_FONDO) if (cambios[k] !== undefined) { antesAudit[k] = previo[k]; despuesAudit[k] = cambios[k] }
  if (cambios.activa !== undefined) { antesAudit.activa = previo.activa; despuesAudit.activa = cambios.activa }
  if (cambios.notas !== undefined) despuesAudit.notas = '[notas]'

  const { data, error } = await db.rpc('contab_cuenta_cambiar', {
    p_id: id, p_cambios: cambios,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.cuenta_cambiada', antes: antesAudit, despues: despuesAudit },
  })
  if (error) return responderError(error.message)
  const r = (data as { resultado?: string } | null)?.resultado
  if (r === 'ok') return NextResponse.json({ ok: true })
  if (r === 'ya_existe') return NextResponse.json({ error: 'Ya hay otra cuenta con ese nombre y ese identificador.', codigo: 'ya_existe' }, { status: 409 })
  if (r === 'no_existe') return NextResponse.json({ error: 'Esa cuenta no existe.' }, { status: 404 })
  return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 })
}
