import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { getAppointment } from '@/lib/citas/servicio'
import { generarIcs } from '@/lib/citas/ics'
import { rutaDeVisitas, type QuienVe } from '@/lib/citas/enlaces'
import { SITIO } from '@/lib/sitio'

/**
 * GET /api/citas/[id]/ics — el evento de una cita CONFIRMADA para Google Calendar, Outlook, Apple Calendar, Samsung y cualquier
 * calendario de celular o escritorio («Añadir al calendario», fase 1; la sincronización bidireccional con OAuth es una fase posterior).
 *
 * · Con sesión, y solo de una cita que la persona puede ver (si no es suya: 404, no se revela que existe).
 * · Solo si la cita está acordada (confirmada, o con un cambio pedido sobre una confirmada). Una solicitud pendiente NO es un evento.
 * · `UID` estable = id de la cita y `SEQUENCE` = su versión: si la cita cambia y se vuelve a añadir, el calendario ACTUALIZA el evento en
 *   vez de duplicarlo. Sin invitados, sin teléfonos ni correos: lo que se ve es la propiedad, el lugar, la hora y el enlace a la cita.
 * · No es un GET que cambie nada: solo lee.
 */
export const dynamic = 'force-dynamic'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { id } = await params
  if (!RE_UUID.test(id)) return NextResponse.json({ error: 'No encontramos esa cita.' }, { status: 404 })

  try {
    const cita = await getAppointment(id, auth.perfil)
    if (!cita) return NextResponse.json({ error: 'No encontramos esa cita.' }, { status: 404 })
    // Solo una cita acordada es un evento. Con un cambio pedido, el horario vigente sigue siendo el original hasta que se acepte.
    // `PENDING_CONFIRMATION` (la registró el equipo y falta que el cliente confirme) todavía no es un evento.
    if (!cita.firme || cita.estado === 'PENDING_CONFIRMATION') {
      return NextResponse.json({ error: 'La cita todavía no está confirmada: cuando lo esté podrás añadirla a tu calendario.' }, { status: 409 })
    }

    const quien: QuienVe = cita.papel === 'cliente' ? 'cliente' : cita.papel === 'propietario' ? 'propietario'
      : auth.perfil.rol === 'publicador' ? 'publicador' : 'equipo'
    const titulo = cita.propiedad?.titulo ?? 'la propiedad'
    const ics = generarIcs({
      id: cita.id, version: cita.version, inicio: new Date(cita.inicio), fin: new Date(cita.fin),
      titulo, lugar: cita.lugar, enlace: `${SITIO}${rutaDeVisitas(quien, cita.id)}`, ahora: new Date(),
    })
    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cita-vive-bien.ics"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    console.error('[citas] no se pudo generar el .ics', e instanceof Error ? e.message.slice(0, 120) : 'error')
    return NextResponse.json({ error: 'No se pudo generar el archivo del calendario.' }, { status: 500 })
  }
}
