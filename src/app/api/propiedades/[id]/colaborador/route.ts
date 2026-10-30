import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { frenarAsync, TOPES } from '@/lib/limites'

/**
 * PUT /api/propiedades/[id]/colaborador — liga (o quita) el asesor o inmobiliaria que colaboró con una propiedad (migración 57). SOLO el equipo (`propiedad.gestionar_todas`):
 * el dueño publicador no ve ni elige colaboradores. Cuerpo: `{ colaborador_id: uuid | null }`; solo se acepta uno que EXISTA en el directorio y esté ACTIVO (el navegador no inventa ids).
 * Necesita que la propiedad ya tenga su origen guardado (la columna vive ahí). Falla cerrado si la migración 57 no está aplicada (503, sin cambiar nada).
 * La bitácora lleva solo ids (nunca nombre, teléfono ni correo del colaborador).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const columnaAusente = (e: { code?: string; message?: string } | null | undefined) => Boolean(e && (e.code === '42703' || /colaborador_id|schema cache|column/i.test(e.message ?? '')))

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'propiedad.gestionar_todas')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`interno:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  const { id } = await params
  const cuerpo = (await req.json().catch(() => ({}))) as { colaborador_id?: unknown }
  const destino = cuerpo.colaborador_id
  if (destino !== null && (typeof destino !== 'string' || !UUID.test(destino))) return NextResponse.json({ error: 'Elige un colaborador del directorio.' }, { status: 400 })

  const db = supabaseAdmin()
  const origen = await db.from('propiedad_origen').select('propiedad_id, colaborador_id').eq('propiedad_id', id).maybeSingle()
  if (origen.error) return columnaAusente(origen.error) ? NextResponse.json({ error: 'El colaborador de la propiedad todavía no está disponible.', codigo: 'no_disponible' }, { status: 503 }) : NextResponse.json({ error: origen.error.message }, { status: 500 })
  if (!origen.data) return NextResponse.json({ error: 'Primero guarda de quién es la propiedad (origen); después podrás ligar al colaborador.', codigo: 'sin_origen' }, { status: 409 })

  if (destino !== null) {
    const c = await db.from('colaboradores').select('id, activo').eq('id', destino).maybeSingle()
    if (c.error) return NextResponse.json({ error: 'El directorio de colaboradores todavía no está disponible.', codigo: 'no_disponible' }, { status: 503 })
    if (!c.data) return NextResponse.json({ error: 'Ese colaborador no existe en el directorio.' }, { status: 404 })
    if (!(c.data as { activo: boolean }).activo) return NextResponse.json({ error: 'Ese colaborador está desactivado: actívalo en el directorio para usarlo.' }, { status: 409 })
  }

  const antes = (origen.data as { colaborador_id: string | null }).colaborador_id ?? null
  const w = await db.from('propiedad_origen').update({ colaborador_id: destino, actualizado_por: perfil.email || perfil.uid, actualizado_en: new Date().toISOString() }).eq('propiedad_id', id).select('propiedad_id').maybeSingle()
  if (w.error) return columnaAusente(w.error) ? NextResponse.json({ error: 'El colaborador de la propiedad todavía no está disponible.', codigo: 'no_disponible' }, { status: 503 }) : NextResponse.json({ error: w.error.message }, { status: 500 })
  await registrar({ actor: perfil, accion: 'propiedad.colaborador_ligado', entidad: 'propiedad', entidadId: id, antes: { colaborador_id: antes }, despues: { colaborador_id: destino } })
  return NextResponse.json({ ok: true })
}
