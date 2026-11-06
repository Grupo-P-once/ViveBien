import { NextResponse } from 'next/server'
import { flagEncendido } from '@/lib/config/flags-servidor'

/**
 * GET /api/citas/estado — ¿se pueden agendar citas en línea? Público y sin datos personales: solo el interruptor.
 *
 * La ficha de la propiedad lo consulta para decidir si muestra la tarjeta «Agenda una cita» (con el flag apagado la tarjeta no
 * aparece: no se promete lo que no se puede reservar). Cache corto sin «stale-while-revalidate»: si el dueño lo apaga, deja de verse en segundos.
 * Falla cerrado: si no se puede leer el flag, `false`.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const citasEnLinea = await flagEncendido('citasEnLinea').catch(() => false)
  return NextResponse.json({ citasEnLinea }, { headers: { 'Cache-Control': 'public, s-maxage=20' } })
}
