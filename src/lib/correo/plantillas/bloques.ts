import { DIRECCION_CORTA, NEGOCIO, enlaceWhatsApp } from '../../config/negocio'
import { SITIO } from '../../sitio'
import { COLORES, LOGO_URL, escapar, urlSegura } from './marca'

/**
 * Bloques del diseño de los correos (D-80 v2), tomados de las maquetas del dueño (`campana_recomendaciones_vive_bien.html` y
 * `bienvenida_nueva_cuenta_vive_bien-1.html`) y mejorados: sin adivinar el género («Bienvenido/a»), sin símbolos que Outlook
 * dibuja como cuadros (números en lugar de ⌕ ♡ ↗), sin enlaces `tel:` (sólo https y mailto), texto que se lee aunque las
 * imágenes no carguen, contraste AA en los textos pequeños y nada de «cancelar suscripción» en un correo que no es una lista.
 * Todo dato dinámico se escapa AQUÍ; los parámetros `html` los arma quien llama con `escapar`.
 */

export const AZUL = '#66709F'
export const DORADO = '#D6A84F'
export const FUENTE = 'Montserrat, Arial, Helvetica, sans-serif'
export const TEXTO = 'Arial, Helvetica, sans-serif'

const PAD = 'class="mobile-pad"'

type Boton = { texto: string; url: string }

function botonLleno(b: Boton, fondo: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${fondo}" style="background:${fondo};border-radius:3px"><a href="${escapar(urlSegura(b.url))}" target="_blank" style="display:inline-block;padding:15px 23px;font-family:${FUENTE};font-size:12px;line-height:16px;font-weight:800;letter-spacing:.4px;color:${color};text-decoration:none">${escapar(b.texto)}</a></td></tr></table>`
}

/** Bloque de color con el titular grande y un botón blanco (la bienvenida y la solicitud abren así). */
export function filaHero(o: { kicker: string; titulo: string; texto?: string; boton?: Boton; nota?: string }): string {
  const texto = o.texto ? `<p style="margin:0 auto 25px;max-width:460px;font-family:${TEXTO};font-size:16px;line-height:26px;color:#FFF3F1">${escapar(o.texto)}</p>` : ''
  const boton = o.boton ? botonLleno(o.boton, COLORES.blanco, COLORES.rojo) : ''
  const nota = o.nota ? `<p style="margin:22px 0 0;font-family:${FUENTE};font-size:12px;line-height:18px;font-weight:600;color:#F8D9D7">${escapar(o.nota)}</p>` : ''
  return `<tr><td align="center" ${PAD} style="padding:38px 42px 40px;background:${COLORES.rojo}"><p style="margin:0 0 15px;font-family:${FUENTE};font-size:11px;line-height:16px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:#F8D9D7">${escapar(o.kicker)}</p><h1 class="hero-title" style="margin:0 0 17px;font-family:${FUENTE};font-size:38px;line-height:45px;font-weight:800;letter-spacing:-1px;color:${COLORES.blanco}">${escapar(o.titulo)}</h1>${texto}${boton}${nota}</td></tr>`
}

/** Encabezado claro (kicker azul, titular, párrafos). `parrafos` ya viene escapado. */
export function filaTexto(o: { kicker?: string; titulo: string; parrafos: string[]; grande?: boolean }): string {
  const kicker = o.kicker ? `<p style="margin:0 0 9px;font-family:${FUENTE};font-size:10px;line-height:15px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase;color:${AZUL}">${escapar(o.kicker)}</p>` : ''
  const ps = o.parrafos.map((p) => `<p style="margin:0 0 12px;font-family:${TEXTO};font-size:15px;line-height:25px;color:#535761">${p}</p>`).join('')
  return `<tr><td ${PAD} style="padding:34px 42px 13px;background:${COLORES.blanco}">${kicker}<h2 style="margin:0 0 12px;font-family:${FUENTE};font-size:${o.grande ? 26 : 24}px;line-height:${o.grande ? 33 : 31}px;font-weight:800;color:${COLORES.negro}">${escapar(o.titulo)}</h2>${ps}</td></tr>`
}

