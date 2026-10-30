import { supabaseAdmin } from './auth-server'
import { SITIO } from './sitio'

/**
 * Aviso por WhatsApp a ATENCIÓN DE VIVE BIEN cuando alguien pide informes o
 * una visita de una propiedad.
 *
 * ─────────────────────────────────────────────────────────────
 * V-1.1.77 — SEC-01 (D-02, ADR-0006)
 *
 * Antes esto se llamaba `notificarPublicador`: buscaba el teléfono del DUEÑO
 * de la propiedad y le mandaba el nombre, el WhatsApp y el correo del
 * interesado. Además devolvía al navegador del cliente un enlace wa.me al
 * teléfono del dueño. Las dos cosas iban contra el PRD: todo lead es de
 * VIVE BIEN y el publicador nunca recibe datos personales de nadie.
 *
 * Ahora el destino es sólo el número de atención de VIVE BIEN
 * (`WHATSAPP_ATENCION`, un número interno del equipo, no el público de la
 * web). El dueño de la propiedad no se consulta en ningún momento.
 * ─────────────────────────────────────────────────────────────
 *
 * Dos niveles, según lo que haya configurado:
 *
 *   1. WhatsApp Cloud API — envío automático desde el servidor. Requiere
 *      cuenta de negocio verificada y plantilla aprobada por Meta.
 *   2. Sin eso, queda `pendiente` y el correo de `aviso-lead.ts` es el aviso.
 *
 * Regla que atraviesa todo el módulo: esto NUNCA hace fallar la solicitud
 * del cliente. Él ya hizo su parte cuando el formulario se guardó. Un
 * problema de mensajería es un problema nuestro, y se registra como tal.
 */

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const PLANTILLA = process.env.WHATSAPP_TEMPLATE_NAME || 'vivebien_nuevo_interesado'
const IDIOMA = process.env.WHATSAPP_TEMPLATE_LANG || 'es_MX'

export type EstadoAviso = 'enviado' | 'fallido' | 'sin_numero' | 'pendiente'

export type ResultadoAviso = {
  estado: EstadoAviso
  detalle?: string
}

type Cliente = { nombre: string; telefono: string; email: string; mensaje: string | null }

/**
 * A qué número de VIVE BIEN llegan los avisos. Sólo dígitos, o null si no hay.
 * Se lee de la variable de entorno y de nada más: nunca de la propiedad ni de
 * la cuenta de su dueño.
 */
export function destinoAtencion(env: Record<string, string | undefined> = process.env): string | null {
  const digitos = (env.WHATSAPP_ATENCION ?? '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos : null
}

async function guardarEstado(
  solicitudId: number | null,
  estado: EstadoAviso,
  mensajeId?: string | null,
  error?: string | null,
): Promise<void> {
  if (solicitudId == null) return
  try {
    await supabaseAdmin()
      .from('solicitudes_contacto')
      .update({
        whatsapp_estado: estado,
        whatsapp_id: mensajeId ?? null,
        whatsapp_error: error ? String(error).slice(0, 500) : null,
      })
      .eq('id', solicitudId)
  } catch {
    // La solicitud ya está guardada; el estado del aviso es secundario.
  }
}

export async function notificarAtencion(opts: {
  solicitudId: number | null
  propiedadId: string
  propiedadTitulo: string
  /** Ruta pública (`/propiedades/<slug>`). Si falta, se usa el id. */
  ruta?: string
  cliente: Cliente
}): Promise<ResultadoAviso> {
  const url = `${SITIO}${opts.ruta ?? `/propiedades/${opts.propiedadId}`}`
  const destino = destinoAtencion()

  if (!destino) {
    await guardarEstado(opts.solicitudId, 'sin_numero', null, 'WHATSAPP_ATENCION sin configurar (el aviso va por correo)')
    return { estado: 'sin_numero' }
  }

  // Sin credenciales de Meta: el aviso queda en el correo de atención.
  if (!TOKEN || !PHONE_ID) {
    await guardarEstado(opts.solicitudId, 'pendiente', null, 'WhatsApp Cloud API sin configurar')
    return { estado: 'pendiente' }
  }

  try {
    const controlador = new AbortController()
    const corte = setTimeout(() => controlador.abort(), 10_000)

    const res = await fetch(`https://graph.facebook.com/v23.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: PLANTILLA,
          language: { code: IDIOMA },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: opts.propiedadTitulo },
                { type: 'text', text: opts.cliente.nombre },
                { type: 'text', text: opts.cliente.telefono },
                { type: 'text', text: url },
              ],
            },
          ],
        },
      }),
      signal: controlador.signal,
    })

    clearTimeout(corte)
    const cuerpo = await res.json().catch(() => ({}))

    if (!res.ok) {
      // Meta puede responder que la cuenta está activa y verificada y aun
      // así rechazar el envío por facturación. El motivo viene aquí.
      const motivo = cuerpo?.error?.message || `HTTP ${res.status}`
      console.error('[whatsapp] envío rechazado:', motivo)
      await guardarEstado(opts.solicitudId, 'fallido', null, motivo)
      return { estado: 'fallido', detalle: motivo }
    }

    const mensajeId = cuerpo?.messages?.[0]?.id ?? null
    await guardarEstado(opts.solicitudId, 'enviado', mensajeId)
    return { estado: 'enviado' }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'error desconocido'
    console.error('[whatsapp] fallo de red o timeout:', motivo)
    await guardarEstado(opts.solicitudId, 'fallido', null, motivo)
    return { estado: 'fallido', detalle: motivo }
  }
}
