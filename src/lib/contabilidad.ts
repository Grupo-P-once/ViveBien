import { etiquetaDeMes, fechaDeOperacion, mesesHasta, type OperacionComision } from './comision-resumen'

/**
 * Contabilidad de comisiones (25-oct-2026). Código puro: sin base, sin red y sin reloj (la fecha de hoy entra como argumento). Dinero en CENTAVOS ENTEROS.
 *
 * El LIBRO DIARIO une dos fuentes SIN copiarlas:
 *  · las operaciones de comisión (`comision_operaciones`): la comisión que ENTRA, la parte del colaborador y los gastos de cada operación, que SALEN;
 *  · los movimientos manuales (`contab_movimientos`): gastos externos, ingresos extra, devoluciones y anulaciones.
 * Lo que se corrige no se borra: una anulación es otro asiento vinculado al original; el original queda visible y los dos dejan de contar en los totales.
 *
 * Qué cuenta como qué:
 *  · «cobrado» = comisión de una operación confirmada; «por cobrar» = registrada. «comprometido» = parte del colaborador (todavía no hay pagos registrados).
 *  · Las operaciones anuladas y los asientos anulados salen del diario marcados, pero NUNCA suman.
 *  · Los gastos se analizan NETOS de sus devoluciones (una lona de $1,500 con $500 devueltos cuesta $1,000).
 */

export type CategoriaDeGasto =
  | 'publicidad_digital' | 'publicidad_impresa' | 'fotografia_video' | 'gestoria_legal' | 'software_suscripciones' | 'transporte' | 'oficina'
  | 'honorarios_externos' | 'comision_externa' | 'impuestos_derechos' | 'otro'

/** Etiquetas de todo lo que puede salir en el diario (las categorías de gasto y las que se derivan de las operaciones). */
export const ETIQUETA_CATEGORIA: Readonly<Record<string, string>> = Object.freeze({
  publicidad_digital: 'Publicidad digital', publicidad_impresa: 'Publicidad impresa (lonas, volantes)', fotografia_video: 'Fotografía y video', gestoria_legal: 'Gestoría y legal',
  software_suscripciones: 'Software y suscripciones', transporte: 'Transporte', oficina: 'Oficina', honorarios_externos: 'Honorarios externos', comision_externa: 'Comisión a terceros',
  impuestos_derechos: 'Impuestos y derechos', otro: 'Otros', ingreso_extra: 'Ingreso extra', aportacion_grupo: 'Aportación a empresa del grupo', aportacion_recibida_grupo: 'Aportación de empresa del grupo', pago_colaborador: 'Pago al colaborador (ya incluido en su parte)', comision: 'Comisión', comision_recibida: 'Comisión externa (su parte)', colaborador: 'Parte del colaborador', gasto_operacion: 'Gasto de la operación',
})
export const CATEGORIAS_DE_GASTO = Object.freeze(['publicidad_digital', 'publicidad_impresa', 'fotografia_video', 'gestoria_legal', 'software_suscripciones', 'transporte', 'oficina', 'honorarios_externos', 'comision_externa', 'impuestos_derechos', 'otro'] as const)

/** Una comisión EXTERNA (no viene de una propiedad del sitio): lo que le tocó a VIVE BIEN de un trato conseguido con un tercero. Migración 55. */
export type ExternaContable = {
  id: string; fecha: string; descripcion: string; tipo: 'venta' | 'renta' | 'otro'; colaborador_id: string | null; contraparte: string | null
  parte_centavos: number; total_centavos: number | null; porcentaje_bp: number | null; estado: 'por_cobrar' | 'cobrada' | 'anulada'
  cobrada_en: string | null; metodo_cobro: 'efectivo' | 'transferencia' | null; referencia: string | null; adjunto: string | null; estado_motivo?: string | null; creado_por: string; creado_en: string
}

export type MovimientoContable = {
  id: string
  fecha: string
  sentido: 'entra' | 'sale'
  clase: 'gasto' | 'ingreso_extra' | 'devolucion' | 'anulacion' | 'aportacion_grupo' | 'aportacion_recibida_grupo' | 'pago_colaborador'
  monto_centavos: number
  categoria: string
  cuenta_id: string | null
  propiedad_id: string | null
  operacion_id: string | null
  concepto: string
  referencia: string | null
  reverso_de: string | null
  motivo: string | null
  creado_por: string
  creado_en: string
}

export type CuentaDeGasto = { id: string; nombre: string; categoria: string; identificador: string | null; notas: string | null; activa: boolean; creado_en: string }