/** Tres tarjetas (se apilan en el teléfono). Cada una lleva un número, no un símbolo. */
export function filaTarjetas(items: Array<{ titulo: string; texto: string }>): string {
  const colores = [COLORES.rojo, AZUL, DORADO]
  const celdas = items.slice(0, 3).map((it, i) => {
    const relleno = i === 0 ? '0 7px 12px 0' : i === items.length - 1 ? '0 0 12px 7px' : '0 4px 12px'
    return `<td class="stack" width="33.33%" valign="top" style="width:33.33%;padding:${relleno}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORES.fondo};border-top:3px solid ${colores[i]}"><tr><td style="padding:17px 13px 18px"><p style="margin:0 0 8px;font-family:${FUENTE};font-size:22px;line-height:26px;font-weight:800;color:${colores[i] === DORADO ? '#8A6A1F' : colores[i]}">0${i + 1}</p><p style="margin:0 0 7px;font-family:${FUENTE};font-size:14px;line-height:19px;font-weight:800;color:${COLORES.negro}">${escapar(it.titulo)}</p><p style="margin:0;font-family:${TEXTO};font-size:13px;line-height:20px;color:#4B5563">${escapar(it.texto)}</p></td></tr></table></td>`
  })
  return `<tr><td ${PAD} style="padding:22px 42px 22px;background:${COLORES.blanco}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${celdas.join('')}</tr></table></td></tr>`
}

/** Franja de color con una lista corta (por ejemplo, los tipos de propiedad). */
export function filaFranja(o: { titulo: string; texto: string; lineas: string[] }): string {
  return `<tr><td ${PAD} style="padding:25px 42px 27px;background:${AZUL}"><h2 style="margin:0 0 13px;font-family:${FUENTE};font-size:19px;line-height:26px;font-weight:800;color:${COLORES.blanco}">${escapar(o.titulo)}</h2><p style="margin:0 0 18px;font-family:${TEXTO};font-size:14px;line-height:22px;color:#F1F2FA">${escapar(o.texto)}</p><p style="margin:0;font-family:${FUENTE};font-size:11px;line-height:22px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${COLORES.blanco}">${o.lineas.map(escapar).join('<br>')}</p></td></tr>`
}

/** Llamado a la acción central, con una nota pequeña debajo (`notaHtml` ya escapada). */
export function filaCta(o: { titulo: string; texto: string; boton: Boton; notaHtml?: string }): string {
  const nota = o.notaHtml ? `<p style="margin:17px 0 0;font-family:${TEXTO};font-size:12px;line-height:19px;color:#6B7280">${o.notaHtml}</p>` : ''
  return `<tr><td align="center" ${PAD} style="padding:34px 42px 35px;background:${COLORES.blanco}"><h2 style="margin:0 0 11px;font-family:${FUENTE};font-size:23px;line-height:30px;font-weight:800;color:${COLORES.negro}">${escapar(o.titulo)}</h2><p style="margin:0 0 21px;font-family:${TEXTO};font-size:14px;line-height:23px;color:#535761">${escapar(o.texto)}</p>${botonLleno(o.boton, COLORES.rojo, COLORES.blanco)}${nota}</td></tr>`
}

/** Bloque beige de acompañamiento por WhatsApp (el número sale de los datos del negocio). */
export function filaWhatsApp(o: { titulo?: string; texto?: string; mensaje?: string } = {}): string {
  const titulo = o.titulo ?? '¿Quieres afinar la búsqueda?'
  const texto = o.texto ?? 'Cuéntanos qué necesitas. Podemos ajustar la búsqueda según tu zona, presupuesto y tipo de propiedad.'
  const url = enlaceWhatsApp(o.mensaje ?? 'Hola VIVE BIEN, quiero afinar mi búsqueda de propiedades.')
  return `<tr><td ${PAD} style="padding:28px 42px 30px;background:${COLORES.fondo};border-top:1px solid #E7E3DD"><p style="margin:0 0 8px;font-family:${FUENTE};font-size:10px;line-height:15px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${COLORES.rojo}">Te acompañamos</p><h2 style="margin:0 0 11px;font-family:${FUENTE};font-size:22px;line-height:29px;font-weight:700;color:${COLORES.negro}">${escapar(titulo)}</h2><p style="margin:0 0 19px;font-family:${TEXTO};font-size:14px;line-height:23px;color:#535761">${escapar(texto)}</p>${botonLleno({ texto: 'Hablemos por WhatsApp →', url }, COLORES.negro, COLORES.blanco)}</td></tr>`
}

