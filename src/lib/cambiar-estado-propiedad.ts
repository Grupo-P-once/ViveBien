import type { SupabaseClient } from '@supabase/supabase-js'
import type { PerfilUsuario } from './auth-server'
import type { EstadoPub } from './publicacion'

/**
 * Mover una propiedad de estado Y dejar la bitácora, en UNA transacción (migración 33: `propiedad_cambiar_estado`).
 *
 * Antes, `/estado`, el alta heredada del panel y el asistente de Telegram hacían `update` y DESPUÉS `registrar()` (otra llamada, con
 * los errores tragados): si la segunda fallaba, o la función serverless moría entre las dos, la propiedad cambiaba de estado SIN
 * huella. Aquí no se puede: la base escribe las dos cosas o ninguna, compara el estado que se leyó (`conflicto`) y rechaza lo que la
 * máquina de estados no permite.
 *
 * QUIÉN puede pedir cada transición (rol, capacidad, dueño, completitud, contacto) lo decide el SERVIDOR antes de llamar aquí: esta
 * función sólo ejecuta lo ya decidido. Si la migración falta, falla CERRADO (503) y no cambia nada.
 */

/** Las únicas columnas que puede acompañar a un cambio de estado (lista blanca, también en la base). */
export type CambiosDeEstado = Partial<{
  completitud: number
  estatus: string
  enviada_en: string
  publicada_en: string
  revisado_por: string | null
  revisado_en: string
  nota_moderacion: string | null
}>

export type ResultadoCambioDeEstado =
  | { ok: true }
  | { ok: false; codigo: 'conflicto' | 'no_existe' | 'sin_migracion' | 'invalido' | 'error'; status: number; mensaje: string }

export const MENSAJE_CONFLICTO_ESTADO = 'Esta propiedad cambió de estado mientras la mirabas. Recarga la página para ver cómo quedó.'

export async function cambiarEstadoDePropiedad(
  db: SupabaseClient,
  o: {
    id: string
    /** El estado que se LEYÓ: si la propiedad ya no está ahí, es un conflicto y no se escribe nada. */
    antes: string
    estado: EstadoPub
    cambios: CambiosDeEstado
    actor: Pick<PerfilUsuario, 'uid' | 'email' | 'rol'>
    /** `propiedad.<estado>`. */
    accion: string
    auditAntes: Record<string, unknown>
    auditDespues: Record<string, unknown>
  },
): Promise<ResultadoCambioDeEstado> {
  const { data, error } = await db.rpc('propiedad_cambiar_estado', {
    p_id: o.id,
    p_antes_estado: o.antes,
    p_estado: o.estado,
    p_cambios: o.cambios,
    p_audit: {
      actor_uid: o.actor.uid,
      actor_email: o.actor.email,
      actor_rol: o.actor.rol,
      accion: o.accion,
      antes: o.auditAntes,
      despues: o.auditDespues,
    },
  })

  if (error) {
    const msg = error.message ?? ''
    if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(msg)) {
      return { ok: false, codigo: 'sin_migracion', status: 503, mensaje: 'Falta aplicar la migración 33 (cambio de estado de una propiedad con su bitácora en una sola operación).' }
    }
    // Lo que la base rechaza por contenido (huella incompleta, nota corta, transición o valor no permitidos): no se escribió nada.
    if (/auditoria_incompleta|cambio_invalido/.test(msg)) {
      return { ok: false, codigo: 'invalido', status: 400, mensaje: 'Ese cambio de estado no es válido (¿falta el motivo?). No se hizo nada.' }
    }
    return { ok: false, codigo: 'error', status: 503, mensaje: 'No se pudo guardar el cambio ni registrarlo en la bitácora, así que no se hizo nada. Inténtalo otra vez.' }
  }

  const resultado = (data as { resultado?: string } | null)?.resultado
  if (resultado === 'ok') return { ok: true }
  if (resultado === 'conflicto') return { ok: false, codigo: 'conflicto', status: 409, mensaje: MENSAJE_CONFLICTO_ESTADO }
  if (resultado === 'no_existe') return { ok: false, codigo: 'no_existe', status: 404, mensaje: 'Esa propiedad no existe.' }
  return { ok: false, codigo: 'error', status: 500, mensaje: 'No se pudo guardar el cambio.' }
}
