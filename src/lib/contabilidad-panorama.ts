import { etiquetaDeMes, mesesHasta } from './comision-resumen'
import { normalizarConcepto, sugerirCategoria, type Linea, type Rango } from './contabilidad'

/** Palabras que, en el concepto de un gasto de operación, lo vuelven «promoción» (ya sin acentos ni signos). */
const ES_PROMOCION = /(publicid|promoci|marketing|anunci|campana|lona|volante|rotulo|espectacular|banner|fotograf|video|dron|recorrido virtual|tour virtual|meta ads|facebook|instagram|google ads)/

/**
 * Panorama de comisiones (26-oct-2026): todo el dinero junto y analizado. Qué entra (por mes, por venta o renta, por tipo de propiedad, por zona), en qué se gasta, cuánto se
 * gasta en promoción (publicidad, lonas, fotografía), qué propiedades y qué tipos de propiedad rinden más por cada peso invertido, y COMPROBACIONES de que los números cuadren.
 * Código puro: sin base, sin red y sin reloj. Dinero en centavos enteros. Solo cuenta lo vigente (lo anulado no suma) dentro del rango.
 *
 * Definiciones (las mismas que se muestran en pantalla):
 *  · Comisión = lo que cobra VIVE BIEN en la operación (total). Comisión neta = comisión − la parte del colaborador.
 *  · Gastos ligados = los de operación (los capturados con el cierre) + los gastos externos ligados a la propiedad, netos de devoluciones.
 *  · Promoción = publicidad digital e impresa y fotografía/video; en los gastos de una operación se reconoce por el concepto (p. ej. «Publicidad», «Fotografía»).
 *  · Utilidad de una propiedad = comisión neta − gastos ligados. Retorno = comisión neta ÷ gastos ligados («por cada $1 gastado, $X de comisión neta»).
 *  · Los gastos que no están ligados a ninguna propiedad (una cuenta de Meta, la oficina) son GASTO GENERAL: no se reparten a la fuerza entre propiedades; se muestran aparte.
 */

export type DatosDePropiedad = { tipo: string | null; subtipo: string | null; operacion: string | null; colonia: string | null; ciudad: string | null }
export type GrupoDeGasto = 'promocion' | 'comision_externa' | 'administracion' | 'otros_de_operacion'
export const ETIQUETA_GRUPO: Readonly<Record<GrupoDeGasto, string>> = Object.freeze({ promocion: 'Promoción (publicidad y fotografía)', comision_externa: 'Comisión a terceros', administracion: 'Administración y otros', otros_de_operacion: 'Otros gastos de operación' })
const PROMO = new Set(['publicidad_digital', 'publicidad_impresa', 'fotografia_video'])
export const ETIQUETA_TIPO: Readonly<Record<string, string>> = Object.freeze({ casa: 'Casa', departamento: 'Departamento', terreno: 'Terreno', local: 'Local comercial', bodega: 'Bodega', nave: 'Nave industrial', oficina: 'Oficina', sin_dato: 'Sin tipo registrado' })
export const etiquetaDeTipo = (t: string) => ETIQUETA_TIPO[t] ?? (t ? t[0].toUpperCase() + t.slice(1) : 'Sin tipo registrado')

const enRango = (l: Pick<Linea, 'fecha'>, r?: Rango) => (!r?.desde || l.fecha >= r.desde) && (!r?.hasta || l.fecha <= r.hasta)

