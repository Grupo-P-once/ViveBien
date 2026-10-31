/**
 * MÉTRICAS de correo (30-oct-2026). Funciones PURAS: reciben filas ya leídas del libro (`correo_envios`) y de las bajas (`correo_suscriptores`) y devuelven
 * números y series. No leen la base, no usan reloj ni azar (el reloj entra por parámetro): por eso se pueden probar con datos sintéticos.
 *
 * Cada número tiene una DEFINICIÓN y una FUENTE (`DEFINICIONES`) que el panel muestra. Lo que Resend no entrega o no guardamos NO se inventa: va en `NO_DISPONIBLES`.
 * Los correos de SERVICIO o seguridad (categorías `transaccional` y `servicio`) y los PROMOCIONALES (`marketing`) nunca se suman: cada grupo tiene su propio bloque.
 * Un conteo de personas por debajo de `MIN_CELDA` se oculta («<5») y, si el grupo es así de pequeño, también su detalle por día.
 */
export const ZONA = 'America/Mexico_City'
export const MIN_CELDA = 5
export const MAX_DIAS = 366

export type Grupo = 'servicio' | 'promocional'
export type FiltroGrupo = 'todos' | Grupo
export type Celda = number | '<5'
export type FilaEnvio = { categoria: string; tipo: string; estado: string; momento: string }
export type FilaBaja = { baja_en: string }
export type Rango = { desde: string; hasta: string }
export type Filtro = Rango & { tipo: string | null; grupo: FiltroGrupo }

const ENVIADOS = new Set(['enviado', 'entregado', 'rebotado', 'queja'])
const ENTREGADOS = new Set(['entregado', 'queja'])
const OMITIDOS = new Set(['omitido', 'suprimido'])

export const grupoDe = (categoria: string): Grupo => (categoria === 'marketing' ? 'promocional' : 'servicio')
const celda = (n: number): Celda => (n > 0 && n < MIN_CELDA ? '<5' : n)

/** Día calendario (AAAA-MM-DD) de un instante en la zona de VIVE BIEN. */
export function diaLocal(instante: Date | string): string {
  const d = typeof instante === 'string' ? new Date(instante) : instante
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d)
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const aUtc = (dia: string) => Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)))
const deUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const fechaValida = (dia: string) => FECHA.test(dia) && deUtc(aUtc(dia)) === dia

export function diasDelRango({ desde, hasta }: Rango): string[] {
  const dias: string[] = []
  for (let t = aUtc(desde); t <= aUtc(hasta); t += 86_400_000) dias.push(deUtc(t))
  return dias
}

/** Últimos `n` días calendario, contando el de hoy (zona de VIVE BIEN). */
export function rangoDeUltimosDias(n: number, ahora: Date): Rango {
  const hasta = diaLocal(ahora)
  return { desde: deUtc(aUtc(hasta) - (n - 1) * 86_400_000), hasta }
}

/** Valida un rango personalizado: fechas reales, en orden, sin futuro (en la zona de VIVE BIEN) y de a lo más `MAX_DIAS` días. */
export function validarRango(r: Rango, ahora: Date): { ok: true } | { ok: false; error: string } {
  if (!fechaValida(r.desde) || !fechaValida(r.hasta)) return { ok: false, error: 'Las fechas deben ser reales y venir como AAAA-MM-DD.' }
  if (r.desde > r.hasta) return { ok: false, error: 'La fecha inicial debe ser anterior o igual a la final.' }
  if (r.hasta > diaLocal(ahora)) return { ok: false, error: 'La fecha final no puede ser futura.' }
  if ((aUtc(r.hasta) - aUtc(r.desde)) / 86_400_000 + 1 > MAX_DIAS) return { ok: false, error: `El periodo no puede pasar de ${MAX_DIAS} días.` }
  return { ok: true }
}

/** `null` = NO DISPONIBLE (no es cero): hoy sólo pasa con entregados, rebotes y quejas cuando falta el webhook de Resend (ver `sinDatosDelProveedor`). */
type DiaDeTrabajo = Omit<DiaDeSerie, 'entregados' | 'rebotes' | 'quejas'> & { entregados: number; rebotes: number; quejas: number }
export type Totales = { enviados: Celda; entregados: Celda | null; rebotes: Celda | null; quejas: Celda | null; fallos: Celda; omitidos: Celda; pendientes: Celda }
export type Tasa = { id: 'entrega' | 'rebote' | 'queja' | 'baja'; nombre: string; formula: string; valor: number | null; numerador: Celda | null; denominador: number; motivoSinDato: string | null }
export type DiaDeSerie = { dia: string; enviados: number; entregados: number | null; rebotes: number | null; quejas: number | null; fallos: number; omitidos: number; bajas?: number; bajasAcumuladas?: number }
export type Bloque = {
  grupo: Grupo
  /** `true` si el grupo es demasiado pequeño para mostrar detalle (1 a 4 envíos). */
  detalleOculto: boolean
  totales: Totales
  tasas: Tasa[]
  serie: DiaDeSerie[] | null
  bajas: null | { enPeriodo: Celda; vigentes: Celda; acumuladasAntes: number; atribuibleATipo: false }
}
export type Resultado = {
  periodo: Rango & { dias: number; zona: string }
  filtros: { tipo: string | null; grupo: FiltroGrupo }
  tipos: Array<{ id: string; total: number }>
  bloques: Bloque[]
  /** Métricas que no se pudieron obtener y por qué (el panel las marca «No disponible» en tarjetas, tasas y gráficas). */
  noDisponibles?: Array<{ metrica: string; motivo: string }>
}

