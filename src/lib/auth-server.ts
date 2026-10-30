import { clienteServidor } from './supabase-servidor'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { NextResponse } from 'next/server'
import { esNivelAdmin, puede, type Permiso } from './acceso/permisos'
import { capacidadesEfectivas, tipoDe, type MapaCapacidades, type TipoPublicador } from './acceso/capacidades'

/**
 * Autorización en servidor.
 *
 * Regla de fondo: el navegador nunca decide permisos. Las rutas que escriben
 * usan SUPABASE_SERVICE_ROLE_KEY, que ignora las políticas RLS, así que el
 * único punto donde se puede comprobar quién eres es aquí.
 *
 * El token de Firebase se valida contra las claves públicas de Google: no hace
 * falta service account ni ningún secreto adicional.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export type Rol = 'cliente' | 'publicador' | 'admin'

/**
 * El estado de una cuenta responde a UNA pregunta: ¿esta identidad puede usar
 * VIVE BIEN?
 *
 * `desconocido` no existe en la base. Es lo que devuelve el servidor cuando
 * **no pudo saberlo**: un valor que no reconoce, o la tabla que no responde.
 * Está para que la duda se resuelva cerrando, nunca abriendo.
 */
export type Estado = 'activo' | 'suspendido' | 'pendiente' | 'eliminada' | 'desconocido'

/** Lo que la base admite (`usuarios_estado_check`, migración 25). */
export const ESTADOS_GUARDADOS = ['activo', 'suspendido', 'pendiente', 'eliminada'] as const

/**
 * Los únicos estados que dejan entrar. **Lista blanca**: lo que no está aquí,
 * no pasa. Antes era al revés —se bloqueaba `suspendido` y lo demás entraba—,
 * y con la migración 25 eso convertía una cuenta eliminada en una cuenta viva.
 */
export const ESTADOS_QUE_ENTRAN: readonly Estado[] = ['activo', 'pendiente']

export type AuthUser = {
  uid: string
  email: string | null
  emailVerified: boolean
  /**
   * Cuándo se autenticó DE VERDAD esta sesión (claim `auth_time`, en segundos).
   * Lo firma Google, así que sirve para exigir reautenticación reciente en una
   * acción destructiva sin creerle nada al navegador. Nulo si el token no lo
   * trae, o cuando quien construye el perfil no lo sabe.
   *
   * Es OPCIONAL a propósito, y eso **falla cerrado**: quien exige
   * reautenticación reciente trata la ausencia como «no reciente» y rechaza.
   */
  authTime?: number | null
}

export type PerfilUsuario = AuthUser & {
  /** Rol efectivo. Un Super Admin es 'admin' aquí, para que todo lo que ya
   *  pregunta por 'admin' siga funcionando; lo distingue `superAdmin`. */
  rol: Rol
  /** V-1.1.79 (D-13): admin con poderes extra (roles de admin, flags). */
  superAdmin: boolean
  estado: Estado
  nombre: string | null
  /**
   * Modalidad de publicador (ADR-0013). Sólo significa algo si `rol` es
   * 'publicador'; en cualquier otro caso vale 'publicador' y no se usa.
   */
  tipoPublicador?: TipoPublicador
  /**
   * Permisos efectivos = defaults de la modalidad + overrides del usuario.
   * Calculados aquí, en el servidor; el navegador sólo los recibe para pintar.
   * Opcional: quien construye un perfil sin ellos (mocks, perfiles viejos) no
   * tiene ninguna capacidad.
   */
  capacidades?: MapaCapacidades
}

/** Cliente de Supabase con service role. IGNORA RLS: sólo tras validar sesión. */
export function supabaseAdmin() {
  return clienteServidor(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Devuelve el usuario del ID token del header Authorization, o null si no es válido. */
export async function verifyIdToken(req: Request): Promise<AuthUser | null> {
  if (!PROJECT_ID) return null

  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    })

    // Firebase pone el uid en `sub`. Un token sin sujeto no identifica a nadie.
    const uid = typeof payload.sub === 'string' ? payload.sub : ''
    if (!uid) return null

    return {
      uid,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
      authTime: typeof payload.auth_time === 'number' ? payload.auth_time : null,
    }
  } catch {
    // Firma inválida, expirado, emisor o audiencia que no corresponden.
    return null
  }
}

/*
 * V-1.1.81 — SIN LISTAS DEL ENTORNO.
 *
 * Hasta V-1.1.80, `ADMIN_EMAILS` y `SUPER_ADMIN_EMAILS` daban el rol de
 * administrador por encima de la tabla. Ya no deciden nada: el rol vive SÓLO
 * en `usuarios.rol`, que únicamente escribe el servidor con sus reglas
 * (lib/acceso/roles.ts) y que el navegador no puede tocar (RLS sin políticas y
 * sin privilegios, migración 17). Cambiar un rol deja huella en la bitácora;
 * editar una variable de Vercel, no.
 *
 * Recuperación si se perdiera el último Super Admin (las reglas lo impiden):
 * editar la fila en Supabase a mano.
 */

