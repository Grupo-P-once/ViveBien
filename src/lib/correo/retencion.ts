import type { DbCorreo } from './enviar'

/**
 * Privacidad y retención del correo (F1, 30-oct-2026). Ver la migración 62.
 *
 *  · `olvidarCorreoDeCuenta`: al cerrar una cuenta se borra el rastro de esa persona en el libro de envíos y su suscripción comercial. Se hace ANTES de
 *    `baja_de_cuenta` (después ya no existe el correo del perfil). Si falla, la baja NO se bloquea (borrar la cuenta es un derecho): se reintenta una vez,
 *    queda un aviso SIN datos personales y la retención de 2 años lo borra de todos modos.
 *  · `purgarCorreo`: retención de 2 años (Aviso de Privacidad). Se llama desde el cron diario que YA existe (`/api/alertas/resumen`); es idempotente:
 *    llamarla dos veces el mismo día no borra nada más. No hay cron nuevo.
 * Los registros de este módulo nunca llevan direcciones, uids ni cuerpos: sólo el resultado.
 */

async function rpc(db: DbCorreo, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await db.rpc(fn, args)
    if (error || !data || typeof data !== 'object') return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

export async function olvidarCorreoDeCuenta(db: DbCorreo, uid: string, correo: string | null | undefined): Promise<boolean> {
  const args = { p_uid: uid, p_email: (correo ?? '').trim() || null }
  for (let intento = 0; intento < 2; intento++) {
    if (await rpc(db, 'correo_olvidar_cuenta', args)) return true
  }
  console.error('[correo] no se pudo olvidar el rastro de correo de una cuenta cerrada; lo borrará la retención de 2 años')
  return false
}

export async function purgarCorreo(db: DbCorreo): Promise<{ ok: boolean; resumen?: Record<string, number> }> {
  const r = await rpc(db, 'correo_purgar', {})
  if (!r) {
    console.error('[correo] la purga de retención no se pudo ejecutar (¿migración 62 sin aplicar?)')
    return { ok: false }
  }
  const resumen: Record<string, number> = {}
  for (const [k, v] of Object.entries(r)) if (typeof v === 'number') resumen[k] = v
  return { ok: true, resumen }
}
