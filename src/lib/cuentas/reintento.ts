import type { EstadoProceso } from '@/lib/cuentas/baja'

/**
 * Terminar la parte de Firebase de una baja que se quedó a medias (D-43).
 *
 * ─────────────────────────────────────────────────────────────
 * LO QUE ESTO **NO** ES
 *
 * No es «deshacer una baja» ni «reabrir una cuenta». Una cuenta eliminada no
 * vuelve nunca a estar activa: esta operación **jamás toca `usuarios`**.
 *
 * Tampoco vuelve a ejecutar el cierre local. La función SQL de la migración 26
 * no se llama aquí en ningún caso: lo único que queda pendiente cuando un
 * proceso se atasca es la limpieza en Firebase.
 * ─────────────────────────────────────────────────────────────
 *
 * POR QUÉ HACE FALTA
 *
 * `exigir` corta con 403 a una cuenta ya eliminada, así que la persona no
 * puede empujar su propio proceso, y el `GET` de estado tampoco. Sin esta
 * operación, una baja que falla en Firebase se queda parada para siempre — y
 * esa persona no podría registrarse de nuevo con su correo, porque Google le
 * devolvería el UID anterior. Rompería la promesa central de D-35.
 */

/** Estados desde los que tiene sentido reintentar. */
export const REINTENTABLES: readonly EstadoProceso[] = [
  'error',              // falló Firebase
  'bloqueada',          // cerrada, Firebase sin hacer
  'firebase_eliminada', // Firebase hecho, el proceso no llegó a cerrarse
  'datos_procesados',   // íd.
]

/**
 * `solicitada` NO se reintenta: significa que el cierre local no llegó a
 * confirmarse, así que no consta que la cuenta esté cerrada. Borrar la
 * identidad de alguien que quizá sigue activo sería el peor error posible.
 * `completada` tampoco: no queda nada por hacer.
 */
export const NO_REINTENTABLES: readonly EstadoProceso[] = ['solicitada', 'completada']

/** Cuánto vale un intento antes de que otro pueda tomar el relevo. */
export const ARRIENDO_MS = 2 * 60 * 1000

export type MotivoRechazo =
  | 'sin_registro'        // no hay baja para ese uid
  | 'ya_completada'       // no queda nada que hacer
  | 'sin_paso_pendiente'  // estado no reintentable (p. ej. `solicitada`)
  | 'cuenta_no_eliminada' // la cuenta NO está cerrada: no se toca Firebase
  | 'en_curso'            // otro reintento lo tiene tomado ahora mismo

export type ResultadoReintento =
  /** `estado` es el que la base tiene DE VERDAD al terminar, no el que se quiso escribir. */
  | { ok: true; estado: EstadoProceso; firebaseYaNoExistia: boolean; fallo?: string }
  | { ok: false; motivo: MotivoRechazo }

export type Baja = {
  uid: string
  estado: EstadoProceso
  intentos: number
  ultimoIntentoEn: string | null
}

export type DependenciasReintento = {
  /** La baja y el estado REAL de la cuenta. Null si no hay registro. */
  leer: (uid: string) => Promise<{ baja: Baja; estadoCuenta: string } | null>
  /**
   * Toma el relevo. Devuelve `true` sólo si ESTE proceso se lo quedó.
   *
   * Es un `UPDATE` condicional: PostgreSQL reevalúa la condición después de un
   * `UPDATE` concurrente, así que de dos reintentos simultáneos **sólo uno**
   * ve filas afectadas. El arriendo por tiempo permite además recuperar un
   * reintento que murió a mitad, sin hacer falta una columna nueva.
   */
  tomarElRelevo: (uid: string, intentos: number, limite: string) => Promise<boolean>
  revocarSesiones: (uid: string) => Promise<{ ok: boolean; codigo?: string }>
  borrarIdentidad: (uid: string) => Promise<{ ok: boolean; codigo?: string; yaNoExistia?: boolean }>
  /**
   * Escribe el avance y devuelve **el estado real de la fila** después de
   * intentarlo. Si otro reintento ya movió el proceso más adelante, la
   * escritura no se aplica y lo que vuelve es lo que hay, no lo que se pidió.
   */
  marcar: (uid: string, estado: EstadoProceso, error: string | null) => Promise<EstadoProceso>
  auditar: (accion: string, uid: string, datos: Record<string, unknown>) => Promise<void>
}

/**
 * Reintenta. El `uid` lo elige un administrador, pero **no puede ser
 * cualquiera**: tiene que corresponder a una baja registrada, en un estado
 * pendiente, y sobre una cuenta que conste como eliminada.
 */
export async function reintentarFirebase(
  d: DependenciasReintento,
  uid: string,
  ahora = Date.now(),
): Promise<ResultadoReintento> {
  const fila = await d.leer(uid)
  if (!fila) return { ok: false, motivo: 'sin_registro' }

  const { baja, estadoCuenta } = fila
  if (baja.estado === 'completada') return { ok: false, motivo: 'ya_completada' }
  if (!REINTENTABLES.includes(baja.estado)) return { ok: false, motivo: 'sin_paso_pendiente' }

  // La comprobación que de verdad protege: si la cuenta NO consta cerrada, no
  // se toca Firebase. Da igual lo que diga el registro del proceso.
  if (estadoCuenta !== 'eliminada') {
    await d.auditar('cuenta.baja_reintento_rechazado', uid, { motivo: 'cuenta_no_eliminada' })
    return { ok: false, motivo: 'cuenta_no_eliminada' }
  }

  const limite = new Date(ahora - ARRIENDO_MS).toISOString()
  if (!(await d.tomarElRelevo(uid, baja.intentos + 1, limite))) {
    return { ok: false, motivo: 'en_curso' }
  }

  await d.auditar('cuenta.baja_reintento', uid, { desde: baja.estado, intento: baja.intentos + 1 })

  // Revocar sólo si Firebase puede seguir teniendo sesiones vivas.
  if (baja.estado === 'error' || baja.estado === 'bloqueada') {
    const revocado = await d.revocarSesiones(uid)
    if (!revocado.ok) return await fallar(d, uid, 'revocar', revocado.codigo)

    const borrado = await d.borrarIdentidad(uid)
    if (!borrado.ok) return await fallar(d, uid, 'borrar', borrado.codigo)

    await d.marcar(uid, 'firebase_eliminada', null)
    const real = await d.marcar(uid, 'completada', null)
    await d.auditar('cuenta.baja_reintento_completado', uid, {})
    return { ok: true, estado: real, firebaseYaNoExistia: borrado.yaNoExistia === true }
  }

  // Firebase ya estaba hecho: sólo falta cerrar el proceso.
  const real = await d.marcar(uid, 'completada', null)
  await d.auditar('cuenta.baja_reintento_completado', uid, { firebase: 'ya_estaba' })
  return { ok: true, estado: real, firebaseYaNoExistia: true }
}

/**
 * Anota el fallo y devuelve el estado REAL. Si mientras este intento estaba
 * colgado otro terminó la baja, `marcar` no aplica nada y aquí vuelve
 * `completada`: no se le dice a nadie que hay trabajo pendiente cuando ya no lo
 * hay, ni se marca como fallida una baja terminada.
 */
async function fallar(
  d: DependenciasReintento, uid: string, paso: string, codigo: string | undefined,
): Promise<ResultadoReintento> {
  const fallo = codigo ?? 'desconocido'
  const real = await d.marcar(uid, 'error', fallo)
  await d.auditar('cuenta.baja_reintento_fallido', uid, { paso, codigo: fallo })
  return { ok: true, estado: real, firebaseYaNoExistia: false, fallo }
}
