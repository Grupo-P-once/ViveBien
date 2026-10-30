import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'
import { construirActividad, type FuentesActividad } from '@/lib/admin/actividad'

/**
 * GET /api/admin/actividad?limite=20 — lo último que pasó en el sitio. Sólo admin.
 *
 * Se reconstruye de las fechas que cada tabla ya guarda (ver
 * `lib/admin/actividad.ts`). De cada fuente se piden sólo las filas más
 * recientes: para enseñar las 20 últimas no hace falta leer todo el histórico.
 */

export const dynamic = 'force-dynamic'

const POR_FUENTE = 60

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const pedido = Number(url.searchParams.get('limite'))
  const limite = Number.isFinite(pedido) ? Math.min(100, Math.max(1, Math.round(pedido))) : 20

  // Los cambios de módulos son cosa de Super Admin: un admin normal no los ve en el feed.
  const acciones = ['usuario.editar', 'propiedad.crear', 'propiedad.borrar', ...(auth.perfil.superAdmin ? ['configuracion.flag'] : [])]
  const db = supabaseAdmin()
  const [leads, solicitudes, contactos, usuarios, propiedades, auditoria, invitaciones] = await Promise.all([
    db.from('leads').select('id, nombre, interes, created_at').order('created_at', { ascending: false }).limit(POR_FUENTE),
    db.from('solicitudes_contacto').select('id, nombre, tipo, propiedad_titulo, creado_en').order('creado_en', { ascending: false }).limit(POR_FUENTE),
    db.from('contactos').select('id, nombre, created_at').order('created_at', { ascending: false }).limit(POR_FUENTE),
    db.from('usuarios').select('uid, nombre, email, creado_en').order('creado_en', { ascending: false }).limit(500),
    db.from('propiedades').select('id, titulo, tipo, operacion, folio, estado_pub, publicada_en, enviada_en'),
    db.from('audit_logs')
      .select('id, accion, entidad_id, antes, despues, creado_en')
      .in('accion', acciones)
      .order('creado_en', { ascending: false })
      .limit(POR_FUENTE),
    db.from('invitaciones').select('id, email, rol, creado_en, aceptada_en').order('creado_en', { ascending: false }).limit(POR_FUENTE),
  ])

  const faltan = [
    leads.error && 'leads', solicitudes.error && 'solicitudes_contacto', contactos.error && 'contactos',
    usuarios.error && 'usuarios', propiedades.error && 'propiedades', auditoria.error && 'audit_logs',
    invitaciones.error && 'invitaciones',
  ].filter((x): x is string => Boolean(x))
  if (faltan.length) console.error('[admin/actividad] no contestaron:', faltan.join(', '))

  const fuentes = {
    leads: leads.data ?? [],
    solicitudes: solicitudes.data ?? [],
    contactos: contactos.data ?? [],
    usuarios: usuarios.data ?? [],
    propiedades: propiedades.data ?? [],
    auditoria: auditoria.data ?? [],
    invitaciones: invitaciones.data ?? [],
  } as FuentesActividad

  return NextResponse.json({ items: construirActividad(fuentes, limite), faltan })
}
