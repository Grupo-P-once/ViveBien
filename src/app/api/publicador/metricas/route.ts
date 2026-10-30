import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { rendimientoPorPropiedad, totalesDe, type FilaPropiedadMetricas } from '@/lib/analitica-propiedades'
import { serieDiaria, type FilaContacto, type FilaEvento } from '@/lib/analitica'
import { tieneCapacidad } from '@/lib/acceso/capacidades'

/**
 * GET /api/publicador/metricas?dias=7|30|90 — las métricas de LAS PROPIEDADES QUE ESTA CUENTA SUBIÓ (publicador y asociado), para su portal.
 *
 * SEGURIDAD (la hace cumplir `tests/publicador-metricas.test.ts`):
 *  · El dueño lo pone el servidor con la sesión (`owner_id = uid`), SIEMPRE —también para un administrador, que aquí pide «lo que yo subí»—. Ningún
 *    parámetro del navegador decide de quién son las propiedades.
 *  · Solo CANTIDADES: vistas, clics, solicitudes y guardadas. Nunca nombre, teléfono, correo ni mensaje de quien se comunicó (ADR-0006: el publicador
 *    no ve datos personales de leads salvo su capacidad explícita, y esta pantalla ni siquiera los pide).
 *  · MÁS DETALLE POR CAPACIDAD, no por tipo de cuenta (ADR-0013: la modalidad no es la autorización): quien tiene `recibir_citas` (el asociado por defecto, o
 *    un publicador al que un admin se la dio) recibe además las citas de cada propiedad y la serie diaria de su cartera. Sigue sin haber datos personales:
 *    nombre, teléfono y correo de los interesados viven solo en las pantallas de Citas y Solicitudes, con su permiso `ver_datos_interesado`.
 *  · «Generales» es un promedio de TODO el sitio (vistas por propiedad publicada), sin datos de ninguna otra cuenta ni propiedad.
 */
export const dynamic = 'force-dynamic'

const PERIODOS = [7, 30, 90]
const NOMBRES = ['property_view', 'property_card_click', 'property_contact_click', 'property_share']
const COLUMNAS = 'id, folio, titulo, tipo, operacion, precio, estado_pub, publicada_en, created_at, vistas, ubicacion'

