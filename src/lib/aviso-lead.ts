import { CORREO_CONTACTO } from './contacto'
import { NEGOCIO } from './config/negocio'
import { claveResend, claveUnica, enviarPorEmisorUnico } from './correo/emisor'
import { correoDeLead } from './correo/plantillas/lead'

/**
 * Avisar de que entró un lead.
 *
 * ─────────────────────────────────────────────────────────────
 * EL HUECO QUE CIERRA
 *
 * `/api/contacto` avisaba sólo por WhatsApp. Pero los cinco formularios
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
  solicitud: 'una solicitud de una propiedad (con cuenta)',
}

/** Nombre corto del origen para el asunto. */
const ORIGEN_CORTO: Record<string, string> = {
  contacto: 'Formulario de contacto',
  portada: 'Portada',
  ficha: 'Ficha de propiedad',
  valuador: 'Valuador',
  registro: 'Registro',
  solicitud: 'Solicitud de propiedad',
}

export type Resultado =
  | { enviado: true }
  | { enviado: false; motivo: 'sin-configurar' | 'fallo'; detalle?: string }

export async function avisarDeLead(lead: Lead): Promise<Resultado> {
  // `.trim()`: al pegar la clave en `vercel env add` se cuela con facilidad un
  // salto de línea, y entonces la cabecera `Authorization` sale rota y Resend
  // la rechaza aunque la clave sea correcta. Pasó igual con el token de
  // Telegram (V-1.1.51) y con CRON_SECRET: media hora de diagnóstico cada vez.
  const clave = claveResend()
  if (!clave) {
    // No es un error: es que todavía no se ha configurado. Se registra para
    // que quede rastro de cuántos avisos se están perdiendo.
    // Sin nombre ni teléfono: el contacto ya quedó guardado en la base y un registro de la plataforma no debe llevar datos personales.
    console.warn('[aviso-lead] sin RESEND_API_KEY — un contacto nuevo no fue avisado por correo (quedó guardado)')
    return { enviado: false, motivo: 'sin-configurar' }
  }

  const origen = NOMBRE_ORIGEN[lead.origen] ?? lead.origen
  // El correo (HTML con el marco de VIVE BIEN y texto plano) lo arma una plantilla pura, la misma que ve el panel en la biblioteca de correos.
  const { asunto, html, texto } = correoDeLead({ ...lead, origen, origenCorto: ORIGEN_CORTO[lead.origen] })

  try {
    // Pasa por el emisor único (`correo/emisor.ts`): reserva cupo del plan antes de salir y, con CORREO_MODO_PRUEBAS=1, fija destino y respuesta.
    const res = await enviarPorEmisorUnico({
      apiKey: clave,
      clave: claveUnica('lead'),
      categoria: 'transaccional',
      tipo: 'aviso_lead',
      para: CORREO_CONTACTO,
      cuerpo: {
        from: process.env.RESEND_FROM || NEGOCIO.remitente,
        to: [CORREO_CONTACTO],
        // El asunto lleva el nombre y el origen: se decide si abrirlo desde la
        // notificación del teléfono, sin entrar.
        subject: asunto,
        reply_to: lead.email || undefined,
        text: texto,
        html,
      },
    })

    if (!res.ok) {
      console.error('[aviso-lead] el envío no salió:', res.estado, res.status ?? '', (res.detalle ?? '').slice(0, 200))
      return { enviado: false, motivo: 'fallo', detalle: String(res.status ?? res.estado) }
    }

    return { enviado: true }
  } catch (e) {
    console.error('[aviso-lead] no se pudo enviar:', e instanceof Error ? e.message : e)
    return { enviado: false, motivo: 'fallo' }
  }
}
