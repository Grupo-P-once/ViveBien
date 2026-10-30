import { createHash, createHmac } from 'node:crypto'
import { normalizarNube } from './nube'
import { destinoCloudinary } from '../fotos'
import { puede } from '../acceso/permisos'
import { puedeEditarAnuncio } from '../publicacion'

/**
 * Subidas FIRMADAS a Cloudinary (SEC-05, ADR-0008). Sólo servidor.
 *
 * ─────────────────────────────────────────────────────────────
 * V-1.1.78 — tarea 01.07 del PRD v2.0
 *
 * Antes cada subida usaba un preset SIN firma cuyo nombre viajaba en el código
 * del sitio: cualquiera podía subir lo que quisiera a la cuenta, a la carpeta
 * que quisiera, sin pasar por el sitio.
 *
 * Ahora el servidor decide y firma CADA subida: a qué carpeta va, con qué
 * nombre y en qué formatos. Cloudinary rechaza la subida si el navegador
 * cambia cualquiera de esos datos (la firma deja de cuadrar) o si pasó más de
 * una hora. El secreto nunca sale del servidor.
 * ─────────────────────────────────────────────────────────────
 */

/** Los mismos formatos que acepta el asistente (FORMATOS_FOTO). */
export const FORMATOS_PERMITIDOS = 'jpg,jpeg,png,webp'

export type Credenciales = { nube: string; apiKey: string; secreto: string }

/** Las tres piezas, sin espacios invisibles. Null si falta alguna. */
export function credencialesCloudinary(env: Record<string, string | undefined> = process.env): Credenciales | null {
  const nube = normalizarNube(env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME)
  const apiKey = env.CLOUDINARY_API_KEY?.trim()
  const secreto = env.CLOUDINARY_API_SECRET?.trim()
  return nube && apiKey && secreto ? { nube, apiKey, secreto } : null
}

/**
 * La firma de Cloudinary: parámetros ordenados por nombre, `clave=valor`
 * unidos con `&`, el secreto al final, SHA-1 en hexadecimal. No entran
 * `file`, `cloud_name`, `resource_type` ni `api_key`.
 */
export function firmar(params: Record<string, string | number>, secreto: string): string {
  const texto = Object.keys(params)
    .filter((k) => !['file', 'cloud_name', 'resource_type', 'api_key'].includes(k))
    .filter((k) => params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(texto + secreto).digest('hex')
}

export type Campos = Record<string, string>

/** Los campos que acompañan al archivo en el POST a Cloudinary, ya firmados. */
export function camposFirmados(
  params: Record<string, string>,
  cred: Credenciales,
  ahora = Date.now(),
): Campos {
  const conHora = { ...params, timestamp: String(Math.floor(ahora / 1000)) }
  return { ...conHora, api_key: cred.apiKey, signature: firmar(conHora, cred.secreto) }
}

export function urlDeSubida(nube: string): string {
  return `https://api.cloudinary.com/v1_1/${nube}/image/upload`
}

/** Nombre corto y único, como el de `destinoCloudinary`. */
function nombreUnico(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Qué se puede pedir ────────────────────────────────────────────

export type Pedido =
  | { proposito: 'propiedad'; propiedadId: string | null; clase: 'fotos' | 'planos' }
  | { proposito: 'perfil' }

/** Lee lo que manda el navegador. Todo lo demás lo decide el servidor. */
export function leerPedido(body: unknown): Pedido | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.proposito === 'perfil') return { proposito: 'perfil' }
  if (b.proposito === 'propiedad') {
    const id = typeof b.propiedadId === 'string' && b.propiedadId.trim() ? b.propiedadId.trim().slice(0, 120) : null
    return { proposito: 'propiedad', propiedadId: id, clase: b.clase === 'planos' ? 'planos' : 'fotos' }
  }
  return null
}

type Quien = { uid: string; rol: string; editaPublicadas?: boolean }
type Propiedad = { owner_id: string | null; tipo: string | null; estado_pub?: string | null } | null

/**
 * ¿Puede esta cuenta subir esto? Regla del ADR-0008: sólo quien puede editar
 * la propiedad sube a su carpeta. Una propiedad sin id (panel clásico, antes
 * de guardarla) sólo la sube un admin.
 */
