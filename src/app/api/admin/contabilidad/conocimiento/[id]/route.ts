import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { esUuid, responderError, responderResultado } from '@/lib/contabilidad-servidor'

/**
 * PATCH /api/admin/contabilidad/conocimiento/[id] — retira una nota del contador (migración 49). SOLO Super Admin (`contabilidad.registrar`).
 *   { motivo: string }  (de 10 a 300 caracteres)
 * Retirar no borra: la nota queda en el historial, marcada, con quién la retiró, cuándo y por qué. Una nota retirada no vuelve (se registra otra). No hay DELETE.
 */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'Esa nota no existe.' }, { status: 404 })
  const c = (await req.json().catch(() => ({}))) as { motivo?: unknown }
  const motivo = typeof c.motivo === 'string' ? c.motivo.trim() : ''
  if (motivo.length < 10 || motivo.length > 300) return NextResponse.json({ error: 'Escribe el motivo (de 10 a 300 caracteres).' }, { status: 400 })

  const { data, error } = await supabaseAdmin().rpc('contab_nota_retirar', {
    p_id: id, p_motivo: motivo, p_por: perfil.email || perfil.uid,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.nota_retirada', antes: { retirada: false }, despues: { retirada: true } },
  })
  if (error) return responderError(error.message)
  const r = (data as { resultado?: string } | null)?.resultado
  if (r === 'ok') return NextResponse.json({ ok: true })
  return responderResultado(data)
}
