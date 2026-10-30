import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { esUuid, responderError, responderResultado } from '@/lib/contabilidad-servidor'

import { prepararCambioDeExterna } from '@/lib/contabilidad-externas'
import { fechaLocalISO } from '@/lib/contabilidad'
/**
 * PATCH /api/admin/contabilidad/externas/[id] — SOLO Super Admin (`contabilidad.registrar`).
 *   { accion: 'cobrar', antes: 'por_cobrar', cobrada_en, metodo_cobro: 'efectivo'|'transferencia', referencia?, adjunto? }   → marca que ya se cobró (con su comprobante opcional)
 *   { accion: 'anular', antes: 'por_cobrar'|'cobrada', motivo }                                                              → la anula, con motivo (no se borra)
 * `antes` es el estado que vio quien decide: si cambió, 409.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'Esa comisión no existe.' }, { status: 404 })
  const cuerpo = await req.json().catch(() => ({}))
  const p = prepararCambioDeExterna(cuerpo && typeof cuerpo === 'object' ? cuerpo : {}, fechaLocalISO())
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status })
  const { antes, nuevo, datos } = p.datos
  const { data, error } = await supabaseAdmin().rpc('comision_externa_cambiar_estado', {
    p_id: id, p_antes: antes, p_nuevo: nuevo, p_datos: datos,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: `contabilidad.externa_${nuevo}`, antes: { estado: antes }, despues: { estado: nuevo, ...(datos.metodo_cobro ? { metodo_cobro: datos.metodo_cobro } : {}), ...(datos.motivo ? { motivo: '[motivo]' } : {}) } },
  })
  if (error) return responderError(error.message)
  const r = (data as { resultado?: string } | null)?.resultado
  if (r === 'ok') return NextResponse.json({ ok: true })
  return responderResultado(data)
}
