import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { leerNotas, NO_DISPONIBLE, prepararNota, responderError, responderResultado } from '@/lib/contabilidad-servidor'
import { FUENTES_DEL_CONOCIMIENTO, VERSION_DEL_CONOCIMIENTO, vigenciaDelConocimiento } from '@/lib/contabilidad-conocimiento'

/**
 * /api/admin/contabilidad/conocimiento — las notas del contador y la vigencia de la base del asesor (migración 49). SOLO Super Admin.
 *
 *  GET  (`contabilidad.ver`)       → { notas, vigencia, version, fuentes }: todas las notas (vigentes y retiradas) y qué tan al día está la base.
 *  POST (`contabilidad.registrar`) → agrega una nota: { titulo, tema, texto, vigente_desde?, clave_idempotencia }. No se edita ni se borra; se retira en `[id]`.
 *
 * Una nota es información que se le da al asesor: puede contradecir la base y entonces prevalece. Por eso solo la escribe el Super Admin, no admite correos ni teléfonos,
 * y la bitácora guarda su título y tema pero no su texto.
 */

export async function GET(req: Request) {
  const auth = await exigir(req, 'contabilidad.ver')
  if (auth.error) return auth.error
  const notas = await leerNotas(supabaseAdmin())
  if (notas === null) return NO_DISPONIBLE()
  const hoy = new Date().toISOString().slice(0, 10)
  const masNueva = notas.filter((n) => !n.retirada).map((n) => n.vigente_desde).sort().at(-1) ?? null
  return NextResponse.json({ notas, vigencia: vigenciaDelConocimiento(hoy, masNueva), version: VERSION_DEL_CONOCIMIENTO, fuentes: FUENTES_DEL_CONOCIMIENTO })
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const cuerpo = await req.json().catch(() => ({}))
  const p = prepararNota(cuerpo && typeof cuerpo === 'object' ? cuerpo : {}, perfil.email || perfil.uid)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status })
  const d = p.datos
  const { data, error } = await supabaseAdmin().rpc('contab_nota_registrar', {
    p_datos: d,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.nota_registrada', antes: {}, despues: { titulo: d.titulo, tema: d.tema, vigente_desde: d.vigente_desde ?? null } },
  })
  if (error) return responderError(error.message)
  return responderResultado(data)
}
