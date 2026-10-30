/**
 * Una sola consulta de `/api/usuarios/me` por sesión y por recorrido de entrada.
 *
 * El problema (Etapa 7): al iniciar sesión se pasa por `/dashboard` (que pregunta el rol y reparte) y luego por el
 * marco del panel de destino (portal, publicador, admin), que volvía a preguntar lo mismo. Eran dos viajes seguidos
 * por lo mismo, cada uno con su propia pantalla de espera: de ahí el «azul y luego blanco».
 *
 * Qué hace esto y qué NO hace:
 * - Reutiliza la respuesta **del servidor** unos segundos y la clave es el `uid` de la sesión: otra cuenta nunca la lee.
 * - Une las consultas simultáneas (una petición en vuelo por `uid`).
 * - No decide nada: el rol sigue siendo el que devolvió `/api/usuarios/me` y cada API vuelve a comprobarlo con el token.
 * - No guarda errores ni respuestas no `ok` (un 401/403/500 se vuelve a preguntar siempre).
 * - Vive en memoria del navegador (se pierde al recargar) y se vacía al cerrar sesión o cambiar de cuenta.
 * - TTL corto a propósito: un cambio de rol hecho por un admin se ve al recargar o en cuanto pase el TTL.
 */

/** Cuánto se reutiliza la respuesta del servidor. Cubre el salto /dashboard → panel; no más. */
export const VIGENCIA_PERFIL_MS = 8_000

/** Lo que los marcos leen de `/api/usuarios/me` (el servidor manda más). Todo es opcional: cada lector valida lo que usa. */
export type PerfilCrudo = {
  rol?: string
  superAdmin?: boolean
  nombre?: unknown
  foto_url?: unknown
  capacidades?: Record<string, boolean | undefined>
  portal?: boolean
  [clave: string]: unknown
}

export type RespuestaPerfil = { ok: boolean; status: number; datos: PerfilCrudo | null }

type Entrada = { uid: string; momento: number; respuesta: RespuestaPerfil }

let guardado: Entrada | null = null
let enVuelo: { uid: string; promesa: Promise<RespuestaPerfil> } | null = null
/** Sube con cada «olvidar» o cambio de cuenta: una consulta que empezó antes ya no guarda su respuesta. */
let generacion = 0

/** Vacía todo. Se llama al cerrar sesión, al cambiar de cuenta y tras editar el perfil. */
export function olvidarPerfilDeSesion(): void {
  guardado = null
  enVuelo = null
  generacion++
}

type Opciones = {
  /** Para pruebas: reloj y petición inyectables. */
  ahora?: () => number
  pedir?: (token: string) => Promise<RespuestaPerfil>
  /** `true` salta la reutilización (p. ej. tras confirmar el correo). */
  fresco?: boolean
}

async function pedirAlServidor(token: string): Promise<RespuestaPerfil> {
  const res = await fetch('/api/usuarios/me', { headers: { Authorization: `Bearer ${token}` } })
  let datos: PerfilCrudo | null = null
  if (res.ok) {
    try { datos = (await res.json()) as PerfilCrudo } catch { datos = null }
  }
  return { ok: res.ok && datos !== null, status: res.status, datos }
}

/**
 * Perfil de la sesión `uid`. `token` se usa SOLO si hay que ir al servidor.
 * Devuelve siempre un objeto nuevo-seguro de leer; los llamadores no deben mutarlo.
 */
export async function perfilDeSesion(uid: string, token: () => Promise<string>, o: Opciones = {}): Promise<RespuestaPerfil> {
  const ahora = o.ahora ?? Date.now
  const pedir = o.pedir ?? pedirAlServidor

  // Otra cuenta: lo de la anterior no se toca ni se reutiliza.
  if ((guardado && guardado.uid !== uid) || (enVuelo && enVuelo.uid !== uid)) olvidarPerfilDeSesion()

  if (o.fresco) olvidarPerfilDeSesion()
  else if (guardado && ahora() - guardado.momento < VIGENCIA_PERFIL_MS) return guardado.respuesta

  if (enVuelo) return enVuelo.promesa

  const miGeneracion = generacion
  const promesa = (async () => {
    const r = await pedir(await token())
    // Solo se guarda lo que el servidor aceptó, y solo si nadie olvidó ni cambió de cuenta mientras tanto.
    if (r.ok && miGeneracion === generacion) guardado = { uid, momento: ahora(), respuesta: r }
    return r
  })()
  enVuelo = { uid, promesa }
  try {
    return await promesa
  } finally {
    if (enVuelo?.promesa === promesa) enVuelo = null
  }
}
