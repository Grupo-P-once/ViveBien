import { NextResponse } from 'next/server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { normalizarFiltros, mismaBusqueda, describir, MAXIMO_BUSQUEDAS, type Filtros } from '@/lib/busquedas'

/**
 * Búsquedas guardadas del cliente (pendiente 14).
 *
 * Siempre atadas al `uid` del token, nunca a uno que venga en la petición: la
 * tabla tiene RLS cerrado y se escribe con service role, así que esta ruta ES
 * la frontera. Los filtros se normalizan aquí aunque el cliente ya lo haga —
 * lo que llega por la red no se da por bueno.
 *
 * V-1.1.82 (P3-03): todo pasa por `exigir('cuenta.propia')`: sin sesión 401;
 * cuenta suspendida 403 (y el intento de escribir queda en la bitácora).
 */

/** GET /api/busquedas — las mías, la más reciente primero. */
export async function GET(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin()
    .from('busquedas_guardadas')
    .select('id, nombre, filtros, creado_en')
    .eq('uid', auth.perfil.uid)
    .order('creado_en', { ascending: false })
    .limit(MAXIMO_BUSQUEDAS)

  if (error) return NextResponse.json({ error: 'No pudimos cargar tus búsquedas.' }, { status: 503 })
  return NextResponse.json({ busquedas: data ?? [] })
}

/** POST /api/busquedas — guarda los filtros actuales. Body: { filtros } */
export async function POST(req: Request) {
  const frenado = await frenarAsync(`busquedas:${origenDe(req)}`, TOPES.busquedas)
  if (frenado) return frenado

  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const uid = auth.perfil.uid

  const body = await req.json().catch(() => ({}))
  const filtros = normalizarFiltros((body?.filtros ?? {}) as Record<string, unknown>)
  if (!filtros) {
    return NextResponse.json({ error: 'Elige al menos un filtro antes de guardar la búsqueda.' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: mias, error: errLectura } = await db
    .from('busquedas_guardadas')
    .select('id, filtros')
    .eq('uid', uid)

  if (errLectura) return NextResponse.json({ error: 'No pudimos guardar la búsqueda.' }, { status: 503 })

  // La misma búsqueda dos veces no es otra búsqueda: se dice que ya estaba.
  const repetida = (mias ?? []).find(b => mismaBusqueda(b.filtros as Filtros, filtros))
  if (repetida) return NextResponse.json({ ok: true, id: repetida.id, yaEstaba: true })

  if ((mias ?? []).length >= MAXIMO_BUSQUEDAS) {
    return NextResponse.json(
      { error: `Tienes ${MAXIMO_BUSQUEDAS} búsquedas guardadas. Borra una desde tu panel para guardar otra.` },
      { status: 409 },
    )
  }

  const { data, error } = await db
    .from('busquedas_guardadas')
    .insert({ uid, nombre: describir(filtros).slice(0, 120), filtros })
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'No pudimos guardar la búsqueda.' }, { status: 503 })
  return NextResponse.json({ ok: true, id: data?.id })
}

/** DELETE /api/busquedas?id=123 — sólo una mía. */
export async function DELETE(req: Request) {
  const frenado = await frenarAsync(`busquedas:${origenDe(req)}`, TOPES.busquedas)
  if (frenado) return frenado

  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error

  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta la búsqueda.' }, { status: 400 })

  // El `eq('uid')` es lo que impide borrar la búsqueda de otro cambiando el id.
  const { error } = await supabaseAdmin()
    .from('busquedas_guardadas')
    .delete()
    .eq('id', id)
    .eq('uid', auth.perfil.uid)

  if (error) return NextResponse.json({ error: 'No pudimos borrarla.' }, { status: 503 })
  return NextResponse.json({ ok: true })
}
