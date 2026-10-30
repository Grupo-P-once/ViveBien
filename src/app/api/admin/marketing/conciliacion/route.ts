import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { registrar } from '@/lib/auditoria'

/**
 * Registrar una lectura del panel de Resend (uso del día y del ciclo). SOLO Super Admin. Es la única forma de que el sistema «vea» lo que consumen otros
 * servicios de la misma cuenta; sin una lectura de los últimos 8 días el correo OPCIONAL no sale (migración 62). El actor queda registrado (uid, no correo).
 */
export const dynamic = 'force-dynamic'

const entero = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : null)

export async function POST(req: Request) {
  const auth = await exigir(req, 'correo.conciliar')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`marketing-conciliar:${auth.perfil.uid}`, TOPES.marketingConciliar)
  if (frenado) return frenado

  const crudo = await req.text().catch(() => '')
  if (crudo.length > 2048) return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 })
  let c: { dia?: unknown; mes?: unknown; nota?: unknown } = {}
  try {
    c = JSON.parse(crudo)
  } catch {
    /* se valida abajo */
  }
  const dia = entero(c.dia)
  const mes = entero(c.mes)
  if (dia === null || mes === null) return NextResponse.json({ error: 'Indica el uso del día y del ciclo como números enteros (0 o más).' }, { status: 400 })
  if (dia > 100 || mes > 3000) return NextResponse.json({ error: 'Esos valores superan el plan gratuito de Resend (100 al día, 3,000 al mes). Revísalos en el panel de Resend.' }, { status: 400 })
  const nota = typeof c.nota === 'string' ? c.nota.trim().slice(0, 300) : ''

  const { data, error } = await supabaseAdmin().rpc('correo_conciliar', { p_dia: dia, p_mes: mes, p_actor: auth.perfil.uid, p_nota: nota || null })
  if (error || !data) return NextResponse.json({ error: 'No se pudo guardar la lectura (¿falta aplicar la migración de correo?).' }, { status: 503 })
  await registrar({ actor: { ...auth.perfil, email: null }, accion: 'correo.conciliar', entidad: 'correo_conciliacion', entidadId: String((data as { id?: unknown }).id ?? ''), despues: { dia, mes } })
  return NextResponse.json({ ok: true, dia, mes })
}
