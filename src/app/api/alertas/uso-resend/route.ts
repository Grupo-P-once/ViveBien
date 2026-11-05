import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { avisar } from '@/lib/alertas'
import { conciliarUsoDeResend } from '@/lib/correo/cuota-resend'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * Lectura diaria y automática del consumo de Resend con `GET /usage` (D-83). La dispara una tarea programada de Vercel (`vercel.json`, 06:00 UTC) y registra la lectura por
 * la misma función SQL que usa el Super Admin en el panel, con actor `automatico:uso-resend`. La llave de acceso completo vive aparte (`RESEND_USAGE_KEY`) y sólo la usa este camino.
 *
 * Protegido con `CRON_SECRET` (es una URL pública): sin el secreto —o sin la variable configurada— responde 401. Sin la llave o fuera de producción no hace nada (200, sin aviso).
 * Si no se puede leer o guardar, NO inventa nada: avisa al grupo (sin datos personales ni la llave) y deja la última lectura, que vence sola. La lectura manual sigue siendo el respaldo.
 */
export const dynamic = 'force-dynamic'

const mismaCadena = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET?.trim()
  if (!secreto || !mismaCadena(req.headers.get('authorization') ?? '', `Bearer ${secreto}`)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const r = await conciliarUsoDeResend(supabaseAdmin() as unknown as DbCorreo)
  if (r.ok) return NextResponse.json({ ok: true, dia: r.dia, mes: r.mes })
  if (r.motivo === 'fuera_de_produccion' || r.motivo === 'sin_llave') return NextResponse.json({ ok: false, motivo: r.motivo }, { status: 200 })
  console.error(`[correo] la lectura automática del consumo de Resend falló: ${r.motivo}${r.estado ? ` (${r.estado})` : ''}`)
  await avisar({
    nivel: 'aviso',
    titulo: 'Lectura automática de Resend: no se pudo registrar',
    datos: { Motivo: r.motivo, 'Estado de Resend': r.estado },
    accion: 'Registra la lectura a mano en Admin → Marketing → «Estado y cupo de Resend» antes de que venza la última (8 días).',
    clave: `uso-resend:${new Date().toISOString().slice(0, 10)}`,
  }).catch(() => false)
  return NextResponse.json({ ok: false, motivo: r.motivo, estado: r.estado }, { status: r.motivo === 'no_se_guardo' ? 503 : 502 })
}
