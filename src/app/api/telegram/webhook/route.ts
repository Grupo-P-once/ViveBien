import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { calcularCompletitud } from '@/lib/publicacion'
import { extraerDeTexto } from '@/lib/telegram'
import {
  PREGUNTAS,
  interpretar,
  resumen,
  type PasoTelegram,
} from '@/lib/telegram-wizard'
import { SITIO } from '@/lib/sitio'

/**
 * POST /api/telegram/webhook — el asistente de publicación, conversando.
 *
 * ─────────────────────────────────────────────────────────────
 * SEGURIDAD
 *
 * Un webhook de Telegram es una URL pública que acepta POST de cualquiera.
 * Tres capas, y las tres fallan cerrado:
 *
 *  1. **Cabecera secreta** `X-Telegram-Bot-Api-Secret-Token`. Si no coincide,
 *     se rechaza sin mirar el cuerpo.
 *  2. **Lista de `chat_id`** en `TELEGRAM_CHATS_PERMITIDOS`. Conocer la URL no
 *     basta.
 *  3. **Sin secreto configurado, 503.** No se acepta nada.
 *
 * Se responde **200 siempre que la petición sea legítima**, aunque algo falle
 * después: Telegram reintenta ante cualquier otro código, y un reintento
 * duplicaría el borrador.
 *
 * ─────────────────────────────────────────────────────────────
 * DÓNDE VIVE EL ESTADO
 *
 * En el propio borrador, no en memoria. Ver `lib/telegram-wizard.ts`.
 * ─────────────────────────────────────────────────────────────
 */

export const dynamic = 'force-dynamic'

type Foto = { file_id: string; file_size?: number; width?: number }

type Actualizacion = {
  message?: {
    chat?: { id?: number }
    from?: { first_name?: string }
    text?: string
    caption?: string
    photo?: Foto[]
  }
  callback_query?: {
    id: string
    data?: string
    message?: { chat?: { id?: number } }
  }
}

const API = (metodo: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${metodo}`

function chatsPermitidos(): string[] {
  return (process.env.TELEGRAM_CHATS_PERMITIDOS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
}

/** Manda un mensaje. Nunca lanza: que falle el aviso no debe perder el dato. */
async function responder(chatId: string, texto: string, botones?: [string, string][]) {
  try {
    await fetch(API('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        parse_mode: 'Markdown',
        reply_markup: botones
          ? { inline_keyboard: botones.map(([v, t]) => [{ text: t, callback_data: v }]) }
          : undefined,
      }),
    })
  } catch (e) {
    console.error('[telegram] no se pudo responder:', e instanceof Error ? e.message : e)
  }
}

/**
 * Sube una foto de Telegram a Cloudinary.
 *
 * Telegram guarda las fotos en sus servidores y da un `file_id`. Hay que pedir
 * la ruta, descargar y volver a subir — **al mismo Cloudinary y la misma
 * carpeta que usa el asistente web**, para que no acaben en dos sitios.
 *
 * Se toma la última del array: Telegram manda varias resoluciones y la última
 * es la mayor.
 */
async function subirACloudinary(fileId: string): Promise<string | null> {
  const nube = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  if (!nube || !preset) {
    console.error('[telegram] Cloudinary sin configurar')
    return null
  }

  try {
    const r1 = await fetch(API(`getFile?file_id=${encodeURIComponent(fileId)}`))
    const j1 = await r1.json()
    const ruta = j1?.result?.file_path
    if (!ruta) return null

    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${ruta}`

    const fd = new FormData()
    // Cloudinary acepta una URL remota: así no hay que descargar el binario
    // aquí y volver a subirlo, que en una función serverless cuesta memoria.
    fd.append('file', url)
    fd.append('upload_preset', preset)
    fd.append('folder', 'vivebien')

    const r2 = await fetch(`https://api.cloudinary.com/v1_1/${nube}/image/upload`, {
      method: 'POST', body: fd,
    })
    const j2 = await r2.json()
    return typeof j2?.secure_url === 'string' ? j2.secure_url : null
  } catch (e) {
    console.error('[telegram] fallo al subir la foto:', e instanceof Error ? e.message : e)
    return null
  }
}

/** El uid de quien firma lo que entra por Telegram. */
async function duenoTelegram(db: ReturnType<typeof supabaseAdmin>): Promise<string | null> {
  const correo = process.env.TELEGRAM_OWNER_EMAIL || 'joseponcer@vivebienn.com'
  try {
    const { data } = await db
      .from('usuarios').select('uid').ilike('email', correo).maybeSingle()
    return data?.uid ?? null
  } catch {
    // Si no se encuentra, el borrador queda sin dueño: es de la casa, y un
    // administrador lo asigna. Mejor eso que atarlo a quien no toca.
    return null
  }
}

