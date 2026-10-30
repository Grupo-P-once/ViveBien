import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir, registrarIntentoDenegado } from '@/lib/auth-server'
import { portalCerradoParaEscribir } from '@/lib/portal/exigir-portal'
import { puede } from '@/lib/acceso/permisos'
import { tieneCapacidad } from '@/lib/acceso/capacidades'
import { leerFlags } from '@/lib/config/flags-servidor'
import { registrar } from '@/lib/auditoria'
import { frenarAsync, TOPES } from '@/lib/limites'
import { COMO_FUNCIONA, origenListo, resumenEconomico, sanearOrigenDeclarado } from '@/lib/origen-declarado'
import { estadoAcreditacion, ETIQUETA_ACREDITACION } from '@/lib/comision-acreditacion'
import { MENSAJE_COMISION_NO_DISPONIBLE } from '@/lib/comision-aceptacion'

/**
 * /api/propiedades/[id]/origen — cómo maneja el publicador SU propiedad (trato directo o agente/inmobiliaria), antes de enviarla (migración 43).
 *
 *  GET → { aplica, ... }. `aplica` es falso con el módulo apagado, para el equipo y para quien tiene `sin_comision`: no se pinta nada.
 *  PUT → guarda la declaración. Solo el dueño de la propiedad y solo cuando aplica. Escribe SOLO las columnas de la declaración: no toca la
 *        comisión pactada ni las notas del equipo. Declarar un folio NO lo verifica (solo el equipo, en /api/propiedades/[id]/acreditacion).
 *
 * Falla cerrado: si el módulo está encendido y la tabla o las columnas no existen, 503 y no cambia nada.
 */

const NO_DISPONIBLE = () => NextResponse.json({ error: MENSAJE_COMISION_NO_DISPONIBLE, codigo: 'no_disponible' }, { status: 503 })
const hoy = () => new Date().toISOString().slice(0, 10)

const COLUMNAS = 'origen_tipo, declara_autorizacion, titular_nombre, titular_empresa, titular_telefono, titular_correo, acreditacion_folio, acreditacion_municipio, acreditacion_resultado, acreditacion_vigente_hasta, acreditacion_verificado_por'

