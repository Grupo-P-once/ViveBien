import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { estaDisponible } from '@/lib/contactos-cliente'

/**
 * /api/portal/avisos-precio — la campana «Avisarme cuando baje de precio» de la ficha (migración 59).
 *  GET  ?propiedadId=…            → { activo }  (¿esta persona ya pidió el aviso para esa propiedad?)
 *  POST { propiedadId, activo }   → enciende (guarda el precio de AHORA como punto de partida) o apaga el aviso.
 * SOLO con cuenta: la persona sale de la sesión (`exigirPortal`: la misma puerta de toda `/api/portal/*`), nunca del cuerpo; sin sesión 401, cuenta suspendida 403, portal cerrado para esa persona 404. Solo propiedades publicadas y disponibles, con precio.
 * Falla CERRADO si la migración 59 no está aplicada (503 sin cambiar nada). Quién avisa y cuándo: la tarea diaria de `lib/avisos-cliente-servidor.ts`.
 */
export const dynamic = 'force-dynamic'
const MAXIMO_AVISOS = 100
const tablaAusente = (e: { code?: string; message?: string } | null | undefined) => Boolean(e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? '')))
const NO_DISPONIBLE = () => NextResponse.json({ error: 'Los avisos de precio todavía no están disponibles.', codigo: 'no_disponible' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
const idValido = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 120 && !/[\s<>"'`\\]/.test(v.trim()) ? v.trim() : null)

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const id = idValido(new URL(req.url).searchParams.get('propiedadId'))
  if (!id) return NextResponse.json({ error: 'Falta la propiedad.' }, { status: 400 })
  const r = await supabaseAdmin().from('cliente_avisos_precio').select('propiedad_id').eq('uid', auth.perfil.uid).eq('propiedad_id', id).limit(1)
  if (r.error) return tablaAusente(r.error) ? NO_DISPONIBLE() : NextResponse.json({ error: 'No se pudo consultar.' }, { status: 500 })
  return NextResponse.json({ activo: (r.data ?? []).length > 0 }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: Request) {
  const frenado = await frenarAsync(`avisos-precio:${origenDe(req)}`, TOPES.favoritos)
  if (frenado) return frenado
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const uid = auth.perfil.uid

  const body = (await req.json().catch(() => ({}))) as { propiedadId?: unknown; activo?: unknown }
  const id = idValido(body.propiedadId)
  if (!id || typeof body.activo !== 'boolean') return NextResponse.json({ error: 'Falta la propiedad o si quieres el aviso.' }, { status: 400 })
  const db = supabaseAdmin()

  if (!body.activo) {
    const d = await db.from('cliente_avisos_precio').delete().eq('uid', uid).eq('propiedad_id', id)
    if (d.error) return tablaAusente(d.error) ? NO_DISPONIBLE() : NextResponse.json({ error: 'No se pudo quitar el aviso.' }, { status: 500 })
    return NextResponse.json({ ok: true, activo: false })
  }

  const p = await db.from('propiedades').select('id, precio, moneda, estado_pub, estatus').eq('id', id).maybeSingle()
  if (p.error) return NextResponse.json({ error: 'No se pudo registrar.' }, { status: 500 })
  const fila = p.data as { id: string; precio: number | string | null; moneda: string | null; estado_pub: string; estatus: string | null } | null
  if (!fila || !estaDisponible(fila)) return NextResponse.json({ error: 'Esa propiedad ya no está disponible.' }, { status: 404 })
  const precio = typeof fila.precio === 'number' ? fila.precio : Number(fila.precio)
  if (!Number.isFinite(precio) || precio <= 0) return NextResponse.json({ error: 'Esta propiedad no tiene un precio publicado para comparar.' }, { status: 422 })

  const previos = await db.from('cliente_avisos_precio').select('propiedad_id').eq('uid', uid).limit(MAXIMO_AVISOS + 1)
  if (previos.error) return tablaAusente(previos.error) ? NO_DISPONIBLE() : NextResponse.json({ error: 'No se pudo registrar.' }, { status: 500 })
  const lista = (previos.data ?? []) as Array<{ propiedad_id: string }>
  if (lista.some((x) => x.propiedad_id === id)) return NextResponse.json({ ok: true, activo: true, yaEstaba: true })       // no se pisa el precio de partida
  if (lista.length >= MAXIMO_AVISOS) return NextResponse.json({ error: `Ya tienes ${MAXIMO_AVISOS} avisos de precio. Quita alguno para agregar otro.` }, { status: 409 })

  const w = await db.from('cliente_avisos_precio').upsert({ uid, propiedad_id: fila.id, precio_base: precio, moneda: (fila.moneda ?? 'MXN').toUpperCase().slice(0, 3) }, { onConflict: 'uid,propiedad_id', ignoreDuplicates: true })
  if (w.error) return tablaAusente(w.error) ? NO_DISPONIBLE() : NextResponse.json({ error: 'No se pudo registrar.' }, { status: 500 })
  return NextResponse.json({ ok: true, activo: true }, { status: 201 })
}
