import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '@/lib/portal/tarjeta'
import { interesanVista, type FilaInteres } from '@/lib/portal/pantallas'

/**
 * GET /api/portal/me-interesan — sobre qué propiedades hizo algo (V-1.1.86).
 *
 * «Algo» es una **interacción comercial real hecha con su cuenta** (D-27.2):
 * pidió informes, pidió una visita (`solicitudes_contacto.cliente_uid`) o tiene
 * una visita agendada (`citas.cliente_uid`).
 *
 * NO cuentan las visitas a la ficha (nadie guarda quién la vio) ni los
 * formularios públicos: `leads` no tiene cuenta, y emparejar por correo sería
 * enseñarle a alguien lo que hizo otra persona (D-28.1 = A).
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  try {
    const db = supabaseAdmin()
    const [sols, citas, props] = await Promise.all([
      db.from('solicitudes_contacto').select('propiedad_id, tipo, creado_en').eq('cliente_uid', perfil.uid).order('creado_en', { ascending: false }).limit(200),
      db.from('citas').select('propiedad_id, estado, creada_en').eq('cliente_uid', perfil.uid).order('creada_en', { ascending: false }).limit(200),
      db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(1000),
    ])
    for (const r of [sols, citas, props]) if (r.error) throw r.error

    const interacciones: FilaInteres[] = [
      ...((sols.data ?? []) as Array<{ propiedad_id: string | null; tipo: string; creado_en: string }>).map((s) => ({
        propiedad_id: s.propiedad_id,
        que: (s.tipo === 'visita' ? 'visita' : 'informacion') as FilaInteres['que'],
        cuando: s.creado_en,
      })),
      ...((citas.data ?? []) as Array<{ propiedad_id: string | null; estado: string; creada_en: string }>).map((c) => ({
        propiedad_id: c.propiedad_id,
        que: 'cita' as const,
        cuando: c.creada_en,
        estado: c.estado,
      })),
    ]

    return NextResponse.json({
      interesan: interesanVista(interacciones, (props.data ?? []) as FilaPropiedadPortal[]),
    })
  } catch (e) {
    console.error('[portal] me interesan', e)
    return NextResponse.json({ error: 'No se pudo cargar lo que te interesa.' }, { status: 500 })
  }
}
