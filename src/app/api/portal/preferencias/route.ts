import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { frenarAsync, TOPES } from '@/lib/limites'
import { registrar } from '@/lib/auditoria'

/**
 * /api/portal/preferencias — cómo quiere esta persona recibir avisos (migración 58; correo de baja de precio: migración 60).
 *  GET → { correoAlertas, correoLegal, correoPrecio, consentimientoEn, consentimientoPrecioEn } (si nunca eligió: alertas y precio por correo APAGADOS, legal ENCENDIDO).
 *  PUT { correoAlertas?, correoLegal?, correoPrecio?: boolean } → guarda. Encender un correo de alertas es el CONSENTIMIENTO: queda la fecha y la bitácora (solo «activó»/«desactivó», sin el correo).
 *       Los avisos de Términos/Privacidad son de servicio y se pueden apagar, pero nacen encendidos. El correo de baja de precio tiene consentimiento PROPIO (no se deduce del de búsquedas).
 * Si la migración 60 no está aplicada, `correoPrecio` se lee como APAGADO y no se puede encender (503 sin cambiar nada).
 */
export const dynamic = 'force-dynamic'
const tablaAusente = (e: { code?: string; message?: string } | null | undefined) => Boolean(e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? '')))
const columnaAusente = (e: { code?: string; message?: string } | null | undefined) => Boolean(e && (e.code === '42703' || /column .* does not exist|Could not find the .* column/i.test(e.message ?? '')))

type Fila = { correo_alertas: boolean; correo_legal: boolean; consentimiento_alertas_en: string | null; correo_precio?: boolean; consentimiento_precio_en?: string | null }
const dto = (f: Fila | null) => ({
  correoAlertas: f?.correo_alertas ?? false, correoLegal: f?.correo_legal ?? true, correoPrecio: f?.correo_precio ?? false,
  consentimientoEn: f?.consentimiento_alertas_en ?? null, consentimientoPrecioEn: f?.consentimiento_precio_en ?? null,
})
const COLUMNAS_BASE = 'correo_alertas, correo_legal, consentimiento_alertas_en'
const COLUMNAS_TODAS = `${COLUMNAS_BASE}, correo_precio, consentimiento_precio_en`

/** Lee la fila con las columnas de la 60; si no existen, sin ellas (y avisa que no hay columna de precio). */
async function leer(uid: string) {
  const db = supabaseAdmin()
  const con = await db.from('preferencias_notificacion').select(COLUMNAS_TODAS).eq('uid', uid).maybeSingle()
  if (!con.error) return { fila: con.data as Fila | null, error: null, hayPrecio: true }
  if (!columnaAusente(con.error)) return { fila: null, error: con.error, hayPrecio: false }
  const sin = await db.from('preferencias_notificacion').select(COLUMNAS_BASE).eq('uid', uid).maybeSingle()
  return { fila: (sin.data as Fila | null) ?? null, error: sin.error, hayPrecio: false }
}

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const r = await leer(auth.perfil.uid)
  if (r.error) return tablaAusente(r.error) ? NextResponse.json(dto(null)) : NextResponse.json({ error: 'No se pudieron cargar tus preferencias.' }, { status: 500 })
  return NextResponse.json(dto(r.fila), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PUT(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`preferencias:${perfil.uid}`, TOPES.busquedas)
  if (frenado) return frenado
  const c = (await req.json().catch(() => ({}))) as { correoAlertas?: unknown; correoLegal?: unknown; correoPrecio?: unknown }
  const campos = [c.correoAlertas, c.correoLegal, c.correoPrecio]
  if (campos.some((v) => v !== undefined && typeof v !== 'boolean') || campos.every((v) => v === undefined)) {
    return NextResponse.json({ error: 'Elige si quieres o no recibir cada aviso.' }, { status: 400 })
  }
  const previo = await leer(perfil.uid)
  if (previo.error) return tablaAusente(previo.error) ? NextResponse.json({ error: 'Los avisos por correo todavía no están disponibles.', codigo: 'no_disponible' }, { status: 503 }) : NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 })
  // Encender el correo de precio sin la migración 60: no se puede (nunca se finge un consentimiento que no se guardó).
  if (c.correoPrecio === true && !previo.hayPrecio) return NextResponse.json({ error: 'Los avisos de baja de precio por correo todavía no están disponibles.', codigo: 'no_disponible' }, { status: 503 })
  const antes = previo.fila
  const ahora = new Date().toISOString()
  const nuevo: Record<string, unknown> = {
    uid: perfil.uid,
    correo_alertas: c.correoAlertas ?? antes?.correo_alertas ?? false,
    correo_legal: c.correoLegal ?? antes?.correo_legal ?? true,
    consentimiento_alertas_en: c.correoAlertas === true && !antes?.correo_alertas ? ahora : antes?.consentimiento_alertas_en ?? null,
    actualizado_en: ahora,
  }
  if (previo.hayPrecio) {
    nuevo.correo_precio = c.correoPrecio ?? antes?.correo_precio ?? false
    nuevo.consentimiento_precio_en = c.correoPrecio === true && !antes?.correo_precio ? ahora : antes?.consentimiento_precio_en ?? null
  }
  const w = await supabaseAdmin().from('preferencias_notificacion').upsert(nuevo, { onConflict: 'uid' })
  if (w.error) return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 })
  if (c.correoAlertas !== undefined && c.correoAlertas !== (antes?.correo_alertas ?? false)) {
    await registrar({ actor: perfil, accion: c.correoAlertas ? 'cuenta.avisos_correo_activados' : 'cuenta.avisos_correo_desactivados', entidad: 'usuario', entidadId: perfil.uid })
  }
  if (previo.hayPrecio && c.correoPrecio !== undefined && c.correoPrecio !== (antes?.correo_precio ?? false)) {
    await registrar({ actor: perfil, accion: c.correoPrecio ? 'cuenta.avisos_precio_correo_activados' : 'cuenta.avisos_precio_correo_desactivados', entidad: 'usuario', entidadId: perfil.uid })
  }
  return NextResponse.json(dto({
    correo_alertas: nuevo.correo_alertas as boolean, correo_legal: nuevo.correo_legal as boolean, consentimiento_alertas_en: nuevo.consentimiento_alertas_en as string | null,
    correo_precio: (nuevo.correo_precio as boolean | undefined) ?? false, consentimiento_precio_en: (nuevo.consentimiento_precio_en as string | null | undefined) ?? null,
  }))
}
