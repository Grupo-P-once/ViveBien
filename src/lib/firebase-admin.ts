import 'server-only'
import { randomBytes } from 'node:crypto'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'

/**
 * Firebase Admin — sólo servidor (V-1.1.87, D-35, D-44).
 *
 * Dos cosas: el diagnóstico (que no toca a nadie) y las dos operaciones de la
 * baja —revocar sesiones y borrar la identidad—, que sólo se llaman DESPUÉS de
 * que el cierre local haya hecho `COMMIT`.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ LAS DOS OPERACIONES VAN POR REST Y NO POR EL SDK (D-44)
 *
 * De este paquete se importa **únicamente `firebase-admin/app`**. Importar
 * `firebase-admin/auth` no funciona en el runtime de Vercel, y la baja real de
 * QA lo demostró: su `exports` resuelve a un envoltorio ESM sobre el CJS del
 * propio SDK, que hace `require('jwks-rsa')` → `require('jose')`, y `jose` 6 es
 * sólo ESM. Nuestro `import()` dinámico no podía arreglarlo: el `require` está
 * tres niveles más abajo, dentro del SDK. Encima, `serverExternalPackages` hace
 * que Turbopack cargue el paquete con su ayudante `externalImport`, que envuelve
 * cualquier fallo en un `Error` pelado sin `code` — de ahí el inútil
 * `ultimo_error = 'Error'` que nos dejó ciegos.
 *
 * Las dos únicas operaciones que necesitamos existen en Identity Toolkit como
 * dos peticiones HTTP. La parte difícil —que la cuenta de servicio sea válida y
 * Google entregue un token— **ya estaba probada en producción**: la hace
 * `firebase-admin/app`, que carga sin problema. Así que se queda el SDK para la
 * credencial y se van dos `fetch` para las operaciones. Cero dependencias
 * nuevas, cero empaquetado que pueda fallar.
 *
 * `tests/firebase-admin-superficie.test.ts` vigila que nadie vuelva a importar
 * `firebase-admin/auth`.
 * ─────────────────────────────────────────────────────────────
 *
 * Regla de esta casa: nada de lo que sale de aquí lleva la credencial, ni la
 * clave privada, ni el correo de la cuenta de servicio, ni el token OAuth. Los
 * errores se traducen a un catálogo fijo de códigos cortos; los mensajes en
 * crudo **no se devuelven** y sólo se escriben en el registro del servidor, que
 * es privado.
 *
 * `import 'server-only'` hace que el build FALLE si alguien importa esto desde
 * un componente de cliente. Es la barrera, no un comentario.
 */

const NOMBRE_APP = 'vivebien-admin'
const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1'

export type Diagnostico =
  | { ok: true; proyectoCoincide: boolean }
  | { ok: false; causa: string }

/** Causas posibles. Ninguna incluye datos de la credencial. */
const CAUSAS = {
  ausente: 'la variable FIREBASE_SERVICE_ACCOUNT no existe en este entorno',
  noEsJson: 'FIREBASE_SERVICE_ACCOUNT no es JSON válido',
  camposFaltantes: 'al JSON le faltan campos obligatorios (project_id, client_email o private_key)',
  claveMalFormada: 'la clave privada no tiene el formato PEM esperado',
  rechazada: 'Google rechazó la credencial (invalid_grant): puede estar revocada, o el reloj del servidor desfasado',
  sinRed: 'no se pudo contactar con Google para validar la credencial',
} as const

/** Un código de error corto y sin datos dentro. Todo lo demás se descarta. */
function codigoSeguro(e: unknown): string {
  const c = (e as { code?: unknown })?.code
  if (typeof c === 'string' && /^[\w.\-/]{1,60}$/.test(c)) return c
  const n = (e as { name?: unknown })?.name
  if (typeof n === 'string' && /^[\w.\-]{1,40}$/.test(n)) return n
  return 'desconocido'
}

type Credencial = { getAccessToken(): Promise<{ access_token?: unknown }> }
type Cuenta = { projectId: string; clientEmail: string; privateKey: string }

/** Lee y valida la variable. Devuelve la cuenta, o la causa por la que no sirve. */
function leerCuentaDeServicio(): { cuenta: Cuenta } | { causa: string } {
  const crudo = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!crudo || !crudo.trim()) return { causa: CAUSAS.ausente }

  let json: { project_id?: unknown; client_email?: unknown; private_key?: unknown }
  try {
    json = JSON.parse(crudo)
  } catch {
    return { causa: CAUSAS.noEsJson }
  }

  const projectId = typeof json.project_id === 'string' ? json.project_id : ''
  const clientEmail = typeof json.client_email === 'string' ? json.client_email : ''
  const privateKey = typeof json.private_key === 'string' ? json.private_key : ''
  if (!projectId || !clientEmail || !privateKey) return { causa: CAUSAS.camposFaltantes }
  if (!privateKey.includes('BEGIN PRIVATE KEY')) return { causa: CAUSAS.claveMalFormada }

  return { cuenta: { projectId, clientEmail, privateKey } }
}

