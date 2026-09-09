import { createClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { NextResponse } from 'next/server'

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
export type Estado = 'activo' | 'suspendido' | 'pendiente'

export type AuthUser = {
  uid: string
  email: string | null
  emailVerified: boolean
}

export type PerfilUsuario = AuthUser & {
  rol: Rol
  estado: Estado
  nombre: string | null
}

/** Cliente de Supabase con service role. IGNORA RLS: sólo tras validar sesión. */
export function supabaseAdmin() {
  return createClient(
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
    }
  } catch {
    // Firma inválida, expirado, emisor o audiencia que no corresponden.
    return null
  }
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** True si el email pertenece a la lista de administradores de arranque. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails().includes(email.toLowerCase())
}

/**
 * Resuelve el perfil del usuario.
 *
 * La fuente de verdad es la tabla `usuarios`. Mientras esa tabla no exista
 * (migración sin aplicar), cae a la lista ADMIN_EMAILS para no dejar el panel
 * inaccesible. La lista sigue mandando por encima de la tabla: es el modo de
 * recuperar el acceso si alguien se degrada a sí mismo por error.
 */
export async function getPerfil(user: AuthUser): Promise<PerfilUsuario> {
  const esAdminPorLista = isAdminEmail(user.email)

  try {
    const { data, error } = await supabaseAdmin()
      .from('usuarios')
      .select('rol, estado, nombre')
      .eq('uid', user.uid)
      .maybeSingle()

    if (error) throw error

    if (data) {
      return {
        ...user,
        rol: esAdminPorLista ? 'admin' : ((data.rol as Rol) ?? 'cliente'),
        estado: (data.estado as Estado) ?? 'activo',
        nombre: data.nombre ?? null,
      }
    }
  } catch {
    // La tabla puede no existir todavía. No es motivo para negar el acceso
    // a quien ya está en la lista de administradores.
  }

  return {
    ...user,
    rol: esAdminPorLista ? 'admin' : 'cliente',
    estado: 'activo',
    nombre: null,
  }
}

type Fallo = { perfil?: never; error: NextResponse }
type Exito = { perfil: PerfilUsuario; error?: never }
export type ChequeoRol = Exito | Fallo

function no(mensaje: string, status: number): Fallo {
  return { error: NextResponse.json({ error: mensaje }, { status }) }
}

/**
 * Exige sesión válida y uno de los roles indicados.
 *
 * Falla cerrado en todos los caminos: token inválido, cuenta suspendida, rol
 * insuficiente, o administración sin configurar.
 */
export async function requireRole(req: Request, roles: Rol[]): Promise<ChequeoRol> {
  const user = await verifyIdToken(req)
  if (!user) return no('Inicia sesión para continuar.', 401)

  const perfil = await getPerfil(user)

  if (perfil.estado === 'suspendido') {
    return no('Tu cuenta está suspendida.', 403)
  }

  if (roles.includes('admin') && adminEmails().length === 0) {
    console.error('[auth] ADMIN_EMAILS no está configurada: se rechazan las peticiones de administración.')
    return no('La administración no está configurada en este entorno.', 503)
  }

  if (!roles.includes(perfil.rol)) {
    return no('Tu cuenta no tiene permisos para esta acción.', 403)
  }

  return { perfil }
}

/** Atajo para las rutas que sólo admite un administrador. */
export async function requireAdmin(req: Request): Promise<ChequeoRol> {
  return requireRole(req, ['admin'])
}
