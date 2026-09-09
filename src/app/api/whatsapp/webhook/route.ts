import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/auth-server'

/**
 * Webhook de acuses de WhatsApp.
 *
 * Que la API acepte un mensaje sólo significa que Meta lo recibió, no que
 * llegó al teléfono. La entrega real se sabe aquí. Sin este webhook, el
 * panel mostraría "enviado" para mensajes que nunca llegaron.
 *
 * Es una URL pública, así que cada petición se verifica con la firma
 * HMAC del cuerpo. Sin APP_SECRET configurado no se procesa nada.
 */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
const APP_SECRET = process.env.WHATSAPP_APP_SECRET

/** GET — el saludo de verificación que Meta hace al registrar la URL. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const modo = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const reto = url.searchParams.get('hub.challenge')

  if (modo === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(reto ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

function firmaValida(crudo: string, cabecera: string | null): boolean {
  if (!APP_SECRET || !cabecera?.startsWith('sha256=')) return false
  const esperada = createHmac('sha256', APP_SECRET).update(crudo).digest('hex')
  const recibida = cabecera.slice(7)
  // Longitudes distintas romperían timingSafeEqual.
  if (esperada.length !== recibida.length) return false
  return timingSafeEqual(Buffer.from(esperada), Buffer.from(recibida))
}

/** Estados que Meta reporta, traducidos a los nuestros. */
function traducir(estado: string): string | null {
  switch (estado) {
    case 'sent': return 'enviado'
    case 'delivered':
    case 'read': return 'entregado'
    case 'failed': return 'fallido'
    default: return null
  }
}

export async function POST(req: Request) {
  const crudo = await req.text()

  if (!firmaValida(crudo, req.headers.get('x-hub-signature-256'))) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = JSON.parse(crudo)
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  try {
    const db = supabaseAdmin()
    const entradas = (cuerpo?.entry ?? []) as Array<Record<string, unknown>>

    for (const entrada of entradas) {
      const cambios = (entrada?.changes ?? []) as Array<Record<string, unknown>>
      for (const cambio of cambios) {
        const valor = (cambio?.value ?? {}) as Record<string, unknown>
        const acuses = (valor?.statuses ?? []) as Array<Record<string, unknown>>

        for (const acuse of acuses) {
          const id = typeof acuse.id === 'string' ? acuse.id : null
          const estado = typeof acuse.status === 'string' ? traducir(acuse.status) : null
          if (!id || !estado) continue

          const errores = (acuse.errors ?? []) as Array<Record<string, unknown>>
          const motivo = errores[0]?.title ?? errores[0]?.message ?? null

          await db
            .from('solicitudes_contacto')
            .update({
              whatsapp_estado: estado,
              whatsapp_error: motivo ? String(motivo).slice(0, 500) : null,
            })
            .eq('whatsapp_id', id)

          // Un fallo de facturación o de cuenta restringida no es ruido del
          // día a día: es que dejaron de salir todos los avisos.
          if (estado === 'fallido') {
            console.error('[whatsapp] entrega fallida', { id, motivo })
          }
        }
      }
    }
  } catch (e) {
    console.error('[whatsapp] error procesando el acuse:', e)
    // Se responde 200 igualmente: si no, Meta reintenta en bucle.
  }

  return NextResponse.json({ ok: true })
}