/** El marco común: encabezado con logotipo, filas, pie de marca y aviso. `pie` ya viene escapado. */
export function marcoCorreo(o: { preheader: string; filas: string; pie?: string; avisoPropiedades?: boolean }): string {
  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><title>VIVE BIEN Grupo Inmobiliario</title>
<style>
  @media screen and (max-width:600px) {
    .mobile-pad { padding-left:20px !important; padding-right:20px !important; }
    .stack, .property-col { display:block !important; width:100% !important; max-width:100% !important; padding-left:0 !important; padding-right:0 !important; }
    .headline { font-size:29px !important; line-height:35px !important; }
    .hero-title { font-size:30px !important; line-height:37px !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:${COLORES.fondo}">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORES.fondo}">${escapar(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORES.fondo}" style="background:${COLORES.fondo}"><tr><td align="center" style="padding:26px 12px 34px">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:${COLORES.blanco}">
    <tr><td align="center" style="padding:26px 24px 20px;background:${COLORES.blanco};border-bottom:1px solid #E9E5DE;border-top:4px solid ${COLORES.rojo}">
      <a href="${escapar(SITIO)}" target="_blank" style="text-decoration:none"><img src="${escapar(LOGO_URL)}" width="178" alt="VIVE BIEN Grupo Inmobiliario" style="display:block;border:0;outline:none;height:auto;width:178px;max-width:178px;margin:0 auto;font-family:${FUENTE};font-size:16px;font-weight:800;color:${COLORES.rojo}"></a>
    </td></tr>
    ${o.filas}
    <tr><td align="center" style="padding:27px 24px 25px;background:${COLORES.fondo};border-top:1px solid #E5E0D8;font-family:${TEXTO};font-size:12px;line-height:19px;color:#4B5563">
      <p style="margin:0 0 8px;font-family:${FUENTE};font-size:15px;line-height:21px;font-weight:700;color:${COLORES.negro}">VIVE BIEN <span style="font-weight:400;color:${AZUL}">Grupo Inmobiliario</span></p>
      <p style="margin:0 0 14px">Más que propiedades, mejores historias.</p>
      <p style="margin:0 0 6px"><a href="${escapar(SITIO)}" target="_blank" style="color:${COLORES.rojo};text-decoration:none">vivebienn.com</a> · <a href="mailto:${escapar(NEGOCIO.email)}" style="color:#4B5563">${escapar(NEGOCIO.email)}</a> · ${escapar(NEGOCIO.telefonoVisible)}</p>
      <p style="margin:0 0 15px;font-size:11px;line-height:17px;color:#6B7280">${escapar(DIRECCION_CORTA)}, ${escapar(NEGOCIO.ciudad)}, ${escapar(NEGOCIO.estado)}.</p>
      ${o.pie ? `<div style="font-size:11px;line-height:18px;color:#6B7280">${o.pie}</div>` : ''}
    </td></tr>
  </table>
  ${o.avisoPropiedades === false ? '' : `<p style="max-width:600px;margin:13px auto 0;font-family:${TEXTO};font-size:10px;line-height:15px;color:#6B7280;text-align:center">La disponibilidad, el precio y las condiciones de las propiedades pueden cambiar. Confirma la información con VIVE BIEN antes de tomar una decisión.</p>`}
</td></tr></table>
</body></html>`
}
