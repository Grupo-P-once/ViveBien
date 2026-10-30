import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync } from '@/lib/limites'
import { NO_DISPONIBLE } from '@/lib/contabilidad-servidor'
import { enviarQuincenal, hoyEnMexico, prepararReporte, telegramConfigurado } from '@/lib/contabilidad-reporte-servidor'

/**
 * Reporte quincenal de contabilidad — vista previa y envío manual. SOLO Super Admin.
 *
 *  GET  (`contabilidad.ver`)        → { reporte, alerta, telegram: { configurado } }: lo que se mandaría, SIN mandar nada.
 *  POST { confirmar: true } (`contabilidad.registrar`) → manda a Telegram la quincena que ya terminó. Es un envío hacia fuera: exige `confirmar: true` y la quincena se reserva en
 *       la base, así que si el cron ya la mandó responde 409 `ya_enviado` y nunca llega duplicada.
 */

const TOPE_ENVIO = { maximo: 3, ventanaMs: 60 * 60 * 1000 }

export async function GET(req: Request) {
  const auth = await exigir(req, 'contabilidad.ver')
  if (auth.error) return auth.error
  const p = await prepararReporte(supabaseAdmin(), hoyEnMexico())
  if (!p) return NO_DISPONIBLE()
  return NextResponse.json({ reporte: p.reporte, alerta: p.alerta, telegram: { configurado: telegramConfigurado() } })
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`contab-reporte:${auth.perfil.uid}`, TOPE_ENVIO)
  if (frenado) return frenado
  const c = (await req.json().catch(() => ({}))) as { confirmar?: unknown }
  if (c.confirmar !== true) return NextResponse.json({ error: 'Confirma el envío: el mensaje llega al grupo de avisos y no se puede retirar.' }, { status: 400 })
  const r = await enviarQuincenal(supabaseAdmin(), hoyEnMexico(), 'manual')
  switch (r.estado) {
    case 'enviado': return NextResponse.json({ ok: true, quincena: r.reporte?.quincena })
    case 'ya_enviado': return NextResponse.json({ error: 'Esa quincena ya se envió al grupo de avisos.', codigo: 'ya_enviado' }, { status: 409 })
    case 'en_curso': return NextResponse.json({ error: 'Se está enviando en este momento. Espera unos minutos.', codigo: 'en_curso' }, { status: 409 })
    case 'telegram_sin_configurar': return NextResponse.json({ error: 'Telegram no está configurado (falta el bot o el grupo de avisos).', codigo: 'telegram_sin_configurar' }, { status: 503 })
    case 'no_disponible': return NO_DISPONIBLE()
    default: return NextResponse.json({ error: 'Telegram no aceptó el mensaje. Inténtalo de nuevo en unos minutos.', codigo: 'fallo' }, { status: 502 })
  }
}
