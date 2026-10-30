import { NextResponse } from 'next/server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { verifyIdToken, supabaseAdmin, requireAdmin } from '@/lib/auth-server'
import { zonasBuscadas, type BusquedaRegistrada } from '@/lib/zonas-buscadas'

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
  'property_card_click',
  'property_contact_click',
  'property_share',
])

/** Canales válidos de un clic de contacto: el navegador no puede guardar texto libre aquí. */
const CANALES = new Set(['whatsapp', 'telefono', 'correo'])
const LUGARES = new Set(['tarjeta', 'ficha', 'pagina'])
const CANALES_COMPARTIR = new Set(['nativo', 'copiado'])

/** Un clic de contacto solo guarda el canal y el lugar, de listas fijas (nunca el número ni el correo). */
function datosDeContacto(d: unknown): { canal: string; lugar: string } {
  const o = (d ?? {}) as Record<string, unknown>
  return { canal: CANALES.has(String(o.canal)) ? String(o.canal) : 'otro', lugar: LUGARES.has(String(o.lugar)) ? String(o.lugar) : 'pagina' }
}

/** Compartir solo guarda el modo (hoja nativa o enlace copiado), de una lista fija. */
function datosDeCompartir(d: unknown): { canal: string } {
  const o = (d ?? {}) as Record<string, unknown>
  return { canal: CANALES_COMPARTIR.has(String(o.canal)) ? String(o.canal) : 'otro' }
}

/** POST /api/eventos — registra un evento. Body: { nombre, propiedadId?, sesion?, datos? } */
export async function POST(req: Request) {
  // Tope por origen. Sin esto, cualquiera con la consola abierta llena
  // esta tabla en un minuto. Ver lib/limites.ts para lo que cubre y lo
  // que no.
  const frenado = await frenarAsync(`eventos:${origenDe(req)}`, TOPES.eventos)
  if (frenado) return frenado

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
    datos: nombre === 'property_contact_click' ? datosDeContacto(body.datos) : nombre === 'property_share' ? datosDeCompartir(body.datos) : (body.datos ?? null),
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
  // V-1.1.76: la misma comprobación que el resto del panel (rol + correo verificado).
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const db = supabaseAdmin()
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('eventos')
    // `sesion`: para saber qué búsquedas son pasos de una misma escritura.
    .select('nombre, propiedad_id, datos, creado_en, sesion')
    .gte('creado_en', desde)
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = data ?? []
  const porNombre: Record<string, number> = {}
  const porPropiedad: Record<string, number> = {}
  const busquedas: BusquedaRegistrada[] = []

  for (const e of filas) {
    porNombre[e.nombre] = (porNombre[e.nombre] ?? 0) + 1
    if (e.nombre === 'property_view' && e.propiedad_id) {
      porPropiedad[e.propiedad_id] = (porPropiedad[e.propiedad_id] ?? 0) + 1
    }
    if (e.nombre === 'search_performed') {
      const zona = (e.datos as Record<string, unknown> | null)?.zona
      if (typeof zona === 'string') {
        busquedas.push({ sesion: e.sesion ?? null, zona, creado: e.creado_en })
      }
    }
  }

  const top = (o: Record<string, number>, n: number) =>
    Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)

  // D-75: «guardadas» sale de la tabla `favoritos` (la fuente de verdad), no de
  // un evento `property_favorite` que nadie emite. Es un total, no una serie.
  const { count: favoritos } = await db.from('favoritos').select('propiedad_id', { count: 'exact', head: true })

  return NextResponse.json({
    desde,
    favoritos: favoritos ?? 0,
    total: filas.length,
    porNombre,
    masVistas: top(porPropiedad, 10),
    // Contadas como búsquedas, no como teclas: ver src/lib/zonas-buscadas.ts.
    zonasMasBuscadas: zonasBuscadas(busquedas, 8),
  })
}
