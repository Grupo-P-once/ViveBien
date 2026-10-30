import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir, registrarIntentoDenegado } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { estadoAcreditacion, ETIQUETA_ACREDITACION, puedeVerificar } from '@/lib/comision-acreditacion'

/**
 * /api/propiedades/[id]/acreditacion — revisión de la acreditación de un agente inmobiliario (migración 43). SOLO el equipo.
 *
 *  GET  → { folio, municipio, aportoPor, estado, etiqueta, verificadoPor, verificadoEn, vigenteHasta, motivo }
 *  POST → { folio, resultado: 'coincide' | 'no_coincide', vigente_hasta, motivo }: registra lo que el equipo comprobó en el padrón oficial.
 *
 * El cambio y su bitácora son una sola transacción (`origen_verificar_acreditacion`); `folio` es el que vio quien revisa (si cambió, 409);
 * quien aportó el folio no lo verifica y nadie verifica una propiedad suya. Sin la migración: 503 y no cambia nada.
 */

const NO_DISPONIBLE = () => NextResponse.json({ error: 'La verificación de acreditación todavía no está disponible.', codigo: 'no_disponible' }, { status: 503 })
const hoy = () => new Date().toISOString().slice(0, 10)
const COLUMNAS = 'acreditacion_folio, acreditacion_municipio, acreditacion_aporto_por, acreditacion_resultado, acreditacion_vigente_hasta, acreditacion_verificado_por, acreditacion_verificado_en, acreditacion_motivo'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'propiedad.moderar')
  if (auth.error) return auth.error
  const { id } = await params
  const o = await supabaseAdmin().from('propiedad_origen').select(COLUMNAS).eq('propiedad_id', id).maybeSingle()
  if (o.error) return NO_DISPONIBLE()
  const f = o.data
  const estado = estadoAcreditacion(f && f.acreditacion_folio
    ? { folio: f.acreditacion_folio, resultado: (f.acreditacion_resultado as 'coincide' | 'no_coincide' | null) ?? null, vigenteHasta: f.acreditacion_vigente_hasta ?? null, verificadoPor: f.acreditacion_verificado_por ?? null }
    : null, hoy())
  return NextResponse.json({
    folio: f?.acreditacion_folio ?? null, municipio: f?.acreditacion_municipio ?? null, aportoPor: f?.acreditacion_aporto_por ?? null,
    estado, etiqueta: ETIQUETA_ACREDITACION[estado], verificadoPor: f?.acreditacion_verificado_por ?? null, verificadoEn: f?.acreditacion_verificado_en ?? null,
    vigenteHasta: f?.acreditacion_vigente_hasta ?? null, motivo: f?.acreditacion_motivo ?? null,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigir(req, 'propiedad.moderar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`acreditacion:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado
  const { id } = await params
  const db = supabaseAdmin()

  const c = (await req.json().catch(() => ({}))) as { folio?: unknown; resultado?: unknown; vigente_hasta?: unknown; motivo?: unknown }
  const motivo = typeof c.motivo === 'string' ? c.motivo.trim() : ''
  if (motivo.length < 10 || motivo.length > 500) return NextResponse.json({ error: 'Escribe el motivo de la revisión (de 10 a 500 caracteres).' }, { status: 400 })
  if (c.resultado !== 'coincide' && c.resultado !== 'no_coincide') return NextResponse.json({ error: 'Indica si el folio coincide o no con el padrón.' }, { status: 400 })
  const hasta = typeof c.vigente_hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.vigente_hasta) ? c.vigente_hasta : null
  if (c.resultado === 'coincide' && !hasta) return NextResponse.json({ error: 'Indica hasta cuándo es vigente la acreditación según el padrón.' }, { status: 400 })
  if (typeof c.folio !== 'string' || !c.folio) return NextResponse.json({ error: 'Falta el folio que revisaste.' }, { status: 400 })

  const p = await db.from('propiedades').select('owner_id').eq('id', id).maybeSingle()
  if (p.error) return NextResponse.json({ error: p.error.message }, { status: 500 })
  if (!p.data) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })
  if (!puedeVerificar({ actorUid: perfil.uid, esEquipo: true, duenoUid: p.data.owner_id })) {
    await registrarIntentoDenegado(perfil, req, `propiedad.acreditacion_propia:${id}`)
    return NextResponse.json({ error: 'No puedes verificar la acreditación de una propiedad tuya.', codigo: 'autoaprobacion' }, { status: 403 })
  }

  const { data, error } = await db.rpc('origen_verificar_acreditacion', {
    p_propiedad_id: id, p_antes_folio: c.folio, p_resultado: c.resultado, p_vigente_hasta: c.resultado === 'coincide' ? hasta : null,
    p_audit: {
      actor_uid: perfil.uid, actor_email: perfil.email, actor_rol: perfil.rol, accion: 'propiedad.acreditacion_verificada',
      antes: {}, despues: { resultado: c.resultado, vigente_hasta: c.resultado === 'coincide' ? hasta : null, motivo },
    },
  })
  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) return NO_DISPONIBLE()
    if (/auditoria_incompleta|cambio_invalido/.test(error.message)) return NextResponse.json({ error: 'Los datos de la revisión no son válidos.' }, { status: 400 })
    return NextResponse.json({ error: 'No se pudo registrar la revisión.' }, { status: 500 })
  }
  const resultado = (data as { resultado?: string } | null)?.resultado
  if (resultado === 'ok') return NextResponse.json({ ok: true })
  if (resultado === 'no_existe') return NextResponse.json({ error: 'Esta propiedad no tiene origen registrado.' }, { status: 404 })
  if (resultado === 'sin_folio') return NextResponse.json({ error: 'Esta propiedad no tiene folio de acreditación que revisar.', codigo: 'sin_folio' }, { status: 409 })
  if (resultado === 'conflicto') return NextResponse.json({ error: 'El folio cambió mientras lo revisabas. Recarga y vuelve a comprobarlo.', codigo: 'conflicto' }, { status: 409 })
  if (resultado === 'autoaprobacion') return NextResponse.json({ error: 'Quien aportó el folio no puede verificarlo.', codigo: 'autoaprobacion' }, { status: 403 })
  return NextResponse.json({ error: 'No se pudo registrar la revisión.' }, { status: 500 })
}
