import { centavosDePesos } from './comision-calculo'

/**
 * Directorio de colaboradores, comisiones EXTERNAS y constancias (26-oct-2026). Código puro: valida y arma los datos que mandan las rutas al servidor (que los vuelve a
 * validar en la base). Sin base ni red.
 *
 * Reglas del dueño que viven aquí:
 *  · La acreditación del agente es OPCIONAL: el folio es un dato más del directorio, nunca se exige.
 *  · Una comisión externa se registra en segundos: qué fue, con quién se compartió (opcional), cuánto le tocó a VIVE BIEN, y si ya se cobró (con método y fecha).
 *  · Nada de datos personales en lo que se muestra o se guarda como texto libre (descripciones, nombres, referencias): ni correos ni números largos. El teléfono y el correo
 *    de un colaborador van en sus propios campos y NO en la bitácora.
 */

export type Preparado<T> = { ok: true; datos: T } | { ok: false; status: number; error: string }

/** Una fila del directorio, tal como la devuelve `GET /api/admin/contabilidad/colaboradores` (con contacto: nunca va al libro ni al asesor de IA). */
export type ColaboradorFila = { id: string; tipo: TipoDeColaborador; nombre: string; empresa: string | null; telefono: string | null; correo: string | null; municipio: string | null; folio_acreditacion: string | null; notas: string | null; activo: boolean; creado_en: string }

export const TIPOS_DE_COLABORADOR = ['agente', 'inmobiliaria', 'broker', 'otro'] as const
export type TipoDeColaborador = (typeof TIPOS_DE_COLABORADOR)[number]
export const ETIQUETA_TIPO_DE_COLABORADOR: Readonly<Record<TipoDeColaborador, string>> = Object.freeze({ agente: 'Asesor / agente', inmobiliaria: 'Inmobiliaria', broker: 'Broker', otro: 'Otro' })
export const TIPOS_DE_EXTERNA = ['venta', 'renta', 'otro'] as const
export type TipoDeExterna = (typeof TIPOS_DE_EXTERNA)[number]
export const ETIQUETA_TIPO_DE_EXTERNA: Readonly<Record<TipoDeExterna, string>> = Object.freeze({ venta: 'Venta', renta: 'Renta', otro: 'Otro' })
export const METODOS_DE_PAGO = ['efectivo', 'transferencia'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TELEFONO = /^[0-9+()\-\s.]{5,40}$/
/** Un archivo del bucket privado: AAAA/uuid.ext. Nunca una ruta que el navegador invente. */
export const RUTA_DE_ADJUNTO = /^\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/
const conDatosPersonales = (t: string) => /@|\d{7,}/.test(t)
const texto = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const fechaReal = (f: unknown): f is string => typeof f === 'string' && FECHA.test(f) && !Number.isNaN(Date.parse(`${f}T00:00:00Z`)) && new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) === f
const err = (error: string, status = 400): { ok: false; status: number; error: string } => ({ ok: false, status, error })

// ── Colaboradores ───────────────────────────────────────────────────────────────────────

export type EntradaColaborador = { tipo?: unknown; nombre?: unknown; empresa?: unknown; telefono?: unknown; correo?: unknown; municipio?: unknown; folio_acreditacion?: unknown; notas?: unknown; activo?: unknown }

function camposDeColaborador(e: EntradaColaborador, parcial: boolean): Preparado<Record<string, unknown>> {
  const datos: Record<string, unknown> = {}
  const dado = (v: unknown) => !parcial || v !== undefined
  if (dado(e.tipo)) {
    if (typeof e.tipo !== 'string' || !(TIPOS_DE_COLABORADOR as readonly string[]).includes(e.tipo)) return err('Elige si es asesor, inmobiliaria, broker u otro.')
    datos.tipo = e.tipo
  }
  if (dado(e.nombre)) {
    const nombre = texto(e.nombre)
    if (nombre.length < 2 || nombre.length > 120) return err('Escribe el nombre (de 2 a 120 caracteres).')
    if (conDatosPersonales(nombre)) return err('El nombre no lleva correos ni números largos: el teléfono y el correo van en su propio campo.')
    datos.nombre = nombre
  }
  const opcional = (clave: 'empresa' | 'municipio' | 'folio_acreditacion' | 'notas' | 'telefono' | 'correo', max: number, min: number, etiqueta: string, validar?: (t: string) => boolean) => {
    if (e[clave] === undefined && parcial) return null
    const t = e[clave] === undefined || e[clave] === null ? '' : texto(e[clave])
    if (t && (t.length < min || t.length > max || (validar && !validar(t)))) return err(`${etiqueta} no es válido.`)
    datos[clave] = t || (parcial ? null : undefined)
    if (!t && !parcial) delete datos[clave]
    return null
  }
  for (const r of [
    opcional('empresa', 120, 1, 'La empresa', (t) => !t.includes('@')),
    opcional('telefono', 40, 5, 'El teléfono', (t) => TELEFONO.test(t)),
    opcional('correo', 200, 5, 'El correo', (t) => CORREO.test(t)),
    opcional('municipio', 120, 2, 'El municipio'),
    opcional('folio_acreditacion', 40, 3, 'El folio de acreditación (opcional)'),
    opcional('notas', 500, 1, 'Las notas'),
  ]) if (r) return r
  if (parcial && e.activo !== undefined) {
    if (typeof e.activo !== 'boolean') return err('Indica si está activo (sí o no).')
    datos.activo = e.activo
  }
  return { ok: true, datos }
}

