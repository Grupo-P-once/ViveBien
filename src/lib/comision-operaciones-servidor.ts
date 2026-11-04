import 'server-only'
import { resolverPerfil, supabaseAdmin, type AuthUser } from './auth-server'
import { tieneCapacidad } from './acceso/capacidades'
import { calcularComision, centavosDePesos, centesimasDeMeses, LIMITES, puntosBaseDePorcentaje, REGLA_BORRADOR_2026_10_24, type Ajustes, type EstadoAcreditacion, type Gasto, type ResultadoCalculo, type TipoOperacion } from './comision-calculo'
import { estadoAcreditacion } from './comision-acreditacion'

/**
 * Registro de operaciones de comisión (Etapa C). Solo servidor.
 *
 * El navegador manda QUÉ operación es (propiedad, venta/renta, precio, fecha de cierre, si es atribuible, clave); el servidor decide todo lo demás: si la
 * cuenta dueña está exenta (`sin_comision`, propiedad de VIVE BIEN), si hay agente colaborador y si su acreditación está verificada HOY, y
 * calcula con la regla versionada. Nada de lo calculado viene del cliente. Este módulo no mueve dinero.
 *
 * `leerContexto` es lo MISMO que decide el registro, expuesto a la pantalla para mostrar el cálculo antes de guardar: así lo que se ve en el
 * formulario y lo que se guarda no pueden divergir.
 */

export type EntradaOperacion = {
  propiedad_id?: unknown; tipo?: unknown; base_pesos?: unknown; atribuible?: unknown; atribucion_ref?: unknown; clave_idempotencia?: unknown; fecha_cierre?: unknown
  /** Ajustes del trato real (todos opcionales; sin ellos vale la regla): % de la venta, meses de la renta, si se comparte y con qué %, gastos y el motivo. */
  comision_pct?: unknown; renta_meses?: unknown; comparte?: unknown; colaborador_pct?: unknown; gastos?: unknown; ajuste_motivo?: unknown
}

export type ContextoComision = {
  propiedad: { id: string; folio: string | null; titulo: string | null; operacion: string | null; precioCentavos: number | null; estatus: string | null; estadoPub: string | null }
  /** `null` = paga comisión. */
  exenta: null | 'sin_dueno' | 'sin_comision'
  cuentaEncontrada: boolean
  origenTipo: string | null
  participa: boolean
  acreditacion: EstadoAcreditacion
}

export type ResultadoContexto = { ok: true; ctx: ContextoComision } | { ok: false; status: number; error: string; codigo?: string }

export type OperacionPreparada =
  | { ok: true; datos: Record<string, unknown>; calculo: Extract<ResultadoCalculo, { ok: true }> }
  | { ok: false; status: number; error: string; codigo?: string }

const hoy = () => new Date().toISOString().slice(0, 10)
const aCentavos = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  const c = Math.round(n * 100)
  return Number.isSafeInteger(c) ? c : null
}

/** Todo lo que se sabe de una propiedad para decidir su comisión. Lee; no escribe. */
export async function leerContexto(propiedadId: string): Promise<ResultadoContexto> {
  const db = supabaseAdmin()
  const p = await db.from('propiedades').select('id, owner_id, folio, titulo, operacion, precio, estatus, estado_pub').eq('id', propiedadId).maybeSingle()
  if (p.error) return { ok: false, status: 503, error: 'No se pudo leer la propiedad.', codigo: 'no_disponible' }
  if (!p.data) return { ok: false, status: 404, error: 'Esa propiedad no existe.' }
  const propiedad = {
    id: p.data.id as string, folio: (p.data.folio as string | null) ?? null, titulo: (p.data.titulo as string | null) ?? null, operacion: (p.data.operacion as string | null) ?? null,
    precioCentavos: aCentavos(p.data.precio), estatus: (p.data.estatus as string | null) ?? null, estadoPub: (p.data.estado_pub as string | null) ?? null,
  }

  // ¿La cuenta dueña paga comisión? Desde el 26-oct-2026 TODA propiedad genera comisión por decisión del dueño (revierte D-11): una propiedad sin cuenta dueña (la gestiona el equipo
  // por un tercero) ya no está exenta. Solo queda exenta una cuenta dueña con la capacidad `sin_comision`.
  let exenta: ContextoComision['exenta'] = null
  let cuentaEncontrada = true
  if (p.data.owner_id) {
    const u = await db.from('usuarios').select('rol, estado, nombre, tipo_publicador, permisos_override').eq('uid', p.data.owner_id).maybeSingle()
    if (u.error) return { ok: false, status: 503, error: 'No se pudo leer la cuenta dueña.', codigo: 'no_disponible' }
    // Sin fila de usuario no se sabe si está exenta: ausente = sin permiso, y aquí «sin permiso» es NO registrar (nunca cobrar por omisión).
    if (!u.data) cuentaEncontrada = false
    else if (tieneCapacidad(resolverPerfil({ uid: p.data.owner_id } as AuthUser, u.data), 'sin_comision')) exenta = 'sin_comision'
  }

  const o = await db.from('propiedad_origen')
    .select('origen_tipo, acreditacion_folio, acreditacion_resultado, acreditacion_vigente_hasta, acreditacion_verificado_por').eq('propiedad_id', propiedadId).maybeSingle()
  if (o.error) return { ok: false, status: 503, error: 'No se pudo leer el origen.', codigo: 'no_disponible' }
  const participa = o.data?.origen_tipo === 'inmobiliaria' || o.data?.origen_tipo === 'broker'
  const acreditacion = estadoAcreditacion(o.data?.acreditacion_folio
    ? { folio: o.data.acreditacion_folio, resultado: (o.data.acreditacion_resultado as 'coincide' | 'no_coincide' | null) ?? null, vigenteHasta: o.data.acreditacion_vigente_hasta ?? null, verificadoPor: o.data.acreditacion_verificado_por ?? null }
    : null, hoy())
  return { ok: true, ctx: { propiedad, exenta, cuentaEncontrada, origenTipo: (o.data?.origen_tipo as string | null) ?? null, participa, acreditacion } }
}

