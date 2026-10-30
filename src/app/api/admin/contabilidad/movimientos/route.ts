import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { prepararMovimiento, responderError, responderResultado } from '@/lib/contabilidad-servidor'

/**
 * POST /api/admin/contabilidad/movimientos — registra un gasto, un ingreso extra, una devolución o una anulación (migración 48). SOLO Super Admin
 * (`contabilidad.registrar`). El libro solo se agrega: no hay PATCH ni DELETE; un error se corrige con una anulación y una devolución es otro movimiento.
 *
 *   { clase: 'gasto' | 'ingreso_extra' | 'devolucion' | 'anulacion', monto_pesos, fecha, concepto, referencia?, clave_idempotencia,
 *     gasto: { categoria, cuenta_id?, propiedad_id?, operacion_id? }, devolucion / anulacion: { reverso_de, motivo } }
 *
 * El servidor valida y la función SQL decide lo que depende de otros movimientos (cuánto queda por devolver, si ya se anuló, si la cuenta sigue activa) y escribe
 * la bitácora en la misma transacción. Reintentar con la misma clave devuelve el mismo movimiento (200 `repetida`), nunca uno doble.
 * La bitácora guarda cifras y vínculos, nunca el texto libre del concepto o del motivo (puede traer datos de personas).
 */

export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const cuerpo = await req.json().catch(() => ({}))
  const p = prepararMovimiento(cuerpo && typeof cuerpo === 'object' ? cuerpo : {}, perfil.email || perfil.uid)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status })
  const d = p.datos

  const { data, error } = await supabaseAdmin().rpc('contab_movimiento_registrar', {
    p_datos: d,
    p_audit: {
      actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: `contabilidad.${d.clase}`,
      antes: {},
      despues: { clase: d.clase, fecha: d.fecha, monto_centavos: d.monto_centavos, categoria: d.categoria, cuenta_id: d.cuenta_id ?? null, propiedad_id: d.propiedad_id ?? null, operacion_id: d.operacion_id ?? null, reverso_de: d.reverso_de ?? null },
    },
  })
  if (error) return responderError(error.message)
  return responderResultado(data)
}