type ContextoBajas = { filas: FilaBaja[]; acumuladasAntes: number; vigentes: number }

const pct = (n: number, d: number) => Math.round((n / d) * 1000) / 10

function bloque(grupo: Grupo, filas: FilaEnvio[], dias: string[], bajas: ContextoBajas | null): Bloque {
  const cuenta = { enviados: 0, entregados: 0, rebotes: 0, quejas: 0, fallos: 0, omitidos: 0, pendientes: 0 }
  const porDia = new Map<string, DiaDeTrabajo>(dias.map((d) => [d, { dia: d, enviados: 0, entregados: 0, rebotes: 0, quejas: 0, fallos: 0, omitidos: 0 }]))
  for (const f of filas) {
    const dia = porDia.get(diaLocal(f.momento))
    if (!dia) continue
    if (ENVIADOS.has(f.estado)) { cuenta.enviados++; dia.enviados++ }
    if (ENTREGADOS.has(f.estado)) { cuenta.entregados++; dia.entregados++ }
    if (f.estado === 'rebotado') { cuenta.rebotes++; dia.rebotes++ }
    if (f.estado === 'queja') { cuenta.quejas++; dia.quejas++ }
    if (f.estado === 'error') { cuenta.fallos++; dia.fallos++ }
    if (OMITIDOS.has(f.estado)) { cuenta.omitidos++; dia.omitidos++ }
    if (f.estado === 'pendiente') cuenta.pendientes++
  }
  const total = cuenta.enviados + cuenta.fallos + cuenta.omitidos + cuenta.pendientes
  const detalleOculto = total > 0 && total < MIN_CELDA

  let bajasEnPeriodo = 0
  let serie: DiaDeSerie[] | null = [...porDia.values()]
  if (grupo === 'promocional' && bajas) {
    const porDiaBajas = new Map<string, number>()
    for (const b of bajas.filas) { const d = diaLocal(b.baja_en); if (porDia.has(d)) porDiaBajas.set(d, (porDiaBajas.get(d) ?? 0) + 1) }
    bajasEnPeriodo = [...porDiaBajas.values()].reduce((a, b) => a + b, 0)
    let acumulado = bajas.acumuladasAntes
    for (const d of serie) { d.bajas = porDiaBajas.get(d.dia) ?? 0; acumulado += d.bajas; d.bajasAcumuladas = acumulado }
  }
  // El detalle por día sólo sale si el grupo no es diminuto; rebotes, quejas y bajas por día sólo si en el periodo suman al menos MIN_CELDA.
  if (detalleOculto) serie = null
  else if (serie) {
    const ocultaRebotes = cuenta.rebotes > 0 && cuenta.rebotes < MIN_CELDA
    const ocultaQuejas = cuenta.quejas > 0 && cuenta.quejas < MIN_CELDA
    const ocultaBajas = bajasEnPeriodo > 0 && bajasEnPeriodo < MIN_CELDA
    serie = serie.map((d) => ({ ...d, rebotes: ocultaRebotes ? 0 : d.rebotes, quejas: ocultaQuejas ? 0 : d.quejas, ...(d.bajas === undefined ? {} : { bajas: ocultaBajas ? 0 : d.bajas, bajasAcumuladas: ocultaBajas ? 0 : d.bajasAcumuladas }) }))
  }

  const c = (n: number): Celda => (detalleOculto ? '<5' : celda(n))
  const totales: Totales = { enviados: c(cuenta.enviados), entregados: c(cuenta.entregados), rebotes: c(cuenta.rebotes), quejas: c(cuenta.quejas), fallos: c(cuenta.fallos), omitidos: c(cuenta.omitidos), pendientes: c(cuenta.pendientes) }

  const tasa = (id: Tasa['id'], nombre: string, formula: string, num: number, den: number): Tasa => {
    if (detalleOculto || den < MIN_CELDA) return { id, nombre, formula, valor: null, numerador: null, denominador: den, motivoSinDato: den === 0 ? 'Sin envíos en el periodo.' : `Menos de ${MIN_CELDA} envíos: no alcanza para una tasa confiable.` }
    if (num > 0 && num < MIN_CELDA) return { id, nombre, formula, valor: null, numerador: '<5', denominador: den, motivoSinDato: `Menos de ${MIN_CELDA} casos: se oculta para no identificar a nadie.` }
    return { id, nombre, formula, valor: pct(num, den), numerador: num, denominador: den, motivoSinDato: null }
  }
  const tasas: Tasa[] = [
    tasa('entrega', 'Tasa de entrega', 'entregados ÷ enviados', cuenta.entregados, cuenta.enviados),
    tasa('rebote', 'Tasa de rebote', 'rebotes permanentes ÷ enviados', cuenta.rebotes, cuenta.enviados),
    tasa('queja', 'Tasa de quejas de spam', 'quejas ÷ enviados', cuenta.quejas, cuenta.enviados),
  ]
  if (grupo === 'promocional') tasas.push(tasa('baja', 'Tasa de baja', 'bajas del periodo ÷ promocionales enviados', bajasEnPeriodo, cuenta.enviados))

  return {
    grupo, detalleOculto, totales, tasas, serie,
    bajas: grupo === 'promocional' && bajas ? { enPeriodo: c(bajasEnPeriodo), vigentes: celda(bajas.vigentes), acumuladasAntes: bajas.acumuladasAntes, atribuibleATipo: false } : null,
  }
}

