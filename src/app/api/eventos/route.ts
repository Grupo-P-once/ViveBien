import { NextResponse } from 'next/server'
import { verifyIdToken, supabaseAdmin, isAdminEmail } from '@/lib/auth-server'

/**
 * Eventos de producto.
 *
 * El navegador puede avisar de que algo pasó, pero no escribe contadores.
 * Si pudiera, cualquiera inflaría las vistas de su propio anuncio: por eso
 * la suma la hace una función de base de datos y la vista se deduplica por
 * sesión con un índice único.
 */

const PERMITIDOS = new Set([
  'property_view',
  'property_favorite',
  'property_unfavorite',
  'search_performed',
  'contact_started',
  'valuation_calculated',
  'blog_view',
])

/** POST /api/eventos — registra un evento. Body: { nombre, propiedadId?, sesion?, datos? } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const nombre = typeof body.nombre === 'string' ? body.nombre : ''

  if (!PERMITIDOS.has(nombre)) {
    return NextResponse.json({ error: 'Evento no reconocido.' }, { status: 400 })
  }

  // La sesión es anónima y la genera el navegador: sólo sirve para no
  // contar diez veces la misma visita.
  const sesion = typeof body.sesion === 'string' ? body.sesion.slice(0, 64) : null
  const propiedadId = typeof body.propiedadId === 'string' ? body.propiedadId.slice(0, 120) : null

  // Sin token también se registra: la mayoría del tráfico es anónimo.
  const user = await verifyIdToken(req)

  const db = supabaseAdmin()

  // La ruta es pública por necesidad, así que se limita por sesión. Sin
  // esto, cualquiera puede llenar la tabla de basura desde un bucle.
  if (sesion) {
    const desde = new Date(Date.now() - 60 * 1000).toISOString()
    const { count } = await db
      .from('eventos')
      .select('id', { count: 'exact', head: true })
      .eq('sesion', sesion)
      .gte('creado_en', desde)

    if ((count ?? 0) >= 60) {
      return NextResponse.json({ ok: true, limitado: true })
    }
  }

  const { error } = await db.from('eventos').insert({
    nombre,
    uid: user?.uid ?? null,
    sesion,
    propiedad_id: propiedadId,
    datos: body.datos ?? null,
  })

  // El índice único de vistas rechaza los duplicados: no es un fallo.
  const duplicado = error?.code === '23505'
  if (error && !duplicado) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (nombre === 'property_view' && propiedadId && !duplicado) {
    try {
      await db.rpc('sumar_vista', { p_id: propiedadId })
    } catch {
      // El contador es secundario; el evento ya quedó registrado.
    }
  }

  return NextResponse.json({ ok: true, duplicado })
}

/** GET /api/eventos — resumen agregado para el panel. Sólo admin. */
export async function GET(req: Request) {
  const user = await verifyIdToken(req)
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  const db = supabaseAdmin()
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('eventos')
    .select('nombre, propiedad_id, datos, creado_en')
    .gte('creado_en', desde)
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = data ?? []
  const porNombre: Record<string, number> = {}
  const porPropiedad: Record<string, number> = {}
  const porZona: Record<string, number> = {}

  for (const e of filas) {
    porNombre[e.nombre] = (porNombre[e.nombre] ?? 0) + 1
    if (e.nombre === 'property_view' && e.propiedad_id) {
      porPropiedad[e.propiedad_id] = (porPropiedad[e.propiedad_id] ?? 0) + 1
    }
    if (e.nombre === 'search_performed') {
      const zona = (e.datos as Record<string, unknown> | null)?.zona
      if (typeof zona === 'string' && zona.trim()) {
        const k = zona.trim().toLowerCase()
        porZona[k] = (porZona[k] ?? 0) + 1
      }
    }
  }

  const top = (o: Record<string, number>, n: number) =>
    Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)

  return NextResponse.json({
    desde,
    total: filas.length,
    porNombre,
    masVistas: top(porPropiedad, 10),
    zonasMasBuscadas: top(porZona, 8),
  })
}
