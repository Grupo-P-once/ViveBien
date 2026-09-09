import { supabaseAdmin } from './auth-server'

/**
 * Aviso al publicador cuando alguien se interesa por su propiedad.
 *
 * Dos niveles, según lo que haya configurado:
 *
 *   1. WhatsApp Cloud API — envío automático desde el servidor. Requiere
 *      cuenta de negocio verificada y plantilla aprobada por Meta.
 *   2. Enlace wa.me — respaldo manual mientras lo anterior no exista.
 *
 * Regla que atraviesa todo el módulo: esto NUNCA hace fallar la solicitud
 * del cliente. Él ya hizo su parte cuando el formulario se guardó. Un
 * problema de mensajería es un problema nuestro, y se registra como tal.
 */

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const PLANTILLA = process.env.WHATSAPP_TEMPLATE_NAME || 'vivebien_nuevo_interesado'
const IDIOMA = process.env.WHATSAPP_TEMPLATE_LANG || 'es_MX'
const SITIO = process.env.NEXT_PUBLIC_APP_URL || 'https://vive-bien.vercel.app'

export type EstadoAviso = 'enviado' | 'fallido' | 'sin_numero' | 'pendiente'

export type ResultadoAviso = {
  estado: EstadoAviso
  enlaceRespaldo: string | null
  detalle?: string
}

type Cliente = { nombre: string; telefono: string; email: string; mensaje: string | null }

/** Mensaje que ve el publicador. Mismo texto en ambos niveles. */
function redactar(propiedadTitulo: string, cliente: Cliente, url: string): string {
  const lineas = [
    `Nuevo interesado en Vive Bien.`,
    ``,
    `Propiedad: ${propiedadTitulo}`,
    `Cliente: ${cliente.nombre}`,
    `WhatsApp: ${cliente.telefono}`,
    `Correo: ${cliente.email}`,
  ]
  if (cliente.mensaje) lineas.push(``, `Mensaje: ${cliente.mensaje}`)
  lineas.push(``, `Ver propiedad: ${url}`)
  return lineas.join('\n')
}

function enlaceWa(telefono: string | null, texto: string): string | null {
  if (!telefono) return null
  const digitos = telefono.replace(/\D/g, '')
  if (!digitos) return null
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`
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

/** Teléfono del publicador. Vive en `usuarios`, nunca en la propiedad pública. */
async function telefonoDelPublicador(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return process.env.NEXT_PUBLIC_WA_NUMBER ?? null
  try {
    const { data } = await supabaseAdmin()
      .from('usuarios')
      .select('telefono')
      .eq('uid', ownerId)
      .maybeSingle()
    return data?.telefono || process.env.NEXT_PUBLIC_WA_NUMBER || null
  } catch {
    return process.env.NEXT_PUBLIC_WA_NUMBER ?? null
  }
}

export async function notificarPublicador(opts: {
  solicitudId: number | null
  ownerId: string | null
  propiedadId: string
  propiedadTitulo: string
  cliente: Cliente
}): Promise<ResultadoAviso> {
  const url = `${SITIO}/propiedades/${opts.propiedadId}`
  const texto = redactar(opts.propiedadTitulo, opts.cliente, url)

  const destino = await telefonoDelPublicador(opts.ownerId)
  const respaldo = enlaceWa(destino, texto)

  if (!destino) {
    await guardarEstado(opts.solicitudId, 'sin_numero', null, 'El publicador no tiene teléfono registrado')
    return { estado: 'sin_numero', enlaceRespaldo: null }
  }

  // Sin credenciales de Meta: queda el enlace de respaldo.
  if (!TOKEN || !PHONE_ID) {
    await guardarEstado(opts.solicitudId, 'pendiente', null, 'WhatsApp Cloud API sin configurar')
    return { estado: 'pendiente', enlaceRespaldo: respaldo }
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
        to: destino.replace(/\D/g, ''),
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
      return { estado: 'fallido', enlaceRespaldo: respaldo, detalle: motivo }
    }

    const mensajeId = cuerpo?.messages?.[0]?.id ?? null
    await guardarEstado(opts.solicitudId, 'enviado', mensajeId)
    return { estado: 'enviado', enlaceRespaldo: respaldo }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'error desconocido'
    console.error('[whatsapp] fallo de red o timeout:', motivo)
    await guardarEstado(opts.solicitudId, 'fallido', null, motivo)
    return { estado: 'fallido', enlaceRespaldo: respaldo, detalle: motivo }
  }
}