export type EstadoDeLinea = 'cobrado' | 'por_cobrar' | 'comprometido' | 'registrado' | 'anulado'
export type Linea = {
  id: string
  fecha: string
  origen: 'comision' | 'manual'
  sentido: 'entra' | 'sale'
  clase: 'comision' | 'comision_externa' | 'colaborador' | 'gasto_operacion' | 'gasto' | 'ingreso_extra' | 'devolucion' | 'anulacion' | 'aportacion_grupo' | 'aportacion_recibida_grupo' | 'pago_colaborador'
  /** Si la línea nace de una operación de comisión: ¿fue una venta o una renta? (Los movimientos manuales no lo traen.) */
  tipoOp: 'venta' | 'renta' | null
  categoria: string
  concepto: string
  monto: number
  estado: EstadoDeLinea
  cuentaId: string | null
  propiedadId: string | null
  propiedadEtiqueta: string | null
  operacionId: string | null
  referencia: string | null
  motivo: string | null
  reversoDe: string | null
  /** ¿Cuenta en los totales? Las anuladas (y sus contra-asientos) no. */
  vigente: boolean
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const tit = (o: { propiedad_titulo?: string | null; propiedad_folio?: string | null; propiedad_id: string }) => o.propiedad_titulo || o.propiedad_folio || o.propiedad_id

/** Une operaciones y movimientos en las líneas del diario, la más reciente primero. */
export function construirLineas(entrada: { operaciones: OperacionComision[]; movimientos: MovimientoContable[]; etiquetasDePropiedad?: Record<string, string>; externas?: ExternaContable[] }): Linea[] {
  const lineas: Linea[] = []
  const etiquetas = new Map<string, string>(Object.entries(entrada.etiquetasDePropiedad ?? {}))
  for (const o of entrada.operaciones) if (!etiquetas.has(o.propiedad_id)) etiquetas.set(o.propiedad_id, tit(o))

  for (const o of entrada.operaciones) {
    const fecha = fechaDeOperacion(o)
    const base = { fecha, origen: 'comision' as const, tipoOp: (o.tipo === 'venta' ? 'venta' : 'renta') as 'venta' | 'renta', cuentaId: null, propiedadId: o.propiedad_id, propiedadEtiqueta: etiquetas.get(o.propiedad_id) ?? null, operacionId: o.id, referencia: o.propiedad_folio ?? null, motivo: null, reversoDe: null }
    const tipo = o.tipo === 'venta' ? 'Venta' : 'Renta'
    if (o.estado === 'anulada') {
      lineas.push({ ...base, id: `op:${o.id}:ingreso`, sentido: 'entra', clase: 'comision', categoria: 'comision', concepto: `${tipo} anulada · ${tit(o)}`, monto: n(o.total_centavos), estado: 'anulado', vigente: false })
      continue
    }
    lineas.push({ ...base, id: `op:${o.id}:ingreso`, sentido: 'entra', clase: 'comision', categoria: 'comision', concepto: `Comisión de ${tipo.toLowerCase()} · ${tit(o)}`, monto: n(o.total_centavos), estado: o.estado === 'confirmada' ? 'cobrado' : 'por_cobrar', vigente: true })
    const colab = n(o.colaborador_centavos) + n(o.colaborador_retenido_centavos)
    if (colab > 0) lineas.push({ ...base, id: `op:${o.id}:colaborador`, sentido: 'sale', clase: 'colaborador', categoria: 'colaborador', concepto: `Parte del colaborador${n(o.colaborador_retenido_centavos) > 0 ? ' (retenida)' : ''} · ${tit(o)}`, monto: colab, estado: 'comprometido', vigente: true })
    ;(Array.isArray(o.gastos) ? o.gastos : []).forEach((g, i) => {
      const monto = n(g?.monto_centavos)
      if (monto > 0) lineas.push({ ...base, id: `op:${o.id}:gasto:${i}`, sentido: 'sale', clase: 'gasto_operacion', categoria: 'gasto_operacion', concepto: `${g.concepto} · ${tit(o)}`, monto, estado: 'registrado', vigente: true })
    })
  }

  // Comisiones externas: ingreso de VIVE BIEN (solo su parte); no hay colaborador que pagar ni propiedad del catálogo.
  for (const x of entrada.externas ?? []) {
    const anulada = x.estado === 'anulada'
    lineas.push({
      id: `ext:${x.id}`, fecha: x.fecha, origen: 'comision', tipoOp: x.tipo === 'venta' ? 'venta' : x.tipo === 'renta' ? 'renta' : null, sentido: 'entra', clase: 'comision_externa', categoria: 'comision_recibida',
      concepto: `Comisión externa · ${x.descripcion}${x.contraparte ? ` · con ${x.contraparte}` : ''}`, monto: n(x.parte_centavos), estado: anulada ? 'anulado' : x.estado === 'cobrada' ? 'cobrado' : 'por_cobrar',
      cuentaId: null, propiedadId: null, propiedadEtiqueta: null, operacionId: null, referencia: x.referencia, motivo: x.estado_motivo ?? null, reversoDe: null, vigente: !anulada,
    })
  }
  const anulados = new Set(entrada.movimientos.filter((m) => m.clase === 'anulacion' && m.reverso_de).map((m) => m.reverso_de as string))
  for (const m of entrada.movimientos) {
    const anulado = anulados.has(m.id)
    const esAnulacion = m.clase === 'anulacion'
    lineas.push({
      id: `mov:${m.id}`, fecha: m.fecha, origen: 'manual', tipoOp: null, sentido: m.sentido, clase: m.clase, categoria: m.categoria, concepto: m.concepto, monto: n(m.monto_centavos),
      estado: anulado || esAnulacion ? 'anulado' : 'registrado', cuentaId: m.cuenta_id, propiedadId: m.propiedad_id, propiedadEtiqueta: m.propiedad_id ? etiquetas.get(m.propiedad_id) ?? m.propiedad_id : null,
      operacionId: m.operacion_id, referencia: m.referencia, motivo: m.motivo, reversoDe: m.reverso_de,
      // La anulación y lo anulado se compensan: ninguno de los dos suma.
      vigente: !anulado && !esAnulacion,
    })
  }
  // Más reciente primero; a igual fecha, lo manual (más reciente de capturar) arriba.
  return lineas.sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.origen === b.origen ? a.id.localeCompare(b.id) : a.origen === 'manual' ? -1 : 1))
}

