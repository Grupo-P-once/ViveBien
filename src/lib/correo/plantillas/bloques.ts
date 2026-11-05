import { DIRECCION_CORTA, NEGOCIO, enlaceWhatsApp } from '../../config/negocio'
import { SITIO } from '../../sitio'
import { COLORES, LOGO_URL, bloqueGrupoPOnce, escapar, urlSegura } from './marca'

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

/**
 * Titular, etiqueta de sección y botón a todo el ancho: el estilo de los mockups del dueño (carpeta MKT/correos, 30-oct-2026): regla roja arriba, logotipo con la etiqueta de la
 * sección a la derecha, saludo gris, titular enorme con la segunda mitad en rojo, subtítulo y un botón rojo a todo el ancho. Todo el que usa `filaHero`, `filaTexto` y `marcoCorreo`
 * lo adopta a la vez.
 */

/** Parte un titular en dos tramos: el segundo va en rojo. */
function partirTitulo(t: string): [string, string] {
  const p = t.trim().split(/\s+/)
  if (p.length < 2) return [t.trim(), '']
  const n = Math.ceil(p.length / 2)
  return [p.slice(0, n).join(' '), p.slice(n).join(' ')]
}

/** La etiqueta de sección del encabezado (a la derecha del logotipo). La pone el primer bloque que la trae y `marcoCorreo` la recoge (el comentario no se ve en el correo). */
const etiquetaDeSeccion = (e?: string) => (e ? `<!--et:${escapar(e)}-->` : '')

/** Un saludo («Hola Ana,») va gris y sin partir; cualquier otro titular va grande, con la segunda mitad en rojo. */
function tituloGrande(titulo: string, px: number): string {
  if (/^Hola\b/i.test(titulo.trim())) return `<p style="margin:0 0 12px;font-family:${TEXTO};font-size:22px;line-height:30px;color:${AZUL}">${escapar(titulo)}</p>`
  const [a, b] = partirTitulo(titulo)
  return `<h1 class="hero-title" style="margin:0 0 16px;font-family:${FUENTE};font-size:${px}px;line-height:${px + 6}px;font-weight:800;letter-spacing:-1px;color:${COLORES.negro}">${escapar(a)}${b ? ` <span style="color:${COLORES.rojo}">${escapar(b)}</span>` : ''}</h1>`
}

/** Botón rojo a todo el ancho (el de las maquetas). */
function botonAncho(b: Boton): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${COLORES.rojo}" style="background:${COLORES.rojo};border-radius:8px"><a href="${escapar(urlSegura(b.url))}" target="_blank" style="display:block;padding:17px 20px;font-family:${FUENTE};font-size:17px;line-height:22px;font-weight:700;color:${COLORES.blanco};text-decoration:none;text-align:center">${escapar(b.texto)}</a></td></tr></table>`
}

/** Titular grande con subtítulo, botón a todo el ancho y una nota opcional (la bienvenida, la solicitud y los avisos de propiedad abren así). */
export function filaHero(o: { kicker: string; titulo: string; texto?: string; boton?: Boton; nota?: string }): string {
  const texto = o.texto ? `<p style="margin:0 0 8px;font-family:${TEXTO};font-size:19px;line-height:30px;color:${AZUL}">${escapar(o.texto)}</p>` : ''
  const cta = o.boton ? `<tr><td ${PAD} style="padding:16px 42px 6px;background:${COLORES.blanco}">${botonAncho(o.boton)}</td></tr>` : ''
  const nota = o.nota ? `<tr><td ${PAD} style="padding:8px 42px 6px;background:${COLORES.blanco}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:${COLORES.fondo};padding:10px 14px;font-family:${FUENTE};font-size:14px;line-height:20px;font-weight:700;color:${COLORES.negro}">${escapar(o.nota)}</td></tr></table></td></tr>` : ''
  return `<tr><td ${PAD} style="padding:38px 42px 12px;background:${COLORES.blanco}">${etiquetaDeSeccion(o.kicker)}${tituloGrande(o.titulo, 42)}${texto}</td></tr>${cta}${nota}`
}