/**
 * ¿Está bien puesta la credencial y la acepta Google?
 *
 * Inicializar **no** prueba nada: `cert()` sólo parsea. Por eso se pide un
 * token de acceso, que es una llamada a Google que valida la firma sin tocar
 * ninguna cuenta de nadie.
 */
export async function diagnosticarFirebaseAdmin(): Promise<Diagnostico> {
  const leido = leerCuentaDeServicio()
  if ('causa' in leido) return { ok: false, causa: leido.causa }
  const { projectId, clientEmail, privateKey } = leido.cuenta

  let credencial: Credencial
  let app: App
  try {
    credencial = cert({ projectId, clientEmail, privateKey }) as unknown as Credencial
    app = getApps().find((a) => a.name === NOMBRE_APP) ?? initializeApp({ credential: credencial as never }, NOMBRE_APP)
  } catch (e) {
    return { ok: false, causa: `no se pudo inicializar (${codigoSeguro(e)})` }
  }

  try {
    await credencial.getAccessToken()
  } catch (e) {
    const codigo = codigoSeguro(e)
    if (codigo === 'ENOTFOUND' || codigo === 'ECONNREFUSED' || codigo === 'ETIMEDOUT') {
      return { ok: false, causa: CAUSAS.sinRed }
    }
    // El mensaje de la librería NO se reenvía: puede traer la credencial dentro.
    const texto = e instanceof Error ? e.message : ''
    if (texto.includes('invalid_grant')) return { ok: false, causa: CAUSAS.rechazada }
    return { ok: false, causa: `Google no entregó un token (${codigo})` }
  }

  // El identificador del proyecto ya es público (va en NEXT_PUBLIC_*), pero
  // aun así sólo se informa si coincide o no; no se devuelve su valor.
  const esperado = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''
  void app
  return { ok: true, proyectoCoincide: esperado !== '' && esperado === projectId }
}

/** La línea exacta que se enseña. Sin adornos y sin datos. */
export function lineaDeDiagnostico(d: Diagnostico): string {
  return d.ok ? 'Firebase Admin: OK' : `Firebase Admin: ERROR — ${d.causa}`
}


// ═══════════════════════════════════════════════════════════════
// Las dos operaciones de la baja, por Identity Toolkit REST (D-43, D-44)
// ═══════════════════════════════════════════════════════════════

export type ResultadoFirebase =
  | { ok: true; yaNoExistia: boolean }
  | { ok: false; codigo: string }

/** Lo que hace falta para hablar con Identity Toolkit. */
export type Acceso = { token: string; projectId: string }

/**
 * Traduce la respuesta de Identity Toolkit a un código corto y seguro.
 *
 * Identity Toolkit contesta `{"error":{"code":400,"message":"USER_NOT_FOUND"}}`.
 * El `message` es un identificador en MAYÚSCULAS, a veces con una explicación
 * detrás tras ` : `. **Sólo se acepta ese identificador**: cualquier otra cosa
 * se descarta y se responde con el código HTTP, para que no haya forma de que
 * un texto arbitrario acabe en la base o en la bitácora.
 */
export function codigoDeIdentityToolkit(http: number, cuerpo: unknown): string {
  const mensaje = (cuerpo as { error?: { message?: unknown } })?.error?.message
  if (typeof mensaje === 'string') {
    const identificador = mensaje.split(/[\s:]/)[0]
    if (/^[A-Z][A-Z0-9_]{1,59}$/.test(identificador)) return identificador
  }
  if (http === 401) return 'credencial_rechazada'
  if (http === 403) return 'permiso_denegado'
  return `http_${http}`
}

/** El token OAuth de la cuenta de servicio. Nunca sale de este módulo. */
async function accesoDeServicio(): Promise<Acceso | { codigo: string }> {
  const leido = leerCuentaDeServicio()
  if ('causa' in leido) return { codigo: 'credencial_no_disponible' }

  try {
    const credencial = cert(leido.cuenta) as unknown as Credencial
    const t = await credencial.getAccessToken()
    const token = typeof t?.access_token === 'string' ? t.access_token : ''
    if (!token) return { codigo: 'sin_token' }
    return { token, projectId: leido.cuenta.projectId }
  } catch (e) {
    const codigo = codigoSeguro(e)
    // Registro del servidor: privado, y es lo único que permite diagnosticar.
    console.error('[firebase] no se pudo obtener el token de servicio:', codigo, e)
    if (codigo === 'ENOTFOUND' || codigo === 'ECONNREFUSED' || codigo === 'ETIMEDOUT') {
      return { codigo: 'sin_red' }
    }
    return { codigo: 'credencial_no_disponible' }
  }
}