export type Rango = { desde?: string; hasta?: string }
const enRango = (l: Pick<Linea, 'fecha'>, r?: Rango) => (!r?.desde || l.fecha >= r.desde) && (!r?.hasta || l.fecha <= r.hasta)

export type Totales = {
  entra: number
  sale: number
  neto: number
  /** Lo que entra por comisiones: ya cobrado y por cobrar. */
  comisionCobrada: number
  comisionPorCobrar: number
  ingresosExtra: number
  devoluciones: number
  /** Lo que sale, por tipo. */
  colaboradores: number
  gastosDeOperacion: number
  gastosExternos: number
  /** Gastos externos netos de devoluciones. */
  gastosExternosNetos: number
  /** Dinero entregado a otra empresa del grupo como aportación de capital: sale, pero NO es gasto. */
  aportacionesAlGrupo: number
  /** Dinero que una empresa del grupo aportó a VIVE BIEN: entra, pero NO es ingreso (no toca el estado de resultados). */
  aportacionesDelGrupo: number
  /** Lo ya pagado a colaboradores. NO se suma a «sale» (la parte del colaborador ya cuenta como salida cuando se compromete): solo dice cuánto de eso ya se pagó. */
  pagosAColaboradores: number
}

export function totales(lineas: Linea[], rango?: Rango): Totales {
  const t: Totales = { entra: 0, sale: 0, neto: 0, comisionCobrada: 0, comisionPorCobrar: 0, ingresosExtra: 0, devoluciones: 0, colaboradores: 0, gastosDeOperacion: 0, gastosExternos: 0, gastosExternosNetos: 0, aportacionesAlGrupo: 0, aportacionesDelGrupo: 0, pagosAColaboradores: 0 }
  for (const l of lineas) {
    if (!l.vigente || !enRango(l, rango)) continue
    if (l.clase === 'pago_colaborador') { t.pagosAColaboradores += l.monto; continue }
    if (l.sentido === 'entra') t.entra += l.monto
    else t.sale += l.monto
    if (l.clase === 'comision' || l.clase === 'comision_externa') { if (l.estado === 'cobrado') t.comisionCobrada += l.monto; else t.comisionPorCobrar += l.monto }
    else if (l.clase === 'ingreso_extra') t.ingresosExtra += l.monto
    else if (l.clase === 'devolucion') t.devoluciones += l.monto
    else if (l.clase === 'colaborador') t.colaboradores += l.monto
    else if (l.clase === 'gasto_operacion') t.gastosDeOperacion += l.monto
    else if (l.clase === 'gasto') t.gastosExternos += l.monto
    else if (l.clase === 'aportacion_grupo') t.aportacionesAlGrupo += l.monto
    else if (l.clase === 'aportacion_recibida_grupo') t.aportacionesDelGrupo += l.monto
  }
  t.neto = t.entra - t.sale
  t.gastosExternosNetos = t.gastosExternos - t.devoluciones
  return t
}

export type PuntoDelMes = { mes: string; etiqueta: string; entra: number; sale: number; neto: number; comisiones: number; gastos: number }
/** Entra, sale y neto de los últimos `cuantos` meses (el último es el de `hoy`). `gastos` = externos + de operación, netos de devoluciones. */
export function serieMensual(lineas: Linea[], hoy: string, cuantos = 12): PuntoDelMes[] {
  const meses = mesesHasta(hoy, cuantos)
  const mapa = new Map<string, PuntoDelMes>(meses.map((m) => [m, { mes: m, etiqueta: etiquetaDeMes(m), entra: 0, sale: 0, neto: 0, comisiones: 0, gastos: 0 }]))
  for (const l of lineas) {
    if (!l.vigente || l.clase === 'pago_colaborador') continue
    const p = mapa.get(l.fecha.slice(0, 7))
    if (!p) continue
    if (l.sentido === 'entra') p.entra += l.monto
    else p.sale += l.monto
    if (l.clase === 'comision' || l.clase === 'comision_externa') p.comisiones += l.monto
    else if (l.clase === 'gasto' || l.clase === 'gasto_operacion') p.gastos += l.monto
    else if (l.clase === 'devolucion') p.gastos -= l.monto
  }
  for (const p of mapa.values()) p.neto = p.entra - p.sale
  return meses.map((m) => mapa.get(m)!)
}

