import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { frenarAsync, TOPES } from '@/lib/limites'

/**
 * /api/portal/notificaciones — la bandeja de avisos de UNA persona (migración 58): alertas de sus búsquedas, cambios de Términos/Privacidad y avisos del sistema.
 *  GET  → { notificaciones (las 60 más recientes), sinLeer } — solo las suyas (la sesión manda; no hay forma de pedir las de otra persona).
 *  POST { ids?: number[] } → las marca leídas (todas si no se mandan ids). Solo cambia `leida_en` de lo suyo.
 */
export const dynamic = 'force-dynamic'
const COLUMNAS = 'id, tipo, titulo, cuerpo, enlace, busqueda_id, propiedad_id, creada_en, leida_en' as const
const tablaAusente = (e: { code?: string; message?: string } | null | undefined) => Boolean(e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? '')))

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const db = supabaseAdmin()
  const [lista, sinLeer] = await Promise.all([
    db.from('notificaciones').select(COLUMNAS).eq('uid', auth.perfil.uid).order('creada_en', { ascending: false }).limit(60),
    db.from('notificaciones').select('id', { count: 'exact', head: true }).eq('uid', auth.perfil.uid).is('leida_en', null),
  ])
  if (lista.error) return tablaAusente(lista.error) ? NextResponse.json({ notificaciones: [], sinLeer: 0 }) : NextResponse.json({ error: 'No se pudieron cargar tus avisos.' }, { status: 500 })
  return NextResponse.json({ notificaciones: lista.data ?? [], sinLeer: sinLeer.count ?? 0 }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`notif:${auth.perfil.uid}`, TOPES.busquedas)
  if (frenado) return frenado
  const cuerpo = (await req.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(cuerpo.ids) ? cuerpo.ids.filter((x): x is number => Number.isInteger(x) && x > 0).slice(0, 200) : null
  if (Array.isArray(cuerpo.ids) && !ids?.length) return NextResponse.json({ error: 'Esos avisos no son válidos.' }, { status: 400 })
  let q = supabaseAdmin().from('notificaciones').update({ leida_en: new Date().toISOString() }).eq('uid', auth.perfil.uid).is('leida_en', null)
  if (ids) q = q.in('id', ids)
  const w = await q
  if (w.error) return tablaAusente(w.error) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No se pudo marcar como leído.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