/** Encabezado claro (etiqueta en el encabezado, titular, párrafos). `parrafos` ya viene escapado. */
export function filaTexto(o: { kicker?: string; titulo: string; parrafos: string[]; grande?: boolean }): string {
  const ps = o.parrafos.map((p) => `<p style="margin:0 0 12px;font-family:${TEXTO};font-size:16px;line-height:26px;color:#535761">${p}</p>`).join('')
  return `<tr><td ${PAD} style="padding:36px 42px 13px;background:${COLORES.blanco}">${etiquetaDeSeccion(o.kicker)}${tituloGrande(o.titulo, o.grande ? 34 : 30)}${ps}</td></tr>`
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
    <tr><td style="padding:24px 40px 16px;background:${COLORES.blanco};border-bottom:1px solid #E9E5DE;border-top:4px solid ${COLORES.rojo}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><a href="${escapar(SITIO)}" target="_blank" style="text-decoration:none"><img src="${escapar(LOGO_URL)}" width="150" alt="VIVE BIEN Grupo Inmobiliario" style="display:block;border:0;outline:none;height:auto;width:150px;max-width:150px;font-family:${FUENTE};font-size:16px;font-weight:800;color:${COLORES.rojo}"></a></td><td valign="middle" align="right" style="padding-left:12px;font-family:${FUENTE};font-size:12px;line-height:17px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:${COLORES.rojo}">${(/<!\-\-et:(.*?)\-\->/.exec(o.filas) ?? [])[1] ?? ''}</td></tr></table></td></tr>
    ${o.filas.replace(/<!\-\-et:.*?\-\->/g, '')}
    <tr><td align="center" style="padding:27px 24px 25px;background:${COLORES.fondo};border-top:1px solid #E5E0D8;font-family:${TEXTO};font-size:12px;line-height:19px;color:#4B5563">
      <p style="margin:0 0 6px;font-family:${FUENTE};font-size:16px;line-height:22px;font-weight:700;color:${COLORES.negro}">VIVE BIEN <span style="font-weight:400;color:${AZUL}">· ${escapar(NEGOCIO.ciudad)}, ${escapar(NEGOCIO.estado)}</span></p>
      <p style="margin:0 0 12px"><a href="${escapar(SITIO)}/privacidad" target="_blank" style="color:${AZUL};text-decoration:underline">Aviso de privacidad</a></p>
      <p style="margin:0 0 14px">Más que propiedades, mejores historias.</p>
      <p style="margin:0 0 6px"><a href="${escapar(SITIO)}" target="_blank" style="color:${COLORES.rojo};text-decoration:none">vivebienn.com</a> · <a href="mailto:${escapar(NEGOCIO.email)}" style="color:#4B5563">${escapar(NEGOCIO.email)}</a> · ${escapar(NEGOCIO.telefonoVisible)}</p>
      <p style="margin:0 0 15px;font-size:11px;line-height:17px;color:#4B5563">${escapar(DIRECCION_CORTA)}, ${escapar(NEGOCIO.ciudad)}, ${escapar(NEGOCIO.estado)}.</p>
      ${o.pie ? `<div style="font-size:11px;line-height:18px;color:#4B5563">${o.pie}</div>` : ''}
      ${bloqueGrupoPOnce()}
    </td></tr>
  </table>
  ${o.avisoPropiedades === false ? '' : `<p style="max-width:600px;margin:13px auto 0;font-family:${TEXTO};font-size:12px;line-height:18px;color:#4B5563;text-align:center">La disponibilidad, el precio y las condiciones de las propiedades pueden cambiar. Confirma la información con VIVE BIEN antes de tomar una decisión.</p>`}
</td></tr></table>
</body></html>`
}