async function contexto(req: Request, params: Promise<{ id: string }>, escribe: boolean) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return { error: auth.error } as const
  const { perfil } = auth
  if (escribe) {
    const cerrado = await portalCerradoParaEscribir(perfil)
    if (cerrado) return { error: cerrado } as const
    const frenado = await frenarAsync(`origen:${perfil.uid}`, TOPES.edicion)
    if (frenado) return { error: frenado } as const
  }
  const { id } = await params
  const db = supabaseAdmin()
  const { data: prop, error } = await db.from('propiedades').select('id, owner_id').eq('id', id).maybeSingle()
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) } as const
  if (!prop) return { error: NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 }) } as const
  const esEquipo = puede(perfil, 'propiedad.gestionar_todas')
  const esDueno = Boolean(prop.owner_id) && prop.owner_id === perfil.uid
  if (!esEquipo && !esDueno) {
    await registrarIntentoDenegado(perfil, req, `propiedad.origen_ajena:${id}`)
    return { error: NextResponse.json({ error: 'Esa propiedad no es tuya.' }, { status: 403 }) } as const
  }
  const flags = await leerFlags()
  const aplica = flags.commissionEngine && !puede(perfil, 'propiedad.moderar') && !tieneCapacidad(perfil, 'sin_comision')
  return { perfil, db, id, esDueno, aplica } as const
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contexto(req, params, false)
  if (c.error) return c.error
  if (!c.aplica) return NextResponse.json({ aplica: false })
  const o = await c.db.from('propiedad_origen').select(COLUMNAS).eq('propiedad_id', c.id).maybeSingle()
  if (o.error) return NO_DISPONIBLE()
  const f = o.data
  const estado = estadoAcreditacion(f && f.acreditacion_folio
    ? { folio: f.acreditacion_folio, resultado: (f.acreditacion_resultado as 'coincide' | 'no_coincide' | null) ?? null, vigenteHasta: f.acreditacion_vigente_hasta ?? null, verificadoPor: f.acreditacion_verificado_por ?? null }
    : null, hoy())
  const resumen = resumenEconomico()
  // Lo que la persona ya dio en su perfil no se le pide dos veces: se ofrece como punto de partida (puede cambiarlo si vende otra persona).
  let prefill = { nombre: c.perfil.nombre ?? '', telefono: '', correo: c.perfil.email ?? '' }
  if (!f || f.origen_tipo !== 'trato_directo') {
    const u = await c.db.from('usuarios').select('telefono').eq('uid', c.perfil.uid).maybeSingle()
    if (!u.error && typeof u.data?.telefono === 'string') prefill = { ...prefill, telefono: u.data.telefono }
  }
  return NextResponse.json({
    aplica: true,
    listo: origenListo(f),
    opcion: !f ? null : f.origen_tipo === 'trato_directo' ? 'trato_directo' : 'agente',
    valores: {
      declara_autorizacion: f?.declara_autorizacion ?? false,
      agente_nombre: f?.origen_tipo === 'trato_directo' ? '' : f?.titular_nombre ?? '',
      inmobiliaria: f?.origen_tipo === 'trato_directo' ? '' : f?.titular_empresa ?? '',
      folio: f?.acreditacion_folio ?? '',
      municipio: f?.acreditacion_municipio ?? '',
      nombre_completo: f?.origen_tipo === 'trato_directo' ? f.titular_nombre ?? '' : '',
      telefono: f?.origen_tipo === 'trato_directo' ? f.titular_telefono ?? '' : '',
      correo: f?.origen_tipo === 'trato_directo' ? f.titular_correo ?? '' : '',
    },
    prefill,
    acreditacion: f?.acreditacion_folio !== undefined && f?.origen_tipo !== 'trato_directo' ? { estado, etiqueta: ETIQUETA_ACREDITACION[estado] } : null,
    comoFunciona: COMO_FUNCIONA,
    resumen,
  })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contexto(req, params, true)
  if (c.error) return c.error
  const { perfil, db, id } = c
  if (!c.aplica) return NextResponse.json({ error: 'Por ahora no hace falta declarar el origen de esta propiedad.', codigo: 'no_aplica' }, { status: 409 })
  if (!c.esDueno) return NextResponse.json({ error: 'Solo quien subió la propiedad declara su origen.' }, { status: 403 })

  const r = sanearOrigenDeclarado(await req.json().catch(() => ({})))
  if (!r.ok) return NextResponse.json({ error: r.errores[0], errores: r.errores }, { status: 400 })

  const previo = await db.from('propiedad_origen').select('origen_tipo, acreditacion_folio').eq('propiedad_id', id).maybeSingle()
  if (previo.error) return NO_DISPONIBLE()

  const quien = perfil.email || perfil.uid
  const d = r.datos
  // Trato directo guarda el nombre completo, el teléfono y el correo de quien es dueño (o lo representa) en los campos del titular; agente
  // guarda los suyos y limpia el teléfono y el correo del titular para no mezclar los datos de una persona con los de otra.
  const campos = d.origen_tipo === 'trato_directo'
    ? { origen_tipo: d.origen_tipo, declara_autorizacion: true, titular_nombre: d.titular_nombre, titular_empresa: null, titular_telefono: d.titular_telefono, titular_correo: d.titular_correo, acreditacion_folio: null, acreditacion_municipio: null }
    : { origen_tipo: d.origen_tipo, declara_autorizacion: null, titular_nombre: d.titular_nombre, titular_empresa: d.titular_empresa, titular_telefono: null, titular_correo: null, acreditacion_folio: d.acreditacion_folio, acreditacion_municipio: d.acreditacion_municipio }
  const folioPrevio = previo.data?.acreditacion_folio ?? null
  const aporto = d.acreditacion_folio === folioPrevio ? {} : { acreditacion_aporto_por: d.acreditacion_folio ? quien : null }
  const cambios = { ...campos, ...aporto, actualizado_por: quien, actualizado_en: new Date().toISOString() }

  const w = previo.data
    ? await db.from('propiedad_origen').update(cambios).eq('propiedad_id', id).select('propiedad_id').maybeSingle()
    : await db.from('propiedad_origen').insert({ propiedad_id: id, ...cambios, creado_por: quien }).select('propiedad_id').maybeSingle()
  if (w.error) return NO_DISPONIBLE()

  // Bitácora sin datos personales: solo la opción y si aportó folio.
  await registrar({
    actor: perfil, accion: 'propiedad.origen_declarado', entidad: 'propiedad', entidadId: id,
    antes: previo.data ? { origen_tipo: previo.data.origen_tipo } : null,
    despues: { origen_tipo: d.origen_tipo, folio_aportado: Boolean(d.acreditacion_folio) },
  })
  // Nota interna automática, sin nombres ni folio (esos están en el origen).
  await db.from('propiedad_notas').insert({
    propiedad_id: id, autor_uid: perfil.uid, autor_rol: 'publicador',
    texto: d.origen_tipo === 'trato_directo'
      ? 'Origen declarado por el publicador: trato directo (declara ser propietario/a o representante autorizado/a). Capturó nombre completo, teléfono y correo del titular: están en «Origen».'
      : `Origen declarado por el publicador: agente inmobiliario/a o inmobiliaria. Folio de acreditación aportado: ${d.acreditacion_folio ? 'sí' : 'no'}. Pendiente de verificación por el equipo.`,
  })
  return NextResponse.json({ ok: true, listo: true })
}
