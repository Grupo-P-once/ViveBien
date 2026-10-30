import 'server-only'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from './auth-server'
import { centavosDePesos } from './comision-calculo'
import { CATEGORIAS_DE_GASTO } from './contabilidad'
import { avisoDeCaducidad, construirEstadoVivo, construirNotas, LIMITES_DE_NOTA, TEMAS_DE_NOTA } from './contabilidad-conocimiento'
import { leerFlags } from './config/flags-servidor'

/**
 * Contabilidad de comisiones — validación y traducción de resultados (solo servidor, 25-oct-2026).
 *
 * El navegador manda lo que la persona ESCRIBIÓ (pesos, fecha, concepto, a qué cuenta y propiedad pertenece, y para una devolución o anulación, cuál es el
 * original y por qué). El servidor convierte a centavos, valida y deja que la función SQL decida lo que depende de los demás movimientos (cuánto queda por
 * devolver, si ya está anulado, si la cuenta sigue activa). Esta capa no mueve dinero ni calcula saldos.
 */

export type EntradaMovimiento = {
  clase?: unknown; monto_pesos?: unknown; fecha?: unknown; categoria?: unknown; cuenta_id?: unknown; propiedad_id?: unknown; operacion_id?: unknown
  concepto?: unknown; referencia?: unknown; reverso_de?: unknown; motivo?: unknown; clave_idempotencia?: unknown
}
export type EntradaCuenta = { nombre?: unknown; categoria?: unknown; identificador?: unknown; notas?: unknown }

