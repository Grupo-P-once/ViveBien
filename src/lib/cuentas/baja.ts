import type { PerfilUsuario } from '@/lib/auth-server'

/**
 * La baja de cuenta, paso a paso (D-35, D-43).
 *
 * ─────────────────────────────────────────────────────────────
 * EL ORDEN NO SE NEGOCIA
 *
 *   cierre local en UNA transacción  →  COMMIT  →  Firebase
 *                                         ↑
 *                              el punto de no retorno
 *
 * Desde ese `COMMIT` la cuenta está cerrada: `usuarios.estado = 'eliminada'`,
 * y cualquier petición con un token anterior recibe 403 aunque el token siga
 * siendo criptográficamente válido. Que Firebase responda o no **no cambia si
 * la cuenta está cerrada**; sólo cambia cuánto trabajo queda pendiente.
 *
 * Por eso aquí no hay «rollback» de la parte local cuando Firebase falla:
 * sería reabrir una cuenta que la persona pidió cerrar.
 * ─────────────────────────────────────────────────────────────
 *
 * Las dependencias se inyectan para poder probar cada frontera de verdad:
 * Supabase caído, Firebase caído, `user-not-found`, reintentos y concurrencia.
 */

/** Lo que devuelve la función SQL de la migración 26. */
export type ResultadoRpc = 'bloqueada' | 'ya_eliminada' | 'ultimo_super_admin' | 'no_existe'

/** El avance del proceso, tal y como lo guarda `bajas_de_cuenta`. */
export type EstadoProceso =
  | 'solicitada' | 'bloqueada' | 'firebase_eliminada' | 'datos_procesados' | 'completada' | 'error'

/**
 * EL PROCESO SÓLO AVANZA. Para cada estado, desde dónde se puede escribir.
 *
 * No es decoración: con el arriendo de 2 minutos del reintento administrativo,
 * un Firebase muy lento permite que un segundo intento entre y termine mientras
 * el primero sigue colgado. Cuando el primero vuelve —y falla— escribiría
 * `error` encima de una baja ya `completada`: una persona que YA puede
 * registrarse de nuevo pasaría a no poder. Con esta tabla, esa escritura tardía
 * no encuentra fila y se queda sin efecto.
 *
 * Es el mismo patrón que ya usaba la parte SQL (`where ... and estado in (...)`).
 */
export const ANTERIORES: Record<EstadoProceso, readonly EstadoProceso[]> = {
  solicitada: [],
  bloqueada: ['solicitada'],
  error: ['bloqueada', 'error'],
  firebase_eliminada: ['bloqueada', 'error'],
  datos_procesados: ['firebase_eliminada'],
  completada: ['bloqueada', 'error', 'firebase_eliminada', 'datos_procesados'],
}

export type RespuestaBaja =
  | { ok: true; estado: EstadoProceso; puedeRegistrarseDeNuevo: boolean; requiereReintento: boolean }
  | { ok: false; motivo: 'ultimo_super_admin' | 'sin_cuenta' | 'fallo_interno'; estado?: never }

export type DependenciasBaja = {
  /** Llama a `public.baja_de_cuenta(...)`. Es la ÚNICA que escribe el cierre local. */
  cerrarEnLaBase: (uid: string, authTime: Date, motivo: string | null) => Promise<{
    resultado: ResultadoRpc
    estadoProceso?: string
  }>
  revocarSesiones: (uid: string) => Promise<{ ok: boolean; codigo?: string }>
  borrarIdentidad: (uid: string) => Promise<{ ok: boolean; codigo?: string }>
  /** Escribe el avance en `bajas_de_cuenta`. */
  marcarProceso: (uid: string, estado: EstadoProceso, error?: string | null) => Promise<void>
  /** Bitácora. Nunca recibe PII. */
  auditar: (accion: string, datos: Record<string, unknown>) => Promise<void>
}

/** Sólo se promete el correo cuando el proceso terminó del todo. */
export function puedeRegistrarseDeNuevo(estado: EstadoProceso): boolean {
  return estado === 'completada'
}

/** Un código corto y sin datos dentro. Todo lo demás se descarta. */
export function codigoDeError(e: unknown): string {
  const c = (e as { code?: unknown })?.code
  if (typeof c === 'string' && /^[\w.\-/]{1,60}$/.test(c)) return c
  const n = (e as { name?: unknown })?.name
  if (typeof n === 'string' && /^[\w.\-]{1,40}$/.test(n)) return n
  return 'desconocido'
}

