import { createClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { NextResponse } from 'next/server'

/**
 * Verificación de sesión en servidor.
 *
 * Las rutas de administración escriben con SUPABASE_SERVICE_ROLE_KEY, que ignora
 * las políticas RLS. Por eso la autorización tiene que resolverse aquí y no en el
 * navegador: comprobar el email en el cliente sólo oculta botones, no protege el
 * endpoint.
 *
 * El token de Firebase se valida contra las claves públicas de Google, así que no
 * hace falta una service account ni ningún secreto nuevo.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export type AuthUser = {
  uid: string
  email: string | null
  emailVerified: boolean
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

type AdminCheck = { user: AuthUser; error?: never } | { user?: never; error: NextResponse }

/**
 * Exige sesión válida y email en la lista de administradores.
 *
 * Falla cerrado: si ADMIN_EMAILS no está configurada, nadie pasa. Es preferible
 * que el panel deje de funcionar a que quede abierto.
 *
 * Provisional hasta la Fase 1, donde el rol pasa a la tabla `usuarios` y a los
 * custom claims de Firebase.
 */
export async function requireAdmin(req: Request): Promise<AdminCheck> {
  const user = await verifyIdToken(req)

  if (!user) {
    return { error: NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 }) }
  }

  const permitidos = adminEmails()
  if (permitidos.length === 0) {
    console.error('[auth] ADMIN_EMAILS no está configurada: se rechazan todas las peticiones de administración.')
    return {
      error: NextResponse.json(
        { error: 'La administración no está configurada en este entorno.' },
        { status: 503 },
      ),
    }
  }

  if (!user.email || !permitidos.includes(user.email.toLowerCase())) {
    return { error: NextResponse.json({ error: 'Tu cuenta no tiene permisos de administración.' }, { status: 403 }) }
  }

  return { user }
}

/** True si el email pertenece a la lista de administradores. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails().includes(email.toLowerCase())
}

/** Cliente de Supabase con service role. IGNORA RLS: sólo tras validar sesión. */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
