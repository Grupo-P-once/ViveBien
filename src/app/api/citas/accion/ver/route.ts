import { NextResponse } from 'next/server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { verToken } from '@/lib/citas/servicio'

/**
 * POST /api/citas/accion/ver  `{ token }` — qué hace un enlace de correo,
 * SIN hacerlo. Es lo que la página enseña antes del botón.
 *
 * POST y no GET: el token nunca va en una URL que quede en registros.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const frenado = await frenarAsync(`citas-accion:${origenDe(req)}`, TOPES.citas)
  if (frenado) return frenado
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const vista = await verToken(cuerpo.token)
    return NextResponse.json(vista, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[citas] ver enlace', e)
    return NextResponse.json({ error: 'No se pudo leer el enlace.' }, { status: 500 })
  }
}