/**
 * El perfil a partir del token y la fila de `usuarios`. Puro: es lo que
 * prueban los tests. El rol lo dice la tabla y nada más.
 *
 * Un Super Admin tiene rol efectivo 'admin' (así todo lo que ya pregunta por
 * admin le sigue funcionando) y `superAdmin: true`.
 */
export function resolverPerfil(
  user: AuthUser,
  fila: { rol?: unknown; estado?: unknown; nombre?: unknown; tipo_publicador?: unknown; permisos_override?: unknown } | null,
): PerfilUsuario {
  const guardado = typeof fila?.rol === 'string' ? fila.rol : 'cliente'
  const superAdmin = guardado === 'super_admin'
  const rol: Rol = esNivelAdmin(guardado) ? 'admin' : guardado === 'publicador' ? 'publicador' : 'cliente'
  return {
    ...user,
    rol,
    superAdmin,
    estado: estadoDeLaFila(fila),
    nombre: typeof fila?.nombre === 'string' ? fila.nombre : null,
    tipoPublicador: tipoDe(fila?.tipo_publicador),
    capacidades: capacidadesEfectivas({ rol, tipo: fila?.tipo_publicador, overrides: fila?.permisos_override }),
  }
}

/**
 * El estado, con lista blanca. Tres casos que NO son lo mismo:
 *
 * - **No hay fila** (`null`): el alta todavía no ha ocurrido. Vale como
 *   activa, o nadie podría registrarse nunca.
 * - **Hay fila con un valor conocido**: ese valor.
 * - **Hay fila con un valor que no reconocemos**: `desconocido`, y no entra.
 *
 * La diferencia entre el primero y el tercero es la que evita las dos formas
 * de equivocarse: bloquear a quien se registra, o dejar entrar a una lápida.
 */
function estadoDeLaFila(fila: { estado?: unknown } | null | undefined): Estado {
  if (!fila) return 'activo'
  const e = fila.estado
  if (typeof e !== 'string') return 'desconocido'
  return (ESTADOS_GUARDADOS as readonly string[]).includes(e) ? (e as Estado) : 'desconocido'
}

/**
 * Resuelve el perfil del usuario.
 *
 * Si la tabla no responde, la cuenta vale como cliente: se falla CERRADO. Un
 * panel de administración inaccesible durante una caída es preferible a
 * decidir permisos sin la fuente de verdad.
 */
export async function getPerfil(user: AuthUser): Promise<PerfilUsuario> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('usuarios')
      .select('rol, estado, nombre')
      .eq('uid', user.uid)
      .maybeSingle()
    if (error) throw error
    // La modalidad y los overrides (migración 28) se leen aparte y sólo para un
    // publicador: así una base sin migrar —o un fallo de esa lectura— no tumba
    // el acceso de nadie. Sin ellos vale 'publicador' sin overrides, que es lo
    // más restrictivo (falla cerrado).
    let extra: { tipo_publicador?: unknown; permisos_override?: unknown } | null = null
    if (data?.rol === 'publicador') {
      const r = await supabaseAdmin()
        .from('usuarios')
        .select('tipo_publicador, permisos_override')
        .eq('uid', user.uid)
        .maybeSingle()
      if (!r.error) extra = r.data
    }
    return resolverPerfil(user, data ? { ...data, ...extra } : data)
  } catch {
    // No se pudo leer la fuente de verdad: ni el rol ni el estado se pueden
    // afirmar. Se cierra por los dos lados —cliente y `desconocido`—, y el
    // autorizador responde 503. Antes esto devolvía `activo`, que con una
    // cuenta eliminada habría sido una puerta abierta durante la caída.
    return { ...resolverPerfil(user, null), estado: 'desconocido' }
  }
}

type Fallo = { perfil?: never; error: NextResponse }
type Exito = { perfil: PerfilUsuario; error?: never }
export type ChequeoRol = Exito | Fallo

function no(mensaje: string, status: number): Fallo {
  return { error: NextResponse.json({ error: mensaje }, { status }) }
}

// ── Bitácora de intentos denegados (tarea 02.03) ─────────────────
//
// Cada 403 de una cuenta con sesión queda en `audit_logs` como
// `seguridad.denegado`. Sin sesión (401) no se registra: no hay a quién
// atribuirlo y sería una forma gratis de llenar la tabla. Tope por cuenta
// para que un bucle no la llene tampoco.
const TOPE_BITACORA = 20
const VENTANA_BITACORA_MS = 10 * 60 * 1000
const registrados = new Map<string, { n: number; desde: number }>()

async function registrarDenegado(perfil: PerfilUsuario, req: Request, que: string): Promise<void> {
  const ahora = Date.now()
  const r = registrados.get(perfil.uid)
  if (!r || ahora - r.desde > VENTANA_BITACORA_MS) registrados.set(perfil.uid, { n: 1, desde: ahora })
  else if (r.n >= TOPE_BITACORA) return
  else r.n++

  let ruta = ''
  try { ruta = new URL(req.url).pathname } catch { /* sin URL */ }
  try {
    await supabaseAdmin().from('audit_logs').insert({
      actor_uid: perfil.uid,
      actor_email: perfil.email,
      actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol,
      accion: 'seguridad.denegado',
      entidad: 'permiso',
      entidad_id: que,
      despues: { ruta, metodo: req.method },
    })
  } catch {
    // Sin bitácora, pero la respuesta sigue siendo 403.
  }
}