/** A qué grupo de gasto pertenece una línea que es gasto (o la devolución de un gasto). `null` si no es un gasto. */
export function grupoDeGasto(l: Pick<Linea, 'clase' | 'categoria' | 'concepto'>): GrupoDeGasto | null {
  if (l.clase === 'gasto' || (l.clase === 'devolucion' && l.categoria !== 'ingreso_extra')) {
    if (PROMO.has(l.categoria)) return 'promocion'
    return l.categoria === 'comision_externa' ? 'comision_externa' : 'administracion'
  }
  if (l.clase === 'gasto_operacion') {
    // El gasto de una operación trae solo un concepto libre («Publicidad», «Fotografía», «Notaría»): se reconoce por palabras.
    const concepto = l.concepto.split(' · ')[0]
    const cat = sugerirCategoria(concepto)
    return (cat && PROMO.has(cat)) || ES_PROMOCION.test(normalizarConcepto(concepto)) ? 'promocion' : 'otros_de_operacion'
  }
  return null
}
/** El signo con que una línea entra a los gastos: el gasto suma; su devolución resta. */
const signo = (l: Pick<Linea, 'clase'>) => (l.clase === 'devolucion' ? -1 : 1)

export type Metricas = {
  cierres: number
  comision: number
  colaborador: number
  /** Comisión menos la parte del colaborador. */
  comisionNeta: number
  promocion: number
  otrosGastos: number
  gastos: number
  utilidad: number
  /** utilidad ÷ comisión, en %. */
  margen: number | null
  /** comisión neta ÷ gastos: por cada $1 gastado, cuánta comisión neta. `null` si no se gastó nada. */
  retorno: number | null
  /** comisión neta ÷ promoción. */
  retornoDePromocion: number | null
  ticket: number
}
const vacia = (): Metricas => ({ cierres: 0, comision: 0, colaborador: 0, comisionNeta: 0, promocion: 0, otrosGastos: 0, gastos: 0, utilidad: 0, margen: null, retorno: null, retornoDePromocion: null, ticket: 0 })
function cerrar<T extends Metricas>(m: T): T {
  m.comisionNeta = m.comision - m.colaborador
  m.gastos = m.promocion + m.otrosGastos
  m.utilidad = m.comisionNeta - m.gastos
  m.margen = m.comision > 0 ? Math.round((m.utilidad / m.comision) * 1000) / 10 : null
  m.retorno = m.gastos > 0 ? Math.round((m.comisionNeta / m.gastos) * 100) / 100 : null
  m.retornoDePromocion = m.promocion > 0 ? Math.round((m.comisionNeta / m.promocion) * 100) / 100 : null
  m.ticket = m.cierres ? Math.round(m.comision / m.cierres) : 0
  return m
}
function sumar(m: Metricas, l: Linea) {
  if (l.clase === 'comision') { m.comision += l.monto; m.cierres += 1 }
  else if (l.clase === 'colaborador') m.colaborador += l.monto
  else {
    const g = grupoDeGasto(l)
    if (g) { if (g === 'promocion') m.promocion += signo(l) * l.monto; else m.otrosGastos += signo(l) * l.monto }
  }
}

export type FilaDePropiedad = Metricas & { propiedadId: string; etiqueta: string; tipo: string; operacion: string | null; colonia: string | null }
export type FilaDeGrupo = Metricas & { clave: string; etiqueta: string; propiedades: number; parteDelIngreso: number }
/** Venta o renta: solo ingresos (los gastos externos pertenecen a una propiedad, no a una operación). */
export type FilaDeOperacion = { clave: 'venta' | 'renta'; etiqueta: string; cierres: number; propiedades: number; comision: number; colaborador: number; comisionNeta: number; ticket: number; parteDelIngreso: number }

export type Panorama = {
  totales: Metricas
  /** Gastos que no están ligados a ninguna propiedad (netos de devoluciones), por grupo. */
  gastoGeneral: { total: number; porGrupo: Array<{ grupo: GrupoDeGasto; etiqueta: string; monto: number }> }
  /** Utilidad de la empresa: la de las propiedades menos el gasto general. */
  utilidadDeLaEmpresa: number
  porTipoDePropiedad: FilaDeGrupo[]
  porOperacion: FilaDeOperacion[]
  porZona: FilaDeGrupo[]
  propiedades: FilaDePropiedad[]
  mensual: Array<{ mes: string; etiqueta: string; venta: number; renta: number; promocion: number; otrosGastos: number; colaborador: number; utilidad: number }>
  gastosPorGrupo: Array<{ grupo: GrupoDeGasto; etiqueta: string; monto: number; parte: number }>
  /** Las que más gastan en promoción, de mayor a menor. */
  masPromocion: FilaDePropiedad[]
  /** Mejor y peor retorno por peso gastado (solo propiedades con gasto). */
  mejorRetorno: FilaDePropiedad[]
  peorRetorno: FilaDePropiedad[]
  lecturas: Lectura[]
  calidad: Comprobacion[]
}
export type Lectura = { id: string; nivel: 'info' | 'atencion'; titulo: string; detalle: string }
export type Comprobacion = { id: string; ok: boolean; titulo: string; detalle: string }

