import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { suscribirVisitante, TEXTO_CONSENTIMIENTO_MARKETING, VERSION_CONSENTIMIENTO_MARKETING } from '@/lib/correo/suscripcion'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * POST /api/correo/suscribir — una persona sin cuenta pide recibir recomendaciones de propiedades (D-80).
 *
 * Registra la solicitud y manda AL MOMENTO un primer correo con las propiedades que encajan (respuesta a lo que la persona pidió).
 * Ese correo trae el «sí, quiero seguir recibiéndolas»: sin pulsarlo, no se manda nada más (así nadie suscribe el correo de otra).
 * La respuesta es la misma exista o no el correo, esté suprimido o ya activo (no sirve para averiguar quién está en la lista).
 * Exige el acto afirmativo del formulario (`acepto === true`, que sólo manda el botón). Apagada por defecto: responde 404 hasta que se active `CORREO_MARKETING`.
 */
const MAX_CUERPO = 4 * 1024

export async function POST(req: Request) {
  const frenado = await frenarAsync(`correo:${origenDe(req)}`, TOPES.correo)
  if (frenado) return frenado

  const crudo = await req.text().catch(() => '')
  if (crudo.length > MAX_CUERPO) return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 })
  let cuerpo: unknown = null
  try { cuerpo = JSON.parse(crudo) } catch { /* se valida abajo */ }

  const r = await suscribirVisitante(supabaseAdmin() as unknown as DbCorreo, cuerpo)
  if (r.ok) {
    return NextResponse.json({ ok: true, mensaje: 'Si el correo es válido, te enviamos las primeras propiedades. Revisa tu bandeja (y el correo no deseado).' })
  }
  if (r.motivo === 'invalido') return NextResponse.json({ error: 'Revisa tu correo electrónico.' }, { status: 400 })
  if (r.motivo === 'sin_consentimiento') return NextResponse.json({ error: 'No pudimos registrar tu solicitud. Recarga la página e inténtalo otra vez.' }, { status: 400 })
  if (r.motivo === 'apagado') return NextResponse.json({ error: 'Esta función todavía no está disponible.' }, { status: 404 })
  return NextResponse.json({ error: 'No pudimos registrar tu solicitud. Inténtalo más tarde.' }, { status: 503 })
}

/** El texto y la versión que la persona acepta (la página los muestra; así no hay dos copias que puedan diferir). */
export async function GET() {
  return NextResponse.json({ version: VERSION_CONSENTIMIENTO_MARKETING, texto: TEXTO_CONSENTIMIENTO_MARKETING })
}
