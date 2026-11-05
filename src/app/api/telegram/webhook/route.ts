import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { limpiarTexto } from '@/lib/registro-seguro'
import { avisar } from '@/lib/alertas'
import { supabaseAdmin, resolverPerfil, type PerfilUsuario } from '@/lib/auth-server'
import { cambiarEstadoDePropiedad } from '@/lib/cambiar-estado-propiedad'
import { calcularCompletitud, decidirPublicacionAutomatica } from '@/lib/publicacion'
import { tieneCapacidad } from '@/lib/acceso/capacidades'
import { puedePublicar } from '@/lib/perfil'
import { MINIMO_FOTOS } from '@/lib/esquemas/propiedad'
import { escribirTolerante } from '@/lib/columnas'
import { destinoCloudinary } from '@/lib/fotos'
import { textoDePdf, textoDeImagen, pideLectura } from '@/lib/leer-archivo'
import { leerFicha, primerHueco } from '@/lib/ficha-texto'
import { prefijoDe, pasoDe } from '@/lib/telegram'
import {
  PREGUNTAS,
  interpretar,
  resumen,
  type PasoTelegram,
} from '@/lib/telegram-wizard'
import { SITIO } from '@/lib/sitio'
import { refrescarCatalogo } from '@/lib/refrescar'
import { asignarSlugAlPublicar } from '@/lib/asignar-slug'
import { despuesDeResponder } from '@/lib/correo/transaccionales'
import { avisarPropiedad } from '@/lib/correo/eventos-cuenta'
import type { DbCorreo } from '@/lib/correo/enviar'
import { nombreDe } from '@/lib/propiedad-publica'
import { CUENTA_PROPIETARIO } from '@/lib/config/negocio-interno'
import { FORMATOS_PERMITIDOS, subirDesdeServidor } from '@/lib/medios/firma'

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
 *
 * **V-1.1.47 — y en columnas que existen.** Antes vivía en `extras`, una
 * columna de la migración 07 que sigue sin aplicarse: el bot no podía guardar
 * el paso, así que **no funcionaba en absoluto**. Ahora:
 *
 *  · El chat va en el **id** del borrador, que lo ponemos nosotros:
 *    `tg-<chat>-<hora>`. Buscar la conversación en curso es buscar por ese
 *    prefijo.
 *  · El paso va en `nota_moderacion`, como `tg:fotos`, y **se borra al
 *    terminar**.
 *
 * Ninguna columna nueva. Cuando la 07 entre, esto sigue igual de válido.
 *
 * ─────────────────────────────────────────────────────────────
 * PUBLICA SOLO
 *
 * Lo que entra por Telegram lo manda el dueño del negocio desde su propio
 * teléfono, no un desconocido: **al terminar se publica**, sin pasar por
 * revisión. Revisarse a sí mismo no aporta nada y deja el inventario parado.
 *
 * Con una condición: que tenga lo imprescindible para que el anuncio se
 * sostenga —título, precio, ubicación, tipo, operación y **al menos una
 * foto**—. Si falta algo, se queda en borrador y el bot dice qué falta con el
 * enlace para terminarlo en la web.
 * ─────────────────────────────────────────────────────────────
 */

export const dynamic = 'force-dynamic'

type Foto = { file_id: string; file_size?: number; width?: number }

type Documento = { file_id: string; file_name?: string; mime_type?: string; file_size?: number }

type Actualizacion = {
  message?: {
    chat?: { id?: number }
    from?: { first_name?: string }
    text?: string
    caption?: string
    photo?: Foto[]
    document?: Documento
    location?: { latitude: number; longitude: number }
    voice?: { file_id: string }
    audio?: { file_id: string }
    video_note?: { file_id: string }
    contact?: { phone_number?: string }
  }
  callback_query?: {
    id: string
    data?: string
    message?: { chat?: { id?: number } }
  }
}

/**
 * El token, limpio.
 *
 * V-1.1.51 — pegar el token en una consola arrastra un salto de línea o un
 * espacio con una facilidad pasmosa, y entonces la URL queda rota y Telegram
 * contesta 404: parece un token inválido cuando el token es correcto. Media
 * hora de diagnóstico por un salto de línea invisible.
 */
