import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { prepararCuenta, responderError, responderResultado } from '@/lib/contabilidad-servidor'

/**
 * POST /api/admin/contabilidad/cuentas — da de alta un lugar de gasto («Meta Ads · cuenta 33839», «Lonas El Juanito»). SOLO Super Admin (`contabilidad.registrar`).
 *   { nombre, categoria, identificador?, notas? }
 * Repetir el mismo nombre con el mismo identificador devuelve la cuenta que ya existe (200 `ya_existe`). Las cuentas no se borran: se desactivan (PATCH en `[id]`).
 */

export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const cuerpo = await req.json().catch(() => ({}))
  const p = prepararCuenta(cuerpo && typeof cuerpo === 'object' ? cuerpo : {}, perfil.email || perfil.uid)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status })
  const d = p.datos

  const { data, error } = await supabaseAdmin().rpc('contab_cuenta_registrar', {
    p_datos: d,
    p_audit: { actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.cuenta_creada', antes: {}, despues: { nombre: d.nombre, categoria: d.categoria, identificador: d.identificador ?? null } },
  })
  if (error) return responderError(error.message)
  return responderResultado(data)
}
