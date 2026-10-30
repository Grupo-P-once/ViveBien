import { after, NextResponse } from 'next/server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { usarToken } from '@/lib/citas/servicio'
import { avisarCambio } from '@/lib/citas/enviar'
import type { EventoCorreo } from '@/lib/citas/correos'

/**
 * POST /api/citas/accion  `{ token }` — hace lo que dice el enlace del correo.
 *
 * Sólo se llama al pulsar el botón de la página: abrir el correo o el enlace
 * no llega aquí. El token vale una vez, caduca y deja de valer si la cita
 * cambió. Ver docs/email-flow.md §2.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const frenado = await frenarAsync(`citas-accion:${origenDe(req)}`, TOPES.citas)
  if (frenado) return frenado
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const r = await usarToken(cuerpo.token)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
    const { cita, evento, actorUid } = r.valor
    if (evento) after(() => avisarCambio(cita.id, evento as EventoCorreo, actorUid))
    return NextResponse.json({ estado: cita.estado, etiqueta: cita.etiqueta, inicio: cita.inicio }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[citas] usar enlace', e)
    return NextResponse.json({ error: 'No se pudo guardar el cambio. Inténtalo otra vez.' }, { status: 500 })
  }
}
