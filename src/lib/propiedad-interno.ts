/**
 * Datos INTERNOS de una propiedad (24-oct-2026): de quién es, comisión pactada y notas internas. Código puro: sin base ni red.
 *
 * Reglas (decididas por el propietario el 24-oct-2026):
 *  · Viven en tablas aparte (`propiedad_origen`, `propiedad_notas`, migración 38), nunca en columnas de `propiedades` (lectura pública).
 *  · El administrador y el super admin ven las notas de TODOS; un publicador ve solo las suyas, aunque la propiedad sea suya.
 *  · El origen de una propiedad lo ve quien puede gestionarla: su dueño o el equipo.
 *  · La comisión se guarda como campos estructurados (tipo + valor) y NO tiene valor por defecto: vacía hasta que alguien la capture.
 *  · «Subida por» no se escribe a mano: sale de la cuenta dueña (`owner_id`), para que nadie tenga que adivinar de quién es.
 */

export const ORIGENES = ['trato_directo', 'inmobiliaria', 'broker'] as const
export type OrigenTipo = (typeof ORIGENES)[number]
export const ETIQUETA_ORIGEN: Record<OrigenTipo, string> = {
  trato_directo: 'Trato directo con el dueño',
  inmobiliaria: 'Inmobiliaria',
  broker: 'Broker',
}

export const COMISIONES = ['porcentaje', 'meses_renta', 'monto_fijo', 'compartida'] as const
export type ComisionTipo = (typeof COMISIONES)[number]
export const ETIQUETA_COMISION: Record<ComisionTipo, string> = {
  porcentaje: 'Porcentaje del precio',
  meses_renta: 'Meses de renta',
  monto_fijo: 'Monto fijo (MXN)',
  compartida: 'Comisión compartida (ver detalle)',
}

export const MAXIMO_NOTA = 2000

export type Origen = {
  origen_tipo: OrigenTipo
  titular_nombre: string | null
  titular_empresa: string | null
  titular_telefono: string | null
  titular_correo: string | null
  comision_tipo: ComisionTipo | null
  comision_valor: number | null
  comision_detalle: string | null
}

export type ResultadoOrigen = { ok: true; datos: Origen } | { ok: false; errores: string[] }

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const texto = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (!t) return null
  return t.length > max ? undefined : t
}

/** Lista blanca + validación de lo que el navegador manda. El navegador no es una frontera: aquí se decide qué entra. */
export function sanearOrigen(entrada: unknown): ResultadoOrigen {
  const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>
  const errores: string[] = []

  const origen = (ORIGENES as readonly string[]).includes(e.origen_tipo as string) ? (e.origen_tipo as OrigenTipo) : null
  if (!origen) errores.push('Elige si es trato directo, inmobiliaria o broker.')

  const nombre = texto(e.titular_nombre, 200)
  const empresa = texto(e.titular_empresa, 200)
  const telefono = texto(e.titular_telefono, 40)
  const correo = texto(e.titular_correo, 200)
  const detalle = texto(e.comision_detalle, 1000)
  if (nombre === undefined) errores.push('El nombre es demasiado largo.')
  if (empresa === undefined) errores.push('La empresa es demasiado larga.')
  if (telefono === undefined) errores.push('El teléfono no es válido.')
  else if (telefono && !/^[0-9+()\-\s.]{7,40}$/.test(telefono)) errores.push('El teléfono no es válido.')
  if (correo === undefined) errores.push('El correo es demasiado largo.')
  else if (correo && !CORREO.test(correo)) errores.push('El correo no es válido.')
  if (detalle === undefined) errores.push('El detalle de la comisión es demasiado largo (máximo 1000 caracteres).')

  let tipo: ComisionTipo | null = null
  if (e.comision_tipo !== undefined && e.comision_tipo !== null && e.comision_tipo !== '') {
    if ((COMISIONES as readonly string[]).includes(e.comision_tipo as string)) tipo = e.comision_tipo as ComisionTipo
    else errores.push('El tipo de comisión no es válido.')
  }

  let valor: number | null = null
  const crudo = e.comision_valor
  if (crudo !== undefined && crudo !== null && crudo !== '') {
    const n = typeof crudo === 'number' ? crudo : typeof crudo === 'string' && /^\d+(\.\d+)?$/.test(crudo.trim()) ? Number(crudo) : NaN
    if (!Number.isFinite(n) || n < 0) errores.push('El valor de la comisión no es válido.')
    else {
      valor = Math.round((n + Number.EPSILON) * 100) / 100
      if (tipo === 'porcentaje' && valor > 100) errores.push('Un porcentaje no puede pasar de 100.')
      if (tipo === 'meses_renta' && valor > 12) errores.push('Los meses de renta no pueden pasar de 12.')
      if (valor > 1e11) errores.push('El valor de la comisión es demasiado grande.')
    }
  }
  if (valor !== null && !tipo) errores.push('Elige qué tipo de comisión es el valor que escribiste.')
  if (tipo === 'compartida' && valor === null && !detalle) errores.push('Una comisión compartida necesita el detalle de cómo se reparte.')

  if (errores.length || !origen) return { ok: false, errores }
  return {
    ok: true,
    datos: {
      origen_tipo: origen,
      titular_nombre: nombre ?? null,
      titular_empresa: empresa ?? null,
      titular_telefono: telefono ?? null,
      titular_correo: correo ?? null,
      comision_tipo: tipo,
      comision_valor: valor,
      comision_detalle: detalle ?? null,
    },
  }
}

export function sanearNota(entrada: unknown): { ok: true; texto: string } | { ok: false; error: string } {
  if (typeof entrada !== 'string') return { ok: false, error: 'Escribe la nota.' }
  const t = entrada.trim()
  if (!t) return { ok: false, error: 'Escribe la nota.' }
  if (t.length > MAXIMO_NOTA) return { ok: false, error: `La nota es demasiado larga (máximo ${MAXIMO_NOTA} caracteres).` }
  return { ok: true, texto: t }
}

export type NotaInterna = { id: string; propiedad_id: string; autor_uid: string; autor_rol: string; texto: string; creado_en: string }

/**
 * Quién ve qué nota. El equipo (admin / super admin) ve todas; cualquier otro ve solo las que escribió.
 * Ausente = sin permiso: si no sabemos quién es, no se devuelve ninguna.
 */
export function notasVisibles<T extends { autor_uid: string }>(notas: T[], quien: { uid?: string | null; esEquipo: boolean }): T[] {
  if (quien.esEquipo) return notas
  if (!quien.uid) return []
  return notas.filter((n) => n.autor_uid === quien.uid)
}

/** ¿Falta registrar el origen? Para avisar al equipo; no bloquea nada. */
export const faltaOrigen = (origen: unknown) => !origen
