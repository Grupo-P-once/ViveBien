import { SITIO } from '../../sitio'
import { filaHero, FUENTE, marcoCorreo, TEXTO } from './bloques'
import { botonContorno, fila, tarjetaHorizontal, texto1 } from './eventos'
import { COLORES, escapar, pieTexto, urlSegura, type Correo, type TarjetaCorreo } from './marca'

/**
 * AVISO INTERNO de nuevo interesado (al buzón institucional). Rediseñado el 30-oct-2026 a partir de una captura del dueño en Gmail (modo oscuro) donde se veía sin
 * identidad de VIVE BIEN: sin logotipo ni marco, el asunto era una frase torpe con nombre propio, la propiedad salía como un UUID crudo (sin foto, precio ni enlace),
 * el teléfono sin formato y sin soporte de modo oscuro. Ahora: marco de marca con fondos explícitos (resiste la inversión del modo oscuro), el interesado en un bloque
 * de color, datos ordenados, propiedad como tarjeta (o referencia corta con enlace si solo hay el identificador), el mensaje citado y el botón de WhatsApp con texto
 * oscuro (blanco sobre #25D366 no pasa AA). Función PURA: todo dato se escapa aquí; solo https y mailto.
 */
export type DatosDeLead = {
  nombre: string
  telefono: string
  email?: string | null
  mensaje?: string | null
  interes?: string | null
  /** Texto legible del origen («formulario de contacto», «ficha de una propiedad»…). */
  origen: string
  /** Versión corta para el asunto («Formulario de contacto»). */
  origenCorto?: string
  propiedadId?: string | null
  /** Si quien llama ya la tiene (título, foto, precio…), se dibuja como tarjeta. */
  propiedad?: TarjetaCorreo | null
  sinGuardar?: boolean
}

const soloDigitos = (t: string) => t.replace(/\D/g, '')

/** Teléfono legible: 10 dígitos de México → «+52 477 000 0000». Otra cosa se deja como la escribió la persona. */
export function telefonoLegible(t: string): string {
  const d = soloDigitos(t)
  const mx = d.length === 10 ? d : d.length === 12 && d.startsWith('52') ? d.slice(2) : d.length === 13 && d.startsWith('521') ? d.slice(3) : null
  return mx ? `+52 ${mx.slice(0, 3)} ${mx.slice(3, 6)} ${mx.slice(6)}` : t.trim()
}

/** Número para wa.me: con lada de país (un número de 10 dígitos sin ella no abre el chat). */
export function numeroParaWhatsApp(t: string): string {
  const d = soloDigitos(t)
  return d.length === 10 ? `52${d}` : d.length === 13 && d.startsWith('521') ? `52${d.slice(3)}` : d
}

function botonWhatsApp(url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#25D366" style="background:#25D366;border-radius:8px"><a href="${escapar(urlSegura(url))}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FUENTE};font-size:15px;line-height:20px;font-weight:700;color:#0B1F12;text-decoration:none">Responder por WhatsApp</a></td></tr></table>`
}

const filaDato = (etiqueta: string, valorHtml: string) =>
  `<tr><td valign="top" style="padding:5px 14px 5px 0;font-family:${TEXTO};font-size:13px;line-height:20px;color:#4B5563;white-space:nowrap">${escapar(etiqueta)}</td><td valign="top" style="padding:5px 0;font-family:${TEXTO};font-size:14px;line-height:21px;color:#1A1A1A">${valorHtml}</td></tr>`

