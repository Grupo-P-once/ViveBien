import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { NO_DISPONIBLE, responderError, responderResultado } from '@/lib/contabilidad-servidor'

import { prepararColaborador } from '@/lib/contabilidad-externas'
/**
 * /api/admin/contabilidad/colaboradores — el directorio de asesores e inmobiliarias con los que se colabora (migración 55). SOLO Super Admin.
 *  GET  (`contabilidad.ver`)       → { colaboradores }: con teléfono y correo (datos personales: nunca viajan en el libro, en la bitácora ni al asesor de IA). `no-store`.
 *  POST (`contabilidad.registrar`) → { tipo, nombre, empresa?, telefono?, correo?, municipio?, folio_acreditacion?, notas? }. El folio de acreditación es OPCIONAL (decisión del dueño).
 * Repetir el mismo nombre y empresa devuelve el que ya existe (200 `ya_existe`). No se borran: se desactivan (PATCH en `[id]`).
 */
const PRIVADO = { 'Cache-Control': 'private, no-store' }
const COLUMNAS = 'id, tipo, nombre, empresa, telefono, correo, municipio, folio_acreditacion, notas, activo, creado_en'

export async function GET(req: Request) {
  const auth = await exigir(req, 'contabilidad.ver')
  if (auth.error) return auth.error
  const r = await supabaseAdmin().from('colaboradores').select(COLUMNAS).order('nombre', { ascending: true }).limit(1000)
  if (r.error) return NO_DISPONIBLE()
  return NextResponse.json({ colaboradores: r.data ?? [] }, { headers: PRIVADO })
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  const cuerpo = await req.json().catch(() => ({}))
  const p = prepararColaborador(cuerpo && typeof cuerpo === 'object' ? cuerpo : {}, perfil.email || perfil.uid)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status })
  const d = p.datos
  // La bitácora lleva solo quién es (tipo y nombre): ni teléfono ni correo.
  const { data, error } = await supabaseAdmin().rpc('contab_colaborador_registrar', {
    p_datos: d,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.colaborador_creado', antes: {}, despues: { tipo: d.tipo, nombre: d.nombre, con_folio: Boolean(d.folio_acreditacion) } },
  })
  if (error) return responderError(error.message)
  return responderResultado(data)
}