/** ¿La reautenticación es lo bastante reciente? Falla cerrado. */
export const MAXIMO_AUTH_TIME_MS = 5 * 60 * 1000

export function reautenticacionReciente(authTime: number | null | undefined, ahora = Date.now()): boolean {
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) return false
  const ms = authTime * 1000
  // Un `auth_time` del futuro es tan sospechoso como uno viejo: se rechaza.
  if (ms > ahora + 60_000) return false
  return ahora - ms <= MAXIMO_AUTH_TIME_MS
}

/**
 * Ejecuta la baja. Supone que quien llama ya comprobó sesión, permiso,
 * reautenticación reciente y tope de peticiones.
 */
export async function ejecutarBaja(
  d: DependenciasBaja,
  perfil: PerfilUsuario,
  opciones: { motivo?: string | null } = {},
): Promise<RespuestaBaja> {
  const uid = perfil.uid
  const authTime = new Date((perfil.authTime ?? 0) * 1000)

  // ── 1 · CIERRE LOCAL ───────────────────────────────────────────────────
  let cierre: { resultado: ResultadoRpc; estadoProceso?: string }
  try {
    cierre = await d.cerrarEnLaBase(uid, authTime, opciones.motivo ?? null)
  } catch (e) {
    // La transacción no se aplicó: la cuenta sigue ACTIVA. No hay estado a
    // medias, y no se toca Firebase.
    await d.auditar('cuenta.baja_fallida', { paso: 'cierre_local', codigo: codigoDeError(e) })
    return { ok: false, motivo: 'fallo_interno' }
  }

  if (cierre.resultado === 'ultimo_super_admin') {
    await d.auditar('cuenta.baja_rechazada', { motivo: 'ultimo_super_admin' })
    return { ok: false, motivo: 'ultimo_super_admin' }
  }
  if (cierre.resultado === 'no_existe') {
    // Hay token pero no fila. No se cierra nada y NO se toca Firebase: en un
    // estado inesperado, lo prudente es no hacer nada destructivo.
    await d.auditar('cuenta.baja_rechazada', { motivo: 'sin_cuenta' })
    return { ok: false, motivo: 'sin_cuenta' }
  }

  // Desde aquí la cuenta está cerrada, venga de este intento (`bloqueada`) o
  // de uno anterior (`ya_eliminada`).
  if (cierre.resultado === 'bloqueada') {
    // La bitácora NO lleva el perfil: sería devolver a `audit_logs` la PII que
    // el cierre acaba de retirar.
    await d.auditar('cuenta.baja_iniciada', { rol_previo: perfil.rol })
  }

  const yaEstaba = (cierre.estadoProceso ?? 'bloqueada') as EstadoProceso
  if (yaEstaba === 'completada') {
    return { ok: true, estado: 'completada', puedeRegistrarseDeNuevo: true, requiereReintento: false }
  }

  // ── 2 · FIREBASE: revocar y luego borrar ───────────────────────────────
  if (yaEstaba === 'bloqueada' || yaEstaba === 'error' || cierre.resultado === 'bloqueada') {
    const revocado = await d.revocarSesiones(uid)
    if (!revocado.ok) {
      await d.marcarProceso(uid, 'error', revocado.codigo ?? 'desconocido')
      await d.auditar('cuenta.baja_error', { paso: 'revocar', codigo: revocado.codigo ?? 'desconocido' })
      return { ok: true, estado: 'error', puedeRegistrarseDeNuevo: false, requiereReintento: true }
    }

    const borrado = await d.borrarIdentidad(uid)
    if (!borrado.ok) {
      await d.marcarProceso(uid, 'error', borrado.codigo ?? 'desconocido')
      await d.auditar('cuenta.baja_error', { paso: 'borrar', codigo: borrado.codigo ?? 'desconocido' })
      return { ok: true, estado: 'error', puedeRegistrarseDeNuevo: false, requiereReintento: true }
    }

    await d.marcarProceso(uid, 'firebase_eliminada', null)
  }

  // ── 3 · CIERRE DEL PROCESO ─────────────────────────────────────────────
  // El tratamiento de datos de la vía A ya lo hizo la función SQL. Lo que
  // queda es dejar constancia de que el proceso terminó.
  await d.marcarProceso(uid, 'completada', null)
  await d.auditar('cuenta.baja_completada', {})

  return { ok: true, estado: 'completada', puedeRegistrarseDeNuevo: true, requiereReintento: false }
}
