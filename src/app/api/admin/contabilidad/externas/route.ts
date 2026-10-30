import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { responderError, responderResultado } from '@/lib/contabilidad-servidor'

import { prepararExterna } from '@/lib/contabilidad-externas'
import { fechaLocalISO } from '@/lib/contabilidad'
/**
 * POST /api/admin/contabilidad/externas — registra una comisión EXTERNA: un trato que NO viene de una propiedad del sitio (un cliente pidió algo, VIVE BIEN lo consiguió con un tercero y
 * se lleva solo su parte). SOLO Super Admin (`contabilidad.registrar`). Migración 55.
 *   { fecha, descripcion, tipo: 'venta'|'renta'|'otro', parte_pesos, total_pesos?, porcentaje?, colaborador_id?, contraparte?, cobrada?, cobrada_en?, metodo_cobro?, referencia?, adjunto?, clave_idempotencia }
 * La lectura sale en el libro (`/api/admin/contabilidad/libro`). Reintentar con la misma clave devuelve la misma comisión. No guarda el nombre del cliente: solo una descripción.
 */
export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  const cuerpo = await req.json().catch(() => ({}))
  const p = prepararExterna(cuerpo && typeof cuerpo === 'object' ? cuerpo : {}, perfil.email || perfil.uid, fechaLocalISO())
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status })
  const d = p.datos
  const { data, error } = await supabaseAdmin().rpc('comision_externa_registrar', {
    p_datos: d,
    p_audit: {
      actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol, accion: 'contabilidad.externa_registrada', antes: {},
      despues: { tipo: d.tipo, fecha: d.fecha, parte_centavos: d.parte_centavos, total_centavos: d.total_centavos ?? null, cobrada: d.cobrada === true, con_colaborador: Boolean(d.colaborador_id), con_adjunto: Boolean(d.adjunto) },
    },
  })
  if (error) return responderError(error.message)
  return responderResultado(data)
}