export function prepararColaborador(e: EntradaColaborador, actor: string): Preparado<Record<string, unknown>> {
  const r = camposDeColaborador(e, false)
  return r.ok ? { ok: true, datos: { ...r.datos, creado_por: actor } } : r
}
export function prepararCambioDeColaborador(e: EntradaColaborador): Preparado<Record<string, unknown>> {
  const r = camposDeColaborador(e, true)
  if (!r.ok) return r
  return Object.keys(r.datos).length ? r : err('No hay nada que cambiar.')
}

// ── Comisiones externas ─────────────────────────────────────────────────────────────────

export type EntradaExterna = {
  fecha?: unknown; descripcion?: unknown; tipo?: unknown; colaborador_id?: unknown; contraparte?: unknown; parte_pesos?: unknown; total_pesos?: unknown; porcentaje?: unknown
  cobrada?: unknown; cobrada_en?: unknown; metodo_cobro?: unknown; referencia?: unknown; adjunto?: unknown; clave_idempotencia?: unknown
}

export function prepararExterna(e: EntradaExterna, actor: string, hoy: string): Preparado<Record<string, unknown>> {
  if (!fechaReal(e.fecha)) return err('La fecha no es válida.')
  if (e.fecha > hoy) return err('La fecha no puede ser futura.')
  if (e.fecha < '2000-01-01') return err('La fecha es demasiado antigua.')
  const descripcion = texto(e.descripcion)
  if (descripcion.length < 3 || descripcion.length > 200) return err('Cuenta qué fue, en pocas palabras (de 3 a 200 caracteres).')
  if (conDatosPersonales(descripcion)) return err('La descripción no lleva correos ni teléfonos: solo qué fue (por ejemplo «casa en Cañada, 3 recámaras»). No pongas el nombre del cliente.')
  if (typeof e.tipo !== 'string' || !(TIPOS_DE_EXTERNA as readonly string[]).includes(e.tipo)) return err('Indica si fue una venta, una renta u otra cosa.')
  const parte = centavosDePesos(e.parte_pesos)
  if (parte === null || parte < 1) return err('Escribe cuánto le tocó a VIVE BIEN, en pesos (hasta 2 decimales).')
  let total: number | null = null
  if (e.total_pesos !== undefined && e.total_pesos !== null && e.total_pesos !== '') {
    total = centavosDePesos(e.total_pesos)
    if (total === null || total < parte) return err('La comisión total no puede ser menor que lo que le tocó a VIVE BIEN.')
  }
  let bp: number | null = null
  if (e.porcentaje !== undefined && e.porcentaje !== null && e.porcentaje !== '') {
    const p = Number(String(e.porcentaje).replace('%', '').trim())
    if (!Number.isFinite(p) || p <= 0 || p > 100) return err('El porcentaje debe estar entre 1 y 100.')
    bp = Math.round(p * 100)
  }
  const contraparte = texto(e.contraparte)
  if (contraparte && (contraparte.length < 2 || contraparte.length > 120 || conDatosPersonales(contraparte))) return err('El nombre de con quién la compartiste no lleva correos ni números largos (2 a 120 caracteres).')
  if (e.colaborador_id && !esUuid(e.colaborador_id)) return err('Ese colaborador no es válido.')
  const referencia = texto(e.referencia)
  if (referencia.length > 120 || referencia.includes('@')) return err('La referencia es un identificador de hasta 120 caracteres, sin correos.')
  const clave = texto(e.clave_idempotencia)
  if (clave.length < 8 || clave.length > 100) return err('Falta la clave del registro (de 8 a 100 caracteres).')
  const adjunto = texto(e.adjunto)
  if (adjunto && !RUTA_DE_ADJUNTO.test(adjunto)) return err('Ese archivo no es válido: vuelve a adjuntarlo.')

  const datos: Record<string, unknown> = { fecha: e.fecha, descripcion, tipo: e.tipo, parte_centavos: parte, clave_idempotencia: clave, creado_por: actor }
  if (total !== null) datos.total_centavos = total
  if (bp !== null) datos.porcentaje_bp = bp
  if (e.colaborador_id) datos.colaborador_id = e.colaborador_id
  if (contraparte) datos.contraparte = contraparte
  if (referencia) datos.referencia = referencia
  if (adjunto) datos.adjunto = adjunto
  if (e.cobrada === true) {
    const cobro = e.cobrada_en
    if (!fechaReal(cobro) || cobro > hoy || cobro < e.fecha) return err('La fecha del cobro no es válida (no puede ser futura ni anterior al trato).')
    if (typeof e.metodo_cobro !== 'string' || !(METODOS_DE_PAGO as readonly string[]).includes(e.metodo_cobro)) return err('Indica cómo te pagaron: efectivo o transferencia.')
    datos.cobrada = true; datos.cobrada_en = cobro; datos.metodo_cobro = e.metodo_cobro
  }
  return { ok: true, datos }
}

