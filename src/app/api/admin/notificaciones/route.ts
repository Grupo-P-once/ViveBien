import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'
import { construirNotificaciones, type Aviso } from '@/lib/admin/notificaciones'
import { nombreDe } from '@/lib/propiedad-publica'

/**
 * GET  /api/admin/notificaciones — la campana del panel. Sólo admin.
 * POST /api/admin/notificaciones — marca todo como leído para quien llama.
 *
 * La fecha de lectura es de cada administrador (`usuarios.notificaciones_vistas_en`):
 * lo que lee uno no se le marca como leído al otro.
 */

export const dynamic = 'force-dynamic'

const DIAS_HISTORIA = 30

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const db = supabaseAdmin()
  const desde = new Date(Date.now() - DIAS_HISTORIA * 86_400_000).toISOString()

  const [yo, porRevisar, leads, solicitudes, contactos, cuentas, invitaciones] = await Promise.all([
    db.from('usuarios').select('notificaciones_vistas_en').eq('uid', perfil.uid).maybeSingle(),
    db.from('propiedades').select('id, titulo, tipo, operacion, enviada_en, created_at').eq('estado_pub', 'en_revision'),
    db.from('leads').select('id, nombre, interes, created_at').gte('created_at', desde).order('created_at', { ascending: false }).limit(20),
    db.from('solicitudes_contacto').select('id, nombre, tipo, propiedad_titulo, creado_en').gte('creado_en', desde).order('creado_en', { ascending: false }).limit(20),
    db.from('contactos').select('id, nombre, created_at').gte('created_at', desde).order('created_at', { ascending: false }).limit(20),
    db.from('usuarios').select('uid, nombre, email, creado_en').gte('creado_en', desde).order('creado_en', { ascending: false }).limit(20),
    db.from('invitaciones').select('id, email, rol, aceptada_en').gte('aceptada_en', desde).order('aceptada_en', { ascending: false }).limit(20),
  ])

  const registros: Aviso[] = [
    ...(leads.data ?? []).map((l) => ({
      id: `lead-${l.id}`, titulo: `Nuevo registro: ${texto(l.nombre) ?? 'sin nombre'}`, detalle: texto(l.interes), fecha: l.created_at as string,
    })),
    ...(solicitudes.data ?? []).map((s) => ({
      id: `solicitud-${s.id}`,
      titulo: `${s.tipo === 'visita' ? 'Pidió una visita' : 'Pidió información'}: ${texto(s.nombre) ?? 'sin nombre'}`,
      detalle: texto(s.propiedad_titulo),
      fecha: s.creado_en as string,
    })),
    ...(contactos.data ?? []).map((c) => ({
      id: `contacto-${c.id}`, titulo: `Mensaje de contacto: ${texto(c.nombre) ?? 'sin nombre'}`, detalle: null, fecha: c.created_at as string,
    })),
  ]

  const resultado = construirNotificaciones(
    {
      porRevisar: (porRevisar.data ?? []).map((p) => ({
        id: p.id as string,
        titulo: `Por revisar: ${nombreDe(p)}`,
        detalle: null,
        fecha: (p.enviada_en ?? p.created_at) as string,
      })),
      registros,
      cuentas: (cuentas.data ?? [])
        // La cuenta de quien mira no es una novedad para él.
        .filter((u) => u.uid !== perfil.uid)
        .map((u) => ({
          id: u.uid as string,
          titulo: `Nueva cuenta: ${texto(u.nombre) ?? texto(u.email) ?? 'sin nombre'}`,
          detalle: texto(u.nombre) ? texto(u.email) : null,
          fecha: u.creado_en as string,
        })),
      invitacionesAceptadas: (invitaciones.data ?? []).map((i) => ({
        id: String(i.id), titulo: `Aceptó la invitación: ${i.email}`, detalle: null, fecha: i.aceptada_en as string,
      })),
    },
    (yo.data?.notificaciones_vistas_en as string | null | undefined) ?? null,
    new Date(),
  )

  return NextResponse.json(resultado)
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const vistasEn = new Date().toISOString()
  const { error } = await supabaseAdmin()
    .from('usuarios')
    .update({ notificaciones_vistas_en: vistasEn })
    .eq('uid', auth.perfil.uid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, vistasEn })
}