type Peticion = (url: string, init: RequestInit) => Promise<Response>

/**
 * Una llamada a Identity Toolkit. Devuelve `ok`, o un código corto.
 *
 * El `Authorization` se construye aquí y no se registra en ningún sitio: ni en
 * el error, ni en la consola, ni en lo que se devuelve.
 */
async function llamar(
  acceso: Acceso,
  operacion: 'accounts:delete' | 'accounts:update',
  cuerpo: Record<string, unknown>,
  pedir: Peticion,
): Promise<{ ok: true } | { ok: false; codigo: string }> {
  let respuesta: Response
  try {
    respuesta = await pedir(`${IDENTITY_TOOLKIT}/projects/${acceso.projectId}/${operacion}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${acceso.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  } catch (e) {
    console.error('[firebase] la operación no llegó a Google:', operacion, codigoSeguro(e), e)
    return { ok: false, codigo: 'sin_red' }
  }

  if (respuesta.ok) return { ok: true }

  const texto = await respuesta.text().catch(() => '')
  let json: unknown = null
  try { json = JSON.parse(texto) } catch { /* la respuesta no era JSON */ }

  const codigo = codigoDeIdentityToolkit(respuesta.status, json)
  // Detalle completo SÓLO en el registro del servidor. Nunca en la base, nunca
  // en la bitácora, nunca en la respuesta al navegador. Sin cabeceras: ahí va
  // el token.
  console.error('[firebase] la operación falló:', operacion, 'HTTP', respuesta.status, codigo, texto.slice(0, 500))
  return { ok: false, codigo }
}

/** `USER_NOT_FOUND` es éxito: el paso que se pedía ya estaba hecho. */
const NO_EXISTE = 'USER_NOT_FOUND'

/**
 * Las dos operaciones, con sus extremos inyectados. Existe para poder probar
 * de verdad cada rama —éxito, `USER_NOT_FOUND`, 401, 403, red caída— sin
 * credencial y sin tocar ninguna cuenta.
 */
export function crearOperaciones(obtenerAcceso: () => Promise<Acceso | { codigo: string }>, pedir: Peticion) {
  const conAcceso = async (
    operacion: 'accounts:delete' | 'accounts:update',
    cuerpo: (uid: string) => Record<string, unknown>,
    uid: string,
  ): Promise<ResultadoFirebase> => {
    const acceso = await obtenerAcceso()
    if ('codigo' in acceso) return { ok: false, codigo: acceso.codigo }

    const r = await llamar(acceso, operacion, cuerpo(uid), pedir)
    if (r.ok) return { ok: true, yaNoExistia: false }
    if (r.codigo === NO_EXISTE) return { ok: true, yaNoExistia: true }
    return { ok: false, codigo: r.codigo }
  }

  return {
    /**
     * Cierra las sesiones abiertas. Se llama **antes** de borrar.
     *
     * Borrar la identidad ya invalida los tokens de refresco, así que esto es
     * redundante si el borrado sale bien. Importa cuando NO sale: sin revocar,
     * una pestaña abierta seguiría renovando su ID token cada hora
     * indefinidamente. Cuesta una llamada y cierra esa ventana.
     *
     * Es lo mismo que hacía `revokeRefreshTokens` del SDK: poner `validSince`
     * al instante actual, en segundos.
     */
    revocarSesiones: (uid: string) =>
      conAcceso('accounts:update', (u) => ({
        localId: u,
        validSince: String(Math.floor(Date.now() / 1000)),
      }), uid),

    /**
     * Borra la identidad. `USER_NOT_FOUND` es **éxito**: quiere decir que el
     * paso ya ocurrió (un reintento, o que nunca existió). Tratarlo como error
     * dejaría el proceso atascado para siempre.
     */
    borrarIdentidad: (uid: string) => conAcceso('accounts:delete', (u) => ({ localId: u }), uid),
  }
}

// ═══════════════════════════════════════════════════════════════
// La sonda: ¿puede esto hacer su trabajo? (D-44, R-6 y R-7)
// ═══════════════════════════════════════════════════════════════

/**
 * El diagnóstico de la credencial NUNCA probó lo que se rompía.
 *
 * `diagnosticarFirebaseAdmin()` valida la cuenta de servicio pidiendo un token,
 * y eso funcionaba perfectamente **mientras la baja real fallaba**: lo que no
 * se podía cargar era `firebase-admin/auth`, que el diagnóstico ni tocaba. Dijo
 * «OK» durante semanas sobre un camino roto.
 *
 * Esta sonda cierra ese hueco: ejecuta **las dos operaciones de verdad**, las
 * mismas que usa la baja, contra un identificador inexistente. Si responden
 * `USER_NOT_FOUND`, está probado que la credencial sirve, que el endpoint
 * responde, que los permisos alcanzan y que la petición está bien formada.
 *
 * ── POR QUÉ ES SEGURA ──
 *
 * · El identificador se genera con `randomBytes`: 28 caracteres alfanuméricos,
 *   el formato real de Firebase. El espacio es de 62^28; acertar con una cuenta
 *   existente no es improbable, es imposible en la práctica.
 * · Se comprueba el formato y se rechaza el UID de la cuenta de QA antes de
 *   enviar nada.
 * · **Se prueba primero `accounts:update`**, que como mucho cerraría sesiones, y
 *   sólo si contesta `USER_NOT_FOUND` —es decir, sólo cuando está demostrado que
 *   ese identificador no existe— se prueba `accounts:delete`. Así, el borrado
 *   nunca puede alcanzar a nadie.
 * · Nada entra desde fuera: el identificador no se acepta por parámetro.
 * · Lo que sale son tres códigos. Ni el identificador, ni el token, ni la
 *   credencial, ni el cuerpo de las respuestas.
 */

/** La cuenta de QA, que está a medias. Nunca puede ser el objetivo de la sonda. */
const UID_QA = 'uRnx8chsgdSNkDbOLju5QkGBr4x1'
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Un identificador con el formato de Firebase que no es de nadie. */
export function generarLocalIdInexistente(aleatorio: (n: number) => Uint8Array): string {
  return [...aleatorio(28)].map((b) => ALFABETO[b % ALFABETO.length]).join('')
}

export type PasoSonda = { paso: 'token' | 'accounts:update' | 'accounts:delete'; ok: boolean; codigo: string }
export type ResultadoSonda = { ok: boolean; pasos: PasoSonda[] }

export function crearSonda(
  obtenerAcceso: () => Promise<Acceso | { codigo: string }>,
  pedir: Peticion,
  aleatorio: (n: number) => Uint8Array,
) {
  return async function sondar(): Promise<ResultadoSonda> {
    const pasos: PasoSonda[] = []
    const fin = (ok: boolean) => ({ ok, pasos })

    const acceso = await obtenerAcceso()
    if ('codigo' in acceso) {
      pasos.push({ paso: 'token', ok: false, codigo: acceso.codigo })
      return fin(false)
    }
    pasos.push({ paso: 'token', ok: true, codigo: 'OK' })

    const localId = generarLocalIdInexistente(aleatorio)
    // Doble candado: formato exacto y nunca la cuenta de QA.
    if (!/^[A-Za-z0-9]{28}$/.test(localId) || localId === UID_QA) {
      pasos.push({ paso: 'accounts:update', ok: false, codigo: 'localid_no_valido' })
      return fin(false)
    }

    // Primero el que no destruye. Si no dijera `USER_NOT_FOUND`, se para aquí y
    // el borrado no llega a intentarse.
    for (const [operacion, cuerpo] of [
      ['accounts:update', { localId, validSince: String(Math.floor(Date.now() / 1000)) }],
      ['accounts:delete', { localId }],
    ] as const) {
      const r = await llamar(acceso, operacion, cuerpo, pedir)
      if (r.ok) {
        // HTTP 200 sobre un identificador que no debería existir. No se sigue.
        pasos.push({ paso: operacion, ok: false, codigo: 'respuesta_inesperada' })
        return fin(false)
      }
      pasos.push({ paso: operacion, ok: r.codigo === NO_EXISTE, codigo: r.codigo })
      if (r.codigo !== NO_EXISTE) return fin(false)
    }

    return fin(true)
  }
}

const operaciones = crearOperaciones(accesoDeServicio, (url, init) => fetch(url, init))
const sonda = crearSonda(accesoDeServicio, (url, init) => fetch(url, init), (n) => randomBytes(n))

/** Ejecuta la sonda con la credencial real. Sólo servidor. */
export const sondarIdentityToolkit = (): Promise<ResultadoSonda> => sonda()

export const revocarSesiones = (uid: string): Promise<ResultadoFirebase> => operaciones.revocarSesiones(uid)
export const borrarIdentidad = (uid: string): Promise<ResultadoFirebase> => operaciones.borrarIdentidad(uid)