export async function GET(req: Request) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error || !auth.perfil) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`pub-metricas:${perfil.uid}`, TOPES.metricasPropias)
  if (frenado) return frenado

  const dias = Number(new URL(req.url).searchParams.get('dias') ?? 30)
  if (!PERIODOS.includes(dias)) return NextResponse.json({ error: 'Periodo no válido (7, 30 o 90 días).' }, { status: 400 })

  const db = supabaseAdmin()
  const hoy = new Date()
  const desde = new Date(hoy.getTime() - dias * 86_400_000)
  const desdeAnterior = new Date(desde.getTime() - dias * 86_400_000)

  const mias = await db.from('propiedades').select(COLUMNAS).eq('owner_id', perfil.uid)
  if (mias.error) return NextResponse.json({ error: 'No se pudieron cargar tus propiedades.' }, { status: 500 })
  const props = (mias.data ?? []) as unknown as FilaPropiedadMetricas[]
  const ids = props.map((p) => p.id)

  // Lo general del sitio (promedio, sin datos de nadie más). Se pide siempre: solo son dos cuentas.
  const [vistasSitio, publicadasSitio] = await Promise.all([
    db.from('eventos').select('id', { count: 'exact', head: true }).eq('nombre', 'property_view').gte('creado_en', desde.toISOString()),
    db.from('propiedades').select('id', { count: 'exact', head: true }).eq('estado_pub', 'publicada'),
  ])
  const nSitio = typeof publicadasSitio.count === 'number' ? publicadasSitio.count : 0
  const generales = { propiedadesPublicadasSitio: nSitio, vistasPromedioSitio: nSitio > 0 && typeof vistasSitio.count === 'number' ? Math.round((vistasSitio.count / nSitio) * 10) / 10 : null }

  const porEstado: Record<string, number> = {}
  for (const p of props) porEstado[p.estado_pub ?? 'sin_estado'] = (porEstado[p.estado_pub ?? 'sin_estado'] ?? 0) + 1
  const resumenBase = { porEstado, vistasHistorico: props.reduce((s, p) => s + (Number(p.vistas) || 0), 0) }

  if (ids.length === 0) {
    return NextResponse.json({ dias, faltan: [], totales: totalesDe([]), propiedades: [], resumen: { ...resumenBase, diasPromedioPublicadas: null }, generales, avanzado: tieneCapacidad(perfil, 'recibir_citas') ? { vistasPorDia: [], compartidasNativo: 0, compartidasCopiado: 0 } : null })
  }

  const conDetalle = tieneCapacidad(perfil, 'recibir_citas')
  const [ev, evAnt, leads, solicitudes, favs, citasQ] = await Promise.all([
    db.from('eventos').select('nombre, propiedad_id, datos, creado_en, sesion').in('propiedad_id', ids).in('nombre', NOMBRES).gte('creado_en', desde.toISOString()).limit(20000),
    db.from('eventos').select('nombre, propiedad_id, datos, creado_en, sesion').in('propiedad_id', ids).eq('nombre', 'property_view').gte('creado_en', desdeAnterior.toISOString()).lt('creado_en', desde.toISOString()).limit(20000),
    db.from('leads').select('created_at, propiedad_id').in('propiedad_id', ids).gte('created_at', desde.toISOString()),
    db.from('solicitudes_contacto').select('creado_en, propiedad_id').in('propiedad_id', ids).gte('creado_en', desde.toISOString()),
    db.from('favoritos').select('propiedad_id').in('propiedad_id', ids),
    // Solo cantidades por estado; la cita en sí (con quién, cuándo, datos) vive en «Citas recibidas».
    conDetalle ? db.from('citas').select('propiedad_id, estado').in('propiedad_id', ids).gte('creada_en', desde.toISOString()) : Promise.resolve({ data: [] as Array<{ propiedad_id: string | null; estado: string }>, error: null }),
  ])
  const faltan = [ev.error && 'eventos', evAnt.error && 'eventos (periodo anterior)', leads.error && 'leads', solicitudes.error && 'solicitudes', favs.error && 'favoritos', citasQ.error && 'citas'].filter(Boolean)
  if (faltan.length) console.error('[publicador/metricas] no contestaron:', faltan.join(', '))

  const contactos: FilaContacto[] = [
    ...(leads.data ?? []).map((l) => ({ fecha: l.created_at as string | null, propiedad_id: l.propiedad_id as string | null })),
    ...(solicitudes.data ?? []).map((s) => ({ fecha: s.creado_en as string | null, propiedad_id: s.propiedad_id as string | null })),
  ]
  const filas = rendimientoPorPropiedad({
    eventos: (ev.data ?? []) as FilaEvento[], eventosAnteriores: (evAnt.data ?? []) as FilaEvento[],
    props, contactos, favoritos: favs.data ?? [], hoy, todas: true, citas: conDetalle ? ((citasQ.data ?? []) as Array<{ propiedad_id: string | null; estado: string }>) : undefined,
  })
  const publicadas = filas.filter((f) => f.estado === 'publicada' && f.diasPublicada != null)
  const diasPromedioPublicadas = publicadas.length ? Math.round(publicadas.reduce((s, f) => s + (f.diasPublicada ?? 0), 0) / publicadas.length) : null

  // Detalle extra solo para quien tiene la capacidad: serie diaria de la cartera (vistas y solicitudes por día) y compartidas por modo.
  const avanzado = conDetalle ? {
    vistasPorDia: serieDiaria((ev.data ?? []) as FilaEvento[], contactos, hoy, dias),
    compartidasNativo: filas.reduce((s, f) => s + f.compartidasNativo, 0),
    compartidasCopiado: filas.reduce((s, f) => s + f.compartidasCopiado, 0),
  } : null

  return NextResponse.json({ dias, faltan, totales: totalesDe(filas), propiedades: filas, resumen: { ...resumenBase, diasPromedioPublicadas }, generales, avanzado })
}