/** Calcula el panel de resultados a partir de filas ya leídas. */
export function calcular(filas: FilaEnvio[], bajas: ContextoBajas | null, filtro: Filtro): Resultado {
  const dias = diasDelRango(filtro)
  const enRango = filas.filter((f) => { const d = diaLocal(f.momento); return d >= filtro.desde && d <= filtro.hasta })
  const tipos = new Map<string, number>()
  for (const f of enRango) tipos.set(f.tipo, (tipos.get(f.tipo) ?? 0) + 1)
  const conTipo = filtro.tipo ? enRango.filter((f) => f.tipo === filtro.tipo) : enRango
  const grupos: Grupo[] = filtro.grupo === 'todos' ? ['servicio', 'promocional'] : [filtro.grupo]
  // «Acumuladas antes del periodo» incluye las bajas que el lector trajo por el margen de un día (anteriores al primer día elegido).
  const bajasCtx = bajas ? { ...bajas, acumuladasAntes: bajas.acumuladasAntes + bajas.filas.filter((b) => diaLocal(b.baja_en) < filtro.desde).length } : null
  return {
    periodo: { desde: filtro.desde, hasta: filtro.hasta, dias: dias.length, zona: ZONA },
    filtros: { tipo: filtro.tipo, grupo: filtro.grupo },
    tipos: [...tipos].map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id)),
    bloques: grupos.map((g) => bloque(g, conTipo.filter((f) => grupoDe(f.categoria) === g), dias, bajasCtx)),
  }
}

export const SIN_WEBHOOK = 'Falta el webhook de Resend en este entorno: sin él no llegan las entregas, los rebotes ni las quejas, así que no se puede medir (no es cero).'
/** El secreto existe pero Resend todavía no ha entregado NINGÚN evento verificado: un cero aquí sería indistinguible de «el webhook no está llegando». */
export const SIN_EVENTOS = 'El secreto del webhook está configurado, pero Resend todavía no ha entregado ningún evento verificado a este sistema (revisa que el webhook esté registrado en Resend y apunte a esta dirección): entregas, rebotes y quejas no se pueden medir todavía (no es cero).'

/**
 * Sin webhook del proveedor las entregas, los rebotes y las quejas NO se pueden saber: el libro no los actualiza. En vez de mostrar ceros que parecen medidos,
 * se marcan como no disponibles (`null`) en totales, tasas y series. Enviados, fallos, omitidos y bajas no dependen del webhook y se conservan.
 */
export function sinDatosDelProveedor(r: Resultado, motivo: string = SIN_WEBHOOK): Resultado {
  const afectadas = ['entrega', 'rebote', 'queja']
  return {
    ...r,
    noDisponibles: [{ metrica: 'Entregados, rebotes y quejas de spam', motivo }],
    bloques: r.bloques.map((b) => ({
      ...b,
      totales: { ...b.totales, entregados: null, rebotes: null, quejas: null },
      tasas: b.tasas.map((x) => (afectadas.includes(x.id) ? { ...x, valor: null, numerador: null, motivoSinDato: motivo } : x)),
      serie: b.serie ? b.serie.map((d) => ({ ...d, entregados: null, rebotes: null, quejas: null })) : null,
    })),
  }
}

