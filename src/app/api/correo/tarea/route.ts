import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/auth-server'
import { ejecutarTareaMarketing } from '@/lib/correo/tarea'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * GET /api/correo/tarea — la ejecución diaria de recomendaciones (D-80). La invoca el cron de Vercel con
 * `Authorization: Bearer <CRON_SECRET>`; sin ese secreto, o con otro, responde 401. Con el marketing apagado
 * (`CORREO_MARKETING` ≠ 1) no hace nada. Devuelve sólo contadores: ni direcciones ni contenido.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const iguales = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET?.trim()
  const cabecera = req.headers.get('authorization') ?? ''
  if (!secreto || !iguales(cabecera, `Bearer ${secreto}`)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const r = await ejecutarTareaMarketing(supabaseAdmin() as unknown as DbCorreo)
  return NextResponse.json(r)
}
