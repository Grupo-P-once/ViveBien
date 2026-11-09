import { auth } from '@/lib/firebase'

/**
 * Llamadas autenticadas a la API de citas desde el navegador. Una sola forma de pedir, de recibir y de fallar:
 *   · sin sesión → 401 con un mensaje, sin tocar la red;
 *   · sin conexión → `status: 0` y un mensaje que invita a reintentar (nunca una pantalla en blanco);
 *   · el cuerpo de un error siempre llega en `data`, porque algunos 409 traen la cita tal como quedó (`{ cita }`).
 * La autoridad es siempre el servidor: nada de lo que se arma aquí decide un permiso.
 */
export type RespuestaApi<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: Record<string, unknown> }

/**
 * Token de la sesión. Al abrir la pantalla Firebase aún puede estar restaurando la sesión (`currentUser` es null unos instantes): sin esperar,
 * la primera petición fallaba con «Inicia sesión» aunque la persona sí la tenía. Se espera a que Firebase decida (máx. 5 s).
 */
async function tokenActual(): Promise<string | null> {
  if (!auth.currentUser) {
    await Promise.race([Promise.resolve(auth.authStateReady?.()).catch(() => {}), new Promise<void>((r) => setTimeout(r, 5000))])
  }
  return (await auth.currentUser?.getIdToken().catch(() => null)) ?? null
}

export async function llamarApi<T = unknown>(
  ruta: string,
  opciones: { method?: 'GET' | 'POST' | 'PUT'; cuerpo?: unknown; clave?: string } = {},
): Promise<RespuestaApi<T>> {
  const token = await tokenActual()
  if (!token) return { ok: false, status: 401, error: 'Inicia sesión para continuar.' }
  const { method = 'GET', cuerpo, clave } = opciones
  const res = await fetch(ruta, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(clave ? { 'Idempotency-Key': clave } : {}),
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  }).catch(() => null)
  if (!res) return { ok: false, status: 0, error: 'Se perdió la conexión. Inténtalo otra vez.' }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.ok) return { ok: true, status: res.status, data: j as T }
  return { ok: false, status: res.status, error: typeof j.error === 'string' ? j.error : 'No se pudo completar.', data: j }
}

/** Descarga un archivo autenticado (el `.ics`): no se puede con un enlace común porque pide el token en la cabecera. */
export async function descargarArchivo(ruta: string, nombre: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await tokenActual()
  if (!token) return { ok: false, error: 'Inicia sesión para continuar.' }
  const res = await fetch(ruta, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => null)
  if (!res) return { ok: false, error: 'Se perdió la conexión. Inténtalo otra vez.' }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: j.error ?? 'No se pudo descargar.' }
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return { ok: true }
}
