import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { listAppointments, type VistaCalendario } from '@/lib/citas/servicio'
import { generarIcsVarios } from '@/lib/citas/ics'
import { rutaDeVisitas, type QuienVe } from '@/lib/citas/enlaces'
import { puede } from '@/lib/acceso/permisos'
import { atiendeCitas } from '@/lib/acceso/capacidades'
import { SITIO } from '@/lib/sitio'

/**
 * GET /api/citas/ics?vista=cliente|asesor|propietario|admin — «Descargar mi calendario»: las citas ACORDADAS de los próximos 100 días en un solo `.ics`.
 *
 * Lo mismo que el `.ics` de una cita, pero de todas las que esta persona puede ver en esa vista:
 *  · Solo con sesión, y con las MISMAS reglas de la lista (`GET /api/citas`): «asesor» solo si atiende citas, «propietario» solo un publicador, «admin» solo quien ve todas.
 *  · Solo citas firmes (confirmadas, o con un cambio pedido sobre una confirmada) y que no estén por confirmar: una solicitud pendiente NO es un evento.
 *  · Sin teléfonos, correos ni notas: lo que se ve es la propiedad, el lugar, la hora y el enlace a la cita. El archivo no cambia nada.
 */
export const dynamic = 'force-dynamic'

const VISTAS: VistaCalendario[] = ['cliente', 'asesor', 'propietario', 'admin']
const DIAS = 100

export async function GET(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`citas-ics:${perfil.uid}`, TOPES.citas)
  if (frenado) return frenado

  const pedida = new URL(req.url).searchParams.get('vista') as VistaCalendario | null
  const vista: VistaCalendario = pedida && VISTAS.includes(pedida) ? pedida : puede(perfil, 'citas.ver_todas') ? 'admin' : 'cliente'
  if (vista === 'admin' && !puede(perfil, 'citas.ver_todas')) return NextResponse.json({ error: 'Tu cuenta no tiene permisos para esta vista.' }, { status: 403 })
  if (vista === 'asesor' && !atiendeCitas(perfil)) return NextResponse.json({ error: 'Tu cuenta no recibe citas.' }, { status: 403 })
  if (vista === 'propietario' && perfil.rol !== 'publicador') return NextResponse.json({ error: 'Tu cuenta no tiene propiedades con citas.' }, { status: 403 })

  try {
    const ahora = new Date()
    const citas = await listAppointments({ perfil, vista, desde: ahora, hasta: new Date(ahora.getTime() + DIAS * 86_400_000), asesorUid: null, tipo: null, estados: null, propiedadId: null, tipoCita: null, incluirCanceladas: false })
    const eventos = citas
      .filter((c) => c.firme && c.estado !== 'PENDING_CONFIRMATION' && new Date(c.fin) > ahora)
      .map((c) => {
        const quien: QuienVe = c.papel === 'cliente' ? 'cliente' : c.papel === 'propietario' ? 'propietario' : perfil.rol === 'publicador' ? 'publicador' : 'equipo'
        return { id: c.id, version: c.version, inicio: new Date(c.inicio), fin: new Date(c.fin), titulo: c.propiedad?.titulo ?? 'la propiedad', lugar: c.lugar, enlace: `${SITIO}${rutaDeVisitas(quien, c.id)}`, ahora }
      })
    return new NextResponse(generarIcsVarios(eventos), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="mis-citas-vive-bien.ics"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    console.error('[citas] no se pudo generar el calendario', e instanceof Error ? e.message.slice(0, 120) : 'error')
    return NextResponse.json({ error: 'No se pudo generar el calendario.' }, { status: 500 })
  }
}
