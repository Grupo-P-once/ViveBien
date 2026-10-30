import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'
import {
  serieDiaria, composicionInventario, interesPorTipo, zonasFrenteAInventario,
  preciosBuscados, diasEnMercado, topFavoritosContactos,
  type FilaEvento, type FilaPropiedad, type FilaContacto,
} from '@/lib/analitica'

/**
 * GET /api/admin/analitica — las series de las gráficas del panel. Sólo admin.
 *
 * Trae las filas y delega los cálculos en `src/lib/analitica.ts`, que está
 * probado aparte. Cada consulta que falle se informa por su nombre en
 * `faltan`: una gráfica vacía porque la tabla no contestó no puede verse igual
 * que una vacía porque todavía no hay datos.
 *
 * Todo se calcula aquí, en el servidor, con la clave de servicio: el navegador
 * del panel no necesita —ni debe— poder leer eventos, favoritos o leads crudos.
 */

export const dynamic = 'force-dynamic'

const DIAS = 30

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const db = supabaseAdmin()
  const hoy = new Date()
  const desde = new Date(hoy.getTime() - DIAS * 86_400_000).toISOString()

  const [ev, props, leads, solicitudes, favs] = await Promise.all([
    db.from('eventos').select('nombre, propiedad_id, datos, creado_en, sesion').gte('creado_en', desde).limit(10000),
    db.from('propiedades').select('*'),
    // Leads y solicitudes completos, sin recortar a 30 días: el top compara con
    // los favoritos de siempre, y comparar histórico con un mes mentiría. La
    // serie diaria descarta sola lo que queda fuera de su ventana.
    db.from('leads').select('created_at, propiedad_id'),
    db.from('solicitudes_contacto').select('creado_en, propiedad_id'),
    db.from('favoritos').select('propiedad_id'),
  ])

  const faltan = [
    ev.error && 'eventos', props.error && 'propiedades', leads.error && 'leads',
    solicitudes.error && 'solicitudes_contacto', favs.error && 'favoritos',
  ].filter(Boolean)
  if (faltan.length) console.error('[analitica] no contestaron:', faltan.join(', '))

  const eventos = (ev.data ?? []) as FilaEvento[]
  const propiedades = (props.data ?? []) as FilaPropiedad[]
  const contactos: FilaContacto[] = [
    ...(leads.data ?? []).map((l) => ({ fecha: l.created_at as string | null, propiedad_id: l.propiedad_id as string | null })),
    ...(solicitudes.data ?? []).map((s) => ({ fecha: s.creado_en as string | null, propiedad_id: s.propiedad_id as string | null })),
  ]

  return NextResponse.json({
    desde,
    dias: DIAS,
    faltan,
    serie: serieDiaria(eventos, contactos, hoy, DIAS),
    inventario: composicionInventario(propiedades),
    interes: interesPorTipo(eventos, propiedades),
    zonas: zonasFrenteAInventario(eventos, propiedades),
    precios: preciosBuscados(eventos),
    mercado: diasEnMercado(propiedades, hoy),
    top: topFavoritosContactos(propiedades, favs.data ?? [], contactos),
  })
}
