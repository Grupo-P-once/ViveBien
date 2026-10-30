import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '@/lib/portal/tarjeta'
import { alertasVista, type FilaBusquedaPortal } from '@/lib/portal/pantallas'

/**
 * Alertas del portal (V-1.1.85, D-27.3 y D-28.2).
 *
 * Lo que hay: **lo nuevo de cada búsqueda guardada desde la última vez que la
 * miró**. No se manda ningún correo —y la pantalla lo dice— porque para eso
 * hacen falta consentimiento, preferencia y baja, que son de una fase posterior.
 *
 * `POST` marca una búsqueda (o todas) como vistas: es lo que hace que el
 * contador BAJE, en vez de contar para siempre desde que se guardó.
 */
export const dynamic = 'force-dynamic'

async function leer(uid: string) {
  const db = supabaseAdmin()
  const [busq, props] = await Promise.all([
    db.from('busquedas_guardadas').select('id, nombre, filtros, creado_en, revisadas_en').eq('uid', uid).order('creado_en', { ascending: false }),
    db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(1000),
  ])
  for (const r of [busq, props]) if (r.error) throw r.error
  return alertasVista(
    (busq.data ?? []) as FilaBusquedaPortal[],
    (props.data ?? []) as FilaPropiedadPortal[],
  )
}

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  try {
    return NextResponse.json({ alertas: await leer(auth.perfil.uid) })
  } catch (e) {
    console.error('[portal] alertas', e)
    return NextResponse.json({ error: 'No se pudieron cargar tus alertas.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const frenado = await frenarAsync(`alertas:${origenDe(req)}`, TOPES.busquedas)
  if (frenado) return frenado

  const cuerpo = await req.json().catch(() => ({}))
  const id = cuerpo?.busquedaId
  const unaSola = Number.isInteger(id) && id > 0

  try {
    const db = supabaseAdmin()
    let q = db.from('busquedas_guardadas').update({ revisadas_en: new Date().toISOString() }).eq('uid', perfil.uid)
    if (unaSola) q = q.eq('id', id)
    const { error } = await q
    if (error) throw error
    // Se responde con el estado ya guardado (D-32): la pantalla no adivina.
    return NextResponse.json({ ok: true, alertas: await leer(perfil.uid) })
  } catch (e) {
    console.error('[portal] marcar alertas vistas', e)
    return NextResponse.json({ error: 'No se pudo marcar como visto.' }, { status: 500 })
  }
}
