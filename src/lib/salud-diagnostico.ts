import { credencialesCloudinary } from '@/lib/medios/firma'
import { supabaseAdmin } from '@/lib/auth-server'

/**
 * Diagnóstico DETALLADO de configuración (R-02 / QA-002, D-62). Solo lo sirve `GET /api/admin/salud`: sesión de administrador o secreto de
 * monitorización. La ruta pública `GET /api/salud` ya NO devuelve nada de esto (solo `{ ok: true }`): enumerar qué integraciones existen,
 * si hay un super admin, qué migraciones están aplicadas o cuántos caracteres tiene el token de Telegram es reconocimiento gratuito.
 *
 * Sigue siendo SOLO verdaderos y falsos: ni valores, ni claves, ni correos, ni longitudes de secretos ni el nombre de la nube.
 */

/** ¿Existe esa columna? Se pregunta por una fila de cero: no devuelve datos. */
async function existeColumna(url: string, clave: string, tabla: string, columna: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${url}/rest/v1/${tabla}?select=${columna}&limit=0`, {
      headers: { apikey: clave, Authorization: `Bearer ${clave}` },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    })
    if (res.status === 200) return true
    if (res.status === 400) return false
    return null // 5xx o similar: la base no responde, no que falte la columna
  } catch {
    return null
  }
}

/** ¿Hay al menos un Super Admin activo? null si la base no responde. */
async function haySuperAdmin(): Promise<boolean | null> {
  try {
    const { count, error } = await supabaseAdmin()
      .from('usuarios')
      .select('uid', { count: 'exact', head: true })
      .eq('rol', 'super_admin')
      .eq('estado', 'activo')
    return error ? null : (count ?? 0) > 0
  } catch {
    return null
  }
}

export async function diagnosticoDetallado() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY

  // V-1.1.81: los administradores viven en la tabla, no en listas del entorno. Se dice SI hay al menos un Super Admin activo.
  const hayAdministracion = await haySuperAdmin()

  // El token del bot tiene forma fija: `123456789:AA...`. Comprobar la FORMA —nunca el valor ni su longitud— distingue «no está
  // configurado» de «está mal pegado», que es lo que costó media hora: Telegram contesta 404 en los dos casos.
  const tg = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
  const tokenBienFormado = /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(tg)

  const base = url && servicio
    ? {
        // Migración 07: dirección desglosada, mapa, planos y videos.
        migracion07: await existeColumna(url, servicio, 'propiedades', 'lat'),
        // Migración 08: sin ella NINGÚN formulario guarda un lead.
        migracion08: await existeColumna(url, servicio, 'leads', 'consentimiento_version'),
      }
    : { migracion07: null, migracion08: null }

  return {
    puedeAdministrar: hayAdministracion,
    correo: Boolean(process.env.RESEND_API_KEY),
    telegram: Boolean(tg && process.env.TELEGRAM_WEBHOOK_SECRET),
    telegramTokenBienFormado: tokenBienFormado,
    whatsapp: Boolean(process.env.WHATSAPP_TOKEN),
    // V-1.1.78 (SEC-05): subida firmada. Solo se dice SI están las piezas, nunca cuáles son.
    cloudinary: Boolean(credencialesCloudinary()),
    cloudinaryClave: Boolean(process.env.CLOUDINARY_API_KEY?.trim()),
    cloudinarySecreto: Boolean(process.env.CLOUDINARY_API_SECRET?.trim()),
    baseDeDatos: Boolean(url && servicio),
    ...base,
    // Qué hacer, en el mismo sitio donde se ve el problema.
    pendiente: [
      hayAdministracion === false ? 'No hay ningún Super Admin activo en la tabla usuarios: nadie puede administrar. Hay que asignarlo en Supabase.' : null,
      base.migracion08 === false ? 'Aplicar supabase/08-leads-columnas.sql: sin eso no se guarda ningún lead.' : null,
      base.migracion07 === false ? 'Aplicar supabase/07-ubicacion-y-fotos.sql: mapa, planos, videos y pies de foto.' : null,
      !credencialesCloudinary() ? 'Configurar CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Vercel: sin eso no se pueden subir fotos.' : null,
      !tg ? 'Configurar TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET para publicar desde Telegram.' : null,
      tg && !tokenBienFormado ? 'El TELEGRAM_BOT_TOKEN no tiene la forma de un token de Telegram: se pegó mal. Telegram responde 404 y el bot no contesta.' : null,
    ].filter(Boolean) as string[],
    // Lo que falta pero NO impide trabajar. Se enseña solo con ?diagnostico=1 en el panel.
    opcional: [
      !process.env.RESEND_API_KEY?.trim() ? 'Configurar RESEND_API_KEY: los avisos de leads no salen por correo (sí por Telegram).' : null,
    ].filter(Boolean) as string[],
  }
}
