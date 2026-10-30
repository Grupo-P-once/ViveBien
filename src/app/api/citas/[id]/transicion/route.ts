import { after, NextResponse } from 'next/server'
import { exigir, registrarIntentoDenegado } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { esAccion } from '@/lib/citas/estados'
import { EVENTO_DE, transicionar } from '@/lib/citas/servicio'
import { avisarCambio } from '@/lib/citas/enviar'
import type { EventoCorreo } from '@/lib/citas/correos'

/**
 * POST /api/citas/[id]/transicion — confirmar, proponer otro horario,
 * aceptar o rechazar el cambio, cancelar, marcar visitada o no asistió.
 *
 * Cuerpo: `{ accion, version, inicio?, motivo? }`. `version` es la que vio la
 * pantalla: si alguien cambió la cita antes, se contesta 409 con cómo quedó.
 * Las reglas viven en `cita_transicionar` (Postgres) y en
 * `src/lib/citas/estados.ts`.
 */

export const dynamic = 'force-dynamic'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { perfil } = auth

  const frenado = await frenarAsync(`citas:${perfil.uid}`, TOPES.citas)
  if (frenado) return frenado

  const { id } = await params
  if (!RE_UUID.test(id)) return NextResponse.json({ error: 'No encontramos esa visita.' }, { status: 404 })

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const accion = cuerpo.accion
  const version = cuerpo.version
  // «vencer» es sólo del sistema (tareas programadas), nunca de una persona.
  if (!esAccion(accion) || accion === 'vencer') {
    return NextResponse.json({ error: 'Esa acción no existe.' }, { status: 400 })
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: 'Recarga la página e inténtalo otra vez.' }, { status: 400 })
  }

  try {
    const r = await transicionar({
      id,
      version,
      accion,
      perfil,
      datos: {
        inicio: typeof cuerpo.inicio === 'string' ? cuerpo.inicio.slice(0, 40) : null,
        motivo: typeof cuerpo.motivo === 'string' ? cuerpo.motivo.slice(0, 500) : null,
      },
    })
    if (!r.ok) {
      // Un 403 aquí es un publicador intentando una acción sin su permiso: queda en la bitácora.
      if (r.status === 403) await registrarIntentoDenegado(perfil, req, `cita.accion:${accion}`)
      return NextResponse.json({ error: r.error, ...(r.cita ? { cita: r.cita } : {}) }, { status: r.status })
    }
    const evento = EVENTO_DE[accion]
    if (evento) after(() => avisarCambio(r.valor.id, evento as EventoCorreo, perfil.uid))
    return NextResponse.json({ cita: r.valor })
  } catch (e) {
    console.error('[citas] no se pudo cambiar', e)
    return NextResponse.json({ error: 'No se pudo guardar el cambio. Inténtalo otra vez.' }, { status: 500 })
  }
}