function token(): string {
  return (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
}

const API = (metodo: string) =>
  `https://api.telegram.org/bot${token()}/${metodo}`

function chatsPermitidos(): string[] {
  return (process.env.TELEGRAM_CHATS_PERMITIDOS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Manda un mensaje. Nunca lanza: que falle el aviso no debe perder el dato.
 *
 * V-1.1.51 — **pero sí se entera.** Antes sólo se registraba la excepción de
 * red; si Telegram contestaba «Unauthorized» o «chat not found», la respuesta
 * se descartaba en silencio. El resultado: el webhook devolvía 200, no había
 * ni un error en los registros, y el bot simplemente no contestaba. Un fallo
 * mudo es el más caro de encontrar.
 */
async function responder(chatId: string, texto: string, botones?: [string, string][]) {
  try {
    const res = await fetch(API('sendMessage'), {
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
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '')
      console.error('[telegram] Telegram rechazó el mensaje:', res.status, limpiarTexto(cuerpo, 200))
    }
  } catch (e) {
    console.error('[telegram] no se pudo responder:', limpiarTexto(e))
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
async function subirACloudinary(fileId: string, donde: { public_id: string; asset_folder: string }): Promise<string | null> {
  try {
    const r1 = await fetch(API(`getFile?file_id=${encodeURIComponent(fileId)}`))
    const j1 = await r1.json()
    const ruta = j1?.result?.file_path
    if (!ruta) return null

    const url = `https://api.telegram.org/file/bot${token()}/${ruta}`

    // Cloudinary acepta una URL remota: así no hay que descargar el binario
    // aquí y volver a subirlo, que en una función serverless cuesta memoria.
    // V-1.1.78 (SEC-05): firmada en el servidor, sin preset.
    const r2 = await subirDesdeServidor(url, { ...donde, allowed_formats: FORMATOS_PERMITIDOS })
    if (!r2.ok) {
      console.error('[telegram] Cloudinary rechazó la foto:', limpiarTexto(r2.motivo))
      return null
    }
    return typeof r2.datos.secure_url === 'string' ? r2.datos.secure_url : null
  } catch (e) {
    console.error('[telegram] fallo al subir la foto:', limpiarTexto(e))
    return null
  }
}

/** La dirección de descarga de un archivo de Telegram, o null. */
async function urlDeArchivo(fileId: string): Promise<string | null> {
  try {
    const r = await fetch(API(`getFile?file_id=${encodeURIComponent(fileId)}`))
    const j = await r.json()
    const ruta = j?.result?.file_path
    return ruta ? `https://api.telegram.org/file/bot${token()}/${ruta}` : null
  } catch {
    return null
  }
}

/**
 * La dirección de unas coordenadas, en palabras.
 *
 * Se usa el mismo servicio que el asistente web (Nominatim, de
 * OpenStreetMap): gratis y sin clave. Pide que uno se identifique, y si no
 * contesta no pasa nada — se guarda el punto igual y la dirección se escribe
 * después.
 */
async function direccionDe(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ViveBien/1.0 (vivebienn.com)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const j = await res.json()
    const a = j?.address ?? {}
    const partes = [
      [a.road, a.house_number].filter(Boolean).join(' '),
      a.neighbourhood ?? a.suburb ?? a.quarter,
      a.city ?? a.town ?? a.village ?? a.municipality,
      a.state,
    ].filter(Boolean)
    return partes.length ? partes.join(', ').slice(0, 200) : (j?.display_name ?? null)
  } catch {
    return null
  }
}

/** El uid de quien firma lo que entra por Telegram. */
async function duenoTelegram(db: ReturnType<typeof supabaseAdmin>): Promise<string | null> {
  const correo = process.env.TELEGRAM_OWNER_EMAIL || CUENTA_PROPIETARIO
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

/**
 * La cuenta que firma lo que entra por Telegram, con su perfil calculado por el código REAL (`resolverPerfil`): de ahí salen
 * el rol y las capacidades que deciden si la propiedad se publica o se manda a revisión. Sin cuenta → `null` (falla cerrado).
 */
async function cuentaDelDueno(db: ReturnType<typeof supabaseAdmin>, uid: unknown): Promise<{ perfil: PerfilUsuario; fila: Record<string, unknown> } | null> {
  if (typeof uid !== 'string' || !uid) return null
  try {
    const { data } = await db.from('usuarios').select('*').eq('uid', uid).maybeSingle()
    if (!data) return null
    const fila = data as Record<string, unknown>
    return { perfil: resolverPerfil({ uid, email: typeof fila.email === 'string' ? fila.email : null, emailVerified: true }, fila), fila }
  } catch {
    return null
  }
}

/** El borrador en curso de ese chat, si lo hay. */
async function borradorEnCurso(db: ReturnType<typeof supabaseAdmin>, chatId: string) {
  const { data } = await db
    .from('propiedades')
    .select('*')
    .eq('estado_pub', 'borrador')
    .like('id', `${prefijoDe(chatId)}%`)
    .order('created_at', { ascending: false })
    .limit(1)
  const fila = (data ?? [])[0] as Record<string, unknown> | undefined
  return fila ?? null
}

/** Tope del cuerpo de una actualización de Telegram (las reales miden unos pocos KB; las fotos viajan como `file_id`). */
const MAX_CUERPO_TELEGRAM = 64 * 1024

/**
 * Idempotencia (best-effort, POR INSTANCIA): Telegram reenvía una actualización si tarda en recibir respuesta, y un reintento
 * concurrente duplicaría borradores y mensajes. Se recuerdan los últimos `update_id` vistos; el repetido responde 200 sin procesarse.
 * No es una garantía distribuida (varias instancias no comparten memoria): reduce el caso común, no lo elimina.
 */
const MAX_VISTOS = 500
const vistos = new Map<number, number>()
function yaVisto(id: number): boolean {
  if (vistos.has(id)) return true
  vistos.set(id, Date.now())
  if (vistos.size > MAX_VISTOS) vistos.delete(vistos.keys().next().value as number)
  return false
}

/** Comparación del secreto en tiempo constante (la `!==` filtra, por tiempos, cuántos caracteres iniciales coinciden). */
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false
  const a = Buffer.from(recibido), b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  // El secreto también se limpia: llega por el mismo camino que el token.
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!secreto) {
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET no está configurada')
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 })
  }
  if (!secretoValido(req.headers.get('x-telegram-bot-api-secret-token'), secreto)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  // Tope de tamaño ANTES de interpretar nada: primero la cabecera, luego lo realmente leído.
  if (Number(req.headers.get('content-length') ?? '0') > MAX_CUERPO_TELEGRAM) {
    return NextResponse.json({ error: 'Cuerpo demasiado grande.' }, { status: 413 })
  }
  const crudo = await req.text().catch(() => '')
  if (crudo.length > MAX_CUERPO_TELEGRAM) return NextResponse.json({ error: 'Cuerpo demasiado grande.' }, { status: 413 })
  let cuerpo = {} as Actualizacion
  try { cuerpo = JSON.parse(crudo) as Actualizacion } catch { /* cuerpo vacío o roto: cae en «sin chat» */ }

  const idActualizacion = (cuerpo as { update_id?: unknown }).update_id
  if (typeof idActualizacion === 'number' && yaVisto(idActualizacion)) return NextResponse.json({ ok: true, duplicado: true })

  // Un botón y un mensaje llegan en formas distintas; se normalizan aquí.
  const cq = cuerpo.callback_query
  const msg = cuerpo.message
  const chatId = String(cq?.message?.chat?.id ?? msg?.chat?.id ?? '')
  const texto = cq?.data ?? msg?.text ?? msg?.caption ?? ''
  const fotos = msg?.photo

  if (!chatId) return NextResponse.json({ ok: true, ignorado: 'sin chat' })

  const permitidos = chatsPermitidos()
  if (permitidos.length === 0 || !permitidos.includes(chatId)) {
    // Se registra el id —no el mensaje— para poder dar de alta un grupo nuevo
    // sin tener que apagar el webhook para leer `getUpdates`. Al remitente no
    // se le contesta nada: saber la URL no es autorización.
    console.warn(`[telegram] mensaje de un chat no autorizado: ${chatId}`)
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
    let paso = pasoDe(borrador)

    /* ── Empezar de cero ── */
    if (!borrador || /^\/?(start|nueva|otra|empezar)/i.test(texto)) {
      const p = PREGUNTAS.inicio!
      const dueno = await duenoTelegram(db)
      const id = `${prefijoDe(chatId)}${Date.now().toString(36)}`

      const alta = await escribirTolerante((f) => db.from('propiedades').insert(f), {
        id,
        // Sin título de relleno: se guarda que todavía no hay título.
        titulo: null,
        owner_id: dueno,
        estado_pub: 'borrador',
        estatus: 'disponible',
        completitud: 0,
        nota_moderacion: 'tg:operacion',
      })

      // V-1.1.53 — si el alta falla, se DICE. Antes se seguía preguntando con
      // el borrador inexistente: el bot contestaba, nada se guardaba, y a la
      // siguiente respuesta volvía al saludo porque no encontraba nada. Un
      // bucle que parecía un fallo del asistente y era la base de datos
      // rechazando la fila (`tipo` era obligatorio).
      if (alta.error) {
        console.error('[telegram] no se pudo crear el borrador:', limpiarTexto(alta.error))
        await responder(
          chatId,
          '⚠️ No pude crear el borrador en la base de datos, así que no sigo para no hacerte contestar en balde.\n\n' +
          'Ya quedó registrado el error; inténtalo en un minuto.',
        )
        return NextResponse.json({ ok: true, error: alta.error })
      }

      await responder(chatId, p.texto, PREGUNTAS.operacion!.botones)
      await responder(chatId, PREGUNTAS.operacion!.texto, PREGUNTAS.operacion!.botones)
      return NextResponse.json({ ok: true, id })
    }

    /* ── Una ficha: PDF, o imagen con pie que pida leerla ──
       Quien tiene una propiedad casi siempre tiene ya su ficha en PDF.
       Contestar siete preguntas cuando todo está escrito en un archivo es
       trabajo repetido: se lee, se rellena lo que se reconozca y se pregunta
       sólo lo que falte. */
    const doc = msg?.document
    const esPdf = doc && (doc.mime_type === 'application/pdf' || /\.pdf$/i.test(doc.file_name ?? ''))
    const imagenParaLeer = fotos && fotos.length > 0 && pideLectura(msg?.caption)

    if (esPdf || imagenParaLeer) {
      const fileId = esPdf ? doc!.file_id : fotos![fotos!.length - 1].file_id
      await responder(chatId, '📄 Leyendo el archivo…')

      const url = await urlDeArchivo(fileId)
      if (!url) {
        await responder(chatId, '⚠️ No pude descargar ese archivo de Telegram. Inténtalo otra vez.')
        return NextResponse.json({ ok: true })
      }

      let lectura
      if (esPdf) {
        const bytes = await fetch(url).then(r => r.arrayBuffer()).catch(() => null)
        lectura = bytes
          ? await textoDePdf(bytes)
          : { ok: false as const, motivo: 'No pude descargar el PDF. Inténtalo otra vez.' }
      } else {
        lectura = await textoDeImagen(url)
      }

      if (!lectura.ok) {
        await responder(chatId, `⚠️ ${lectura.motivo}`, PREGUNTAS[paso]?.botones)
        return NextResponse.json({ ok: true, lectura: 'sin texto' })
      }

      const { campos, reconocido } = leerFicha(lectura.texto)
      // Lo que ya estaba contestado NO se pisa: la ficha rellena huecos, no
      // corrige lo que una persona escribió a mano.
      const nuevos: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(campos)) {
        if (borrador[k] === null || borrador[k] === undefined || borrador[k] === '') nuevos[k] = v
      }

      const fusionado = { ...borrador, ...nuevos }
      const siguiente = primerHueco(fusionado) as PasoTelegram

      const guardadoFicha = await escribirTolerante(
        (f) => db.from('propiedades').update(f).eq('id', borrador!.id as string),
        { ...nuevos, nota_moderacion: `tg:${siguiente}`, completitud: calcularCompletitud(fusionado) },
      )

      if (guardadoFicha.error) {
        console.error('[telegram] no se pudo guardar la ficha:', limpiarTexto(guardadoFicha.error))
        await responder(chatId, '⚠️ Leí el archivo pero no pude guardarlo. Inténtalo otra vez.')
        return NextResponse.json({ ok: true, error: guardadoFicha.error })
      }

      await responder(
        chatId,
        reconocido.length
          ? `✅ De la ficha saqué: *${reconocido.join(', ')}*.\n\n${resumen(fusionado)}`
          : 'Leí el archivo, pero no reconocí datos sueltos. Lo dejé como descripción.',
      )

      const sig = PREGUNTAS[siguiente]
      if (siguiente === 'fotos') {
        await responder(chatId, '📸 Sólo faltan las fotos. Mándamelas y escribe *listo*.')
      } else if (sig) {
        await responder(chatId, sig.texto, sig.botones)
      }

      return NextResponse.json({ ok: true, paso: siguiente, reconocido })
    }

    /* ── Fotos ──
       En CUALQUIER paso, no sólo en el suyo: quien está delante del inmueble
       manda la foto cuando la tiene, no cuando le toca. Antes se ignoraban en
       silencio y el dueño creía que se habían subido. */
    if (fotos && fotos.length > 0) {
      // La última es la de mayor resolución.
      const url = await subirACloudinary(
        fotos[fotos.length - 1].file_id,
        destinoCloudinary(borrador.id as string, borrador.tipo as string | null),
      )
      if (!url) {
        await responder(chatId, '⚠️ Esa foto no se pudo subir. Inténtalo otra vez.')
        return NextResponse.json({ ok: true })
      }
      const actuales = Array.isArray(borrador.fotos) ? (borrador.fotos as string[]) : []
      const nuevas = [...actuales, url]
      await db.from('propiedades').update({ fotos: nuevas }).eq('id', borrador.id as string)
      await responder(
        chatId,
        paso === 'fotos'
          ? `📸 Van ${nuevas.length}. Manda más o escribe *listo*.`
          : `📸 Guardada (van ${nuevas.length}). Seguimos: ${PREGUNTAS[paso]?.texto ?? ''}`,
        paso === 'fotos' ? undefined : PREGUNTAS[paso]?.botones,
      )
      return NextResponse.json({ ok: true, fotos: nuevas.length })
    }

    /* ── El pin de ubicación de Telegram ──
       Preguntar «¿dónde está?» en Telegram y recibir el pin es lo más natural
       del mundo, y el bot **sólo leía texto**: al pin le llegaba vacío y
       contestaba «no entendí» una y otra vez. Quien lo vivió pensó que el bot
       estaba roto, con razón. */
    const punto = msg?.location
    if (punto) {
      const direccion = await direccionDe(punto.latitude, punto.longitude)
      const siguiente: PasoTelegram = paso === 'ubicacion' ? 'metros' : paso

      const guardadoPin = await escribirTolerante(
        (f) => db.from('propiedades').update(f).eq('id', borrador!.id as string),
        {
          lat: punto.latitude,
          lng: punto.longitude,
          // Si el servicio de direcciones no contesta, el punto NO se pierde:
          // se guarda igual y la dirección se escribe luego desde la web.
          ...(direccion && !borrador.ubicacion ? { ubicacion: direccion } : {}),
          nota_moderacion: `tg:${siguiente}`,
        },
      )

      if (guardadoPin.error) {
        console.error('[telegram] no se pudo guardar la ubicación:', limpiarTexto(guardadoPin.error))
        await responder(chatId, '⚠️ No pude guardar esa ubicación. Inténtalo otra vez.')
        return NextResponse.json({ ok: true })
      }

      await responder(
        chatId,
        direccion
          ? `📍 Ubicación guardada: *${direccion}*`
          : '📍 Ubicación guardada. La dirección escrita la ponemos después.',
      )

      const sigPin = PREGUNTAS[siguiente]
      if (sigPin) await responder(chatId, sigPin.texto, sigPin.botones)
      return NextResponse.json({ ok: true, paso: siguiente, coordenadas: true })
    }

    /* ── Lo que el bot no puede leer ──
       Una nota de voz o un contacto llegan sin texto. Antes caían en «no
       entendí», que hace pensar que la respuesta estuvo mal escrita. */
    if (!texto && (msg?.voice || msg?.audio || msg?.video_note)) {
      await responder(
        chatId,
        '🎙️ Todavía no sé escuchar notas de voz. Escríbeme la respuesta y seguimos.',
        PREGUNTAS[paso]?.botones,
      )
      return NextResponse.json({ ok: true, ignorado: 'audio' })
    }

    /* ── Respuesta a la pregunta actual ── */
    const r = interpretar(paso, texto)
    if (!r.ok) {
      // Qué se rechazó y en qué paso. Sin esto, «el bot no me dejó avanzar» no
      // se puede diagnosticar: los registros sólo decían 200.
      // E-39: NO se registra el texto del usuario (puede traer teléfonos, direcciones o nombres): solo el paso, el motivo y el largo.
      console.warn(`[telegram] no entendí en el paso ${paso} (largo ${texto.length}): ${limpiarTexto(r.motivo, 120)}`)
      await responder(chatId, `❌ ${r.motivo}`, PREGUNTAS[paso]?.botones)
      return NextResponse.json({ ok: true, rechazado: paso })
    }

    const fusion = { ...borrador, ...r.campos }

    const guardado = await escribirTolerante(
      (f) => db.from('propiedades').update(f).eq('id', borrador!.id as string),
      {
        ...r.campos,
        nota_moderacion: `tg:${r.siguiente}`,
        completitud: calcularCompletitud(fusion as Record<string, unknown>),
      },
    )

    if (guardado.error) {
      console.error('[telegram] no se pudo guardar la respuesta:', limpiarTexto(guardado.error))
      await responder(chatId, '⚠️ No pude guardar esa respuesta. Vuelve a escribirla, por favor.')
      return NextResponse.json({ ok: true, error: guardado.error })
    }

    paso = r.siguiente
    borrador = fusion as Record<string, unknown>

    /* ── Terminado: se publica ── */
    if (paso === 'listo') {
      const comp = calcularCompletitud(borrador)
      // MISMA regla que `POST /api/propiedades/[id]/estado` (decidirPublicacionAutomatica): lo mínimo del anuncio, las
      // capacidades de la cuenta dueña y el contacto de su perfil. Antes se publicaba con UNA foto, sin bitácora y sin mirar
      // quién era el dueño: era una puerta lateral a `publicada`.
      const cuenta = await cuentaDelDueno(db, borrador.owner_id)
      const decision = decidirPublicacionAutomatica({
        rol: cuenta ? cuenta.perfil.rol : null,
        activa: cuenta ? ['activo', 'pendiente'].includes(cuenta.perfil.estado) : false,
        publicaSinRevision: cuenta ? tieneCapacidad(cuenta.perfil, 'publicar_sin_revision') : false,
        prop: borrador,
      })
      let falta: string[] = decision.ok ? [] : decision.falta
      // El contacto del dueño: quien publica por sí mismo o envía a revisión lo cumple igual que en la web.
      if (decision.ok && cuenta) {
        const contacto = puedePublicar('whatsapp' in cuenta.fila ? cuenta.fila : { ...cuenta.fila, whatsapp: cuenta.fila.telefono }, cuenta.perfil.rol)
        if (!contacto.ok) falta = ['tu perfil con nombre, teléfono y WhatsApp (sin contacto el anuncio no sirve)']
      }
      const nFotos = Array.isArray(borrador.fotos) ? (borrador.fotos as unknown[]).length : 0

      if (falta.length > 0 || !decision.ok) {
        // No se publica a medias: un anuncio sin foto o sin precio hace más
        // daño en el catálogo que no estar.
        await escribirTolerante(
          (f) => db.from('propiedades').update(f).eq('id', borrador!.id as string),
          { nota_moderacion: 'tg:fotos' },
        )
        await responder(
          chatId,
          `📝 *Casi*\n\n${resumen(borrador)}\n\n` +
          `Para publicarla falta ${falta.join(', ')}.\n` +
          (nFotos === 0 ? 'Mándame una foto aquí mismo, o ' : 'Puedes ') +
          `terminarla en la web:\n${SITIO}/publicador/propiedades/${borrador.id}/editar`,
          [['empezar', '➕ Empezar otra']],
        )
        return NextResponse.json({ ok: true, publicada: false, falta })
      }

      const destino = decision.ok ? decision.destino : 'en_revision'
      const ahora = new Date().toISOString()
      // El cambio y su bitácora son UNA transacción (migración 33); la base compara que SIGA siendo un borrador (si alguien la movió
      // desde la web, 409 y no se pisa). Quién firma es la cuenta dueña; sin cuenta, el actor queda como «telegram».
      const cambio = await cambiarEstadoDePropiedad(db, {
        id: String(borrador.id),
        antes: 'borrador',
        estado: destino,
        cambios: {
          ...(destino === 'publicada' ? { estatus: 'disponible', publicada_en: ahora } : { enviada_en: ahora }),
          completitud: comp,
          // Se limpia el rastro del asistente: ya no hay conversación en curso,
          // y esta nota la lee un administrador en el panel.
          nota_moderacion: null,
        },
        actor: cuenta?.perfil ?? { uid: 'telegram', email: process.env.TELEGRAM_OWNER_EMAIL ?? null, rol: 'telegram' as never },
        accion: `propiedad.${destino}`,
        auditAntes: { estado_pub: 'borrador' },
        auditDespues: { estado_pub: destino, canal: 'telegram', ...(decision.ok && decision.autopublica ? { sinRevision: true } : {}), ...(cuenta ? {} : { sinCuenta: true }) },
      })
      if (!cambio.ok) {
        console.error('[telegram] no se pudo cerrar la propiedad:', limpiarTexto(cambio.codigo, 60), limpiarTexto(cambio.mensaje))
        await responder(chatId, '⚠️ No pude cerrar la propiedad (¿alguien la cambió desde la web?). Revísala aquí:\n' + `${SITIO}/publicador/propiedades/${borrador.id}/editar`)
        return NextResponse.json({ ok: true, error: 'estado' })
      }

      // Nombre público al publicar: sin esto, lo que el bot contestaba como
      // «ya está en el sitio» era /propiedades/tg-n1003782780222-mf3k8x — el id
      // del chat de Telegram metido en la barra de direcciones.
      const ruta = destino === 'publicada' ? await asignarSlugAlPublicar(db, borrador as Record<string, unknown>) : null

      refrescarCatalogo()

      // Mismo correo al dueño que al enviar o publicar desde la web (solo con cuenta, correo verificado y una vez por hecho).
      despuesDeResponder(() => avisarPropiedad(db as unknown as DbCorreo, { evento: destino === 'publicada' ? 'publicada' : 'en_revision', prop: borrador as Record<string, unknown>, version: ahora }))

      if (destino === 'en_revision') {
        void avisar({
          nivel: 'ok',
          titulo: 'Propiedad enviada a revisión desde Telegram',
          datos: { Título: nombreDe(borrador as Record<string, string>), Precio: String(borrador.precio ?? '') },
          accion: `${SITIO}/admin/propiedades/pendientes`,
          clave: `revision:${borrador.id}`,
        })
        await responder(
          chatId,
          `📨 *Enviada a revisión*\n\n${resumen(borrador)}\n\n` +
          'VIVE BIEN la revisa antes de publicarla (tu cuenta no publica sin revisión). Verás el resultado en tu panel.',
          [['empezar', '➕ Subir otra']],
        )
        return NextResponse.json({ ok: true, publicada: false, enRevision: true, completitud: comp })
      }

      void avisar({
        nivel: 'ok',
        titulo: 'Propiedad publicada desde Telegram',
        datos: { Título: nombreDe(borrador as Record<string, string>), Precio: String(borrador.precio ?? '') },
        accion: `${SITIO}${ruta}`,
        clave: `publicada:${borrador.id}`,
      })

      await responder(
        chatId,
        `🎉 *Publicada*\n\n${resumen(borrador)}\n\n` +
        `Ya está en el sitio:\n${SITIO}${ruta}\n\n` +
        (nFotos < MINIMO_FOTOS
          ? `Va con ${nFotos} foto${nFotos === 1 ? '' : 's'}: con ${MINIMO_FOTOS} se ve bastante mejor. ` +
            `Mándamelas y las añado, o edítala aquí:\n${SITIO}/publicador/propiedades/${borrador.id}/editar`
          : `Editarla:\n${SITIO}/publicador/propiedades/${borrador.id}/editar`),
        [['empezar', '➕ Subir otra']],
      )
      return NextResponse.json({ ok: true, publicada: true, completitud: comp })
    }

    /* ── Siguiente pregunta ── */
    const sig = PREGUNTAS[paso]
    if (sig) await responder(chatId, sig.texto, sig.botones)

    return NextResponse.json({ ok: true, paso })
  } catch (e) {
    // Se registra pero se responde 200: un 500 haría que Telegram reintentara
    // y duplicaría lo que sí llegó a guardarse.
    console.error('[telegram] fallo:', limpiarTexto(e))
    await responder(chatId, '⚠️ Algo falló de nuestro lado. Escribe *nueva* para volver a empezar.')
    return NextResponse.json({ ok: true, error: true })
  }
}

// E-35 / QA-012: aquí hubo un `GET` público de «diagnóstico». Se quitó: el webhook SOLO atiende el POST firmado de Telegram.
// La comprobación de configuración vive ahora en `/api/admin/telegram/diagnostico` (protegida).