export type EntradaCambioDeExterna = { accion?: unknown; antes?: unknown; cobrada_en?: unknown; metodo_cobro?: unknown; referencia?: unknown; adjunto?: unknown; motivo?: unknown }

export function prepararCambioDeExterna(e: EntradaCambioDeExterna, hoy: string): Preparado<{ antes: 'por_cobrar' | 'cobrada'; nuevo: 'cobrada' | 'anulada'; datos: Record<string, unknown> }> {
  if (e.antes !== 'por_cobrar' && e.antes !== 'cobrada') return err('Falta el estado que estás viendo.')
  if (e.accion === 'cobrar') {
    if (e.antes !== 'por_cobrar') return err('Esa comisión ya se cobró.')
    if (!fechaReal(e.cobrada_en) || e.cobrada_en > hoy) return err('La fecha del cobro no es válida (no puede ser futura).')
    if (typeof e.metodo_cobro !== 'string' || !(METODOS_DE_PAGO as readonly string[]).includes(e.metodo_cobro)) return err('Indica cómo te pagaron: efectivo o transferencia.')
    const datos: Record<string, unknown> = { cobrada_en: e.cobrada_en, metodo_cobro: e.metodo_cobro }
    const referencia = texto(e.referencia)
    if (referencia.length > 120 || referencia.includes('@')) return err('La referencia es un identificador de hasta 120 caracteres, sin correos.')
    if (referencia) datos.referencia = referencia
    const adjunto = texto(e.adjunto)
    if (adjunto) { if (!RUTA_DE_ADJUNTO.test(adjunto)) return err('Ese archivo no es válido: vuelve a adjuntarlo.'); datos.adjunto = adjunto }
    return { ok: true, datos: { antes: 'por_cobrar', nuevo: 'cobrada', datos } }
  }
  if (e.accion === 'anular') {
    const motivo = texto(e.motivo)
    if (motivo.length < 10 || motivo.length > 500) return err('Escribe el motivo (de 10 a 500 caracteres).')
    return { ok: true, datos: { antes: e.antes, nuevo: 'anulada', datos: { motivo } } }
  }
  return err('Acción no válida.')
}

// ── Constancias ─────────────────────────────────────────────────────────────────────────

export type EntradaConstancia = { movimiento_id?: unknown; colaborador_id?: unknown; colaborador_nombre?: unknown; metodo?: unknown; referencia?: unknown; comprobante?: unknown; descripcion?: unknown }

export function prepararConstancia(e: EntradaConstancia, actor: string): Preparado<Record<string, unknown>> {
  if (!esUuid(e.movimiento_id)) return err('Falta el pago al que corresponde la constancia.')
  const nombre = texto(e.colaborador_nombre)
  if (nombre.length < 2 || nombre.length > 120) return err('Escribe el nombre de quien recibe el pago (de 2 a 120 caracteres).')
  if (conDatosPersonales(nombre)) return err('El nombre de quien recibe no lleva correos ni números largos.')
  if (typeof e.metodo !== 'string' || !(METODOS_DE_PAGO as readonly string[]).includes(e.metodo)) return err('Indica cómo se pagó: efectivo o transferencia.')
  if (e.colaborador_id && !esUuid(e.colaborador_id)) return err('Ese colaborador no es válido.')
  const referencia = texto(e.referencia)
  if (referencia.length > 120 || referencia.includes('@')) return err('La referencia es un identificador de hasta 120 caracteres, sin correos.')
  const comprobante = texto(e.comprobante)
  if (comprobante && !RUTA_DE_ADJUNTO.test(comprobante)) return err('Ese comprobante no es válido: vuelve a adjuntarlo.')
  const descripcion = texto(e.descripcion)
  if (descripcion && (descripcion.length < 3 || descripcion.length > 300 || conDatosPersonales(descripcion))) return err('La descripción de la operación no lleva correos ni teléfonos (3 a 300 caracteres).')
  const datos: Record<string, unknown> = { movimiento_id: e.movimiento_id, colaborador_nombre: nombre, metodo: e.metodo, creado_por: actor }
  if (e.colaborador_id) datos.colaborador_id = e.colaborador_id
  if (referencia) datos.referencia = referencia
  if (comprobante) datos.comprobante = comprobante
  if (descripcion) datos.descripcion = descripcion
  return { ok: true, datos }
}
