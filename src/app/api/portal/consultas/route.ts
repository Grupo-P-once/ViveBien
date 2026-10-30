import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { COLUMNAS_CONSULTA_CLIENTE, aConsultaCliente, type FilaConsultaCliente } from '@/lib/consultas'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '@/lib/portal/tarjeta'
import { consultasVista } from '@/lib/portal/pantallas'

/**
 * GET /api/portal/consultas — lo que esta persona ha preguntado (V-1.1.85).
 *
 * Usa el DTO de cliente de 3a (`aConsultaCliente`): ni dueño, ni estado de
 * WhatsApp, ni notas internas, ni atribución. Sólo lo suyo (`cliente_uid`), y
 * con la tarjeta pública de la propiedad para reconocerla de un vistazo.
 *
 * El estado es siempre «enviada»: el seguimiento (en revisión, atendida…) es de
 * la fase 7, y fingirlo aquí sería prometer un proceso que todavía no existe.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  try {
    const db = supabaseAdmin()
    const [sols, props] = await Promise.all([
      db.from('solicitudes_contacto').select(COLUMNAS_CONSULTA_CLIENTE).eq('cliente_uid', perfil.uid).order('creado_en', { ascending: false }).limit(100),
      db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(1000),
    ])
    for (const r of [sols, props]) if (r.error) throw r.error

    const consultas = consultasVista(
      ((sols.data ?? []) as unknown as FilaConsultaCliente[]).map(aConsultaCliente),
      (props.data ?? []) as FilaPropiedadPortal[],
    )
    return NextResponse.json({ consultas })
  } catch (e) {
    console.error('[portal] consultas', e)
    return NextResponse.json({ error: 'No se pudieron cargar tus consultas.' }, { status: 500 })
  }
}
