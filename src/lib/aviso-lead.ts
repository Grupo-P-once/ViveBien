import { CORREO_CONTACTO } from './contacto'

/**
 * Avisar de que entró un lead.
 *
 * ─────────────────────────────────────────────────────────────
 * EL HUECO QUE CIERRA
 *
 * `/api/contacto` avisa al publicador por WhatsApp. Pero los cinco formularios
 * anónimos —portada, /contacto, ficha, valuador y el modal— entran por
 * `/api/registro-lead`, que **no avisaba a nadie**.
 *
 * Alguien deja su teléfono un viernes por la noche y nadie se entera hasta que
 * alguien se acuerda de abrir el panel. En este negocio la primera respuesta se
 * mide en minutos: un lead de dos días es un lead perdido.
 * ─────────────────────────────────────────────────────────────
 *
 * Se usa **Resend** porque el sitio no tiene ningún envío de correo montado y
 * es lo más simple que existe: una clave, una llamada HTTP, sin SDK ni SMTP.
 *
 * **Sin clave configurada no falla: registra y sigue.** Un aviso que no sale no
 * puede costar el lead — guardarlo es lo importante, avisar es el extra. Por
 * eso esta función nunca lanza y su resultado nunca bloquea la respuesta.
 */

export type Lead = {
  nombre: string
  telefono: string
  email?: string | null
  mensaje?: string | null
  interes?: string | null
  origen: string
  propiedadId?: string | null
  /** True si la base no pudo guardarlo: entonces este correo es el ÚNICO registro. */
  sinGuardar?: boolean
}

const NOMBRE_ORIGEN: Record<string, string> = {
  contacto: 'formulario de contacto',
  portada: 'formulario de la portada',
  ficha: 'ficha de una propiedad',
  valuador: 'el valuador',
  registro: 'el registro',
}

export type Resultado =
  | { enviado: true }
  | { enviado: false; motivo: 'sin-configurar' | 'fallo'; detalle?: string }

export async function avisarDeLead(lead: Lead): Promise<Resultado> {
  const clave = process.env.RESEND_API_KEY
  if (!clave) {
    // No es un error: es que todavía no se ha configurado. Se registra para
    // que quede rastro de cuántos avisos se están perdiendo.
    console.warn(`[aviso-lead] sin RESEND_API_KEY — nadie fue avisado de: ${lead.nombre} (${lead.telefono})`)
    return { enviado: false, motivo: 'sin-configurar' }
  }

  const origen = NOMBRE_ORIGEN[lead.origen] ?? lead.origen
  const wa = lead.telefono.replace(/\D/g, '')

  // Texto plano además de HTML: algunos clientes de correo y casi todos los
  // relojes y notificaciones muestran sólo eso.
  const texto = [
    lead.sinGuardar
      ? '⚠️ LA BASE DE DATOS NO RESPONDIÓ. Este correo es el único registro de este contacto: guárdalo.\n'
      : null,
    `${lead.nombre} dejó sus datos en ${origen}.`,
    ``,
    `Teléfono: ${lead.telefono}`,
    lead.email ? `Correo: ${lead.email}` : null,
    lead.propiedadId ? `Propiedad: ${lead.propiedadId}` : null,
    lead.interes ? `Interés: ${lead.interes}` : null,
    lead.mensaje ? `\nMensaje:\n${lead.mensaje}` : null,
    ``,
    `Responder por WhatsApp: https://wa.me/${wa}`,
  ].filter(Boolean).join('\n')

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px">
      ${lead.sinGuardar ? `<p style="background:#FEF2F2;border-left:3px solid #B91C1C;color:#991B1B;padding:10px 14px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.55;margin:0 0 16px"><strong>La base de datos no respondió.</strong> Este correo es el <strong>único registro</strong> de este contacto. Guárdalo.</p>` : ''}
      <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8B95A3;margin:0 0 4px">
        Nuevo interesado
      </p>
      <h2 style="margin:0 0 2px;color:#1B365D;font-size:20px">${escapar(lead.nombre)}</h2>
      <p style="margin:0 0 18px;color:#5A6472;font-size:14px">Desde ${escapar(origen)}</p>

      <table style="font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:3px 14px 3px 0;color:#8B95A3">Teléfono</td><td><strong>${escapar(lead.telefono)}</strong></td></tr>
        ${lead.email ? `<tr><td style="padding:3px 14px 3px 0;color:#8B95A3">Correo</td><td>${escapar(lead.email)}</td></tr>` : ''}
        ${lead.propiedadId ? `<tr><td style="padding:3px 14px 3px 0;color:#8B95A3">Propiedad</td><td>${escapar(lead.propiedadId)}</td></tr>` : ''}
        ${lead.interes ? `<tr><td style="padding:3px 14px 3px 0;color:#8B95A3">Interés</td><td>${escapar(lead.interes)}</td></tr>` : ''}
      </table>

      ${lead.mensaje ? `<p style="margin:16px 0 0;padding:12px 14px;background:#F1EFEC;border-radius:8px;font-size:14px;line-height:1.55;color:#374151">${escapar(lead.mensaje)}</p>` : ''}

      <a href="https://wa.me/${wa}"
         style="display:inline-block;margin-top:20px;background:#25D366;color:#fff;padding:11px 22px;border-radius:9px;font-weight:700;text-decoration:none;font-size:14px">
        Responder por WhatsApp
      </a>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || `Vive Bien <avisos@vivebienn.com>`,
        to: [CORREO_CONTACTO],
        // El asunto lleva el nombre y el origen: se decide si abrirlo desde la
        // notificación del teléfono, sin entrar.
        subject: `${lead.sinGuardar ? '⚠️ SIN GUARDAR — ' : ''}Nuevo interesado: ${lead.nombre} — ${origen}`,
        reply_to: lead.email || undefined,
        text: texto,
        html,
      }),
    })

    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '')
      console.error('[aviso-lead] Resend rechazó el envío:', res.status, cuerpo.slice(0, 200))
      return { enviado: false, motivo: 'fallo', detalle: String(res.status) }
    }

    return { enviado: true }
  } catch (e) {
    console.error('[aviso-lead] no se pudo enviar:', e instanceof Error ? e.message : e)
    return { enviado: false, motivo: 'fallo' }
  }
}

/** Lo que escribe un desconocido va a un correo: escapar no es opcional. */
function escapar(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
