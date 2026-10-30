import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { esUuid, NO_DISPONIBLE, responderError, responderResultado } from '@/lib/contabilidad-servidor'

import { RUTA_DE_ADJUNTO } from '@/lib/contabilidad-externas'

/**
 * /api/admin/contabilidad/constancias/[folio] — SOLO Super Admin. `[folio]` es el folio (CP-AAAA-NNNN) para leer y el id para adjuntar.
 *  GET (`contabilidad.ver`)   → { constancia }: lo que la hoja membretada necesita (a quién, cuánto, cuándo, cómo, de qué operación y si hay comprobante). `no-store`.
 *  PATCH (`contabilidad.registrar`) { comprobante } → agrega el comprobante cuando llega después; solo si todavía no hay uno (no se reemplaza).
 */
const FOLIO = /^CP-\d{4}-\d{4,}$/
const PRIVADO = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request, { params }: { params: Promise<{ folio: string }> }) {
  const auth = await exigir(req, 'contabilidad.ver')
  if (auth.error) return auth.error
  const { folio } = await params
  if (!FOLIO.test(folio)) return NextResponse.json({ error: 'Esa constancia no existe.' }, { status: 404 })
  const r = await supabaseAdmin().from('contab_constancias').select('id, folio, colaborador_nombre, metodo, referencia, comprobante, monto_centavos, fecha_pago, descripcion, creado_en').eq('folio', folio).maybeSingle()
  if (r.error) return NO_DISPONIBLE()
  if (!r.data) return NextResponse.json({ error: 'Esa constancia no existe.' }, { status: 404 })
  return NextResponse.json({ constancia: r.data }, { headers: PRIVADO })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ folio: string }> }) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  const { folio: id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'Esa constancia no existe.' }, { status: 404 })
  const c = (await req.json().catch(() => ({}))) as { comprobante?: unknown }
  if (typeof c.comprobante !== 'string' || !RUTA_DE_ADJUNTO.test(c.comprobante)) return NextResponse.json({ error: 'Ese comprobante no es válido: vuelve a adjuntarlo.' }, { status: 400 })
  const { data, error } = await supabaseAdmin().rpc('contab_constancia_adjuntar', {
    p_id: id, p_comprobante: c.comprobante,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.constancia_comprobante', antes: {}, despues: { con_comprobante: true } },
  })
  if (error) return responderError(error.message)
  const r = (data as { resultado?: string } | null)?.resultado
  if (r === 'ok') return NextResponse.json({ ok: true })
  if (r === 'no_existe') return NextResponse.json({ error: 'Esa constancia no existe.' }, { status: 404 })
  return responderResultado(data)
}
