import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { responderError, responderResultado } from '@/lib/contabilidad-servidor'

import { prepararConstancia } from '@/lib/contabilidad-externas'
/**
 * POST /api/admin/contabilidad/constancias — crea la CONSTANCIA de un pago a un colaborador (hoja membretada con folio). SOLO Super Admin (`contabilidad.registrar`). Migración 55.
 *   { movimiento_id, colaborador_nombre, colaborador_id?, metodo: 'efectivo'|'transferencia', referencia?, comprobante?, descripcion? }
 * El pago ya está registrado (clase `pago_colaborador`); la constancia toma de ahí el monto, la fecha y la operación. Una sola por pago: repetir devuelve la misma (200 `repetida`).
 * El comprobante (una transferencia, un recibo) es OPCIONAL y es una ruta del bucket privado que devolvió `/adjuntos`.
 */
export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  const cuerpo = await req.json().catch(() => ({}))
  const p = prepararConstancia(cuerpo && typeof cuerpo === 'object' ? cuerpo : {}, perfil.email || perfil.uid)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status })
  const d = p.datos
  const { data, error } = await supabaseAdmin().rpc('contab_constancia_crear', {
    p_datos: d,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.constancia_creada', antes: {}, despues: { metodo: d.metodo, con_comprobante: Boolean(d.comprobante) } },
  })
  if (error) return responderError(error.message)
  const r = (data as { resultado?: string; folio?: string; id?: string } | null)
  if (r?.resultado === 'ok') return NextResponse.json({ ok: true, id: r.id, folio: r.folio }, { status: 201 })
  if (r?.resultado === 'repetida') return NextResponse.json({ ok: true, id: r.id, folio: r.folio, repetida: true })
  return responderResultado(data)
}