/** Registra un intento denegado que decidió la propia ruta (p. ej. un campo protegido). */
export async function registrarIntentoDenegado(perfil: PerfilUsuario, req: Request, que: string): Promise<void> {
  await registrarDenegado(perfil, req, que)
}

type Puerta = {
  mensaje: string
  status: number
  que: string
  bitacora: 'siempre' | 'escrituras' | 'nunca'
}

/**
 * Qué hacer con un estado que no entra. `null` = adelante.
 *
 * Las tres salidas son distintas a propósito:
 * - **eliminada** es irreversible y no se apela; se registra siempre, porque
 *   un token de una cuenta cerrada llamando a la API es algo que se quiere ver.
 * - **suspendida** se puede levantar; se registra sólo en escrituras, como
 *   hasta ahora, para no llenar la bitácora de lecturas.
 * - **desconocido** no es culpa de quien pide: es que no pudimos comprobarlo.
 *   Por eso responde **503** y no 403, y no va a la bitácora —si la base está
 *   caída, escribir en ella tampoco funcionaría—.
 */
export function revisarEstado(estado: Estado): Puerta | null {
  if (ESTADOS_QUE_ENTRAN.includes(estado)) return null
  if (estado === 'eliminada') {
    return {
      mensaje: 'Esta cuenta fue eliminada.',
      status: 403,
      que: 'cuenta.eliminada',
      bitacora: 'siempre',
    }
  }
  if (estado === 'suspendido') {
    return {
      mensaje: 'Tu cuenta está suspendida.',
      status: 403,
      que: 'cuenta.suspendida',
      bitacora: 'escrituras',
    }
  }
  return {
    mensaje: 'No pudimos comprobar tu cuenta en este momento. Inténtalo en unos segundos.',
    status: 503,
    que: 'cuenta.indeterminada',
    bitacora: 'nunca',
  }
}

/** Lo que necesita `autorizar`. Se inyecta para poder probarlo de verdad, sin red ni base. */
export type DependenciasAutorizacion = {
  verificar: (req: Request) => Promise<AuthUser | null>
  perfil: (user: AuthUser) => Promise<PerfilUsuario>
  denegado: (perfil: PerfilUsuario, req: Request, que: string) => Promise<void>
}

/**
 * EL punto de autorización. `exigir` (por permiso) y `requireRole` (por rol,
 * lo que usaban las rutas de antes) pasan por aquí: sesión, suspensión,
 * decisión con el catálogo y bitácora del intento denegado.
 *
 * V-1.1.82 (P3-03): una cuenta suspendida recibe 403 en TODO, lo decida la
 * ruta que lo decida; y si intentaba escribir (no GET/HEAD), queda en la
 * bitácora como `cuenta.suspendida:<permiso>`. Leer no se registra: sólo
 * haría ruido.
 */
export function crearAutorizador(d: DependenciasAutorizacion) {
  return async function autorizar(
    req: Request,
    decide: (perfil: PerfilUsuario) => boolean,
    que: string,
  ): Promise<ChequeoRol> {
    const user = await d.verificar(req)
    if (!user) return no('Inicia sesión para continuar.', 401)

    const perfil = await d.perfil(user)

    const puerta = revisarEstado(perfil.estado)
    if (puerta) {
      const esLectura = req.method === 'GET' || req.method === 'HEAD'
      if (puerta.bitacora === 'siempre' || (puerta.bitacora === 'escrituras' && !esLectura)) {
        await d.denegado(perfil, req, `${puerta.que}:${que}`)
      }
      return no(puerta.mensaje, puerta.status)
    }

    if (!decide(perfil)) {
      await d.denegado(perfil, req, que)
      return no('Tu cuenta no tiene permisos para esta acción.', 403)
    }

    return { perfil }
  }
}

const autorizar = crearAutorizador({ verificar: verifyIdToken, perfil: getPerfil, denegado: registrarDenegado })

/** Exige sesión y un permiso del catálogo (`src/lib/acceso/permisos.ts`). */
export async function exigir(req: Request, permiso: Permiso): Promise<ChequeoRol> {
  return autorizar(req, (p) => puede(p, permiso), permiso)
}

/**
 * Exige sesión y uno de los roles indicados. Es la forma de antes; pasa por
 * el mismo `autorizar`.
 *
 * @deprecated V-1.1.80: ninguna ruta la usa ya; usar `exigir(req, permiso)`.
 */
export async function requireRole(req: Request, roles: Rol[]): Promise<ChequeoRol> {
  return autorizar(req, (p) => roles.includes(p.rol), `rol:${roles.join('|')}`)
}

/** Las rutas sólo de administración: el permiso `panel.admin`. */
export async function requireAdmin(req: Request): Promise<ChequeoRol> {
  return exigir(req, 'panel.admin')
}