const MUESTRA_MINIMA = 3

export function construirPanorama(lineas: Linea[], propiedades: Record<string, DatosDePropiedad>, opciones: { rango?: Rango; hoy: string; formato?: (centavos: number) => string }): Panorama {
  const fmt = opciones.formato ?? ((c: number) => `$${Math.round(c / 100)}`)
  const vig = lineas.filter((l) => l.vigente && enRango(l, opciones.rango))
  const info = (id: string | null): DatosDePropiedad | undefined => (id ? propiedades[id] : undefined)

  // — Por propiedad —
  const porId = new Map<string, FilaDePropiedad>()
  const general = new Map<GrupoDeGasto, number>()
  const totales = vacia()
  for (const l of vig) {
    const esIngresoCierre = l.clase === 'comision' || l.clase === 'colaborador'
    const g = grupoDeGasto(l)
    if (!esIngresoCierre && !g) continue
    sumar(totales, l)
    if (!l.propiedadId) { if (g) general.set(g, (general.get(g) ?? 0) + signo(l) * l.monto); continue }
    const d = info(l.propiedadId)
    const f = porId.get(l.propiedadId) ?? { ...vacia(), propiedadId: l.propiedadId, etiqueta: l.propiedadEtiqueta ?? l.propiedadId, tipo: d?.tipo ?? 'sin_dato', operacion: d?.operacion ?? l.tipoOp ?? null, colonia: d?.colonia ?? null }
    sumar(f, l)
    if (l.tipoOp && !f.operacion) f.operacion = l.tipoOp
    porId.set(l.propiedadId, f)
  }
  cerrar(totales)
  const filas = [...porId.values()].map((f) => cerrar(f))

  // — Agrupaciones —
  const agrupar = (clave: (f: FilaDePropiedad) => string, etiqueta: (c: string) => string): FilaDeGrupo[] => {
    const m = new Map<string, FilaDeGrupo>()
    for (const f of filas) {
      const k = clave(f)
      const g = m.get(k) ?? { ...vacia(), clave: k, etiqueta: etiqueta(k), propiedades: 0, parteDelIngreso: 0 }
      g.cierres += f.cierres; g.comision += f.comision; g.colaborador += f.colaborador; g.promocion += f.promocion; g.otrosGastos += f.otrosGastos; g.propiedades += 1
      m.set(k, g)
    }
    const lista = [...m.values()].map((g) => cerrar(g))
    for (const g of lista) g.parteDelIngreso = totales.comision > 0 ? Math.round((g.comision / totales.comision) * 1000) / 10 : 0
    return lista.sort((a, b) => b.comision - a.comision || b.utilidad - a.utilidad)
  }
  const porTipoDePropiedad = agrupar((f) => f.tipo, etiquetaDeTipo)
  const porZona = agrupar((f) => f.colonia || 'sin_dato', (c) => (c === 'sin_dato' ? 'Sin zona registrada' : c)).slice(0, 8)
  // Venta o renta: se sabe por la línea de la comisión. Solo se comparan los INGRESOS (comisión, parte del colaborador, ticket): los gastos externos no pertenecen a una
  // operación sino a una propiedad, así que mostrarlos aquí daría una utilidad incompleta.
  const op = new Map<'venta' | 'renta', FilaDeOperacion>((['venta', 'renta'] as const).map((k) => [k, { clave: k, etiqueta: k === 'venta' ? 'Ventas' : 'Rentas', cierres: 0, propiedades: 0, comision: 0, colaborador: 0, comisionNeta: 0, ticket: 0, parteDelIngreso: 0 }]))
  const propsPorOp = new Map<'venta' | 'renta', Set<string>>([['venta', new Set()], ['renta', new Set()]])
  const tipoDeOperacion = new Map<string, 'venta' | 'renta'>()
  for (const l of vig) {
    if (l.clase !== 'comision' || !l.tipoOp) continue
    const o = op.get(l.tipoOp)!
    o.comision += l.monto; o.cierres += 1
    if (l.propiedadId) propsPorOp.get(l.tipoOp)!.add(l.propiedadId)
    if (l.operacionId) tipoDeOperacion.set(l.operacionId, l.tipoOp)
  }
  for (const l of vig) if (l.clase === 'colaborador' && l.operacionId) { const t = tipoDeOperacion.get(l.operacionId); if (t) op.get(t)!.colaborador += l.monto }
  const porOperacion = [...op.values()].filter((o) => o.cierres > 0).map((o) => ({ ...o, propiedades: propsPorOp.get(o.clave)!.size, comisionNeta: o.comision - o.colaborador, ticket: Math.round(o.comision / o.cierres), parteDelIngreso: totales.comision > 0 ? Math.round((o.comision / totales.comision) * 1000) / 10 : 0 }))

  // — Gasto general (sin propiedad) y utilidad de la empresa —
  const porGrupoGeneral = [...general.entries()].filter(([, v]) => v !== 0).map(([grupo, monto]) => ({ grupo, etiqueta: ETIQUETA_GRUPO[grupo], monto })).sort((a, b) => b.monto - a.monto)
  const gastoGeneral = { total: porGrupoGeneral.reduce((s, x) => s + x.monto, 0), porGrupo: porGrupoGeneral }
  const utilidadDeLaEmpresa = totales.utilidad // `totales` ya incluye el gasto general: es comisión neta − todos los gastos

  // — Mensual (últimos 12 meses hasta hoy; independiente del rango, para ver la tendencia) —
  const meses = mesesHasta(opciones.hoy, 12)
  const serie = new Map(meses.map((m) => [m, { mes: m, etiqueta: etiquetaDeMes(m), venta: 0, renta: 0, promocion: 0, otrosGastos: 0, colaborador: 0, utilidad: 0 }]))
  for (const l of lineas) {
    if (!l.vigente) continue
    const p = serie.get(l.fecha.slice(0, 7))
    if (!p) continue
    if (l.clase === 'comision') { if (l.tipoOp === 'renta') p.renta += l.monto; else p.venta += l.monto }
    else if (l.clase === 'colaborador') p.colaborador += l.monto
    else { const g = grupoDeGasto(l); if (g === 'promocion') p.promocion += signo(l) * l.monto; else if (g) p.otrosGastos += signo(l) * l.monto }
  }
  for (const p of serie.values()) p.utilidad = p.venta + p.renta - p.colaborador - p.promocion - p.otrosGastos

  // — Gasto por grupo —
  const porGrupo = new Map<GrupoDeGasto, number>()
  for (const l of vig) { const g = grupoDeGasto(l); if (g) porGrupo.set(g, (porGrupo.get(g) ?? 0) + signo(l) * l.monto) }
  const totalGastos = [...porGrupo.values()].reduce((s, v) => s + Math.max(v, 0), 0)
  const gastosPorGrupo = [...porGrupo.entries()].filter(([, v]) => v > 0).map(([grupo, monto]) => ({ grupo, etiqueta: ETIQUETA_GRUPO[grupo], monto, parte: totalGastos > 0 ? Math.round((monto / totalGastos) * 1000) / 10 : 0 })).sort((a, b) => b.monto - a.monto)

  // — Rankings —
  const masPromocion = [...filas].filter((f) => f.promocion > 0).sort((a, b) => b.promocion - a.promocion).slice(0, 5)
  const conGasto = filas.filter((f) => f.gastos > 0 && f.retorno !== null)
  const mejorRetorno = [...conGasto].filter((f) => f.cierres > 0).sort((a, b) => (b.retorno ?? 0) - (a.retorno ?? 0)).slice(0, 5)
  const peorRetorno = [...conGasto].sort((a, b) => (a.retorno ?? 0) - (b.retorno ?? 0)).slice(0, 5)

  // — Lecturas: lo que dicen los números, con su cifra y con la advertencia cuando la muestra es chica —
  const lecturas: Lectura[] = []
  const tiposConDato = porTipoDePropiedad.filter((t) => t.clave !== 'sin_dato' && t.comision > 0)
  if (tiposConDato.length) {
    const t = tiposConDato[0]
    lecturas.push({ id: 'tipo-que-mas-deja', nivel: 'info', titulo: `«${t.etiqueta}» es el tipo que más comisión aporta: ${t.parteDelIngreso} % del ingreso`, detalle: `${fmt(t.comision)} en ${t.cierres} ${t.cierres === 1 ? 'cierre' : 'cierres'} de ${t.propiedades} ${t.propiedades === 1 ? 'propiedad' : 'propiedades'}; utilidad ${fmt(t.utilidad)}.${t.cierres < MUESTRA_MINIMA ? ' Muestra chica: con menos de 3 cierres no es una tendencia.' : ''}` })
  }
  const conRetorno = porTipoDePropiedad.filter((t) => t.retorno !== null && t.cierres > 0 && t.clave !== 'sin_dato')
  if (conRetorno.length >= 2) {
    const ordenados = [...conRetorno].sort((a, b) => (b.retorno ?? 0) - (a.retorno ?? 0))
    const mejor = ordenados[0]; const peor = ordenados.at(-1)!
    if (mejor.clave !== peor.clave) lecturas.push({ id: 'donde-conviene-invertir', nivel: 'info', titulo: `Donde más rinde cada peso: «${mejor.etiqueta}» (${mejor.retorno}×) frente a «${peor.etiqueta}» (${peor.retorno}×)`, detalle: `Por cada $1 gastado, ${mejor.etiqueta.toLowerCase()} devuelve $${mejor.retorno} de comisión neta y ${peor.etiqueta.toLowerCase()}, $${peor.retorno}.${Math.min(mejor.cierres, peor.cierres) < MUESTRA_MINIMA ? ' Ojo: alguno de los dos tiene menos de 3 cierres; úsalo como pista, no como regla.' : ' Si hay que decidir dónde poner más promoción, empieza por el primero.'}` })
  }
  const pierden = filas.filter((f) => f.utilidad < 0)
  if (pierden.length) lecturas.push({ id: 'propiedades-que-pierden', nivel: 'atencion', titulo: `${pierden.length} ${pierden.length === 1 ? 'propiedad cuesta más de lo que deja' : 'propiedades cuestan más de lo que dejan'}`, detalle: `${pierden.slice(0, 3).map((f) => `${f.etiqueta} (${fmt(f.utilidad)})`).join('; ')}${pierden.length > 3 ? '…' : ''}.` })
  const sinCierre = filas.filter((f) => f.cierres === 0 && f.gastos > 0)
  if (sinCierre.length) lecturas.push({ id: 'gasto-sin-cierre', nivel: 'atencion', titulo: `${sinCierre.length} ${sinCierre.length === 1 ? 'propiedad con gasto y sin cierre' : 'propiedades con gasto y sin cierre'}: ${fmt(sinCierre.reduce((s, f) => s + f.gastos, 0))} sin retorno todavía`, detalle: `${sinCierre.slice(0, 3).map((f) => f.etiqueta).join(', ')}${sinCierre.length > 3 ? '…' : ''}.` })
  if (totales.promocion > 0 && totales.retornoDePromocion !== null) lecturas.push({ id: 'retorno-de-promocion', nivel: totales.retornoDePromocion < 2 ? 'atencion' : 'info', titulo: `Por cada $1 en promoción, ${totales.retornoDePromocion < 1 ? `solo $${totales.retornoDePromocion}` : `$${totales.retornoDePromocion}`} de comisión neta`, detalle: `${fmt(totales.promocion)} en promoción contra ${fmt(totales.comisionNeta)} de comisión neta del periodo. Es un cálculo de conjunto: un cierre de hoy puede venir de una promoción de hace meses.` })
  if (gastoGeneral.total > 0 && totales.comisionNeta > 0) {
    const p = Math.round((gastoGeneral.total / totales.comisionNeta) * 100)
    lecturas.push({ id: 'gasto-general', nivel: p >= 25 ? 'atencion' : 'info', titulo: `El gasto general (sin propiedad) es ${p} % de la comisión neta`, detalle: `${fmt(gastoGeneral.total)} que no se pueden atribuir a una propiedad. Si es publicidad, ligarla a la propiedad que promueve permite medir su retorno.` })
  }
  if (filas.length >= 3 && totales.comision > 0) {
    const top = [...filas].sort((a, b) => b.comision - a.comision).slice(0, 3)
    const p = Math.round((top.reduce((s, f) => s + f.comision, 0) / totales.comision) * 100)
    if (p >= 70 && filas.length > 3) lecturas.push({ id: 'concentracion', nivel: 'atencion', titulo: `3 propiedades concentran el ${p} % de la comisión`, detalle: `${top.map((f) => f.etiqueta).join(', ')}. Depender de pocas propiedades hace más frágil el ingreso.` })
  }

  // — Comprobaciones: que los números cuadren —
  const calidad: Comprobacion[] = []
  const sumaTipos = porTipoDePropiedad.reduce((s, t) => s + t.comision, 0)
  const sumaOp = porOperacion.reduce((s, o) => s + o.comision, 0)
  calidad.push({ id: 'suma-por-tipo', ok: sumaTipos === totales.comision, titulo: 'Las comisiones por tipo de propiedad suman el total', detalle: `${fmt(sumaTipos)} por tipo contra ${fmt(totales.comision)} de total.` })
  calidad.push({ id: 'suma-por-operacion', ok: sumaOp === totales.comision, titulo: 'Ventas más rentas suman el total de comisiones', detalle: `${fmt(sumaOp)} contra ${fmt(totales.comision)}.` })
  const ligados = filas.reduce((s, f) => s + f.gastos, 0)
  calidad.push({ id: 'suma-de-gastos', ok: ligados + gastoGeneral.total === totales.gastos, titulo: 'Gastos ligados + gasto general suman todos los gastos', detalle: `${fmt(ligados)} + ${fmt(gastoGeneral.total)} contra ${fmt(totales.gastos)}.` })
  const conOperacionSinTipo = vig.filter((l) => l.clase === 'comision' && l.propiedadId && !info(l.propiedadId)?.tipo)
  calidad.push({ id: 'tipo-conocido', ok: conOperacionSinTipo.length === 0, titulo: 'Todas las operaciones tienen el tipo de su propiedad', detalle: conOperacionSinTipo.length ? `${conOperacionSinTipo.length} de ${totales.cierres} no tienen tipo registrado: se agrupan como «Sin tipo registrado» y no se pueden comparar.` : 'Sí: ningún cierre queda sin tipo.' })
  const gastoExterno = vig.filter((l) => l.clase === 'gasto').reduce((s, l) => s + l.monto, 0)
  const gastoExternoSinPropiedad = vig.filter((l) => l.clase === 'gasto' && !l.propiedadId).reduce((s, l) => s + l.monto, 0)
  const pctSin = gastoExterno > 0 ? Math.round((gastoExternoSinPropiedad / gastoExterno) * 100) : 0
  calidad.push({ id: 'gasto-ligado', ok: pctSin < 30, titulo: 'Los gastos externos están ligados a una propiedad', detalle: gastoExterno > 0 ? `${pctSin} % del gasto externo no está ligado a ninguna propiedad: sin ligarlo no se puede medir su retorno.` : 'No hay gastos externos en el periodo.' })
  calidad.push({ id: 'muestra', ok: totales.cierres >= 5, titulo: 'Hay suficientes cierres para ver tendencias', detalle: totales.cierres >= 5 ? `${totales.cierres} cierres en el periodo.` : `Solo ${totales.cierres} ${totales.cierres === 1 ? 'cierre' : 'cierres'}: las comparaciones son orientativas, no estadísticas.` })

  return {
    totales, gastoGeneral, utilidadDeLaEmpresa, porTipoDePropiedad, porOperacion, porZona, propiedades: filas.sort((a, b) => b.utilidad - a.utilidad),
    mensual: meses.map((m) => serie.get(m)!), gastosPorGrupo, masPromocion, mejorRetorno, peorRetorno, lecturas, calidad,
  }
}