/** Lo que el panel NO puede mostrar todavía, y por qué (no se rellena con ceros ni con estimaciones). */
export const NO_DISPONIBLES: ReadonlyArray<{ metrica: string; motivo: string }> = [
  { metrica: 'Aperturas', motivo: 'Resend sólo las reporta si el seguimiento de aperturas está activado en el dominio (está apagado por omisión) y son aproximadas: algunos buzones abren el correo antes de que la persona lo vea y otros bloquean las imágenes. Este sistema no las guarda.' },
  { metrica: 'Clics', motivo: 'Resend sólo los reporta si el seguimiento de clics está activado en el dominio (apagado por omisión) y reescribe los enlaces. Este sistema no los guarda.' },
  { metrica: 'Cupo global de Resend', motivo: 'El libro local sólo cuenta los envíos de esta base; el uso de toda la cuenta se comprueba con la lectura manual del panel de Resend (Super Admin).' },
  { metrica: 'Campañas', motivo: 'Todavía no existen campañas ni su identificador en el libro, así que no se puede filtrar por campaña.' },
]

/** Definición y fuente de cada número, tal como las muestra el panel. */
export const DEFINICIONES: ReadonlyArray<{ metrica: string; definicion: string; fuente: string }> = [
  { metrica: 'Enviados', definicion: 'Correos que Resend aceptó: estados enviado, entregado, rebotado o queja del libro. Se cuentan por el día en que se intentó el envío (zona de VIVE BIEN).', fuente: 'Libro correo_envios de esta base; Resend lo confirma al aceptar la petición.' },
  { metrica: 'Entregados', definicion: 'Correos que el servidor del destinatario aceptó (incluye los que luego recibieron una queja).', fuente: 'Evento email.delivered del webhook de Resend. Sin webhook configurado este número queda en cero.' },
  { metrica: 'Rebotes', definicion: 'Rechazos permanentes del servidor del destinatario. Los rebotes temporales no se cuentan.', fuente: 'Evento email.bounced (tipo permanente) del webhook de Resend.' },
  { metrica: 'Quejas de spam', definicion: 'Destinatarios que marcaron el correo como spam.', fuente: 'Evento email.complained del webhook de Resend.' },
  { metrica: 'Fallos', definicion: 'Envíos que no salieron por un error (de nuestra llamada a Resend o reportado por Resend).', fuente: 'Estado error del libro; evento email.failed del webhook de Resend.' },
  { metrica: 'Omitidos', definicion: 'Correos que no se mandaron a propósito: dirección suprimida, sin suscripción activa, sin cupo o apagados.', fuente: 'Estados omitido y suprimido del libro; evento email.suppressed del webhook de Resend.' },
  { metrica: 'Bajas promocionales', definicion: 'Personas que se dieron de baja de los correos promocionales (y hoy siguen dadas de baja). No incluye correos de servicio.', fuente: 'Tabla correo_suscriptores (estado baja, fecha de baja); cada baja deja además una supresión que impide futuros promocionales.' },
  { metrica: 'Tasas', definicion: 'Se calculan sobre el periodo y los filtros elegidos, con la fórmula que aparece en cada tarjeta; si hay menos de 5 envíos o menos de 5 casos se ocultan.', fuente: 'Cálculo del servidor sobre los números anteriores.' },
]

// ───────────────────────────── Datos de DEMOSTRACIÓN (sólo fuera de producción, siempre rotulados) ─────────────────────────────
function semilla(n: number) { let s = n >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 } }

/** Filas SINTÉTICAS y deterministas para el interruptor «Ver datos de demostración». No tienen ninguna relación con la base. */
export function datosDeDemostracion(r: Rango): { filas: FilaEnvio[]; bajas: ContextoBajas } {
  const azar = semilla(20261030)
  const filas: FilaEnvio[] = []
  const bajas: FilaBaja[] = []
  const tipos: Array<[string, string]> = [['alertas', 'servicio'], ['baja_de_precio', 'servicio'], ['legal', 'servicio'], ['bienvenida', 'transaccional'], ['recomendaciones', 'marketing']]
  for (const dia of diasDelRango(r)) {
    for (const [tipo, categoria] of tipos) {
      const n = Math.floor(azar() * (categoria === 'marketing' ? 14 : 9))
      for (let i = 0; i < n; i++) {
        const x = azar()
        const estado = x < 0.84 ? 'entregado' : x < 0.88 ? 'enviado' : x < 0.92 ? 'rebotado' : x < 0.94 ? 'queja' : x < 0.97 ? 'error' : 'omitido'
        filas.push({ categoria, tipo, estado, momento: `${dia}T18:00:00.000Z` })
      }
    }
    if (azar() < 0.55) for (let i = 0, m = 1 + Math.floor(azar() * 3); i < m; i++) bajas.push({ baja_en: `${dia}T18:00:00.000Z` })
  }
  return { filas, bajas: { filas: bajas, acumuladasAntes: 12, vigentes: 12 + bajas.length } }
}
