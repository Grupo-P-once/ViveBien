/**
 * Resumen de las operaciones de comisión para el tablero (25-oct-2026). Código puro: sin base, sin red y sin reloj (la fecha de hoy entra como argumento).
 * Todo el dinero va en CENTAVOS ENTEROS; la pantalla convierte a pesos solo para mostrar.
 *
 * Qué cuenta como qué:
 *  · «Registrada» = la operación se cerró y se calculó, falta confirmar que la comisión se COBRÓ. «Confirmada» = ya se cobró. «Anulada» = no cuenta.
 *  · Las anuladas NUNCA suman en los montos (se muestran aparte, para que se vea cuánto se cayó).
 *  · La fecha de una operación es su fecha de cierre; las anteriores a la migración 46 no la tienen y valen por su fecha de registro.
 *  · La parte del agente colaborador: «liberable» = ya cumplió las condiciones; «retenida» = falta verificar su acreditación o la atribución.
 *  · FLUJO DEL DINERO (26-oct-2026): lo que ENTRA es la comisión total; lo que SALE es la parte del colaborador (liberable o retenida: es lo que se le debe) más los
 *    gastos de la operación (fotografía, publicidad…); lo que QUEDA para VIVE BIEN es el neto. Todavía no hay registro de pagos: «sale» es lo COMPROMETIDO, no lo
 *    ya pagado, y la pantalla lo dice así.
 */

export type OperacionComision = {
  id: string
  propiedad_id: string
  tipo: 'venta' | 'renta'
  base_centavos: number
  total_centavos: number
  vivebien_centavos: number
  colaborador_centavos: number
  colaborador_retenido_centavos: number
  reparto_estado: 'no_aplica' | 'retenido' | 'liberable'
  estado: 'registrada' | 'confirmada' | 'anulada'
  creado_en: string
  fecha_cierre?: string | null
  propiedad_folio?: string | null
  propiedad_titulo?: string | null
  precio_lista_centavos?: number | null
  /** Migración 47. Las operaciones anteriores no los traen: valían la regla y no tenían gastos. */
  comision_bp?: number | null
  renta_meses_cent?: number | null
  colaborador_bp?: number | null
  ajuste_motivo?: string | null
  gastos?: Array<{ concepto: string; monto_centavos: number }> | null
}

/** Suma de los gastos de una operación (centavos). Tolera lo que no traiga la migración 47 o venga mal formado. */
export const gastosDe = (op: Pick<OperacionComision, 'gastos'>): number =>
  Array.isArray(op.gastos) ? op.gastos.reduce((a, g) => a + (g && Number.isFinite(Number(g.monto_centavos)) ? Number(g.monto_centavos) : 0), 0) : 0

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

/** AAAA-MM-DD de una operación: su fecha de cierre o, si no la tiene, la de registro. */
export const fechaDeOperacion = (o: Pick<OperacionComision, 'fecha_cierre' | 'creado_en'>): string => (o.fecha_cierre || o.creado_en || '').slice(0, 10)
const mesDe = (fecha: string) => fecha.slice(0, 7)

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function etiquetaDeMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes)
  return m ? `${MESES_CORTOS[Number(m[2]) - 1] ?? m[2]} ${m[1].slice(2)}` : mes
}

/** Los `cuantos` meses que terminan en el mes de `hoy`, del más viejo al más reciente. */
export function mesesHasta(hoy: string, cuantos: number): string[] {
  const m = /^(\d{4})-(\d{2})/.exec(hoy)
  if (!m) return []
  let anio = Number(m[1])
  let mes = Number(m[2])
  const out: string[] = []
  for (let i = 0; i < cuantos; i++) {
    out.unshift(`${anio}-${String(mes).padStart(2, '0')}`)
    mes -= 1
    if (mes === 0) { mes = 12; anio -= 1 }
  }
  return out
}

export type PuntoMensual = { mes: string; etiqueta: string; venta: number; renta: number; total: number; n: number; colaborador: number; gastos: number; neto: number }
export type FilaPropiedad = { propiedad_id: string; folio: string | null; titulo: string | null; total: number; n: number; ultima: string }

export type ResumenComisiones = {
  kpis: {
    /** Comisión de lo cerrado que no se anuló: cobrada + por cobrar. */
    comisionTotal: number
    cobrada: number
    porCobrar: number
    anulada: number
    /** Lo que se queda VIVE BIEN, ya cobrado, y lo que se quedará de lo que falta por cobrar. */
    netaCobrada: number
    netaPorCobrar: number
    agenteLiberable: number
    agenteRetenido: number
    /** Gastos de las operaciones y lo que queda para VIVE BIEN después de ellos y del colaborador. */
    gastos: number
    netoViveBien: number
    /** Ajustes: cuántas operaciones se separaron de la regla (porcentaje, meses o reparto distintos). */
    ajustadas: number
    operaciones: number
    ventas: number
    rentas: number
    ticketPromedio: number
    mesActual: number
    mesAnterior: number
    /** Variación del mes actual contra el anterior, en %; null si el anterior fue 0. */
    variacionMes: number | null
    /** Cierre contra precio de lista, en % (100 = se cerró al precio anunciado); null si ninguna operación trae precio de lista. */
    cierreVsLista: number | null
  }
  serieMensual: PuntoMensual[]
  porTipo: Array<{ tipo: 'venta' | 'renta'; total: number; n: number }>
  porEstado: Array<{ estado: 'registrada' | 'confirmada' | 'anulada'; total: number; n: number }>
  reparto: { viveBien: number; agenteLiberable: number; agenteRetenido: number }
  topPropiedades: FilaPropiedad[]
}

