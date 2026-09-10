import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { calcularCompletitud } from '@/lib/publicacion'
import { extraerDeTexto } from '@/lib/telegram'

/**
 * POST /api/telegram/webhook — publicar una propiedad desde Telegram.
 *
 * ─────────────────────────────────────────────────────────────
 * QUÉ RESUELVE
 *
 * El asistente de 7 pasos es correcto y es lento. Quien está parado frente a
 * una nave con el teléfono en la mano no va a rellenar siete pantallas: manda
 * las fotos por WhatsApp a un compañero y se olvida. Ese inventario nunca llega
 * al sitio.
 *
 * Aquí manda las fotos y un texto suelto a un bot, y sale un **borrador**.
 * Nunca una publicación: sigue pasando por revisión como todo lo demás.
 *
 * ─────────────────────────────────────────────────────────────
 * SEGURIDAD — ESTE ES EL PUNTO DELICADO
 *
 * Un webhook de Telegram es una URL pública que acepta POST de cualquiera.
 * Sin protección, cualquiera que la descubra crea borradores en el catálogo.
 * Tres capas:
 *
 *  1. **Cabecera secreta.** Telegram reenvía `X-Telegram-Bot-Api-Secret-Token`
 *     con el valor que se registró al dar de alta el webhook. Si no coincide,
 *     se rechaza sin mirar el cuerpo.
 *  2. **Lista de remitentes.** Sólo los `chat_id` de `TELEGRAM_CHATS_PERMITIDOS`
 *     pueden crear nada. Que alguien conozca la URL no basta.
 *  3. **Sin configurar, no funciona.** Si falta el secreto, la ruta responde
 *     503 en vez de aceptar todo. Falla cerrado, como el resto del sistema.
 *
 * Se responde **200 siempre que la petición sea legítima**, incluso si algo
 * falla después: Telegram reintenta ante cualquier otro código, y un reintento
 * duplica el borrador. Es la lección de la cola de OTLI — responder rápido y
 * procesar después.
 * ─────────────────────────────────────────────────────────────
 */

export const dynamic = 'force-dynamic'

type MensajeTelegram = {
  message?: {
    chat?: { id?: number }
    from?: { first_name?: string; username?: string }
    text?: string
    caption?: string
    photo?: { file_id: string; file_size?: number }[]
    media_group_id?: string
  }
}

function chatsPermitidos(): string[] {
  return (process.env.TELEGRAM_CHATS_PERMITIDOS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export async function POST(req: Request) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET

  // Falla cerrado: sin secreto configurado no se acepta nada.
  if (!secreto) {
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET no está configurada')
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 })
  }

  if (req.headers.get('x-telegram-bot-api-secret-token') !== secreto) {
    // 401 sin detalle: a quien sondea la URL no se le explica qué le falta.
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as MensajeTelegram
  const msg = cuerpo.message
  const chatId = msg?.chat?.id ? String(msg.chat.id) : ''

  const permitidos = chatsPermitidos()
  if (permitidos.length === 0) {
    console.error('[telegram] TELEGRAM_CHATS_PERMITIDOS vacía: no se acepta a nadie')
    return NextResponse.json({ ok: true, ignorado: 'sin lista de remitentes' })
  }
  if (!permitidos.includes(chatId)) {
    // 200 a propósito: si Telegram recibe un error, reintenta. Y a un remitente
    // no autorizado no se le confirma siquiera que el chat existe.
    return NextResponse.json({ ok: true, ignorado: 'remitente no autorizado' })
  }

  const texto = msg?.caption ?? msg?.text ?? ''
  const datos = extraerDeTexto(texto)

  if (!datos.titulo && !datos.descripcion) {
    return NextResponse.json({ ok: true, ignorado: 'mensaje vacío' })
  }

  const base = String(datos.titulo ?? 'propiedad')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'propiedad'

  const fila = {
    ...datos,
    id: `${base}-${Date.now().toString(36).slice(-4)}`,
    // El dueño se resuelve por el chat: quien manda, publica.
    owner_id: null,
    estado_pub: 'borrador',
    estatus: 'disponible',
    origen: 'telegram',
    completitud: calcularCompletitud(datos),
  }

  try {
    const { error } = await supabaseAdmin().from('propiedades').insert(fila)
    if (error) throw new Error(error.message)
  } catch (e) {
    // Se registra pero se responde 200: un 500 haría que Telegram reintentara
    // y acabaríamos con tres borradores del mismo mensaje.
    console.error('[telegram] no se pudo crear el borrador:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true, guardado: false })
  }

  return NextResponse.json({
    ok: true,
    guardado: true,
    id: fila.id,
    completitud: fila.completitud,
  })
}

/** Comprobación de que la ruta está viva y configurada, sin exponer nada. */
export async function GET() {
  return NextResponse.json({
    configurado: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    remitentes: chatsPermitidos().length,
  })
}
