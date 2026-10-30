import { supabaseAdmin } from './auth-server'
import { ROLES_GUARDADOS, type RolGuardado } from './acceso/permisos'

/**
 * Aplica la invitación pendiente de un correo VERIFICADO. La llama `GET /api/usuarios/me` en cada acceso.
 *
 * E-30 — la regla vive en la BASE, en una sola transacción (`invitacion_aplicar`, migración 32):
 *   · identidad = el correo VERIFICADO de la sesión, normalizado (trim + minúsculas) y comparado por IGUALDAD;
 *     jamás por patrón (`ilike` usaba el correo como patrón y `_`/`%` eran comodines), ni por UID, ni por una sesión previa;
 *   · cuenta nueva → se crea con el rol invitado; cuenta existente → sube SOLO si el rol invitado es de rango MAYOR
 *     (cliente < publicador < admin < super_admin): una invitación nunca baja ni iguala un rol;
 *   · el rol se escribe y la invitación se acepta juntos: si algo falla no queda «aceptada» sin rol.
 *
 * Aquí solo se normaliza, se llama a la función y se interpreta su respuesta. Quien autoriza es la base: la interfaz
 * nunca es la única protección.
 */

export type MotivoOmision =
  | 'sin_correo'
  | 'invitacion_no_encontrada'
  | 'email_no_verificado'
  | 'rol_ya_suficiente'
  | 'cuenta_no_activa'
  | 'error_aplicando_rol'
  | 'funcion_ausente'

export type ResultadoInvitacion =
  | { estado: 'aplicada'; rol: RolGuardado; antes: string | null }
  | { estado: 'omitida'; motivo: MotivoOmision }

/** El correo como se compara: sin espacios en los extremos y en minúsculas. */
export function normalizarCorreo(correo: string | null | undefined): string {
  return (correo ?? '').trim().toLowerCase()
}

/** Para usar un valor como TEXTO LITERAL dentro de un `ilike`: `\`, `%` y `_` dejan de ser comodines. */
export function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const omitida = (motivo: MotivoOmision): ResultadoInvitacion => ({ estado: 'omitida', motivo })

const MOTIVOS_DE_LA_BASE: readonly MotivoOmision[] = ['sin_correo', 'invitacion_no_encontrada', 'email_no_verificado', 'rol_ya_suficiente', 'cuenta_no_activa']

export async function aplicarInvitacion(
  db: ReturnType<typeof supabaseAdmin>,
  usuario: { uid: string; email: string | null; emailVerified: boolean },
): Promise<ResultadoInvitacion> {
  const email = normalizarCorreo(usuario.email)
  if (!usuario.uid || !email) return omitida('sin_correo')

  const { data, error } = await db.rpc('invitacion_aplicar', {
    p_uid: usuario.uid,
    p_email: email,
    p_email_verificado: usuario.emailVerified === true,
  })

  if (error) {
    // Migración 32 sin aplicar: no se aplica ninguna invitación, pero NADIE deja de entrar (falla cerrado).
    const ausente = error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '')
    return omitida(ausente ? 'funcion_ausente' : 'error_aplicando_rol')
  }

  const r = data as { resultado?: string; rol?: string; antes?: string | null; motivo?: string } | null
  if (r?.resultado === 'aplicada' && (ROLES_GUARDADOS as readonly string[]).includes(r.rol ?? '')) {
    return { estado: 'aplicada', rol: r.rol as RolGuardado, antes: r.antes ?? null }
  }
  if (r?.resultado === 'omitida' && (MOTIVOS_DE_LA_BASE as readonly string[]).includes(r.motivo ?? '')) {
    return omitida(r.motivo as MotivoOmision)
  }
  return omitida('error_aplicando_rol')   // respuesta que no entendemos: no se da por aplicada
}