export async function prepararOperacion(e: EntradaOperacion, actor: string): Promise<OperacionPreparada> {
  const propiedadId = typeof e.propiedad_id === 'string' ? e.propiedad_id : ''
  if (!propiedadId) return { ok: false, status: 400, error: 'Falta la propiedad.' }
  if (e.tipo !== 'venta' && e.tipo !== 'renta') return { ok: false, status: 400, error: 'La operación debe ser venta o renta.' }
  // OJO (aclaración del propietario, 4-nov-2026): este registro es CONTABILIDAD INTERNA de Admin. No depende de que exista un acuerdo vigente con quien publica; no hay que
  // consultarlo aquí. Lo que se protege con «sin texto vigente» es el flujo PÚBLICO (propuesta, nunca «aceptada»): ver `estadoDeAceptacion` y `OrigenDeclarado`.
  const base = centavosDePesos(e.base_pesos)
  if (base === null) return { ok: false, status: 400, error: e.tipo === 'venta' ? 'Escribe el precio final firmado (pesos, hasta 2 decimales).' : 'Escribe la renta mensual base (pesos, hasta 2 decimales).' }
  if (typeof e.atribuible !== 'boolean') return { ok: false, status: 400, error: 'Indica si la operación es atribuible a VIVE BIEN.' }
  const clave = typeof e.clave_idempotencia === 'string' ? e.clave_idempotencia.trim() : ''
  if (clave.length < 8 || clave.length > 100) return { ok: false, status: 400, error: 'Falta la clave de la operación (de 8 a 100 caracteres).' }
  const ref = typeof e.atribucion_ref === 'string' && e.atribucion_ref.trim() ? e.atribucion_ref.trim() : null
  if (ref !== null && !/^[A-Za-z0-9_:.\-]{1,200}$/.test(ref)) return { ok: false, status: 400, error: 'La referencia de atribución solo lleva un identificador (letras, números, : . _ -), sin nombres ni teléfonos.' }
  if (e.atribuible && !ref) return { ok: false, status: 400, error: 'Una operación atribuible necesita su referencia de atribución (por ejemplo, el identificador de la cita o de la consulta).' }
  // Fecha de cierre: opcional por compatibilidad; si viene, debe ser una fecha real que no sea del futuro (la base lo vuelve a comprobar).
  let fechaCierre: string | null = null
  if (e.fecha_cierre !== undefined && e.fecha_cierre !== null && e.fecha_cierre !== '') {
    const f = e.fecha_cierre
    const real = typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f + 'T00:00:00Z')) && new Date(f + 'T00:00:00Z').toISOString().slice(0, 10) === f
    if (!real) return { ok: false, status: 400, error: 'La fecha de cierre no es una fecha válida.' }
    if ((f as string) > hoy()) return { ok: false, status: 400, error: 'La fecha de cierre no puede ser futura.' }
    fechaCierre = f as string
  }

  // Ajustes del trato real. Un valor presente pero ilegible es un error (nunca se ignora en silencio y se cobra la regla).
  const ajustes: Ajustes = {}
  const presente = (v: unknown) => v !== undefined && v !== null && v !== ''
  if (presente(e.comision_pct)) {
    const bp = puntosBaseDePorcentaje(e.comision_pct)
    if (bp === null) return { ok: false, status: 400, error: 'El porcentaje de la comisión debe ser un número con hasta 2 decimales (por ejemplo 3.5).' }
    ajustes.ventaPuntosBase = bp
  }
  if (presente(e.renta_meses)) {
    const m = centesimasDeMeses(e.renta_meses)
    if (m === null) return { ok: false, status: 400, error: 'Los meses de renta deben ser un número con hasta 2 decimales (por ejemplo 1 o 1.5).' }
    ajustes.rentaMesesCent = m
  }
  if (presente(e.colaborador_pct)) {
    const bp = puntosBaseDePorcentaje(e.colaborador_pct)
    if (bp === null) return { ok: false, status: 400, error: 'El reparto del colaborador debe ser un porcentaje con hasta 2 decimales (por ejemplo 50).' }
    ajustes.colaboradorPuntosBase = bp
  }
  if (e.comparte !== undefined && e.comparte !== null && typeof e.comparte !== 'boolean') return { ok: false, status: 400, error: 'Indica si la comisión se comparte (sí o no).' }
  if (presente(e.gastos)) {
    if (!Array.isArray(e.gastos) || e.gastos.length > LIMITES.gastosMax) return { ok: false, status: 400, error: `Los gastos son una lista de hasta ${LIMITES.gastosMax}.` }
    const lista: Gasto[] = []
    for (const g of e.gastos as unknown[]) {
      const o = g && typeof g === 'object' ? (g as Record<string, unknown>) : {}
      const monto = centavosDePesos(o.monto_pesos)
      if (typeof o.concepto !== 'string' || monto === null) return { ok: false, status: 400, error: 'Cada gasto lleva un concepto y un monto en pesos (hasta 2 decimales).' }
      lista.push({ concepto: o.concepto.trim(), montoCentavos: monto })
    }
    ajustes.gastos = lista
  }
  const motivo = typeof e.ajuste_motivo === 'string' ? e.ajuste_motivo.trim() : ''

  const c = await leerContexto(propiedadId)
  if (!c.ok) return c
  const { ctx } = c
  if (!ctx.cuentaEncontrada) return { ok: false, status: 409, error: 'No se encontró la cuenta dueña de la propiedad: sin saber si está exenta de comisión no se registra la operación.', codigo: 'cuenta_no_encontrada' }
  if (ctx.exenta === 'sin_comision') return { ok: false, status: 409, error: 'La cuenta dueña está exenta de comisión (sin_comision).', codigo: 'exenta' }
  if (!ctx.origenTipo) return { ok: false, status: 409, error: 'La propiedad no tiene origen registrado: sin saber cómo se maneja no se calcula el reparto.', codigo: 'sin_origen' }

  // ¿Hay colaborador? Por defecto lo que dice el origen declarado; el equipo puede decir que sí (otro agente) o que no (renunció a su parte).
  // Aunque se diga que sí, la parte solo se LIBERA con acreditación verificada y operación atribuible: si no, queda retenida.
  const participa = typeof e.comparte === 'boolean' ? e.comparte : ctx.participa
  const calculo = calcularComision({ operacion: e.tipo as TipoOperacion, baseCentavos: base, regla: REGLA_BORRADOR_2026_10_24, ajustes, colaborador: { participa, acreditacion: ctx.acreditacion, atribuible: e.atribuible } })
  if (!calculo.ok) return { ok: false, status: 400, error: calculo.error }
  const separaDeLaRegla = calculo.ajustada || participa !== ctx.participa
  if (separaDeLaRegla && (motivo.length < LIMITES.motivo.min || motivo.length > LIMITES.motivo.max)) {
    return { ok: false, status: 400, error: `Cambiaste algo de la regla (porcentaje, meses o reparto): escribe el motivo, de ${LIMITES.motivo.min} a ${LIMITES.motivo.max} caracteres.`, codigo: 'falta_motivo' }
  }

  const reparto_estado = !participa || (calculo.colaboradorCentavos === 0 && calculo.colaboradorRetenidoCentavos === 0) ? 'no_aplica' : calculo.colaboradorRetenidoCentavos > 0 ? 'retenido' : 'liberable'
  return {
    ok: true,
    calculo,
    datos: {
      propiedad_id: propiedadId, tipo: e.tipo, base_centavos: calculo.baseCentavos, regla_version: calculo.regla, total_centavos: calculo.totalCentavos,
      vivebien_centavos: calculo.viveBienCentavos, colaborador_centavos: calculo.colaboradorCentavos, colaborador_retenido_centavos: calculo.colaboradorRetenidoCentavos,
      retencion: calculo.retencion, reparto_estado, atribuible: e.atribuible, atribucion_ref: ref,
      clave_idempotencia: clave, creado_por: actor,
      // La fecha y la copia de la propiedad en el momento de cerrar: el historial no cambia si después se edita la ficha.
      comision_bp: calculo.comisionPuntosBase, renta_meses_cent: calculo.rentaMesesCent, colaborador_bp: calculo.colaboradorPuntosBase,
      ajuste_motivo: separaDeLaRegla ? motivo : null, gastos: (ajustes.gastos ?? []).map((g) => ({ concepto: g.concepto, monto_centavos: g.montoCentavos })),
      fecha_cierre: fechaCierre, propiedad_folio: ctx.propiedad.folio, propiedad_titulo: ctx.propiedad.titulo, precio_lista_centavos: ctx.propiedad.precioCentavos,
    },
  }
}