export type FilaCategoria = { categoria: string; etiqueta: string; bruto: number; devuelto: number; neto: number; n: number; parte: number; acumulada: number }
/** Gasto por categoría, de mayor a menor, con su parte y el acumulado (Pareto). Incluye los gastos de las operaciones y los externos, netos de devoluciones. */
export function porCategoria(lineas: Linea[], rango?: Rango): FilaCategoria[] {
  const mapa = new Map<string, { bruto: number; devuelto: number; n: number }>()
  for (const l of lineas) {
    if (!l.vigente || !enRango(l, rango)) continue
    const esGasto = l.clase === 'gasto' || l.clase === 'gasto_operacion'
    if (!esGasto && l.clase !== 'devolucion') continue
    const k = l.clase === 'gasto_operacion' ? 'gasto_operacion' : l.categoria
    const f = mapa.get(k) ?? { bruto: 0, devuelto: 0, n: 0 }
    if (l.clase === 'devolucion') f.devuelto += l.monto
    else { f.bruto += l.monto; f.n += 1 }
    mapa.set(k, f)
  }
  const filas = [...mapa.entries()].map(([categoria, f]) => ({ categoria, etiqueta: ETIQUETA_CATEGORIA[categoria] ?? categoria, bruto: f.bruto, devuelto: f.devuelto, neto: f.bruto - f.devuelto, n: f.n }))
    .filter((f) => f.neto > 0 || f.bruto > 0)
    .sort((a, b) => b.neto - a.neto || a.etiqueta.localeCompare(b.etiqueta))
  const total = filas.reduce((s, f) => s + Math.max(f.neto, 0), 0)
  let acumulado = 0
  return filas.map((f) => { acumulado += Math.max(f.neto, 0); return { ...f, parte: total > 0 ? Math.round((Math.max(f.neto, 0) / total) * 1000) / 10 : 0, acumulada: total > 0 ? Math.round((acumulado / total) * 1000) / 10 : 0 } })
}

export type FilaCuenta = { cuentaId: string; nombre: string; categoria: string; identificador: string | null; activa: boolean; bruto: number; devuelto: number; neto: number; n: number; ultimaFecha: string | null }
/** Lo gastado en cada cuenta de gasto (neto de devoluciones). Las cuentas sin movimientos salen con 0, para verlas. */
export function porCuenta(lineas: Linea[], cuentas: CuentaDeGasto[], rango?: Rango): FilaCuenta[] {
  const mapa = new Map<string, FilaCuenta>(cuentas.map((c) => [c.id, { cuentaId: c.id, nombre: c.nombre, categoria: c.categoria, identificador: c.identificador, activa: c.activa, bruto: 0, devuelto: 0, neto: 0, n: 0, ultimaFecha: null }]))
  for (const l of lineas) {
    if (!l.vigente || !l.cuentaId || !enRango(l, rango)) continue
    const f = mapa.get(l.cuentaId)
    if (!f) continue
    if (l.clase === 'gasto') { f.bruto += l.monto; f.n += 1; if (!f.ultimaFecha || l.fecha > f.ultimaFecha) f.ultimaFecha = l.fecha }
    else if (l.clase === 'devolucion') f.devuelto += l.monto
  }
  for (const f of mapa.values()) f.neto = f.bruto - f.devuelto
  return [...mapa.values()].sort((a, b) => b.neto - a.neto || a.nombre.localeCompare(b.nombre))
}

export type FilaPropiedad = {
  propiedadId: string; etiqueta: string
  comision: number; colaborador: number; gastosDeOperacion: number; gastosLigados: number
  /** comisión − colaborador − gastos de operación − gastos ligados (netos de devoluciones). */
  neto: number
  operaciones: number
  situacion: 'deja' | 'pierde' | 'sin_cierre'
}
/** Qué deja y qué cuesta cada propiedad. «sin_cierre» = tiene gastos ligados y ninguna comisión: dinero puesto sin retorno (todavía). */
export function porPropiedad(lineas: Linea[], rango?: Rango): FilaPropiedad[] {
  const mapa = new Map<string, FilaPropiedad>()
  for (const l of lineas) {
    if (!l.vigente || !l.propiedadId || !enRango(l, rango)) continue
    const f = mapa.get(l.propiedadId) ?? { propiedadId: l.propiedadId, etiqueta: l.propiedadEtiqueta ?? l.propiedadId, comision: 0, colaborador: 0, gastosDeOperacion: 0, gastosLigados: 0, neto: 0, operaciones: 0, situacion: 'deja' as const }
    if (l.clase === 'comision') { f.comision += l.monto; f.operaciones += 1 }
    else if (l.clase === 'colaborador') f.colaborador += l.monto
    else if (l.clase === 'gasto_operacion') f.gastosDeOperacion += l.monto
    else if (l.clase === 'gasto') f.gastosLigados += l.monto
    else if (l.clase === 'devolucion') f.gastosLigados -= l.monto
    mapa.set(l.propiedadId, f)
  }
  for (const f of mapa.values()) {
    f.neto = f.comision - f.colaborador - f.gastosDeOperacion - f.gastosLigados
    f.situacion = f.comision === 0 ? 'sin_cierre' : f.neto < 0 ? 'pierde' : 'deja'
  }
  return [...mapa.values()].sort((a, b) => b.neto - a.neto || a.etiqueta.localeCompare(b.etiqueta))
}