/** El borrador en curso de ese chat, si lo hay. */
async function borradorEnCurso(db: ReturnType<typeof supabaseAdmin>, chatId: string) {
  const { data } = await db
    .from('propiedades')
    .select('*')
    .eq('estado_pub', 'borrador')
    .contains('extras', { telegram_chat: chatId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

export async function POST(req: Request) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secreto) {
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET no está configurada')
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 })
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secreto) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as Actualizacion

  // Un botón y un mensaje llegan en formas distintas; se normalizan aquí.
  const cq = cuerpo.callback_query
  const msg = cuerpo.message
  const chatId = String(cq?.message?.chat?.id ?? msg?.chat?.id ?? '')
  const texto = cq?.data ?? msg?.text ?? msg?.caption ?? ''
  const fotos = msg?.photo

  if (!chatId) return NextResponse.json({ ok: true, ignorado: 'sin chat' })

  const permitidos = chatsPermitidos()
  if (permitidos.length === 0 || !permitidos.includes(chatId)) {
    // 200 y silencio: a quien no está autorizado no se le confirma nada.
    return NextResponse.json({ ok: true, ignorado: 'remitente no autorizado' })
  }

  // El botón se confirma siempre, o Telegram deja el reloj girando.
  if (cq) {
    fetch(API('answerCallbackQuery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cq.id }),
    }).catch(() => {})
  }

  const db = supabaseAdmin()

  try {
    let borrador = await borradorEnCurso(db, chatId)
    const extras = (borrador?.extras ?? {}) as Record<string, unknown>
    let paso = (extras.telegram_paso as PasoTelegram) ?? 'inicio'

    /* ── Empezar de cero ── */
    if (!borrador || /^\/?(start|nueva|otra|empezar)/i.test(texto)) {
      const p = PREGUNTAS.inicio!
      const dueno = await duenoTelegram(db)
      const id = `tg-${Date.now().toString(36)}`

      await db.from('propiedades').insert({
        id,
        titulo: 'Borrador desde Telegram',
        owner_id: dueno,
        estado_pub: 'borrador',
        estatus: 'disponible',
        completitud: 0,
        extras: { telegram_chat: chatId, telegram_paso: 'operacion', origen: 'telegram' },
      })

      await responder(chatId, p.texto, PREGUNTAS.operacion!.botones)
      await responder(chatId, PREGUNTAS.operacion!.texto, PREGUNTAS.operacion!.botones)
      return NextResponse.json({ ok: true, id })
    }

    /* ── Fotos ── */
    if (fotos && fotos.length > 0 && paso === 'fotos') {
      // La última es la de mayor resolución.
      const url = await subirACloudinary(fotos[fotos.length - 1].file_id)
      if (!url) {
        await responder(chatId, '⚠️ Esa foto no se pudo subir. Inténtalo otra vez.')
        return NextResponse.json({ ok: true })
      }
      const actuales = Array.isArray(borrador.fotos) ? (borrador.fotos as string[]) : []
      const nuevas = [...actuales, url]
      await db.from('propiedades').update({ fotos: nuevas }).eq('id', borrador.id as string)
      await responder(chatId, `📸 Van ${nuevas.length}. Manda más o escribe *listo*.`)
      return NextResponse.json({ ok: true, fotos: nuevas.length })
    }

    /* ── Respuesta a la pregunta actual ── */
    const r = interpretar(paso, texto)
    if (!r.ok) {
      await responder(chatId, `❌ ${r.motivo}`, PREGUNTAS[paso]?.botones)
      return NextResponse.json({ ok: true })
    }

    const nuevosExtras = { ...extras, telegram_paso: r.siguiente }
    const fusion = { ...borrador, ...r.campos }

    await db.from('propiedades').update({
      ...r.campos,
      extras: nuevosExtras,
      completitud: calcularCompletitud(fusion as Record<string, unknown>),
    }).eq('id', borrador.id as string)

    paso = r.siguiente
    borrador = fusion as Record<string, unknown>

    /* ── Terminado ── */
    if (paso === 'listo') {
      const fotosN = Array.isArray(borrador.fotos) ? (borrador.fotos as unknown[]).length : 0
      const comp = calcularCompletitud(borrador)

      await responder(
        chatId,
        `✅ *Borrador creado*\n\n${resumen(borrador)}\n\n` +
        `Completitud: *${comp}%*` +
        (comp < 80 || fotosN < 3
          ? `\n\n⚠️ Necesita *80%* y *3 fotos* para enviarse a revisión. ` +
            `Complétalo aquí:\n${SITIO}/publicador/propiedades/${borrador.id}/editar`
          : `\n\nYa se puede enviar a revisión desde:\n${SITIO}/publicador`),
        [['empezar', '➕ Subir otra']],
      )
      return NextResponse.json({ ok: true, completitud: comp })
    }

    /* ── Siguiente pregunta ── */
    const sig = PREGUNTAS[paso]
    if (sig) await responder(chatId, sig.texto, sig.botones)

    return NextResponse.json({ ok: true, paso })
  } catch (e) {
    // Se registra pero se responde 200: un 500 haría que Telegram reintentara
    // y duplicaría lo que sí llegó a guardarse.
    console.error('[telegram] fallo:', e instanceof Error ? e.message : e)
    await responder(chatId, '⚠️ Algo falló de nuestro lado. Escribe *nueva* para volver a empezar.')
    return NextResponse.json({ ok: true, error: true })
  }
}

/** Comprobación de configuración, sin exponer nada. */
export async function GET() {
  return NextResponse.json({
    configurado: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    conToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    remitentes: chatsPermitidos().length,
    extraeTexto: typeof extraerDeTexto === 'function',
  })
}
