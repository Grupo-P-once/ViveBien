import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'
import { periodoValido, ventanaDe } from '@/lib/admin/periodo'
import { construirResumen, type FilaContactoResumen, type FilaPropiedadResumen } from '@/lib/admin/resumen'
import type { FilaEvento } from '@/lib/analitica'

/**
 * GET /api/admin/resumen?periodo=7d|30d|90d|12m — el tablero del panel. Sólo admin.
 *
 * Trae las filas del período y del anterior, y delega los números en
 * `lib/admin/resumen.ts`, que está probado aparte.
 *
 * Cada consulta de eventos lleva **inicio y fin** (`gte` + `lt`). Y si alguna
 * tabla no contesta, se dice cuál en `faltan`: un cero porque la base falló no
 * puede verse igual que un cero de verdad.
 */

export const dynamic = 'force-dynamic'

/** Tope de eventos por consulta. Si se alcanza, el panel avisa de que faltan filas. */
const TOPE_EVENTOS = 20_000

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const periodo = periodoValido(url.searchParams.get('periodo'))
  const ahora = new Date()
  const v = ventanaDe(periodo, ahora)
  const db = supabaseAdmin()

  const [props, ev, primerEvento, leads, solicitudes, contactos, favs] = await Promise.all([
    db.from('propiedades').select('id, titulo, tipo, operacion, ubicacion, estado_pub, publicada_en, created_at, lat, lng, folio, slug'),
    db.from('eventos')
      .select('nombre, propiedad_id, datos, creado_en, sesion')
      .gte('creado_en', v.anteriorDesde.toISOString())
      .lt('creado_en', v.hasta.toISOString())
      .limit(TOPE_EVENTOS),
    db.from('eventos').select('creado_en').order('creado_en', { ascending: true }).limit(1),
    db.from('leads').select('created_at, propiedad_id'),
    db.from('solicitudes_contacto').select('creado_en, propiedad_id'),
    db.from('contactos').select('created_at'),
    db.from('favoritos').select('creado_en, propiedad_id'),
  ])

  const faltan = [
    props.error && 'propiedades', ev.error && 'eventos', primerEvento.error && 'eventos (inicio)',
    leads.error && 'leads', solicitudes.error && 'solicitudes_contacto', contactos.error && 'contactos',
    favs.error && 'favoritos',
  ].filter((x): x is string => Boolean(x))
  if (faltan.length) console.error('[admin/resumen] no contestaron:', faltan.join(', '))

  const filasContacto: FilaContactoResumen[] = [
    ...(leads.data ?? []).map((l) => ({ fecha: l.created_at as string | null, propiedad_id: l.propiedad_id as string | null })),
    ...(solicitudes.data ?? []).map((s) => ({ fecha: s.creado_en as string | null, propiedad_id: s.propiedad_id as string | null })),
    ...(contactos.data ?? []).map((c) => ({ fecha: c.created_at as string | null, propiedad_id: null })),
  ]

  const eventos = (ev.data ?? []) as FilaEvento[]

  const resumen = construirResumen(
    {
      propiedades: (props.data ?? []) as FilaPropiedadResumen[],
      eventos,
      contactos: filasContacto,
      favoritos: (favs.data ?? []) as { creado_en: string | null; propiedad_id: string | null }[],
      inicioEventos: (primerEvento.data?.[0]?.creado_en as string | undefined) ?? null,
    },
    v,
    ahora,
  )

  return NextResponse.json({
    periodo,
    desde: v.desde.toISOString(),
    hasta: v.hasta.toISOString(),
    anteriorDesde: v.anteriorDesde.toISOString(),
    faltan,
    eventosRecortados: eventos.length >= TOPE_EVENTOS,
    ...resumen,
  })
}
