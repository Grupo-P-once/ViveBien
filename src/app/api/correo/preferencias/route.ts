import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { entornoCorreo, TEXTO_CONSENTIMIENTO_MARKETING, VERSION_CONSENTIMIENTO_MARKETING } from '@/lib/correo/config'
import { leerPreferencias } from '@/lib/correo/recomendaciones'
import { fijarMarketingDeCuenta } from '@/lib/correo/suscripcion'
import { normalizarCorreo } from '@/lib/correo/seguridad'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * Preferencias de correo de la cuenta con sesión (D-80). El marketing es una decisión APARTE de haber creado la cuenta:
 * sin esta aceptación expresa (y con el correo verificado por el proveedor de identidad) no se envía nada comercial.
 *
 *  · GET  → { disponible, activa, preferencias, version, texto }
 *  · POST → { aceptar: boolean, preferencias? }
 * El correo sale de la SESIÓN, nunca del cuerpo: nadie puede suscribir a otra persona desde aquí.
 */
export async function GET(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const env = entornoCorreo()
  const disponible = env.marketing && env.secreto.length >= 32
  const correo = normalizarCorreo(auth.perfil.email)
  let activa = false
  let preferencias = leerPreferencias({})
  if (disponible && correo) {
    const { data } = await supabaseAdmin().from('correo_suscriptores').select('estado, preferencias').eq('email_norm', correo).maybeSingle()
    activa = data?.estado === 'activa'
    preferencias = leerPreferencias(data?.preferencias)
  }
  return NextResponse.json({ disponible, activa, preferencias, version: VERSION_CONSENTIMIENTO_MARKETING, texto: TEXTO_CONSENTIMIENTO_MARKETING })
}

export async function POST(req: Request) {
  const frenado = await frenarAsync(`correo:${origenDe(req)}`, TOPES.correo)
  if (frenado) return frenado
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const env = entornoCorreo()
  if (!env.marketing || env.secreto.length < 32) return NextResponse.json({ error: 'Esta función todavía no está disponible.' }, { status: 404 })

  const crudo = await req.text().catch(() => '')
  if (crudo.length > 4096) return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 })
  let cuerpo: { aceptar?: unknown; preferencias?: unknown } = {}
  try { cuerpo = JSON.parse(crudo) } catch { /* se valida abajo */ }
  if (typeof cuerpo.aceptar !== 'boolean') return NextResponse.json({ error: 'Falta tu decisión.' }, { status: 400 })

  const r = await fijarMarketingDeCuenta(
    supabaseAdmin() as unknown as DbCorreo,
    { uid: auth.perfil.uid, correo: auth.perfil.email ?? '', verificado: auth.perfil.emailVerified === true },
    { aceptar: cuerpo.aceptar, prefs: leerPreferencias(cuerpo.preferencias) },
  )
  if (r.estado === 'activa' || r.estado === 'baja') return NextResponse.json({ ok: true, activa: r.estado === 'activa' })
  if (r.estado === 'correo_sin_verificar') return NextResponse.json({ error: 'Verifica tu correo para recibir recomendaciones.' }, { status: 409 })
  if (r.estado === 'bloqueada') return NextResponse.json({ error: 'Esta dirección no puede recibir recomendaciones.' }, { status: 409 })
  return NextResponse.json({ error: 'No pudimos guardar tu decisión. Inténtalo más tarde.' }, { status: 503 })
}