export type Preparado<T> = { ok: true; datos: T } | { ok: false; status: number; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const hoy = () => new Date().toISOString().slice(0, 10)
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
/** Un concepto o un nombre no es un lugar para datos personales: ni correos ni números largos (el número de factura va en la referencia). */
const conDatosPersonales = (t: string) => /@|\d{7,}/.test(t)

export function prepararMovimiento(e: EntradaMovimiento, actor: string): Preparado<Record<string, unknown>> {
  const clase = e.clase
  if (clase !== 'gasto' && clase !== 'ingreso_extra' && clase !== 'devolucion' && clase !== 'anulacion' && clase !== 'aportacion_grupo' && clase !== 'aportacion_recibida_grupo' && clase !== 'pago_colaborador') return { ok: false, status: 400, error: 'Indica qué se registra: gasto, ingreso extra, aportación a o de una empresa del grupo, pago al colaborador, devolución o anulación.' }
  const monto = centavosDePesos(e.monto_pesos)
  if (monto === null) return { ok: false, status: 400, error: 'Escribe el monto en pesos, con hasta 2 decimales.' }
  const fecha = e.fecha
  const real = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && new Date(fecha + 'T00:00:00Z').toISOString().slice(0, 10) === fecha
  if (!real) return { ok: false, status: 400, error: 'La fecha no es válida.' }
  if ((fecha as string) > hoy()) return { ok: false, status: 400, error: 'La fecha no puede ser futura.' }
  if ((fecha as string) < '2000-01-01') return { ok: false, status: 400, error: 'La fecha es demasiado antigua.' }
  const concepto = texto(e.concepto)
  if (concepto.length < 2 || concepto.length > 200) return { ok: false, status: 400, error: 'Escribe el concepto (de 2 a 200 caracteres).' }
  if (conDatosPersonales(concepto)) return { ok: false, status: 400, error: 'El concepto no lleva correos ni teléfonos: solo qué fue. El número de factura o de campaña va en «Referencia».' }
  const referencia = texto(e.referencia)
  if (referencia.length > 120 || referencia.includes('@')) return { ok: false, status: 400, error: 'La referencia es un identificador de hasta 120 caracteres, sin correos.' }
  const clave = texto(e.clave_idempotencia)
  if (clave.length < 8 || clave.length > 100) return { ok: false, status: 400, error: 'Falta la clave del movimiento (de 8 a 100 caracteres).' }
  const motivo = texto(e.motivo)

  const datos: Record<string, unknown> = { clase, monto_centavos: monto, fecha, concepto, clave_idempotencia: clave, creado_por: actor }
  if (referencia) datos.referencia = referencia

  if (clase === 'gasto' || clase === 'ingreso_extra' || clase === 'aportacion_grupo' || clase === 'aportacion_recibida_grupo' || clase === 'pago_colaborador') {
    if (e.reverso_de) return { ok: false, status: 400, error: 'Un gasto o un ingreso no lleva original: solo las devoluciones y las anulaciones.' }
    if (clase === 'gasto') {
      if (typeof e.categoria !== 'string' || !(CATEGORIAS_DE_GASTO as readonly string[]).includes(e.categoria)) return { ok: false, status: 400, error: 'Elige la categoría del gasto.' }
      datos.categoria = e.categoria
    } else datos.categoria = clase === 'ingreso_extra' ? 'ingreso_extra' : clase === 'aportacion_grupo' ? 'aportacion_grupo' : clase === 'aportacion_recibida_grupo' ? 'aportacion_recibida_grupo' : 'pago_colaborador'
    if (clase === 'pago_colaborador' && !esUuid(e.operacion_id)) return { ok: false, status: 400, error: 'Elige la operación de comisión a la que corresponde el pago.' }
    if (e.cuenta_id) { if (!esUuid(e.cuenta_id)) return { ok: false, status: 400, error: 'Esa cuenta de gasto no es válida.' }; datos.cuenta_id = e.cuenta_id }
    if (e.propiedad_id) { if (typeof e.propiedad_id !== 'string' || e.propiedad_id.length > 80) return { ok: false, status: 400, error: 'Esa propiedad no es válida.' }; datos.propiedad_id = e.propiedad_id }
    if (e.operacion_id) { if (!esUuid(e.operacion_id)) return { ok: false, status: 400, error: 'Esa operación no es válida.' }; datos.operacion_id = e.operacion_id }
  } else {
    if (!esUuid(e.reverso_de)) return { ok: false, status: 400, error: 'Falta el movimiento original.' }
    if (motivo.length < 10 || motivo.length > 300) return { ok: false, status: 400, error: 'Escribe el motivo (de 10 a 300 caracteres).' }
    datos.reverso_de = e.reverso_de
    datos.motivo = motivo
    // La categoría, la cuenta, la propiedad y la operación las hereda del original: la función SQL lo decide, no el navegador.
    datos.categoria = 'otro'
  }
  return { ok: true, datos }
}

export function prepararCuenta(e: EntradaCuenta, actor: string): Preparado<Record<string, unknown>> {
  const nombre = texto(e.nombre)
  if (nombre.length < 2 || nombre.length > 120) return { ok: false, status: 400, error: 'Escribe el nombre de la cuenta (de 2 a 120 caracteres).' }
  if (/@|\d{12,}/.test(nombre)) return { ok: false, status: 400, error: 'El nombre no lleva correos ni números largos: el identificador va en su propio campo.' }
  if (typeof e.categoria !== 'string' || !(CATEGORIAS_DE_GASTO as readonly string[]).includes(e.categoria)) return { ok: false, status: 400, error: 'Elige el tipo de gasto de la cuenta.' }
  const identificador = texto(e.identificador)
  if (identificador.length > 120 || identificador.includes('@')) return { ok: false, status: 400, error: 'El identificador es un código de hasta 120 caracteres, sin correos.' }
  const notas = texto(e.notas)
  if (notas.length > 500) return { ok: false, status: 400, error: 'Las notas son de hasta 500 caracteres.' }
  const datos: Record<string, unknown> = { nombre, categoria: e.categoria, creado_por: actor }
  if (identificador) datos.identificador = identificador
  if (notas) datos.notas = notas
  return { ok: true, datos }
}

/** El resultado de la función SQL → la respuesta HTTP. Lo que no se reconoce es un error: nunca se da por bueno. */
export function responderResultado(r: unknown, extra: Record<string, unknown> = {}): NextResponse {
  const o = (r && typeof r === 'object' ? r : {}) as { resultado?: string; id?: string; disponible?: number; esperado?: number }
  switch (o.resultado) {
    case 'ok': return NextResponse.json({ ok: true, id: o.id, ...extra }, { status: 201 })
    case 'repetida': return NextResponse.json({ ok: true, id: o.id, repetida: true, ...extra })
    case 'ya_existe': return NextResponse.json({ ok: true, id: o.id, ya_existe: true, ...extra })
    case 'clave_en_uso': return NextResponse.json({ error: 'Esa clave ya se usó con otros datos. Usa una clave nueva si es otro movimiento.', codigo: 'clave_en_uso' }, { status: 409 })
    case 'no_existe': return NextResponse.json({ error: 'Algo de lo que mencionas no existe (la cuenta, la propiedad, la operación o el movimiento original).', codigo: 'no_existe' }, { status: 404 })
    case 'cuenta_inactiva': return NextResponse.json({ error: 'Esa cuenta de gasto está desactivada: actívala o elige otra.', codigo: 'cuenta_inactiva' }, { status: 409 })
    case 'excede': return NextResponse.json({ error: 'El monto es mayor que lo que queda disponible (por devolver de ese gasto, o por pagar de esa operación).', codigo: 'excede', disponible_centavos: o.disponible ?? 0 }, { status: 409 })
    case 'conflicto': return NextResponse.json({ error: 'Eso cambió mientras lo mirabas. Recarga para ver cómo quedó.', codigo: 'conflicto' }, { status: 409 })
    case 'ya_tiene': return NextResponse.json({ error: 'Esa constancia ya tiene un comprobante: no se reemplaza.', codigo: 'ya_tiene' }, { status: 409 })
    case 'ya_anulado': return NextResponse.json({ error: 'Ese movimiento ya está anulado.', codigo: 'ya_anulado' }, { status: 409 })
    case 'sin_remanente': return NextResponse.json({ error: 'Ese gasto ya se devolvió por completo: no queda nada que anular.', codigo: 'sin_remanente' }, { status: 409 })
    case 'monto_distinto': return NextResponse.json({ error: 'Una anulación revierte exactamente lo que queda del original.', codigo: 'monto_distinto', esperado_centavos: o.esperado ?? 0 }, { status: 409 })
    case 'tope': return NextResponse.json({ error: 'Ya hay 30 notas vigentes: retira alguna antes de agregar otra.', codigo: 'tope' }, { status: 409 })
    case 'ya_retirada': return NextResponse.json({ error: 'Esa nota ya está retirada.', codigo: 'ya_retirada' }, { status: 409 })
    case 'no_aplica': return NextResponse.json({ error: 'Eso no se puede hacer con ese movimiento (una devolución solo corresponde a un gasto o a un ingreso; una anulación no se anula).', codigo: 'no_aplica' }, { status: 409 })
    default: return NextResponse.json({ error: 'No se pudo registrar el movimiento.' }, { status: 500 })
  }
}

export const NO_DISPONIBLE = () => NextResponse.json({ error: 'La contabilidad todavía no está disponible.', codigo: 'no_disponible' }, { status: 503 })
/** Errores del cliente de Supabase → respuesta. Falta de tabla o función = 503 (se aplica la migración y se vuelve a intentar); datos inválidos = 400. */
export function responderError(mensaje: string): NextResponse {
  if (/does not exist|schema cache|could not find/i.test(mensaje)) return NO_DISPONIBLE()
  if (/cambio_invalido|auditoria_incompleta/.test(mensaje)) return NextResponse.json({ error: 'Los datos del movimiento no son válidos.' }, { status: 400 })
  return NextResponse.json({ error: 'No se pudo registrar el movimiento.' }, { status: 500 })
}

// ── Lectura del libro (la usan la pantalla y el asesor de IA) ───────────────────────────

const COLUMNAS_OPERACION = 'id, propiedad_id, tipo, base_centavos, total_centavos, vivebien_centavos, colaborador_centavos, colaborador_retenido_centavos, reparto_estado, estado, creado_en, fecha_cierre, propiedad_folio, propiedad_titulo, gastos'
const COLUMNAS_MOVIMIENTO = 'id, fecha, sentido, clase, monto_centavos, categoria, cuenta_id, propiedad_id, operacion_id, concepto, referencia, reverso_de, motivo, creado_por, creado_en'
const COLUMNAS_CUENTA = 'id, nombre, categoria, identificador, notas, activa, creado_en'
const COLUMNAS_EXTERNA = 'id, fecha, descripcion, tipo, colaborador_id, contraparte, parte_centavos, total_centavos, porcentaje_bp, estado, cobrada_en, metodo_cobro, referencia, adjunto, estado_motivo, creado_por, creado_en'
const COLUMNAS_CONSTANCIA = 'movimiento_id, folio, colaborador_id, colaborador_nombre, metodo, comprobante'
/** La tabla o la función todavía no existe (migración 55 sin aplicar): se trata como «aún no hay», no como un error. */
export const FALTA_LA_MIGRACION = /does not exist|schema cache|could not find/i
const TOPE_DE_FILAS = 3000

export type Libro = {
  operaciones: Array<Record<string, unknown>>; movimientos: Array<Record<string, unknown>>; cuentas: Array<Record<string, unknown>>
  etiquetasDePropiedad: Record<string, string>; truncado: boolean
  /** Comisiones externas (migración 55); vacío si todavía no existe la tabla. Sin datos de contacto. */
  externas: Array<Record<string, unknown>>
  /** Constancias de pago por movimiento (folio, a quién, cómo). Vacío si todavía no existe la tabla. */
  constancias: Record<string, { folio: string; colaborador_id: string | null; colaborador_nombre: string; metodo: string; comprobante: string | null }>
  /** Lo que se sabe de cada propiedad mencionada (tipo, operación, zona): sirve para ver qué tipo de propiedad deja más. Sin dato = `null`, nunca inventado. */
  propiedades: Record<string, DatosDePropiedad>
}
export type DatosDePropiedad = { tipo: string | null; subtipo: string | null; operacion: string | null; colonia: string | null; ciudad: string | null }

/** Todo lo que el diario necesita. Si falta una tabla o una columna (migración 47 u 48 sin aplicar) devuelve `null`: no se enseña un libro a medias. */
export async function leerLibro(db: ReturnType<typeof supabaseAdmin>): Promise<Libro | null> {
  const [ops, movs, cuentas, ext, cons] = await Promise.all([
    db.from('comision_operaciones').select(COLUMNAS_OPERACION).order('creado_en', { ascending: false }).limit(TOPE_DE_FILAS),
    db.from('contab_movimientos').select(COLUMNAS_MOVIMIENTO).order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(TOPE_DE_FILAS),
    db.from('contab_cuentas').select(COLUMNAS_CUENTA).order('nombre', { ascending: true }).limit(500),
    db.from('comision_externas').select(COLUMNAS_EXTERNA).order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(TOPE_DE_FILAS),
    db.from('contab_constancias').select(COLUMNAS_CONSTANCIA).limit(TOPE_DE_FILAS),
  ])
  if (ops.error || movs.error || cuentas.error) return null
  // Las externas y las constancias son de la migración 55: sin ella, el libro sigue como siempre; con ella pero con otro error, NO se enseña un libro a medias.
  if ((ext.error && !FALTA_LA_MIGRACION.test(ext.error.message)) || (cons.error && !FALTA_LA_MIGRACION.test(cons.error.message))) return null
  const constancias: Libro['constancias'] = {}
  for (const c of (cons.data ?? []) as unknown as Array<{ movimiento_id: string; folio: string; colaborador_id: string | null; colaborador_nombre: string; metodo: string; comprobante: string | null }>) constancias[c.movimiento_id] = { folio: c.folio, colaborador_id: c.colaborador_id, colaborador_nombre: c.colaborador_nombre, metodo: c.metodo, comprobante: c.comprobante }
  // Lo que se sabe de las propiedades mencionadas: etiqueta (las de las operaciones ya traen su título y su folio, pero las que solo aparecen en un gasto no) y tipo, operación y zona.
  // Si esta lectura falla, el libro sigue: solo faltan los análisis por tipo de propiedad (y se dice, no se inventa).
  const conOperacion = new Set((ops.data ?? []).map((o) => o.propiedad_id as string))
  const mencionadas = [...new Set([...(ops.data ?? []).map((o) => o.propiedad_id as string), ...(movs.data ?? []).map((m) => m.propiedad_id as string | null).filter((p): p is string => !!p)])]
  const etiquetasDePropiedad: Record<string, string> = {}
  const propiedades: Record<string, DatosDePropiedad> = {}
  for (let i = 0; i < Math.min(mencionadas.length, 600); i += 200) {
    const p = await db.from('propiedades').select('id, folio, titulo, tipo, subtipo, operacion, colonia, ciudad').in('id', mencionadas.slice(i, i + 200))
    if (p.error) continue
    for (const f of (p.data ?? []) as unknown as Array<Record<string, string | null>>) {
      const id = f.id as string
      if (!conOperacion.has(id)) etiquetasDePropiedad[id] = f.titulo || f.folio || id
      propiedades[id] = { tipo: f.tipo ?? null, subtipo: f.subtipo ?? null, operacion: f.operacion ?? null, colonia: f.colonia ?? null, ciudad: f.ciudad ?? null }
    }
  }
  return {
    operaciones: (ops.data ?? []) as Array<Record<string, unknown>>, movimientos: (movs.data ?? []) as Array<Record<string, unknown>>, cuentas: (cuentas.data ?? []) as Array<Record<string, unknown>>,
    externas: ext.error ? [] : ((ext.data ?? []) as Array<Record<string, unknown>>), constancias,
    etiquetasDePropiedad, propiedades, truncado: (ops.data?.length ?? 0) >= TOPE_DE_FILAS || (movs.data?.length ?? 0) >= TOPE_DE_FILAS,
  }
}

// ── Notas del contador y contexto vivo del asesor ───────────────────────────────────────

export type EntradaNota = { titulo?: unknown; tema?: unknown; texto?: unknown; vigente_desde?: unknown; clave_idempotencia?: unknown }
const sinDatosPersonales = (t: string) => !/@|\d{10,}/.test(t)

export function prepararNota(e: EntradaNota, actor: string): Preparado<Record<string, unknown>> {
  const titulo = texto(e.titulo)
  if (titulo.length < 3 || titulo.length > LIMITES_DE_NOTA.titulo) return { ok: false, status: 400, error: `Escribe un título de 3 a ${LIMITES_DE_NOTA.titulo} caracteres.` }
  if (typeof e.tema !== 'string' || !(e.tema in TEMAS_DE_NOTA)) return { ok: false, status: 400, error: 'Elige el tema de la nota.' }
  const cuerpo = texto(e.texto)
  if (cuerpo.length < 10 || cuerpo.length > LIMITES_DE_NOTA.texto) return { ok: false, status: 400, error: `Escribe la nota (de 10 a ${LIMITES_DE_NOTA.texto} caracteres).` }
  if (!sinDatosPersonales(titulo) || !sinDatosPersonales(cuerpo)) return { ok: false, status: 400, error: 'La nota no lleva correos ni teléfonos: solo el criterio, la cifra o el plazo.' }
  const clave = texto(e.clave_idempotencia)
  if (clave.length < 8 || clave.length > 100) return { ok: false, status: 400, error: 'Falta la clave de la nota (de 8 a 100 caracteres).' }
  const datos: Record<string, unknown> = { titulo, tema: e.tema, texto: cuerpo, clave_idempotencia: clave, creado_por: actor }
  if (e.vigente_desde !== undefined && e.vigente_desde !== null && e.vigente_desde !== '') {
    const f = e.vigente_desde
    const real = typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(f + 'T00:00:00Z').toISOString().slice(0, 10) === f
    if (!real || (f as string) > hoy() || (f as string) < '2000-01-01') return { ok: false, status: 400, error: 'La fecha de la nota no es válida (no puede ser futura).' }
    datos.vigente_desde = f
  }
  return { ok: true, datos }
}

export type FilaDeNota = { id: string; titulo: string; tema: string; texto: string; vigente_desde: string; retirada: boolean; retirada_por: string | null; retirada_en: string | null; retirada_motivo: string | null; creado_por: string; creado_en: string }
const COLUMNAS_NOTA = 'id, titulo, tema, texto, vigente_desde, retirada, retirada_por, retirada_en, retirada_motivo, creado_por, creado_en'

/** Todas las notas (vigentes y retiradas, para ver el historial). Sin la migración 49 devuelve `null`. */
export async function leerNotas(db: ReturnType<typeof supabaseAdmin>): Promise<FilaDeNota[] | null> {
  const r = await db.from('contab_conocimiento').select(COLUMNAS_NOTA).order('creado_en', { ascending: false }).limit(300)
  if (r.error) return null
  return (r.data ?? []) as unknown as FilaDeNota[]
}

/**
 * Lo que cambia en cada consulta del asesor: el estado vivo de VIVE BIEN, las notas vigentes del contador y el aviso de caducidad de la base. Si falta la migración 49 las notas
 * simplemente no están (el asesor funciona con la base); si faltan los interruptores se dice. `libro` es opcional: el modo «operación» no lee el libro.
 */
export async function contextoDeConsulta(db: ReturnType<typeof supabaseAdmin>, hoy: string, libro: Libro | null): Promise<{ estadoVivo: string; notas: string; aviso: string | null }> {
  let flags: Record<string, boolean> = {}
  try { flags = (await leerFlags()) as unknown as Record<string, boolean> } catch { flags = {} }
  const todas = (await leerNotas(db)) ?? []
  const vigentes = todas.filter((n) => !n.retirada)
  const ops = (libro?.operaciones ?? []) as Array<{ estado?: string; fecha_cierre?: string | null; creado_en?: string }>
  const movs = (libro?.movimientos ?? []) as Array<{ fecha?: string }>
  const cuentas = (libro?.cuentas ?? []) as Array<{ activa?: boolean }>
  const maxFecha = (xs: Array<string | null | undefined>) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null
  const estadoVivo = construirEstadoVivo({
    hoy, flags,
    ...(libro ? {
      operaciones: { registradas: ops.filter((o) => o.estado === 'registrada').length, confirmadas: ops.filter((o) => o.estado === 'confirmada').length, anuladas: ops.filter((o) => o.estado === 'anulada').length, ultimaFechaDeCierre: maxFecha(ops.map((o) => o.fecha_cierre || o.creado_en?.slice(0, 10))) },
      movimientos: { total: movs.length, ultimaFecha: maxFecha(movs.map((m) => m.fecha)) },
      cuentas: { total: cuentas.length, activas: cuentas.filter((c) => c.activa).length },
      truncado: libro.truncado,
    } : {}),
    notasDelContador: vigentes.length,
  })
  return { estadoVivo, notas: construirNotas(vigentes), aviso: avisoDeCaducidad(hoy, maxFecha(vigentes.map((n) => n.vigente_desde))) }
}
