import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir } from '@/lib/auth-server'
import { getAppointment } from '@/lib/citas/servicio'

/**
 * GET /api/citas/[id] — una cita y su historial, recortados a lo que puede
 * ver quien pregunta. Si no es suya, 404: no se revela que existe.
 */

export const dynamic = 'force-dynamic'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { id } = await params
  if (!RE_UUID.test(id)) return NextResponse.json({ error: 'No encontramos esa visita.' }, { status: 404 })

  try {
    const cita = await getAppointment(id, auth.perfil)
    if (!cita) return NextResponse.json({ error: 'No encontramos esa visita.' }, { status: 404 })

    const { data } = await supabaseAdmin().from('citas_eventos')
      .select('tipo, estado_antes, estado_despues, actor_rol, via, datos, creado_en')
      .eq('cita_id', id).order('id', { ascending: true }).limit(100)

    // Un publicador atendiendo la cita ve, como el cliente, sólo horarios y
    // motivos: el historial del equipo puede traer notas y datos del interesado.
    // El PROPIETARIO (dueño que no atiende la cita, D-1) tampoco ve notas ni datos del equipo: solo horarios y motivos (revisión de Codex, 6-nov-2026).
    const acotado = cita.papel === 'cliente' || cita.papel === 'propietario' || (cita.papel === 'asesor' && auth.perfil.rol === 'publicador')

    // Quién hizo cada cambio se dice por su papel, nunca por su uid.
    const historial = (data ?? [])
      .filter((e) => !acotado || e.tipo !== 'NOTE_UPDATED')
      .map((e) => ({
        tipo: e.tipo,
        estadoAntes: e.estado_antes,
        estadoDespues: e.estado_despues,
        por: e.actor_rol,
        via: e.via,
        datos: acotado ? soloHorarios(e.datos) : e.datos,
        en: e.creado_en,
      }))

    return NextResponse.json({ cita, historial })
  } catch (e) {
    console.error('[citas] no se pudo leer', e)
    return NextResponse.json({ error: 'No se pudo leer la visita.' }, { status: 500 })
  }
}

/** Al cliente sólo le interesan los cambios de fecha y el motivo de una cancelación. */
function soloHorarios(datos: unknown): Record<string, unknown> {
  if (!datos || typeof datos !== 'object') return {}
  const permitidos = ['inicio', 'fin', 'de_inicio', 'de_fin', 'a_inicio', 'a_fin', 'propuesta_inicio', 'propuesta_fin', 'motivo']
  return Object.fromEntries(Object.entries(datos as Record<string, unknown>).filter(([k]) => permitidos.includes(k)))
}
