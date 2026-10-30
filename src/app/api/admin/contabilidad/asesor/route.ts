import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync } from '@/lib/limites'
import { construirLineas, ETIQUETA_PERIODO, rangoDePeriodo, resumenParaIA, type CuentaDeGasto, type ExternaContable, type MovimientoContable, type Periodo } from '@/lib/contabilidad'
import type { OperacionComision } from '@/lib/comision-resumen'
import { calcularDesdeEntrada, ESCALAS, PCT_COLABORADOR_REGLA, PCT_VENTA_REGLA, MESES_RENTA_REGLA, type EntradaCalculadora } from '@/lib/comision-formulario'
import { construirPanorama, panoramaParaIA } from '@/lib/contabilidad-panorama'
import { contextoDeConsulta, leerLibro, NO_DISPONIBLE, type Libro } from '@/lib/contabilidad-servidor'
import { estadoDelAsesor, iaConfigurada, limpiarHistorial, limpiarPregunta, pedirAnalisis, pedirRelleno, probarConexion, type CodigoDeError } from '@/lib/contabilidad-ia'
import { extraerJson, interpretarRelleno, resumenDeRelleno, sistemaDeRelleno, type ContextoDeRelleno } from '@/lib/contabilidad-relleno'

/**
 * POST /api/admin/contabilidad/asesor — el asesor de IA de las comisiones y de la contabilidad (25-oct-2026). SOLO Super Admin (`contabilidad.ver`).
 *
 *  { modo: 'periodo', periodo: 'mes' | 'tres_meses' | 'doce_meses' | 'todo', pregunta?: string }
 *      → analiza lo que entra y lo que sale del periodo, o responde una pregunta con esas cifras.
 *  { modo: 'panorama', periodo, pregunta?, historial? }
 *      → analiza el PANORAMA de comisiones (por tipo de propiedad, promoción, retorno por peso gastado y las comprobaciones de que los números cuadren).
 *  { modo: 'rellenar', pregunta, hoy? }
 *      → AUTOLLENADO: la IA convierte la instrucción en campos de formulario ({ relleno, resumen, propiedades }). No responde ni guarda; lo guarda la persona con el botón de siempre.
 *  { modo: 'operacion', tipo, base_pesos, comision_pct?, renta_meses?, comparte?, colaborador_pct?, gastos?: [{ concepto, monto_pesos }], pregunta?: string }
 *      → opina sobre una comisión POR CERRAR (la calculadora): si el trato es razonable y qué convendría ajustar. No lee ni guarda nada.
 *  { modo: 'prueba' } → «Probar conexión»: una llamada mínima, sin cifras ni datos de VIVE BIEN → { ok, proveedor, etiqueta, modelo, ms, muestra }
 *  → { texto, modelo, proveedor, generado_en }
 *  GET → cómo está configurado el asesor (proveedor, modelo, qué llaves existen; nunca una llave)
 *
 * En el modo «periodo» el servidor lee el libro él mismo y calcula las cifras con `lib/contabilidad.ts`: el navegador NO manda datos a la IA. En el modo «operacion» el
 * servidor recalcula la comisión con el mismo código de la calculadora y manda solo esas cifras. A la IA nunca llegan correos, teléfonos ni motivos. Escribe texto y nada más.
 * Con tope de uso porque cada llamada cuesta (poco). Sin la llave del AI Gateway responde 503 `ia_no_configurada` y la pantalla sigue con las recomendaciones por reglas.
 */

const TOPE_IA = { maximo: 20, ventanaMs: 60 * 60 * 1000 }
const ESTADO_HTTP: Record<CodigoDeError, number> = { ia_no_configurada: 503, ia_tiempo: 504, ia_limite: 429, ia_clave: 502, ia_saldo: 502, ia_fallo: 502 }

