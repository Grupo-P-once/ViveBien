import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { flagEncendido } from '@/lib/config/flags-servidor'
import { listAppointments } from '@/lib/citas/servicio'
import { ESTADOS_ACTIVOS } from '@/lib/citas/estados'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '@/lib/portal/tarjeta'
import { construirResumenPortal, type FilaBusqueda, type FilaFavorito, type FilaPerfilPortal, type FilaSolicitud } from '@/lib/portal/resumen'
import { COLUMNAS_QUE_BUSCO } from '@/lib/cliente/busqueda'

/**
 * GET /api/portal/resumen — todo lo que enseña el Inicio del portal del
 * cliente, en una sola petición (como el resumen del panel admin).
 *
 * Cada parte es de quien pregunta: sus favoritos, sus búsquedas, sus
 * consultas, sus visitas. Las propiedades son las publicadas (públicas).
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Portal apagado (ADR-0012): la API tampoco existe.
  // V-1.1.82: flags por etapas, sesión, suspensión y permiso, en una sola puerta.
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth
  const db = supabaseAdmin()
  const ahora = new Date()

  try {
    const [pf, props, favs, busq, sols, citas] = await Promise.all([
      db.from('usuarios').select(`nombre, ${COLUMNAS_QUE_BUSCO}`).eq('uid', perfil.uid).maybeSingle(),
      db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(1000),
      db.from('favoritos').select('propiedad_id, creado_en').eq('uid', perfil.uid).order('creado_en', { ascending: false }),
      db.from('busquedas_guardadas').select('id, nombre, filtros, creado_en, revisadas_en').eq('uid', perfil.uid).order('creado_en', { ascending: false }),
      db.from('solicitudes_contacto').select('id, propiedad_id, propiedad_titulo, tipo, creado_en').eq('cliente_uid', perfil.uid).order('creado_en', { ascending: false }).limit(20),
      listAppointments({ perfil, vista: 'cliente', desde: ahora, hasta: new Date(ahora.getTime() + 95 * 86_400_000), ahora }),
    ])
    for (const r of [pf, props, favs, busq, sols]) if (r.error) throw r.error

    const resumen = construirResumenPortal({
      perfil: pf.data as FilaPerfilPortal | null,
      propiedades: (props.data ?? []) as FilaPropiedadPortal[],
      favoritos: (favs.data ?? []) as FilaFavorito[],
      busquedas: (busq.data ?? []) as FilaBusqueda[],
      solicitudes: (sols.data ?? []) as FilaSolicitud[],
      citas: citas.filter((c) => ESTADOS_ACTIVOS.includes(c.estado)),
      citasEnLinea: await flagEncendido('citasEnLinea'),
    })
    return NextResponse.json(resumen)
  } catch (e) {
    console.error('[portal] resumen', e)
    return NextResponse.json({ error: 'No se pudo cargar tu portal.' }, { status: 500 })
  }
}
