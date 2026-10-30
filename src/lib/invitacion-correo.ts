import { SITIO } from './sitio'
import { NEGOCIO } from './config/negocio'
import { llamarResend } from './correo/resend'

/**
 * El correo de invitación al panel.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ NO CREA LA CUENTA
 *
 * El sitio valida las sesiones contra las claves públicas de Google (no hay
 * `firebase-admin` ni cuenta de servicio), así que **no puede crear cuentas**.
 * La invitación reserva el rol para un correo y se aplica sola la primera vez
 * que esa persona entra con **ese** correo verificado.
 *
 * Por eso el correo pide entrar con Google: así el correo llega verificado y el
 * rol se aplica en el primer acceso, sin que nadie tenga que tocar nada.
 * ─────────────────────────────────────────────────────────────
 *
 * Igual que el aviso de leads: **si no hay clave configurada no falla**. La
 * invitación ya quedó guardada; el correo es el aviso, no el permiso. Quien
 * invita recibe el enlace para mandarlo por WhatsApp si el correo no salió.
 */

const ROL_EN_PALABRAS: Record<string, string> = {
  admin: 'administrador del sitio',
  super_admin: 'Super Administrador del sitio',
  publicador: 'publicador (puede subir propiedades)',
  cliente: 'cliente (puede guardar favoritos y búsquedas)',
}

export type ResultadoInvitacion =
  | { enviado: true }
  | { enviado: false; motivo: 'sin-configurar' | 'fallo'; detalle?: string }

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function enviarInvitacion(opciones: {
  email: string
  nombre?: string | null
  rol: string
  invitadoPor?: string | null
}): Promise<ResultadoInvitacion> {
  const clave = process.env.RESEND_API_KEY?.trim()
  // `?invitado=` solo sirve para que la pantalla avise si hay abierta una sesión de OTRO correo (E-30); no otorga nada.
  const entrada = `${SITIO}/dashboard?invitado=${encodeURIComponent(opciones.email)}`
  const papel = ROL_EN_PALABRAS[opciones.rol] ?? opciones.rol

  if (!clave) {
    console.warn(`[invitacion] sin RESEND_API_KEY — no se avisó a ${opciones.email}`)
    return { enviado: false, motivo: 'sin-configurar' }
  }

  const saludo = opciones.nombre?.trim() ? `Hola ${opciones.nombre.trim()}:` : 'Hola:'
  const texto = [
    saludo,
    '',
    `Te invitaron a Vive Bien Grupo Inmobiliario como ${papel}.`,
    '',
    `Entra aquí con este mismo correo (${opciones.email}), de preferencia con el botón de Google:`,
    entrada,
    '',
    'Al entrar, tus permisos quedan aplicados solos. Si ya tienes una sesión abierta con otro correo, ciérrala primero. Con otro correo no funcionará.',
  ].join('\n')

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px">
      <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8A8882;margin:0 0 4px">Invitación</p>
      <h2 style="margin:0 0 12px;color:#971010;font-size:20px">Te invitaron a Vive Bien</h2>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 6px">${escapar(saludo)}</p>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px">
        Te dieron acceso como <strong>${escapar(papel)}</strong>.
      </p>
      <a href="${entrada}" style="display:inline-block;background:#971010;color:#fff;padding:12px 24px;border-radius:9px;font-weight:700;text-decoration:none;font-size:14px">
        Entrar a Vive Bien
      </a>
      <p style="font-size:13px;line-height:1.6;color:#5C5B57;margin:20px 0 0">
        Entra con <strong>${escapar(opciones.email)}</strong> —de preferencia con el botón de Google—
        y tus permisos se aplican solos. Si ya tienes una sesión abierta con otro correo, ciérrala primero.
        Con otro correo no funcionará.
      </p>
    </div>
  `

  try {
    // Pasa por el único emisor (`correo/resend.ts`): con CORREO_MODO_PRUEBAS=1 el destino y la respuesta se fijan ahí.
    const res = await llamarResend({
      apiKey: clave,
      cuerpo: {
        from: process.env.RESEND_FROM || NEGOCIO.remitente,
        to: [opciones.email],
        subject: 'Te invitaron a Vive Bien Grupo Inmobiliario',
        reply_to: opciones.invitadoPor || undefined,
        text: texto,
        html,
      },
    })
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '')
      console.error('[invitacion] Resend rechazó el envío:', res.status, cuerpo.slice(0, 200))
      return { enviado: false, motivo: 'fallo', detalle: String(res.status) }
    }
    return { enviado: true }
  } catch (e) {
    console.error('[invitacion] no se pudo enviar:', e instanceof Error ? e.message : e)
    return { enviado: false, motivo: 'fallo' }
  }
}