// ── Gastos hormiga ─────────────────────────────────────────────────────────────────────

/** Para agrupar «Lonas Juanito», «lonas  juanito #2» y «LONAS JUANITO 3»: minúsculas, sin acentos, sin dígitos ni signos. */
export function normalizarConcepto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export type GastoHormiga = { clave: string; nombre: string; cuentaId: string | null; n: number; total: number; promedio: number; cadaDias: number | null; ultimaFecha: string; anualProyectado: number }
export type OpcionesHormiga = { /** Un cargo cuenta como «pequeño» hasta este monto (centavos). */ umbral?: number; ventanaDias?: number; /** Mínimo de cargos en la ventana para decir «recurrente». */ minimo?: number }
export const HORMIGA_POR_DEFECTO = Object.freeze({ umbral: 150_000, ventanaDias: 90, minimo: 3 })

const dias = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
const restarDias = (f: string, d: number) => new Date(Date.parse(f + 'T00:00:00Z') - d * 86_400_000).toISOString().slice(0, 10)

/**
 * Cargos pequeños que se repiten: mismo lugar de gasto (o, sin cuenta, mismo concepto normalizado), de hasta `umbral` cada uno, al menos `minimo` veces en la ventana.
 * Es la señal de las herramientas de gasto: «≥ 3 ocurrencias» antes de llamar algo recurrente. Se mide el dinero en juego (proyección anual) y se ordena por él.
 * Solo gastos manuales vigentes: los de operación son parte de un cierre, no un goteo.
 */
export function gastosHormiga(lineas: Linea[], hoy: string, opciones: OpcionesHormiga = {}): GastoHormiga[] {
  const { umbral, ventanaDias, minimo } = { ...HORMIGA_POR_DEFECTO, ...opciones }
  const desde = restarDias(hoy, ventanaDias)
  const grupos = new Map<string, { nombre: string; cuentaId: string | null; fechas: string[]; total: number }>()
  for (const l of lineas) {
    if (!l.vigente || l.clase !== 'gasto' || l.monto > umbral || l.fecha < desde || l.fecha > hoy) continue
    const concepto = normalizarConcepto(l.concepto)
    const clave = l.cuentaId ? `cuenta:${l.cuentaId}` : `concepto:${concepto}`
    if (!l.cuentaId && !concepto) continue
    const g = grupos.get(clave) ?? { nombre: l.concepto, cuentaId: l.cuentaId, fechas: [], total: 0 }
    g.fechas.push(l.fecha)
    g.total += l.monto
    grupos.set(clave, g)
  }
  const salida: GastoHormiga[] = []
  for (const [clave, g] of grupos) {
    if (g.fechas.length < minimo) continue
    const f = [...g.fechas].sort()
    const huecos = f.slice(1).map((x, i) => dias(f[i], x)).sort((a, b) => a - b)
    const cadaDias = huecos.length ? huecos[Math.floor(huecos.length / 2)] : null
    salida.push({ clave, nombre: g.nombre, cuentaId: g.cuentaId, n: g.fechas.length, total: g.total, promedio: Math.round(g.total / g.fechas.length), cadaDias, ultimaFecha: f[f.length - 1], anualProyectado: Math.round((g.total / ventanaDias) * 365) })
  }
  return salida.sort((a, b) => b.anualProyectado - a.anualProyectado || a.nombre.localeCompare(b.nombre))
}

// ── Recomendaciones ────────────────────────────────────────────────────────────────────

export type Recomendacion = { id: string; nivel: 'atencion' | 'info'; titulo: string; detalle: string }