export function autorizar(
  pedido: Pedido,
  quien: Quien,
  prop: Propiedad,
): { ok: true } | { ok: false; status: number; motivo: string } {
  if (pedido.proposito === 'perfil') return { ok: true }
  const esAdmin = puede(quien, 'propiedad.gestionar_todas') || quien.rol === 'super_admin'
  if (!pedido.propiedadId) {
    return esAdmin ? { ok: true } : { ok: false, status: 403, motivo: 'Guarda la propiedad antes de subir fotos.' }
  }
  if (!prop) return { ok: false, status: 404, motivo: 'Esa propiedad no existe.' }
  if (!esAdmin && prop.owner_id !== quien.uid) return { ok: false, status: 403, motivo: 'Esa propiedad no es tuya.' }
  // La misma regla que el PATCH de la propiedad: en revisión o publicada no se
  // suben fotos nuevas hasta que un administrador la devuelva a borrador.
  if (!esAdmin && !puedeEditarAnuncio(prop.estado_pub, false, quien.editaPublicadas === true)) {
    return { ok: false, status: 409, motivo: 'Esta propiedad está en revisión o publicada: no se pueden subir fotos.' }
  }
  return { ok: true }
}

/**
 * Identificador OPACO y estable de una cuenta para las carpetas de Cloudinary (15-oct-2026).
 *
 * Las URLs de Cloudinary son públicas: poner el UID de Firebase en la ruta publicaría el identificador de la cuenta junto a cada
 * foto. En su lugar se usa un HMAC-SHA256 del UID con un secreto que el servidor YA tiene (el de Cloudinary; no se añade ninguna
 * variable): mismo UID → misma carpeta; sin el secreto no se puede volver al UID ni calcular la carpeta de otra persona.
 * Límite conocido: si algún día se rota `CLOUDINARY_API_SECRET`, las subidas NUEVAS de una cuenta irán a otra carpeta (las
 * imágenes ya subidas conservan su URL; no se mueve ni se borra nada).
 */
export function idOpacoDeUsuario(uid: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`vivebien/usuario/${uid}`).digest('hex').slice(0, 20)
}

/** Quién sube y con qué secreto se deriva su carpeta: SIEMPRE datos del servidor (sesión validada y fila de la propiedad). */
export type OrigenDeCarpeta = { uid: string; secreto: string }

/**
 * Dónde y con qué nombre queda el archivo. Lo decide el servidor, no el navegador.
 *
 * Con `origen`: `usuarios/<id opaco>/anuncios/<tipo>/<anuncio>` (+ `/planos`). La persona dueña de la carpeta es la dueña de la
 * propiedad en la base (`prop.owner_id`); si la propiedad no tiene dueño o aún no existe (panel clásico, solo admin), la cuenta de
 * la sesión. Sin `origen` queda el esquema anterior `vivebien/<tipo>/<anuncio>` (lo usa el bot de Telegram).
 */
export function destinoDe(pedido: Pedido, prop: Propiedad, origen?: OrigenDeCarpeta): Record<string, string> {
  if (pedido.proposito === 'perfil') {
    return { public_id: `vivebien/perfiles/${nombreUnico()}`, asset_folder: 'vivebien/perfiles', allowed_formats: FORMATOS_PERMITIDOS }
  }
  const propietario = origen ? idOpacoDeUsuario(prop?.owner_id || origen.uid, origen.secreto) : undefined
  const { public_id, asset_folder } = destinoCloudinary(pedido.propiedadId ?? 'nueva', prop?.tipo, pedido.clase, propietario)
  return { public_id, asset_folder, allowed_formats: FORMATOS_PERMITIDOS }
}

/**
 * Subida desde el propio servidor (bot de Telegram, lectura de fichas).
 * `archivo` puede ser una URL remota: Cloudinary la descarga.
 */
export async function subirDesdeServidor(
  archivo: string,
  params: Record<string, string>,
): Promise<{ ok: true; datos: Record<string, unknown> } | { ok: false; motivo: string }> {
  const cred = credencialesCloudinary()
  if (!cred) return { ok: false, motivo: 'Cloudinary sin configurar (faltan CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET).' }
  const fd = new FormData()
  fd.append('file', archivo)
  for (const [k, v] of Object.entries(camposFirmados(params, cred))) fd.append(k, v)
  try {
    const res = await fetch(urlDeSubida(cred.nube), { method: 'POST', body: fd })
    const datos = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const error = datos.error as { message?: string } | undefined
      return { ok: false, motivo: error?.message ?? `HTTP ${res.status}` }
    }
    return { ok: true, datos }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'error de red' }
  }
}
