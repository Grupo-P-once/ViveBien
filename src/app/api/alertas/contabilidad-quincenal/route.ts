import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { enviarQuincenal, hoyEnMexico } from '@/lib/contabilidad-reporte-servidor'

/**
 * El reporte quincenal de contabilidad al grupo de avisos de Telegram (26-oct-2026). Lo dispara una tarea programada de Vercel (`vercel.json`) los días 1, 2, 16 y 17 a las 9:00
 * hora de México: el 1 y el 16 mandan la quincena que acaba de terminar; el 2 y el 17 reintentan por si falló (y no mandan dos veces: la quincena se reserva en la base).
 *
 * Protegido con `CRON_SECRET` (es una URL pública): sin el secreto responde 401, y si el secreto no está configurado, también (falla cerrado). El mensaje lleva solo cifras
 * agregadas; ver `lib/contabilidad-quincenal.ts`.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET?.trim()
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const r = await enviarQuincenal(supabaseAdmin(), hoyEnMexico(), 'cron')
  const quincena = r.reporte?.quincena
  if (r.estado === 'enviado' || r.estado === 'ya_enviado') return NextResponse.json({ ok: true, estado: r.estado, quincena })
  if (r.estado === 'en_curso' || r.estado === 'telegram_sin_configurar') return NextResponse.json({ ok: false, estado: r.estado, quincena })
  return NextResponse.json({ ok: false, estado: r.estado, quincena }, { status: r.estado === 'no_disponible' ? 503 : 502 })
}