export function correoDeLead(d: DatosDeLead): Correo {
  const nombre = d.nombre.trim() || 'Sin nombre'
  const tel = telefonoLegible(d.telefono)
  const wa = `https://wa.me/${numeroParaWhatsApp(d.telefono)}`
  const email = d.email && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(d.email) ? d.email : null
  const refCorta = d.propiedadId ? d.propiedadId.slice(0, 8) : null
  const urlPropiedad = d.propiedad?.url ?? (d.propiedadId ? `${SITIO}/propiedades/${encodeURIComponent(d.propiedadId)}` : null)

  const alerta = d.sinGuardar
    ? fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FEF2F2" style="background:#FEF2F2;border-left:4px solid #B91C1C;padding:12px 16px;font-family:${TEXTO};font-size:14px;line-height:22px;color:#7F1D1D"><strong>La base de datos no respondió.</strong> Este correo es el único registro de este contacto: guárdalo.</td></tr></table>`, 22, 0)
    : ''

  const datos = [
    filaDato('Teléfono', `<strong>${escapar(tel)}</strong>`),
    email ? filaDato('Correo', `<a href="mailto:${escapar(email)}" style="color:${COLORES.rojo};text-decoration:underline">${escapar(email)}</a>`) : '',
    d.interes ? filaDato('Interés', escapar(d.interes)) : '',
    !d.propiedad && refCorta ? filaDato('Propiedad', `Consultó una propiedad <span style="color:#4B5563">(ref. ${escapar(refCorta)})</span>`) : '',
  ].join('')
  const bloqueDatos = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORES.fondo}" style="background:${COLORES.fondo};border-radius:8px;padding:16px 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${datos}</table></td></tr></table>`

  const mensaje = d.mensaje
    ? fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #E5E0D6;border-left:4px solid ${COLORES.rojo};padding:14px 18px"><p style="margin:0 0 6px;font-family:${FUENTE};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#4B5563">Mensaje</p><p style="margin:0;font-family:${TEXTO};font-size:15px;line-height:24px;color:#1A1A1A">${escapar(d.mensaje)}</p></td></tr></table>`, 4, 14)
    : ''

  const botones =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 10px 10px 0">${botonWhatsApp(wa)}</td>${urlPropiedad ? `<td style="padding:0 0 10px 0">${botonContorno('Ver propiedad', urlPropiedad)}</td>` : ''}</tr></table>`

  const filas =
    alerta +
    filaHero({ kicker: 'Nuevo interesado', titulo: nombre, texto: `Desde ${d.origen}` }) +
    fila(bloqueDatos, 22, 14) +
    (d.propiedad ? fila(tarjetaHorizontal(d.propiedad), 4, 14) : '') +
    mensaje +
    fila(botones, 6, 10) +
    fila(`<p style="margin:0;font-family:${TEXTO};font-size:13px;line-height:20px;color:#4B5563">La primera respuesta se mide en minutos: contesta pronto.</p>`, 0, 26)

  const pie = 'Aviso interno de VIVE BIEN. Contiene datos personales de quien consultó: no lo reenvíes fuera del equipo.'
  const texto = [
    d.sinGuardar ? 'LA BASE DE DATOS NO RESPONDIÓ. Este correo es el único registro de este contacto: guárdalo.\n' : null,
    `${nombre} dejó sus datos en ${d.origen}.`,
    '',
    `Teléfono: ${tel}`,
    email ? `Correo: ${email}` : null,
    d.interes ? `Interés: ${d.interes}` : null,
    d.propiedad ? `Propiedad: ${texto1(d.propiedad)}` : refCorta ? `Propiedad: ref. ${refCorta}${urlPropiedad ? ` — ${urlPropiedad}` : ''}` : null,
    d.mensaje ? `\nMensaje:\n${d.mensaje}` : null,
    '',
    `Responder por WhatsApp: ${wa}`,
  ].filter((x) => x !== null).join('\n') + pieTexto()

  const asunto = `${d.sinGuardar ? 'SIN GUARDAR · ' : ''}Nuevo interesado: ${nombre} · ${d.origenCorto ?? d.origen}`.slice(0, 120)
  return { asunto, html: marcoCorreo({ preheader: `${tel}${d.interes ? ` · ${d.interes}` : ''}`.slice(0, 110), filas, avisoPropiedades: false, pie }), texto }
}
