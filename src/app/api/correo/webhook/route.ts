import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { limpiarTexto } from '@/lib/registro-seguro'
import { entornoCorreo } from '@/lib/correo/config'
import { verificarWebhook } from '@/lib/correo/seguridad'
import { aplicarEventoProveedor } from '@/lib/correo/suscripcion'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * POST /api/correo/webhook — eventos de Resend: rebotes, quejas, entregas (D-80).
 *
 * Se autentica SÓLO por la firma (Svix: HMAC-SHA256 de `<id>.<marca de tiempo>.<cuerpo crudo>` con el secreto `whsec_…`,
 * comparado en tiempo constante, tolerancia de 5 minutos). Sin secreto configurado responde 503: nunca acepta sin verificar.
 * Es idempotente por `svix-id`: un evento repetido no se aplica dos veces. Un rebote permanente o una queja suprimen la
 * dirección para siempre; el proveedor reintenta ante un 5xx, así que un fallo interno responde 500 (para que reintente).
 */
const MAX_CUERPO = 64 * 1024

export async function POST(req: Request) {
  const frenado = await frenarAsync(`correo-webhook:${origenDe(req)}`, TOPES.correoWebhook)
  if (frenado) return frenado

  const secreto = entornoCorreo().webhookSecret
  if (!secreto) return new NextResponse('Webhook no configurado', { status: 503 })
  if (Number(req.headers.get('content-length') ?? '0') > MAX_CUERPO) return new NextResponse('Payload Too Large', { status: 413 })
  const crudo = await req.text().catch(() => '')
  if (crudo.length > MAX_CUERPO) return new NextResponse('Payload Too Large', { status: 413 })

  const id = req.headers.get('svix-id')
  const ok = verificarWebhook({
    secreto,
    id,
    marcaTiempo: req.headers.get('svix-timestamp'),
    firma: req.headers.get('svix-signature'),
    cuerpo: crudo,
  })
  if (!ok || !id) return new NextResponse('Firma no válida', { status: 401 })

  let evento: unknown
  try { evento = JSON.parse(crudo) } catch { return new NextResponse('Cuerpo no válido', { status: 400 }) }

  try {
    const r = await aplicarEventoProveedor(supabaseAdmin() as unknown as DbCorreo, id, evento)
    if (r === 'error') {
      console.error('[correo] no se pudo aplicar un evento del proveedor', limpiarTexto(id, 40))
      return new NextResponse('Error interno', { status: 500 })
    }
    return NextResponse.json({ ok: true, resultado: r })
  } catch (e) {
    console.error('[correo] error procesando un evento del proveedor:', limpiarTexto(e))
    return new NextResponse('Error interno', { status: 500 })
  }
}
