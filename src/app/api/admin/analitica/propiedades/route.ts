import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'
import { rendimientoPorPropiedad, totalesDe, type FilaPropiedadMetricas } from '@/lib/analitica-propiedades'
import type { FilaContacto, FilaEvento } from '@/lib/analitica'

/**
 * GET /api/admin/analitica/propiedades?dias=7|30|90 — rendimiento de cada propiedad (vistas, clics en la tarjeta, contactos, solicitudes, guardadas)
 * con el cambio contra el periodo anterior. Solo admin. Todo se calcula aquí con la clave de servicio: el navegador del panel no lee eventos crudos.
 * Una consulta que falle se informa por su nombre en `faltan` (una tabla vacía porque no contestó no se ve igual que una vacía porque no hay datos).
 */
export const dynamic = 'force-dynamic'

const PERIODOS = [7, 30, 90]
const NOMBRES = ['property_view', 'property_card_click', 'property_contact_click', 'property_share']

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const dias = Number(new URL(req.url).searchParams.get('dias') ?? 30)
  if (!PERIODOS.includes(dias)) return NextResponse.json({ error: 'Periodo no válido (7, 30 o 90 días).' }, { status: 400 })

  const db = supabaseAdmin()
  const hoy = new Date()
  const desde = new Date(hoy.getTime() - dias * 86_400_000)
  const desdeAnterior = new Date(desde.getTime() - dias * 86_400_000)

  const [ev, evAnt, props, leads, solicitudes, favs] = await Promise.all([
    db.from('eventos').select('nombre, propiedad_id, datos, creado_en, sesion').in('nombre', NOMBRES).gte('creado_en', desde.toISOString()).limit(20000),
    db.from('eventos').select('nombre, propiedad_id, datos, creado_en, sesion').eq('nombre', 'property_view').gte('creado_en', desdeAnterior.toISOString()).lt('creado_en', desde.toISOString()).limit(20000),
    db.from('propiedades').select('*'),
    db.from('leads').select('created_at, propiedad_id').gte('created_at', desde.toISOString()),
    db.from('solicitudes_contacto').select('creado_en, propiedad_id').gte('creado_en', desde.toISOString()),
    db.from('favoritos').select('propiedad_id'),
  ])
  const faltan = [ev.error && 'eventos', evAnt.error && 'eventos (periodo anterior)', props.error && 'propiedades', leads.error && 'leads', solicitudes.error && 'solicitudes_contacto', favs.error && 'favoritos'].filter(Boolean)
  if (faltan.length) console.error('[analitica/propiedades] no contestaron:', faltan.join(', '))

  const contactos: FilaContacto[] = [
    ...(leads.data ?? []).map((l) => ({ fecha: l.created_at as string | null, propiedad_id: l.propiedad_id as string | null })),
    ...(solicitudes.data ?? []).map((s) => ({ fecha: s.creado_en as string | null, propiedad_id: s.propiedad_id as string | null })),
  ]
  const filas = rendimientoPorPropiedad({
    eventos: (ev.data ?? []) as FilaEvento[], eventosAnteriores: (evAnt.data ?? []) as FilaEvento[],
    props: (props.data ?? []) as FilaPropiedadMetricas[], contactos, favoritos: favs.data ?? [], hoy,
  })
  return NextResponse.json({ dias, desde: desde.toISOString(), faltan, totales: totalesDe(filas), propiedades: filas })
}
