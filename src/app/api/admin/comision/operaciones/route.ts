import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir } from '@/lib/auth-server'
import { leerFlags } from '@/lib/config/flags-servidor'
import { frenarAsync, TOPES } from '@/lib/limites'
import { prepararOperacion } from '@/lib/comision-operaciones-servidor'

/**
 * /api/admin/comision/operaciones — operaciones de comisión (migración 43). SOLO el equipo. No mueve dinero.
 *
 *  GET  → { operaciones } (las 500 más recientes; `?propiedad_id=` filtra).
 *  POST → registra una operación cerrada: { propiedad_id, tipo: 'venta'|'renta', base_pesos, fecha_cierre, atribuible, atribucion_ref, clave_idempotencia }
 *         y, si el trato real se separa de la regla, sus AJUSTES: { comision_pct, renta_meses, comparte, colaborador_pct, gastos: [{concepto, monto_pesos}], ajuste_motivo }.
 *         El servidor calcula con la regla versionada y decide el reparto; el navegador no manda importes.
 *
 * Con el módulo `commissionEngine` apagado no se registra nada (409 `motor_apagado`). Sin la migración: 503 y no cambia nada. Reintentar con
 * la misma clave devuelve la misma operación (200 `repetida`), nunca una segunda comisión.
 */

const NO_DISPONIBLE = () => NextResponse.json({ error: 'Las operaciones de comisión todavía no están disponibles.', codigo: 'no_disponible' }, { status: 503 })
const COLUMNAS = 'id, propiedad_id, tipo, base_centavos, regla_version, total_centavos, vivebien_centavos, colaborador_centavos, colaborador_retenido_centavos, retencion, reparto_estado, atribuible, atribucion_ref, estado, creado_por, creado_en, estado_por, estado_en, estado_motivo, fecha_cierre, propiedad_folio, propiedad_titulo, precio_lista_centavos, comision_bp, renta_meses_cent, colaborador_bp, ajuste_motivo, gastos'

export async function GET(req: Request) {
  const auth = await exigir(req, 'propiedad.moderar')
  if (auth.error) return auth.error
  const propiedad = new URL(req.url).searchParams.get('propiedad_id')
  let q = supabaseAdmin().from('comision_operaciones').select(COLUMNAS).order('creado_en', { ascending: false }).limit(500)
  if (propiedad) q = q.eq('propiedad_id', propiedad)
  const r = await q
  if (r.error) return NO_DISPONIBLE()
  return NextResponse.json({ operaciones: r.data ?? [] })
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'propiedad.moderar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`comision-op:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  if (!(await leerFlags()).commissionEngine) return NextResponse.json({ error: 'El motor de comisiones está apagado.', codigo: 'motor_apagado' }, { status: 409 })

  const cuerpo = await req.json().catch(() => ({}))
  const quien = perfil.email || perfil.uid
  const p = await prepararOperacion(cuerpo && typeof cuerpo === 'object' ? cuerpo : {}, quien)
  if (!p.ok) return NextResponse.json({ error: p.error, codigo: p.codigo }, { status: p.status })

  const { data, error } = await supabaseAdmin().rpc('comision_operacion_registrar', {
    p_datos: p.datos,
    p_audit: {
      actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.rol, accion: 'comision.operacion_registrada',
      antes: {},
      despues: { propiedad_id: p.datos.propiedad_id, tipo: p.datos.tipo, regla: p.datos.regla_version, total_centavos: p.datos.total_centavos, reparto_estado: p.datos.reparto_estado, fecha_cierre: p.datos.fecha_cierre, comision_bp: p.datos.comision_bp, renta_meses_cent: p.datos.renta_meses_cent, colaborador_bp: p.datos.colaborador_bp, gastos: (p.datos.gastos as unknown[]).length, ajuste_motivo: p.datos.ajuste_motivo ? '[motivo]' : null },
    },
  })
  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) return NO_DISPONIBLE()
    if (/cambio_invalido|auditoria_incompleta/.test(error.message)) return NextResponse.json({ error: 'Los datos de la operación no son válidos.' }, { status: 400 })
    return NextResponse.json({ error: 'No se pudo registrar la operación.' }, { status: 500 })
  }
  const r = data as { resultado?: string; id?: string } | null
  if (r?.resultado === 'ok') return NextResponse.json({ ok: true, id: r.id, calculo: p.calculo }, { status: 201 })
  if (r?.resultado === 'repetida') return NextResponse.json({ ok: true, id: r.id, repetida: true, calculo: p.calculo })
  if (r?.resultado === 'clave_en_uso') return NextResponse.json({ error: 'Esa clave ya se usó con otros datos. Usa una clave nueva si es otra operación.', codigo: 'clave_en_uso' }, { status: 409 })
  if (r?.resultado === 'no_existe') return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })
  return NextResponse.json({ error: 'No se pudo registrar la operación.' }, { status: 500 })
}
