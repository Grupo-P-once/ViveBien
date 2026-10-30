import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { confirmarSuscripcion } from '@/lib/correo/suscripcion'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * POST /api/correo/confirmar — activa la suscripción con el enlace FIRMADO del correo de confirmación (D-80).
 *
 * Es un POST a propósito, y el enlace del correo lleva el token después del `#` (no llega al servidor ni a los registros):
 * los escáneres de correo abren enlaces solos y no deben confirmar nada. La persona ve una página y pulsa un botón.
 */
const MAX_CUERPO = 1024

export async function POST(req: Request) {
  const frenado = await frenarAsync(`correo-enlaces:${origenDe(req)}`, TOPES.correoEnlaces)
  if (frenado) return frenado
  const crudo = await req.text().catch(() => '')
  if (crudo.length > MAX_CUERPO) return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 })
  let token: unknown = null
  try { token = (JSON.parse(crudo) as { token?: unknown }).token } catch { /* inválido */ }

  const r = await confirmarSuscripcion(supabaseAdmin() as unknown as DbCorreo, token)
  if (r.estado === 'activa') return NextResponse.json({ ok: true })
  if (r.estado === 'bloqueada') return NextResponse.json({ error: 'Esta dirección no puede recibir recomendaciones.' }, { status: 409 })
  if (r.estado === 'error') return NextResponse.json({ error: 'No pudimos confirmar ahora. Inténtalo más tarde.' }, { status: 503 })
  return NextResponse.json({ error: 'El enlace no es válido o ya venció. Puedes pedir uno nuevo.' }, { status: 400 })
}
