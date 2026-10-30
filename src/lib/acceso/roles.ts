import { esNivelAdmin, ROLES_GUARDADOS, type RolGuardado } from './permisos'

/**
 * Quién puede cambiar el rol o el estado de quién (tarea 02.02, D-13).
 * Código puro: las rutas le pasan los datos y aplican lo que diga.
 *
 * ─────────────────────────────────────────────────────────────
 * V-1.1.79 / V-1.1.81
 *
 *  · Dar o quitar admin / super admin (en la lista o invitando) → sólo un
 *    Super Admin, y con motivo (queda en la bitácora).
 *  · Cliente ↔ publicador y suspender a un cliente o publicador → cualquier
 *    admin.
 *  · Suspender a un admin → sólo un Super Admin.
 *  · Nadie se cambia a sí mismo (ni el rol ni el estado).
 *  · Nadie deja al sistema sin Super Admin: el último activo no se degrada ni
 *    se suspende. (V-1.1.81: sustituye a «no se toca a quien está en
 *    ADMIN_EMAILS», que era la forma de recuperar el acceso cuando la lista
 *    mandaba sobre la tabla. Ahora la tabla es la única fuente.)
 * ─────────────────────────────────────────────────────────────
 */

export const MINIMO_MOTIVO = 10

type Actor = { uid: string; superAdmin: boolean }
type Objetivo = { uid: string; rol: string; esUltimoSuperAdmin: boolean; estado?: string }
type Decision = { ok: true } | { ok: false; status: number; motivo: string }

const no = (status: number, motivo: string): Decision => ({ ok: false, status, motivo })

const ULTIMO = 'Es el único Super Admin activo: nombra a otro antes de quitarle el rol o suspenderlo, o el sistema se quedaría sin nadie que pueda hacerlo.'

/** Una cuenta eliminada no se toca: la baja es irreversible (Firebase ya la borró) y cambiarle el estado la «resucitaría» sin acceso real. */
export const CUENTA_ELIMINADA = 'Esa cuenta fue eliminada: la baja es definitiva y no se puede cambiar.'

function base(actor: Actor, objetivo: Objetivo): Decision | null {
  if (actor.uid === objetivo.uid) {
    return no(400, 'No puedes cambiar tu propia cuenta desde aquí. Pídeselo a otro administrador.')
  }
  if (objetivo.estado === 'eliminada') return no(409, CUENTA_ELIMINADA)
  return null
}

export function decidirCambioDeRol(opts: {
  actor: Actor
  objetivo: Objetivo
  nuevo: string
  motivo?: string | null
}): Decision {
  const { actor, objetivo, nuevo } = opts
  const previo = base(actor, objetivo)
  if (previo) return previo
  if (!(ROLES_GUARDADOS as readonly string[]).includes(nuevo)) return no(400, 'Ese rol no existe.')
  if (nuevo === objetivo.rol) return no(400, 'Ya tiene ese rol.')

  if (esNivelAdmin(objetivo.rol) || esNivelAdmin(nuevo)) {
    if (!actor.superAdmin) {
      return no(403, 'Sólo un Super Admin puede dar o quitar el rol de administrador.')
    }
    if ((opts.motivo ?? '').trim().length < MINIMO_MOTIVO) {
      return no(400, `Escribe el motivo del cambio (mínimo ${MINIMO_MOTIVO} caracteres): queda en la bitácora.`)
    }
  }
  if (objetivo.rol === 'super_admin' && nuevo !== 'super_admin' && objetivo.esUltimoSuperAdmin) {
    return no(409, ULTIMO)
  }
  return { ok: true }
}

export function decidirCambioDeEstado(opts: { actor: Actor; objetivo: Objetivo; nuevo: string }): Decision {
  const previo = base(opts.actor, opts.objetivo)
  if (previo) return previo
  if (esNivelAdmin(opts.objetivo.rol) && !opts.actor.superAdmin) {
    return no(403, 'Sólo un Super Admin puede suspender o reactivar a un administrador.')
  }
  if (opts.objetivo.rol === 'super_admin' && opts.nuevo !== 'activo' && opts.objetivo.esUltimoSuperAdmin) {
    return no(409, ULTIMO)
  }
  return { ok: true }
}

/** Invitar con rol de admin o super admin es darlo: la misma regla. */
export function decidirInvitacion(opts: { actor: Actor; rol: string }): Decision {
  if (!(ROLES_GUARDADOS as readonly string[]).includes(opts.rol)) return no(400, 'Ese rol no existe.')
  if (esNivelAdmin(opts.rol) && !opts.actor.superAdmin) {
    return no(403, 'Sólo un Super Admin puede invitar a alguien como administrador.')
  }
  return { ok: true }
}

/**
 * Rango de los roles guardados (E-30): cliente < publicador < admin < super_admin. Una invitación SOLO puede subir un rol,
 * nunca bajarlo ni igualarlo. Espejo de la función SQL `invitacion_aplicar` (migración 32), que es quien decide de verdad.
 */
export const RANGO_DE_ROL: Record<RolGuardado, number> = { cliente: 1, publicador: 2, admin: 3, super_admin: 4 }

/** ¿`invitado` es un rol de rango MAYOR que `actual`? Un rol que no conocemos (actual) cuenta como el más alto: no se toca. */
export function esAscenso(actual: unknown, invitado: unknown): boolean {
  const i = typeof invitado === 'string' ? RANGO_DE_ROL[invitado as RolGuardado] : undefined
  if (!i) return false
  const a = typeof actual === 'string' ? RANGO_DE_ROL[actual as RolGuardado] : undefined
  if (a === undefined) return false
  return i > a
}

export type { RolGuardado }
