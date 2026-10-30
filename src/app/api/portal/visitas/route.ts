import { NextResponse } from 'next/server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { listAppointments } from '@/lib/citas/servicio'
import { flagEncendido } from '@/lib/config/flags-servidor'

/**
 * GET /api/portal/visitas — las visitas de esta persona (V-1.1.86).
 *
 * **Sólo lectura** (D-28.3 = A): aquí no se agenda, ni se cancela, ni se
 * reprograma. Reutiliza `listAppointments` con la vista de cliente, que ya
 * filtra por `cliente_uid` y **recorta** lo que no le toca ver (del asesor sólo
 * el nombre; nada de notas internas ni de Google).
 *
 * `citasEnLinea` viaja en la respuesta para que la pantalla sepa si puede
 * ofrecer agendar —hoy, no— sin inventarse la regla por su cuenta.
 */
export const dynamic = 'force-dynamic'

/** Un año hacia atrás y uno hacia delante: suficiente para «mis visitas». */
const ANO_MS = 365 * 86_400_000

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  try {
    const ahora = new Date()
    const citas = await listAppointments({
      perfil,
      vista: 'cliente',
      desde: new Date(ahora.getTime() - ANO_MS),
      hasta: new Date(ahora.getTime() + ANO_MS),
      ahora,
    })

    const corte = ahora.getTime()
    const proximas = citas.filter((c) => Date.parse(c.inicio) >= corte)
    const pasadas = citas.filter((c) => Date.parse(c.inicio) < corte).reverse()

    return NextResponse.json({ proximas, pasadas, citasEnLinea: await flagEncendido('citasEnLinea') })
  } catch (e) {
    console.error('[portal] visitas', e)
    return NextResponse.json({ error: 'No se pudieron cargar tus visitas.' }, { status: 500 })
  }
}
