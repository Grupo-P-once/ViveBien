import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir } from '@/lib/auth-server'
import { leerFlags } from '@/lib/config/flags-servidor'
import { frenarAsync, TOPES } from '@/lib/limites'

/**
 * /api/admin/comision/operaciones/[id] — seguimiento de UNA operación (migración 43). SOLO el equipo. No mueve dinero.
 *
 *  PATCH { accion: 'confirmar' | 'anular', antes, motivo } → cambia el estado (registrada → confirmada | anulada, confirmada → anulada).
 *        `antes` es el estado que vio quien decide (si cambió, 409). Quien registró la operación no la confirma, SALVO el Super Admin (con motivo; queda «autoaprobada» en la bitácora).
 *  PATCH { accion: 'liberar_reparto' }                     → pasa la parte retenida del colaborador a «liberable» SOLO si la operación es
 *        atribuible y la acreditación del agente está verificada y vigente hoy. «Liberable» no es «pagado».
 *
 * Todo con bitácora en la misma transacción y con el módulo `commissionEngine` encendido.
 */

const NO_DISPONIBLE = () => NextResponse.json({ error: 'Las operaciones de comisión todavía no están disponibles.', codigo: 'no_disponible' }, { status: 503 })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'propiedad.moderar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`comision-op:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  if (!(await leerFlags()).commissionEngine) return NextResponse.json({ error: 'El motor de comisiones está apagado.', codigo: 'motor_apagado' }, { status: 409 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Esa operación no existe.' }, { status: 404 })
  const c = (await req.json().catch(() => ({}))) as { accion?: unknown; antes?: unknown; motivo?: unknown }
  const db = supabaseAdmin()
  // El Super Admin puede confirmar la operación que él mismo registró (migración 52; con motivo y marcada «autoaprobada»). El rol lo decide el servidor, nunca el navegador.
  const actor = { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol }

  let rpc
  if (c.accion === 'liberar_reparto') {
    rpc = await db.rpc('comision_reparto_liberar', { p_id: id, p_audit: { ...actor, accion: 'comision.reparto_liberado', antes: {}, despues: { reparto_estado: 'liberable' } } })
  } else if (c.accion === 'confirmar' || c.accion === 'anular') {
    const motivo = typeof c.motivo === 'string' ? c.motivo.trim() : ''
    if (motivo.length < 10 || motivo.length > 500) return NextResponse.json({ error: 'Escribe el motivo (de 10 a 500 caracteres).' }, { status: 400 })
    if (c.antes !== 'registrada' && c.antes !== 'confirmada') return NextResponse.json({ error: 'Falta el estado que estás viendo.' }, { status: 400 })
    const nuevo = c.accion === 'confirmar' ? 'confirmada' : 'anulada'
    rpc = await db.rpc('comision_operacion_cambiar_estado', {
      p_id: id, p_antes: c.antes, p_nuevo: nuevo, p_motivo: motivo,
      p_audit: { ...actor, accion: `comision.operacion_${nuevo}`, antes: { estado: c.antes }, despues: { estado: nuevo, motivo } },
    })
  } else {
    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 })
  }

  if (rpc.error) {
    if (/does not exist|schema cache|could not find/i.test(rpc.error.message)) return NO_DISPONIBLE()
    if (/cambio_invalido|auditoria_incompleta/.test(rpc.error.message)) return NextResponse.json({ error: 'Ese cambio no es válido para la operación.' }, { status: 400 })
    return NextResponse.json({ error: 'No se pudo registrar el cambio.' }, { status: 500 })
  }
  const resultado = (rpc.data as { resultado?: string } | null)?.resultado
  if (resultado === 'ok') return NextResponse.json({ ok: true })
  if (resultado === 'no_existe') return NextResponse.json({ error: 'Esa operación no existe.' }, { status: 404 })
  if (resultado === 'conflicto') return NextResponse.json({ error: 'La operación cambió mientras la mirabas. Recarga para ver cómo quedó.', codigo: 'conflicto' }, { status: 409 })
  if (resultado === 'autoaprobacion') return NextResponse.json({ error: 'Quien registró la operación no puede confirmarla: debe hacerlo otra persona del equipo (solo el Super Admin puede confirmar la suya).', codigo: 'autoaprobacion' }, { status: 403 })
  if (resultado === 'no_elegible') return NextResponse.json({ error: 'Todavía no se cumplen las condiciones para liberar el reparto: acreditación verificada y vigente, y operación atribuible. El Super Admin puede liberarlo sin ellas (queda marcado en la bitácora).', codigo: 'no_elegible' }, { status: 409 })
  return NextResponse.json({ error: 'No se pudo registrar el cambio.' }, { status: 500 })
}