export function resumenComisiones(operaciones: OperacionComision[], o: { hoy: string; meses?: number }): ResumenComisiones {
  const meses = mesesHasta(o.hoy, o.meses ?? 12)
  const serie = new Map<string, PuntoMensual>(meses.map((m) => [m, { mes: m, etiqueta: etiquetaDeMes(m), venta: 0, renta: 0, total: 0, n: 0, colaborador: 0, gastos: 0, neto: 0 }]))
  const porPropiedad = new Map<string, FilaPropiedad>()

  const k = { comisionTotal: 0, cobrada: 0, porCobrar: 0, anulada: 0, netaCobrada: 0, netaPorCobrar: 0, agenteLiberable: 0, agenteRetenido: 0, gastos: 0, netoViveBien: 0, ajustadas: 0, operaciones: 0, ventas: 0, rentas: 0 }
  const porTipo = { venta: { total: 0, n: 0 }, renta: { total: 0, n: 0 } }
  const porEstado = { registrada: { total: 0, n: 0 }, confirmada: { total: 0, n: 0 }, anulada: { total: 0, n: 0 } }
  let sumaCierre = 0
  let sumaLista = 0

  for (const op of operaciones) {
    const total = n(op.total_centavos)
    const estado = op.estado
    if (!(estado in porEstado)) continue
    porEstado[estado].total += total
    porEstado[estado].n += 1
    if (estado === 'anulada') { k.anulada += total; continue }

    k.comisionTotal += total
    k.operaciones += 1
    if (op.tipo === 'venta') { k.ventas += 1; porTipo.venta.total += total; porTipo.venta.n += 1 } else { k.rentas += 1; porTipo.renta.total += total; porTipo.renta.n += 1 }
    if (estado === 'confirmada') { k.cobrada += total; k.netaCobrada += n(op.vivebien_centavos) } else { k.porCobrar += total; k.netaPorCobrar += n(op.vivebien_centavos) }
    k.agenteLiberable += n(op.colaborador_centavos)
    k.agenteRetenido += n(op.colaborador_retenido_centavos)
    const gastosOp = gastosDe(op)
    const netoOp = n(op.vivebien_centavos) - gastosOp
    k.gastos += gastosOp
    k.netoViveBien += netoOp
    if (op.ajuste_motivo) k.ajustadas += 1

    const fecha = fechaDeOperacion(op)
    const punto = serie.get(mesDe(fecha))
    if (punto) { punto[op.tipo] += total; punto.total += total; punto.n += 1; punto.colaborador += n(op.colaborador_centavos) + n(op.colaborador_retenido_centavos); punto.gastos += gastosOp; punto.neto += netoOp }

    const fila = porPropiedad.get(op.propiedad_id) ?? { propiedad_id: op.propiedad_id, folio: op.propiedad_folio ?? null, titulo: op.propiedad_titulo ?? null, total: 0, n: 0, ultima: '' }
    fila.total += total
    fila.n += 1
    if (fecha > fila.ultima) { fila.ultima = fecha; fila.folio = op.propiedad_folio ?? fila.folio; fila.titulo = op.propiedad_titulo ?? fila.titulo }
    porPropiedad.set(op.propiedad_id, fila)

    if (op.precio_lista_centavos && op.precio_lista_centavos > 0) { sumaCierre += n(op.base_centavos); sumaLista += n(op.precio_lista_centavos) }
  }

  const mesActual = serie.get(meses[meses.length - 1])?.total ?? 0
  const mesAnterior = meses.length > 1 ? serie.get(meses[meses.length - 2])?.total ?? 0 : 0
  return {
    kpis: {
      ...k,
      ticketPromedio: k.operaciones ? Math.round(k.comisionTotal / k.operaciones) : 0,
      mesActual,
      mesAnterior,
      variacionMes: mesAnterior > 0 ? Math.round(((mesActual - mesAnterior) / mesAnterior) * 100) : null,
      cierreVsLista: sumaLista > 0 ? Math.round((sumaCierre / sumaLista) * 1000) / 10 : null,
    },
    serieMensual: meses.map((m) => serie.get(m)!),
    porTipo: [{ tipo: 'venta', ...porTipo.venta }, { tipo: 'renta', ...porTipo.renta }],
    porEstado: (['registrada', 'confirmada', 'anulada'] as const).map((e) => ({ estado: e, ...porEstado[e] })),
    reparto: { viveBien: k.netaCobrada + k.netaPorCobrar, agenteLiberable: k.agenteLiberable, agenteRetenido: k.agenteRetenido },
    topPropiedades: [...porPropiedad.values()].sort((a, b) => b.total - a.total || b.n - a.n).slice(0, 5),
  }
}

/** Historial de UNA propiedad: sus operaciones, la más reciente primero, y lo que lleva cobrado y por cobrar. */
export function historialDePropiedad(operaciones: OperacionComision[], propiedadId: string) {
  const ops = operaciones.filter((o) => o.propiedad_id === propiedadId).sort((a, b) => fechaDeOperacion(b).localeCompare(fechaDeOperacion(a)) || b.creado_en.localeCompare(a.creado_en))
  let cobrada = 0
  let porCobrar = 0
  for (const o of ops) {
    if (o.estado === 'confirmada') cobrada += n(o.total_centavos)
    else if (o.estado === 'registrada') porCobrar += n(o.total_centavos)
  }
  return { operaciones: ops, cobrada, porCobrar, total: cobrada + porCobrar }
}
