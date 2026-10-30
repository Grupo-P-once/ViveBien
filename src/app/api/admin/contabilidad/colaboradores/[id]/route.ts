import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { esUuid, responderError } from '@/lib/contabilidad-servidor'

import { prepararCambioDeColaborador } from '@/lib/contabilidad-externas'
/**
 * PATCH /api/admin/contabilidad/colaboradores/[id] — edita o desactiva un colaborador. SOLO Super Admin (`contabilidad.registrar`).
 *   { tipo?, nombre?, empresa?, telefono?, correo?, municipio?, folio_acreditacion?, notas?, activo? }  (un texto vacío borra ese dato)
 * No se borra: el historial de pagos y constancias debe seguir leyéndose. La bitácora dice QUÉ campos cambiaron, no sus valores de contacto.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'Ese colaborador no existe.' }, { status: 404 })
  const cuerpo = await req.json().catch(() => ({}))
  const p = prepararCambioDeColaborador(cuerpo && typeof cuerpo === 'object' ? cuerpo : {})
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status })
  const campos = Object.keys(p.datos)
  const { data, error } = await supabaseAdmin().rpc('contab_colaborador_cambiar', {
    p_id: id, p_cambios: p.datos,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.colaborador_cambiado', antes: {}, despues: { campos, ...(typeof p.datos.activo === 'boolean' ? { activo: p.datos.activo } : {}) } },
  })
  if (error) return responderError(error.message)
  const r = (data as { resultado?: string } | null)?.resultado
  if (r === 'ok') return NextResponse.json({ ok: true })
  if (r === 'no_existe') return NextResponse.json({ error: 'Ese colaborador no existe.' }, { status: 404 })
  if (r === 'ya_existe') return NextResponse.json({ error: 'Ya hay otro colaborador con ese nombre y esa empresa.', codigo: 'ya_existe' }, { status: 409 })
  return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 })
}