/** Frases con su cifra: cada recomendación sale de una regla visible, no de una caja negra. */
export function recomendaciones(lineas: Linea[], cuentas: CuentaDeGasto[], hoy: string, rango?: Rango, formato: (centavos: number) => string = (c) => `$${Math.round(c / 100)}`): Recomendacion[] {
  const out: Recomendacion[] = []
  const t = totales(lineas, rango)
  const gastosTotales = t.gastosDeOperacion + t.gastosExternosNetos
  if (t.comisionCobrada + t.comisionPorCobrar > 0 && gastosTotales > 0) {
    const razon = Math.round((gastosTotales / (t.comisionCobrada + t.comisionPorCobrar)) * 100)
    if (razon >= 40) out.push({ id: 'gasto-vs-ingreso', nivel: 'atencion', titulo: `Los gastos se llevan el ${razon} % de la comisión`, detalle: `${formato(gastosTotales)} de gastos contra ${formato(t.comisionCobrada + t.comisionPorCobrar)} de comisión en el periodo. Revisa cuáles se pueden recortar o ligar a un cierre.` })
  }
  const cats = porCategoria(lineas, rango)
  if (cats[0] && cats[0].parte >= 50 && cats.length > 1) out.push({ id: 'concentracion', nivel: 'info', titulo: `«${cats[0].etiqueta}» concentra el ${Math.round(cats[0].parte)} % del gasto`, detalle: `${formato(cats[0].neto)} de ${formato(cats.reduce((s, c) => s + Math.max(c.neto, 0), 0))}. Si algo se negocia o se recorta, empieza por ahí.` })
  const hormiga = gastosHormiga(lineas, hoy)
  if (hormiga.length) {
    const anual = hormiga.reduce((s, h) => s + h.anualProyectado, 0)
    out.push({ id: 'hormiga', nivel: 'atencion', titulo: `${hormiga.length} ${hormiga.length === 1 ? 'gasto hormiga' : 'gastos hormiga'}: ${formato(anual)} al año`, detalle: `Cargos pequeños que se repiten (${hormiga.slice(0, 3).map((h) => h.nombre).join(', ')}${hormiga.length > 3 ? '…' : ''}). Cancela o consolida lo que ya no se use.` })
  }
  const sinCierre = porPropiedad(lineas, rango).filter((p) => p.situacion === 'sin_cierre' && p.gastosLigados > 0)
  if (sinCierre.length) out.push({ id: 'sin-cierre', nivel: 'atencion', titulo: `${sinCierre.length} ${sinCierre.length === 1 ? 'propiedad con gasto y sin cierre' : 'propiedades con gasto y sin cierre'}`, detalle: `${formato(sinCierre.reduce((s, p) => s + p.gastosLigados, 0))} puestos en ${sinCierre.slice(0, 3).map((p) => p.etiqueta).join(', ')}${sinCierre.length > 3 ? '…' : ''} sin comisión todavía.` })
  const devPorCuenta = new Map<string, number>()
  for (const l of lineas) if (l.vigente && l.clase === 'devolucion' && l.cuentaId && enRango(l, rango)) devPorCuenta.set(l.cuentaId, (devPorCuenta.get(l.cuentaId) ?? 0) + 1)
  for (const [id, veces] of devPorCuenta) if (veces >= 2) out.push({ id: `devoluciones-${id}`, nivel: 'atencion', titulo: `«${cuentas.find((c) => c.id === id)?.nombre ?? 'Un proveedor'}» acumula ${veces} devoluciones`, detalle: 'Devoluciones repetidas suelen indicar mala calidad: vale la pena cambiar de proveedor o pedir condiciones por escrito.' })
  const viejas = lineas.filter((l) => l.vigente && (l.clase === 'comision' || l.clase === 'comision_externa') && l.estado === 'por_cobrar' && dias(l.fecha, hoy) > 30)
  if (viejas.length) out.push({ id: 'por-cobrar', nivel: 'atencion', titulo: `${viejas.length} ${viejas.length === 1 ? 'comisión lleva' : 'comisiones llevan'} más de 30 días por cobrar`, detalle: `${formato(viejas.reduce((s, l) => s + l.monto, 0))} cerrados y sin cobrar. Es dinero ya ganado: da seguimiento.` })
  const ultimo = new Map<string, string>()
  for (const l of lineas) if (l.vigente && l.clase === 'gasto' && l.cuentaId && (!ultimo.get(l.cuentaId) || l.fecha > (ultimo.get(l.cuentaId) as string))) ultimo.set(l.cuentaId, l.fecha)
  const dormidas = cuentas.filter((c) => c.activa && (ultimo.get(c.id) ? dias(ultimo.get(c.id) as string, hoy) > 90 : dias(c.creado_en.slice(0, 10), hoy) > 90))
  if (dormidas.length) out.push({ id: 'cuentas-dormidas', nivel: 'info', titulo: `${dormidas.length} ${dormidas.length === 1 ? 'cuenta de gasto activa sin movimientos' : 'cuentas de gasto activas sin movimientos'} en 90 días`, detalle: `${dormidas.slice(0, 3).map((c) => c.nombre).join(', ')}${dormidas.length > 3 ? '…' : ''}. Si ya no se usan, desactívalas para que no estorben.` })
  return out
}

// ── Diario: filtros y CSV ──────────────────────────────────────────────────────────────

