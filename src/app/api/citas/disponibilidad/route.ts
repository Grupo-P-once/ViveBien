import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir } from '@/lib/auth-server'
import { checkAvailability } from '@/lib/citas/servicio'
import { diaLocal, esDia } from '@/lib/citas/zona'
import { puede } from '@/lib/acceso/permisos'

/**
 * GET /api/citas/disponibilidad?propiedad=…&desde=AAAA-MM-DD&dias=14[&cita=…]
 *
 * Horarios libres para visitar una propiedad, en hora de León. Con `cita`
 * (al proponer otro horario) no cuenta el horario que esa misma cita ya ocupa.
 * Sólo con sesión: sólo agenda quien tiene cuenta.
 */

export const dynamic = 'force-dynamic'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { perfil } = auth

  const url = new URL(req.url)
  let propiedadId = url.searchParams.get('propiedad')?.slice(0, 120) ?? ''
  const desdePedido = url.searchParams.get('desde')
  const desde = esDia(desdePedido) ? desdePedido : diaLocal(new Date())
  const dias = Math.min(Math.max(Number(url.searchParams.get('dias')) || 14, 1), 31)

  // Al reprogramar: la cita tiene que ser de quien pregunta.
  const citaId = url.searchParams.get('cita')
  let excluir: string | undefined
  let clienteUid: string | null = perfil.uid
  if (citaId) {
    if (!RE_UUID.test(citaId)) return NextResponse.json({ error: 'No encontramos esa visita.' }, { status: 404 })
    const { data: cita } = await supabaseAdmin().from('citas')
      .select('id, propiedad_id, cliente_uid, asesor_uid').eq('id', citaId).maybeSingle()
    const suya = cita && (puede(perfil, 'citas.ver_todas') || cita.cliente_uid === perfil.uid || cita.asesor_uid === perfil.uid)
    if (!cita || !suya || !cita.propiedad_id) return NextResponse.json({ error: 'No encontramos esa visita.' }, { status: 404 })
    excluir = cita.id
    propiedadId = cita.propiedad_id
    clienteUid = cita.cliente_uid
  }

  if (!propiedadId) return NextResponse.json({ error: 'Falta la propiedad.' }, { status: 400 })

  try {
    const r = await checkAvailability({ propiedadId, desde, dias, clienteUid, excluirCitaId: excluir, ahora: new Date() })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.valor)
  } catch (e) {
    console.error('[citas] disponibilidad', e)
    return NextResponse.json({ error: 'No se pudieron leer los horarios.' }, { status: 500 })
  }
}
