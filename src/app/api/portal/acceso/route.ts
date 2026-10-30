import { NextResponse } from 'next/server'
import { exigirPortal } from '@/lib/portal/exigir-portal'

/**
 * GET /api/portal/acceso — ¿esta sesión puede usar el portal? (V-1.1.82)
 *
 * Lo pregunta la carcasa del portal para decir «todavía no disponible» en vez
 * de mostrar pantallas vacías. La decisión es del servidor (`exigirPortal`);
 * la carcasa sólo la enseña. 200 si puede; 401, 403 o 404 si no.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  return NextResponse.json({ ok: true })
}