export type FiltroDeDiario = { desde?: string; hasta?: string; sentido?: '' | 'entra' | 'sale'; categoria?: string; cuentaId?: string; propiedadId?: string; texto?: string; incluirAnuladas?: boolean }
export function filtrarDiario(lineas: Linea[], f: FiltroDeDiario): Linea[] {
  const q = normalizarConcepto(f.texto ?? '')
  const crudo = (f.texto ?? '').trim().toLowerCase()
  return lineas.filter((l) =>
    (f.incluirAnuladas !== false || l.vigente)
    && enRango(l, f)
    && (!f.sentido || l.sentido === f.sentido)
    && (!f.categoria || l.categoria === f.categoria)
    && (!f.cuentaId || l.cuentaId === f.cuentaId)
    && (!f.propiedadId || l.propiedadId === f.propiedadId)
    && (!crudo || normalizarConcepto(`${l.concepto} ${l.propiedadEtiqueta ?? ''}`).includes(q) || (l.referencia ?? '').toLowerCase().includes(crudo)))
}

/** Un número con signo opcional y decimales («-1500.00»): para Excel es un número, no una fórmula. */
const ES_NUMERO = /^-?\d+(\.\d+)?$/
/**
 * Una celda de CSV a salvo: comillas dobles escapadas y, si empieza con = + - @ (una «fórmula» al abrirlo en Excel), se antepone un apóstrofo.
 * Un importe negativo («-1500.00») NO se neutraliza: es un número y con el apóstrofo Excel lo leería como texto y no se podría sumar (corregido el 26-oct-2026).
 * Cualquier otra cosa que empiece con «-» («-2+3», «-cmd|…») sigue neutralizada.
 */
export function celdaCsv(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s) && !ES_NUMERO.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const ETIQ_ESTADO: Record<EstadoDeLinea, string> = { cobrado: 'Cobrado', por_cobrar: 'Por cobrar', comprometido: 'Comprometido', registrado: 'Registrado', anulado: 'Anulado' }
/** El diario como CSV (pesos con dos decimales; el que entra en positivo y el que sale en negativo). El archivo lleva BOM aparte, al descargar. */
export function diarioACsv(lineas: Linea[], cuentas: CuentaDeGasto[]): string {
  const cuenta = new Map(cuentas.map((c) => [c.id, c.nombre]))
  const filas = [['Fecha', 'Entra/Sale', 'Tipo', 'Categoría', 'Concepto', 'Cuenta', 'Propiedad', 'Referencia', 'Estado', 'Cuenta en totales', 'Monto (MXN)'].map(celdaCsv).join(',')]
  for (const l of lineas) {
    const monto = ((l.sentido === 'sale' ? -l.monto : l.monto) / 100).toFixed(2)
    filas.push([l.fecha, l.sentido === 'entra' ? 'Entra' : 'Sale', l.clase, ETIQUETA_CATEGORIA[l.categoria] ?? l.categoria, l.concepto, l.cuentaId ? cuenta.get(l.cuentaId) ?? '' : '', l.propiedadEtiqueta ?? '', l.referencia ?? '', ETIQ_ESTADO[l.estado], l.vigente ? 'Sí' : 'No', monto].map(celdaCsv).join(','))
  }
  return filas.join('\r\n')
}


// ── Correcciones ───────────────────────────────────────────────────────────────────────

export type Correccion = { devolver: boolean; anular: boolean; /** Lo que queda por devolver (y lo que revierte una anulación), en centavos. */ restante: number }
/**
 * Qué se puede hacer con una línea del diario: solo los movimientos manuales vigentes se corrigen (las operaciones se anulan desde Comisiones).
 * Un gasto o un ingreso extra admite devolución parcial o anulación mientras quede algo; una devolución solo se anula. El servidor lo vuelve a decidir.
 */
export function correccionesPosibles(linea: Linea, lineas: Linea[]): Correccion {
  const ninguna = { devolver: false, anular: false, restante: 0 }
  if (linea.origen !== 'manual' || !linea.vigente) return ninguna
  const id = linea.id.replace(/^mov:/, '')
  if (linea.clase === 'devolucion' || linea.clase === 'aportacion_grupo' || linea.clase === 'aportacion_recibida_grupo' || linea.clase === 'pago_colaborador') return { devolver: false, anular: true, restante: linea.monto }
  if (linea.clase !== 'gasto' && linea.clase !== 'ingreso_extra') return ninguna
  const devuelto = lineas.filter((l) => l.vigente && l.clase === 'devolucion' && l.reversoDe === id).reduce((s, l) => s + l.monto, 0)
  const restante = linea.monto - devuelto
  return restante > 0 ? { devolver: true, anular: true, restante } : ninguna
}