/** GET → cómo está configurado el asesor (proveedor, modelo, qué llaves hay: sí o no). Nunca devuelve una llave. SOLO Super Admin. */
export async function GET(req: Request) {
  const auth = await exigir(req, 'contabilidad.ver')
  if (auth.error) return auth.error
  return NextResponse.json(estadoDelAsesor())
}
const PERIODOS = Object.keys(ETIQUETA_PERIODO) as Periodo[]
const texto = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.ver')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab-ia:${perfil.uid}`, TOPE_IA)
  if (frenado) return frenado
  if (!iaConfigurada()) return NextResponse.json({ error: 'El asesor de IA todavía no está configurado.', codigo: 'ia_no_configurada' }, { status: 503 })

  const c = (await req.json().catch(() => ({}))) as Record<string, unknown>
  // «Probar conexión»: una llamada mínima sin cifras ni datos de VIVE BIEN; sirve justo después de pegar la llave.
  if (c.modo === 'prueba') {
    const p = await probarConexion()
    if (!p.ok) return NextResponse.json({ error: p.error, codigo: p.codigo }, { status: ESTADO_HTTP[p.codigo] })
    return NextResponse.json({ ok: true, proveedor: p.proveedor, etiqueta: p.etiqueta, modelo: p.modelo, ms: p.ms, muestra: p.muestra })
  }
  const pregunta = limpiarPregunta(c.pregunta)
  // Autollenado: la IA solo llena los campos del formulario; no responde ni guarda. Lleva el contexto de captura (cuentas y propiedades que existen), no cifras del negocio.
  if (c.modo === 'rellenar') {
    if (pregunta.length < 3) return NextResponse.json({ error: 'Escribe qué quieres capturar.' }, { status: 400 })
    const db = supabaseAdmin()
    const hoyLocal = new Date().toISOString().slice(0, 10)
    const fechaDeHoy = typeof c.hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.hoy) && Math.abs(Date.parse(c.hoy) - Date.parse(hoyLocal)) <= 2 * 86_400_000 ? c.hoy : hoyLocal
    const libroR = await leerLibro(db)
    if (!libroR) return NO_DISPONIBLE()
    const props = await db.from('propiedades').select('id, folio, titulo, colonia, estatus').neq('estatus', 'eliminada').limit(150)
    const ctx: ContextoDeRelleno = {
      hoy: fechaDeHoy,
      cuentas: (libroR.cuentas as unknown as Array<{ id: string; nombre: string; identificador: string | null; categoria: string; activa: boolean }>).filter((x) => x.activa).map(({ id, nombre, identificador, categoria }) => ({ id, nombre, identificador, categoria })),
      propiedades: ((props.error ? [] : props.data ?? []) as Array<{ id: string; folio: string | null; titulo: string | null; colonia: string | null }>).map((p) => ({ id: p.id, etiqueta: [p.titulo, p.folio, p.colonia].filter(Boolean).join(' · ').slice(0, 90) })),
    }
    const x = await pedirRelleno(sistemaDeRelleno(ctx), pregunta)
    if (!x.ok) return NextResponse.json({ error: x.error, codigo: x.codigo }, { status: ESTADO_HTTP[x.codigo] })
    const relleno = interpretarRelleno(extraerJson(x.texto), ctx)
    if (!relleno) return NextResponse.json({ error: 'No pude sacar datos de eso. Prueba con algo como «gasté 1,500 en lonas ayer con Meta Ads».', codigo: 'sin_datos' }, { status: 422 })
    return NextResponse.json({ relleno, resumen: resumenDeRelleno(relleno, ctx), propiedades: ctx.propiedades.filter((p) => relleno.tipo === 'movimiento' && p.id === relleno.campos.propiedad_id), generado_en: new Date().toISOString() })
  }
  // El chat manda los últimos turnos para que un seguimiento («¿y eso qué recorto primero?») tenga contexto; el servidor los limpia y los recorta.
  const historial = limpiarHistorial(c.historial)

  let datos: unknown
  let libro: Libro | null = null
  const hoy = new Date().toISOString().slice(0, 10)
  let tarea: 'periodo' | 'operacion' | 'panorama' = 'periodo'
  if (c.modo === 'operacion') {
    tarea = 'operacion'
    const tipo = c.tipo === 'renta' ? 'renta' : c.tipo === 'venta' ? 'venta' : null
    if (!tipo) return NextResponse.json({ error: 'Indica si es una venta o una renta.' }, { status: 400 })
    const comparte = c.comparte === true
    const gastos = Array.isArray(c.gastos) ? (c.gastos as unknown[]).slice(0, 10).map((g, i) => { const o = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>; return { id: `g${i}`, concepto: texto(o.concepto), monto: texto(o.monto_pesos) } }) : []
    const entrada: EntradaCalculadora = { tipo, base: texto(c.base_pesos), pct: texto(c.comision_pct) || PCT_VENTA_REGLA, meses: texto(c.renta_meses) || MESES_RENTA_REGLA, comparte, colPct: texto(c.colaborador_pct) || PCT_COLABORADOR_REGLA, gastos, motivo: '' }
    const r = calcularDesdeEntrada(entrada, { participaEnOrigen: comparte, acreditacion: 'verificado', atribuible: true })
    if (!r.calculo) return NextResponse.json({ error: r.error ?? 'Escribe el precio o la renta para que el asesor opine.' }, { status: 400 })
    const k = r.calculo
    const mxn0 = (cent: number) => Math.round(cent / 100)
    datos = {
      operacion: tipo, [tipo === 'venta' ? 'precio_mxn' : 'renta_mensual_mxn']: mxn0(k.baseCentavos),
      comision_pactada: tipo === 'venta' ? `${(k.comisionPuntosBase ?? 0) / 100} %` : `${(k.rentaMesesCent ?? 0) / 100} meses de renta`,
      regla_de_vivebien: tipo === 'venta' ? `${PCT_VENTA_REGLA} %` : `${MESES_RENTA_REGLA} mes`, habitual_en_mexico: tipo === 'venta' ? '3 % a 5 %' : '1 a 2 meses de renta', escala: ESCALAS[tipo],
      comision_total_mxn: mxn0(k.totalCentavos), se_comparte: comparte, ...(comparte ? { parte_del_colaborador: `${(k.colaboradorPuntosBase ?? 0) / 100} %`, colaborador_mxn: mxn0(k.colaboradorCentavos + k.colaboradorRetenidoCentavos) } : {}),
      gastos: gastos.filter((g) => g.concepto && g.monto).map((g) => ({ concepto: g.concepto.slice(0, 80), monto_mxn: Math.round(Number(g.monto.replace(/[,\s$]/g, '')) || 0) })),
      queda_para_vivebien_mxn: mxn0(k.netoViveBienCentavos), queda_porcentaje_de_la_comision: k.totalCentavos > 0 ? Math.round((k.netoViveBienCentavos / k.totalCentavos) * 100) : 0, se_separa_de_la_regla: k.ajustada,
    }
  } else {
    const periodo = (PERIODOS as unknown[]).includes(c.periodo) ? (c.periodo as Periodo) : 'tres_meses'
    libro = await leerLibro(supabaseAdmin())
    if (!libro) return NO_DISPONIBLE()
    const lineas = construirLineas({ operaciones: libro.operaciones as unknown as OperacionComision[], movimientos: libro.movimientos as unknown as MovimientoContable[], etiquetasDePropiedad: libro.etiquetasDePropiedad, externas: libro.externas as unknown as ExternaContable[] })
    if (c.modo === 'panorama') {
      // El panorama de comisiones: por tipo de propiedad, promoción, retorno y comprobaciones. El servidor lo calcula con el mismo código que la pantalla.
      tarea = 'panorama'
      datos = panoramaParaIA(construirPanorama(lineas, libro.propiedades, { rango: rangoDePeriodo(periodo, hoy), hoy }), ETIQUETA_PERIODO[periodo], hoy)
    } else {
      datos = resumenParaIA(lineas, libro.cuentas as unknown as CuentaDeGasto[], hoy, rangoDePeriodo(periodo, hoy), ETIQUETA_PERIODO[periodo])
    }
  }

  // Lo que cambia en cada consulta: el estado vivo de VIVE BIEN, las notas vigentes del contador y el aviso de caducidad de la base.
  const contexto = await contextoDeConsulta(supabaseAdmin(), hoy, libro)
  const r = await pedirAnalisis(datos, { tarea, pregunta, historial, contexto })
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: ESTADO_HTTP[r.codigo] })
  return NextResponse.json({ texto: r.texto, modelo: r.modelo, proveedor: r.proveedor, generado_en: new Date().toISOString() })
}
