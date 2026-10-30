import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { frenarAsync, TOPES } from '@/lib/limites'
import { rutaDe } from '@/lib/propiedad-publica'
import { COLUMNAS_CONTACTO_CLIENTE, aContactoCliente, filasDeHistorial, sanearContacto, type FilaContacto, type PropiedadDeHistorial } from '@/lib/contactos-cliente'

/**
 * /api/portal/contactos — la bitácora de contactos de UNA persona (migración 58).
 *  POST { propiedadId, canal: whatsapp|telefono|correo } → anota que esta persona (la de la sesión: el cuerpo NUNCA dice de quién es) contactó por esa propiedad. El título y el folio se
 *        guardan tal como estaban EN ESE MOMENTO. Solo propiedades publicadas; un doble clic (mismo canal y propiedad en 60 s) no duplica.
 *  GET → sus últimos 100 contactos (DTO sin el uid ni nada interno).
 * Falla cerrado si la migración 58 no está aplicada (503 sin cambiar nada) y nunca rompe el contacto en sí: el navegador lo llama «sin esperar».
 */
export const dynamic = 'force-dynamic'
const tablaAusente = (e: { code?: string; message?: string } | null | undefined) => Boolean(e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? '')))
const NO_DISPONIBLE = () => NextResponse.json({ error: 'El historial de contactos todavía no está disponible.', codigo: 'no_disponible' }, { status: 503 })

export async function POST(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contactos:${perfil.uid}`, TOPES.favoritos)
  if (frenado) return frenado

  const c = sanearContacto(await req.json().catch(() => ({})))
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 })

  const db = supabaseAdmin()
  const p = await db.from('propiedades').select('id, titulo, folio, estado_pub').eq('id', c.propiedadId).maybeSingle()
  if (p.error) return NextResponse.json({ error: 'No se pudo registrar.' }, { status: 500 })
  if (!p.data || (p.data as { estado_pub: string }).estado_pub !== 'publicada') return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })

  const hace60s = new Date(Date.now() - 60_000).toISOString()
  const previo = await db.from('cliente_contactos').select('id').eq('uid', perfil.uid).eq('propiedad_id', c.propiedadId).eq('canal', c.canal).gte('creado_en', hace60s).limit(1)
  if (previo.error) return tablaAusente(previo.error) ? NO_DISPONIBLE() : NextResponse.json({ error: 'No se pudo registrar.' }, { status: 500 })
  if (previo.data?.length) return NextResponse.json({ ok: true, duplicado: true })

  const fila = p.data as { id: string; titulo: string | null; folio: string | null }
  const w = await db.from('cliente_contactos').insert({
    uid: perfil.uid, propiedad_id: fila.id, propiedad_titulo: (fila.titulo ?? '').slice(0, 200) || null, propiedad_folio: (fila.folio ?? '').slice(0, 40) || null, canal: c.canal, destino: 'vivebien',
  })
  if (w.error) return tablaAusente(w.error) ? NO_DISPONIBLE() : NextResponse.json({ error: 'No se pudo registrar.' }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const db = supabaseAdmin()
  const r = await db.from('cliente_contactos').select(COLUMNAS_CONTACTO_CLIENTE).eq('uid', auth.perfil.uid).order('creado_en', { ascending: false }).limit(100)
  if (r.error) return tablaAusente(r.error) ? NextResponse.json({ contactos: [], historial: [] }) : NextResponse.json({ error: 'No se pudo cargar tu historial.' }, { status: 500 })
  const filas = (r.data ?? []) as unknown as FilaContacto[]
  // Las citas de esta persona (solo las suyas: `cliente_uid`). Si esa lectura falla, el historial sigue con los contactos.
  const c = await db.from('citas').select('id, propiedad_id, creada_en').eq('cliente_uid', auth.perfil.uid).order('creada_en', { ascending: false }).limit(100)
  const citas = c.error ? [] : ((c.data ?? []) as unknown as Array<{ id: string | number; propiedad_id: string | null; creada_en: string }>)
  const ids = [...new Set([...filas.map((f) => f.propiedad_id), ...citas.map((x) => x.propiedad_id).filter((x): x is string => Boolean(x))])]
  // Se leen TAMBIÉN las no publicadas, solo para saber su estado (disponible o no); a la respuesta solo llega lo que `filasDeHistorial` permite.
  // En lotes de 80 (la URL de PostgREST tiene tope). Si una lectura falla se DICE: antes todo el historial salía «No disponible» sin avisar.
  const leidas: PropiedadDeHistorial[] = []
  for (let i = 0; i < ids.length; i += 80) {
    const lote = await db.from('propiedades').select('id, slug, titulo, folio, estado_pub, estatus').in('id', ids.slice(i, i + 80))
    if (lote.error) return NextResponse.json({ error: 'No se pudo cargar tu historial.' }, { status: 500 })
    leidas.push(...((lote.data ?? []) as PropiedadDeHistorial[]))
  }
  const porId = new Map(leidas.map((x) => [x.id, x]))
  const ruta = new Map([...porId.values()].filter((x) => x.estado_pub === 'publicada').map((x) => [x.id, rutaDe({ id: x.id, slug: x.slug })]))
  return NextResponse.json({
    contactos: filas.map((f) => aContactoCliente(f, ruta.get(f.propiedad_id) ?? null)),
    historial: filasDeHistorial(filas, citas, porId),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
