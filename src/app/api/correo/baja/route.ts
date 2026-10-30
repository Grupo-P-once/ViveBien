import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { darDeBaja } from '@/lib/correo/suscripcion'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * POST /api/correo/baja — darse de baja de las recomendaciones (D-80). Sin cuenta, sin sesión.
 *
 * Dos entradas, mismo resultado:
 *  · desde la página de baja: `{ token }` en el cuerpo (el enlace del correo lleva el token después del `#`);
 *  · baja con un clic (RFC 8058): Gmail/Yahoo hacen POST a `?t=<token>` con `List-Unsubscribe=One-Click`.
 * El token es un enlace FIRMADO (HMAC), no un identificador adivinable. Responde 200 si la baja quedó aplicada (idempotente).
 * La baja no depende de ninguna bandera: aunque el marketing se apague, el enlace sigue funcionando.
 */
const MAX_CUERPO = 1024

export async function POST(req: Request) {
  const frenado = await frenarAsync(`correo-enlaces:${origenDe(req)}`, TOPES.correoEnlaces)
  if (frenado) return frenado
  const crudo = await req.text().catch(() => '')
  if (crudo.length > MAX_CUERPO) return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 })

  let token: unknown = new URL(req.url).searchParams.get('t')
  if (!token) {
    try { token = (JSON.parse(crudo) as { token?: unknown }).token } catch { /* inválido */ }
  }
  const r = await darDeBaja(supabaseAdmin() as unknown as DbCorreo, token)
  if (r.ok) return NextResponse.json({ ok: true })
  return NextResponse.json({ error: 'El enlace de baja no es válido. Escríbenos y te damos de baja a mano.' }, { status: 400 })
}
