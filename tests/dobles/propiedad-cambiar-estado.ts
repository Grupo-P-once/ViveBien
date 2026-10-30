/**
 * Doble de `public.propiedad_cambiar_estado` (migración 33) para las pruebas de las RUTAS.
 *
 * Misma semántica que el SQL: huella completa, nota ≥ 10 al rechazar / pedir cambios, lista blanca de columnas y de valores,
 * `no_existe`, `conflicto` (el estado leído ya no es el guardado) y máquina de estados; cambia y audita a la vez o no hace nada.
 * `tests/property-core-gaps-restantes.test.ts` lo compara con el SQL REAL en PGlite (las 25 combinaciones y los rechazos).
 */

export const TRANSICIONES_SQL = new Set([
  'borrador>en_revision', 'borrador>publicada',
  'en_revision>publicada', 'en_revision>rechazada', 'en_revision>cambios_solicitados', 'en_revision>borrador',
  'cambios_solicitados>en_revision', 'cambios_solicitados>borrador', 'cambios_solicitados>publicada',
  'rechazada>borrador', 'rechazada>publicada',
  'publicada>borrador', 'publicada>cambios_solicitados',
])
const ESTADOS = ['borrador', 'en_revision', 'cambios_solicitados', 'rechazada', 'publicada']
const COLUMNAS = ['completitud', 'estatus', 'enviada_en', 'publicada_en', 'revisado_por', 'revisado_en', 'nota_moderacion']
const ESTATUS = ['disponible', 'pausada', 'vendida', 'rentada', 'eliminada']

type Args = { p_id: string; p_antes_estado: string; p_estado: string; p_cambios: Record<string, unknown>; p_audit: Record<string, unknown> }
type Resp = { data: { resultado: string } | null; error: { message: string; code?: string } | null }

const err = (message: string): Resp => ({ data: null, error: { message, code: '22023' } })

export function propiedadCambiarEstado(
  props: Array<Record<string, unknown>>,
  auditoria: Array<Record<string, unknown>>,
  a: Args,
): Resp {
  const au = a.p_audit as { actor_uid?: string; actor_email?: string; actor_rol?: string; accion?: string; antes?: unknown; despues?: unknown } | null
  const lleno = (x: unknown) => typeof x === 'string' && x.trim().length > 0
  const objeto = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x)
  if (!objeto(au) || !lleno(au!.actor_uid) || !lleno(au!.accion) || !objeto(au!.antes) || !objeto(au!.despues)) return err('auditoria_incompleta')
  const cambios = a.p_cambios ?? {}
  if (!ESTADOS.includes(a.p_estado) || !objeto(cambios)) return err('cambio_invalido')
  if (Object.keys(cambios).some((k) => !COLUMNAS.includes(k))) return err('cambio_invalido')
  if ((a.p_estado === 'rechazada' || a.p_estado === 'cambios_solicitados') && String(cambios.nota_moderacion ?? '').trim().length < 10) return err('auditoria_incompleta')

  const fila = props.find((p) => p.id === a.p_id)
  if (!fila) return { data: { resultado: 'no_existe' }, error: null }
  if (fila.estado_pub !== a.p_antes_estado) return { data: { resultado: 'conflicto' }, error: null }
  if (!TRANSICIONES_SQL.has(`${String(fila.estado_pub)}>${a.p_estado}`)) return err('cambio_invalido')
  if ('estatus' in cambios && !ESTATUS.includes(String(cambios.estatus))) return err('cambio_invalido')
  if ('completitud' in cambios && !Number.isFinite(Number(cambios.completitud))) return err('cambio_invalido')
  for (const k of ['enviada_en', 'publicada_en', 'revisado_en']) {
    if (k in cambios && cambios[k] !== null && Number.isNaN(Date.parse(String(cambios[k])))) return err('cambio_invalido')
  }

  Object.assign(fila, { estado_pub: a.p_estado }, cambios)
  auditoria.push({
    actor: { uid: au!.actor_uid, email: au!.actor_email, rol: au!.actor_rol },
    accion: au!.accion, entidad: 'propiedades', entidadId: a.p_id, antes: au!.antes, despues: au!.despues,
  })
  return { data: { resultado: 'ok' }, error: null }
}