/** La fecha de HOY en el reloj de la persona (AAAA-MM-DD). `toISOString()` da la de UTC y, en México, después de las 6 pm ya es «mañana». El servidor valida contra UTC: la local nunca la rebasa en México. */
export function fechaLocalISO(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

// ── Periodos ───────────────────────────────────────────────────────────────────────────

export type Periodo = 'mes' | 'tres_meses' | 'doce_meses' | 'todo'
export const ETIQUETA_PERIODO: Readonly<Record<Periodo, string>> = Object.freeze({ mes: 'Este mes', tres_meses: 'Últimos 3 meses', doce_meses: 'Últimos 12 meses', todo: 'Todo' })
/** El rango de fechas de un periodo: «este mes» empieza el día 1; «3 meses» y «12 meses» abarcan el mes de hoy y los anteriores completos. */
export function rangoDePeriodo(periodo: Periodo, hoy: string): Rango {
  if (periodo === 'todo') return {}
  const meses = periodo === 'mes' ? 1 : periodo === 'tres_meses' ? 3 : 12
  return { desde: `${mesesHasta(hoy, meses)[0]}-01`, hasta: hoy }
}

// ── Sugerencia de categoría (sin IA externa) ───────────────────────────────────────────

const REGLAS_DE_CATEGORIA: ReadonlyArray<readonly [CategoriaDeGasto, RegExp]> = [
  ['publicidad_impresa', /\b(lona|lonas|volante|volantes|rotulo|rotulos|espectacular|impres|banner|letrero|cartel|mampara)/],
  ['publicidad_digital', /\b(meta|facebook|instagram|google ads|adwords|tiktok|campana|anuncio|pauta|youtube|linkedin|mailchimp|whatsapp business)/],
  ['fotografia_video', /\b(foto|fotos|fotografia|fotografo|video|dron|drone|recorrido virtual|tour virtual|matterport)/],
  ['gestoria_legal', /\b(notario|notaria|gestor|gestoria|abogado|avaluo|certificado|predial|registro publico|escritura|contrato)/],
  ['software_suscripciones', /\b(suscripcion|licencia|software|canva|crm|hosting|dominio|zoom|google workspace|office|chatgpt|plataforma|app)\b/],
  ['transporte', /\b(gasolina|caseta|casetas|uber|taxi|estacionamiento|viaje|pasaje|kilometraje)/],
  ['oficina', /\b(papeleria|oficina|renta de oficina|luz|internet|telefono|agua|limpieza|mobiliario|cafe)\b/],
  ['honorarios_externos', /\b(honorarios|freelance|disenador|community manager|asesor externo|capacitacion)/],
  ['comision_externa', /\b(comision a|referido|referencia pagada|bono)/],
  ['impuestos_derechos', /\b(impuesto|isr|iva|sat|derechos|multa|recargo)\b/],
]
/** Una pista, no una orden: la categoría más probable para un concepto, o null. La persona siempre confirma. Funciona sin enviar nada fuera. */
export function sugerirCategoria(concepto: string): CategoriaDeGasto | null {
  const t = normalizarConcepto(concepto)
  if (t.length < 3) return null
  for (const [cat, re] of REGLAS_DE_CATEGORIA) if (re.test(t)) return cat
  return null
}

// ── Resumen para el asesor de IA ───────────────────────────────────────────────────────

const p0 = (c: number) => Math.round(c / 100)
/**
 * Lo único que se manda a un modelo de IA: cifras agregadas en pesos enteros y los nombres de categorías, cuentas y propiedades (negocio, no personas).
 * Nunca correos, teléfonos, motivos ni el texto libre de los conceptos de los gastos sueltos.
 */
export function resumenParaIA(lineas: Linea[], cuentas: CuentaDeGasto[], hoy: string, rango: Rango, nombrePeriodo: string) {
  const t = totales(lineas, rango)
  return {
    periodo: nombrePeriodo, hoy,
    totales_mxn: { entra: p0(t.entra), sale: p0(t.sale), queda: p0(t.neto), comision_cobrada: p0(t.comisionCobrada), comision_por_cobrar: p0(t.comisionPorCobrar), colaboradores: p0(t.colaboradores), gastos_de_operacion: p0(t.gastosDeOperacion), gastos_externos_netos: p0(t.gastosExternosNetos), devoluciones: p0(t.devoluciones), ingresos_extra: p0(t.ingresosExtra) },
    gasto_por_categoria: porCategoria(lineas, rango).slice(0, 8).map((c) => ({ categoria: c.etiqueta, mxn: p0(c.neto), porcentaje: c.parte })),
    gasto_por_cuenta: porCuenta(lineas, cuentas, rango).filter((c) => c.neto > 0).slice(0, 6).map((c) => ({ cuenta: c.nombre, mxn: p0(c.neto) })),
    gastos_hormiga: gastosHormiga(lineas, hoy).slice(0, 5).map((h) => ({ concepto: h.cuentaId ? (cuentas.find((c) => c.id === h.cuentaId)?.nombre ?? 'cuenta') : 'gasto sin cuenta', cargos: h.n, cada_dias: h.cadaDias, anual_proyectado_mxn: p0(h.anualProyectado) })),
    propiedades: porPropiedad(lineas, rango).slice(0, 8).map((p) => ({ propiedad: p.etiqueta, comision_mxn: p0(p.comision), deja_mxn: p0(p.neto), situacion: p.situacion })),
    alertas_calculadas: recomendaciones(lineas, cuentas, hoy, rango, (c) => `$${p0(c)}`).map((r) => r.titulo),
  }
}