/** Lo único que se manda a la IA del panorama: cifras agregadas en pesos enteros y nombres de tipos y propiedades (negocio, no personas). */
export function panoramaParaIA(p: Panorama, nombrePeriodo: string, hoy: string) {
  const p0 = (c: number) => Math.round(c / 100)
  const fila = (f: FilaDeGrupo) => ({ nombre: f.etiqueta, cierres: f.cierres, propiedades: f.propiedades, comision_mxn: p0(f.comision), comision_neta_mxn: p0(f.comisionNeta), promocion_mxn: p0(f.promocion), gastos_mxn: p0(f.gastos), utilidad_mxn: p0(f.utilidad), margen_pct: f.margen, retorno_por_peso: f.retorno, parte_del_ingreso_pct: f.parteDelIngreso })
  const prop = (f: FilaDePropiedad) => ({ propiedad: f.etiqueta, tipo: etiquetaDeTipo(f.tipo), cierres: f.cierres, comision_mxn: p0(f.comision), promocion_mxn: p0(f.promocion), gastos_mxn: p0(f.gastos), utilidad_mxn: p0(f.utilidad), retorno_por_peso: f.retorno })
  return {
    periodo: nombrePeriodo, hoy,
    totales_mxn: { cierres: p.totales.cierres, comision: p0(p.totales.comision), parte_de_colaboradores: p0(p.totales.colaborador), comision_neta: p0(p.totales.comisionNeta), promocion: p0(p.totales.promocion), otros_gastos: p0(p.totales.otrosGastos), utilidad: p0(p.utilidadDeLaEmpresa), margen_pct: p.totales.margen, retorno_por_peso: p.totales.retorno, retorno_de_la_promocion: p.totales.retornoDePromocion, gasto_general_sin_propiedad: p0(p.gastoGeneral.total) },
    por_tipo_de_propiedad: p.porTipoDePropiedad.map(fila),
    por_operacion: p.porOperacion.map((o) => ({ nombre: o.etiqueta, cierres: o.cierres, comision_mxn: p0(o.comision), comision_neta_mxn: p0(o.comisionNeta), ticket_mxn: p0(o.ticket), parte_del_ingreso_pct: o.parteDelIngreso })), por_zona: p.porZona.slice(0, 5).map(fila),
    gastos_por_grupo: p.gastosPorGrupo.map((g) => ({ grupo: g.etiqueta, mxn: p0(g.monto), parte_pct: g.parte })),
    propiedades_con_mas_promocion: p.masPromocion.map(prop), mejor_retorno: p.mejorRetorno.map(prop), peor_retorno: p.peorRetorno.map(prop),
    lecturas_calculadas: p.lecturas.map((l) => l.titulo), comprobaciones: p.calidad.map((c) => ({ comprobacion: c.titulo, cuadra: c.ok })),
  }
}
