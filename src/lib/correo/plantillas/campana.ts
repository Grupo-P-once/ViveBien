import { filaWhatsApp, marcoCorreo } from './bloques'
import { COLORES, escapar, urlSegura, type TarjetaCorreo } from './marca'

/**
 * Diseño «campaña» de los correos con propiedades (D-80 v2). Parte de la maqueta del dueño
 * (`campana_recomendaciones_vive_bien.html`): encabezado con kicker y saludo grande, regla roja, UNA propiedad destacada, las
 * demás en dos columnas que se apilan en el teléfono, un bloque de acompañamiento por WhatsApp y el pie legal.
 * Los colores salen de la marca de este sistema (COLORES), no de la maqueta. Mismas reglas que el resto: tablas y estilos
 * en línea (la única hoja <style> sólo afina el teléfono y se ignora sin problema si el cliente la quita), https, alt en
 * toda imagen y todo dato dinámico escapado.
 */

const FUENTE = 'Montserrat, Arial, Helvetica, sans-serif'
const TEXTO = 'Arial, Helvetica, sans-serif'

export function tarjetaDestacada(p: TarjetaCorreo): string {
  const u = escapar(urlSegura(p.url))
  const foto = p.foto
    ? `<tr><td><a href="${u}" target="_blank"><img class="property-image" src="${escapar(urlSegura(p.foto))}" width="554" alt="${escapar(p.titulo)}" style="display:block;width:100%;max-width:554px;height:auto;border:0;background:${COLORES.fondo};font-family:${FUENTE};font-size:15px;font-weight:700;line-height:1.4;color:${COLORES.negro}"></a></td></tr>`
    : ''
  const etiqueta = p.etiqueta ? `<p style="margin:0 0 9px;font-family:${FUENTE};font-size:10px;line-height:15px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${COLORES.rojo}">${escapar(p.etiqueta)}</p>` : ''
  const lugar = p.lugar ? `<p style="margin:0 0 12px;font-family:${TEXTO};font-size:13px;line-height:20px;color:${COLORES.gris}">${escapar(p.lugar)}</p>` : ''
  const datos = p.datos.length ? `<p style="margin:0 0 15px;font-family:${TEXTO};font-size:13px;line-height:21px;color:#444851">${p.datos.map(escapar).join(' · ')}</p>` : ''
  const precio = p.precio ? `<p style="margin:0 0 18px;font-family:${FUENTE};font-size:24px;line-height:30px;font-weight:700;color:${COLORES.negro}">${escapar(p.precio)}</p>` : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;border:1px solid #E7E3DD">${foto}<tr><td style="padding:20px 22px 22px">${etiqueta}<h2 style="margin:0 0 8px;font-family:${FUENTE};font-size:21px;line-height:28px;font-weight:700;color:${COLORES.negro}"><a href="${u}" target="_blank" style="color:${COLORES.negro};text-decoration:none">${escapar(p.titulo)}</a></h2>${lugar}${datos}${precio}<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORES.rojo}" style="background:${COLORES.rojo};border-radius:2px"><a href="${u}" target="_blank" style="display:inline-block;padding:13px 20px;font-family:${FUENTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:.3px;color:${COLORES.blanco};text-decoration:none">Ver propiedad&nbsp; →</a></td></tr></table></td></tr></table>`
}

function tarjetaCompacta(p: TarjetaCorreo, lado: 'izq' | 'der' | 'sola'): string {
  const u = escapar(urlSegura(p.url))
  const foto = p.foto
    ? `<tr><td><a href="${u}" target="_blank"><img class="property-image" src="${escapar(urlSegura(p.foto))}" width="250" alt="${escapar(p.titulo)}" style="display:block;width:100%;height:auto;border:0;background:${COLORES.fondo};font-family:${FUENTE};font-size:13px;font-weight:700;line-height:1.4;color:${COLORES.negro}"></a></td></tr>`
    : ''
  const relleno = lado === 'izq' ? '0 9px 12px 0' : lado === 'der' ? '0 0 12px 9px' : '0 0 12px'
  const ancho = lado === 'sola' ? '50%' : '50%'
  const etiqueta = p.etiqueta ? `<p style="margin:0 0 7px;font-family:${FUENTE};font-size:9px;line-height:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLORES.rojo}">${escapar(p.etiqueta)}</p>` : ''
  const lugar = p.lugar ? `<p style="margin:0 0 9px;font-family:${TEXTO};font-size:12px;line-height:18px;color:${COLORES.gris}">${escapar(p.lugar)}</p>` : ''
  const datos = p.datos.length ? `<p style="margin:0 0 12px;font-family:${TEXTO};font-size:12px;line-height:18px;color:#444851">${p.datos.map(escapar).join(' · ')}</p>` : ''
  const precio = p.precio ? `<p style="margin:0 0 13px;font-family:${FUENTE};font-size:18px;line-height:24px;font-weight:700;color:${COLORES.negro}">${escapar(p.precio)}</p>` : ''
  return `<td class="property-col stack" valign="top" width="${ancho}" style="width:${ancho};padding:${relleno}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E7E3DD">${foto}<tr><td style="padding:15px 14px 17px">${etiqueta}<h3 style="margin:0 0 7px;font-family:${FUENTE};font-size:15px;line-height:21px;font-weight:700;color:${COLORES.negro}"><a href="${u}" target="_blank" style="color:${COLORES.negro};text-decoration:none">${escapar(p.titulo)}</a></h3>${lugar}${datos}${precio}<a href="${u}" target="_blank" style="font-family:${FUENTE};font-size:11px;line-height:16px;font-weight:700;color:${COLORES.rojo};text-decoration:none">Ver detalles&nbsp; →</a></td></tr></table></td>`
}

/** Todas las propiedades en una rejilla de dos columnas (se apilan en el teléfono), sin destacar ninguna. */
export function rejillaPropiedades(ps: TarjetaCorreo[]): string {
  if (ps.length === 0) return ''
  let html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
  for (let i = 0; i < ps.length; i += 2) {
    const par = ps.slice(i, i + 2)
    html += `<tr>${par.length === 2 ? tarjetaCompacta(par[0], 'izq') + tarjetaCompacta(par[1], 'der') : tarjetaCompacta(par[0], 'sola')}</tr>`
  }
  return html + '</table>'
}

/** Las propiedades: la primera destacada y el resto de dos en dos. */
export function bloquePropiedades(ps: TarjetaCorreo[], tituloResto = 'También podrían interesarte'): string {
  if (ps.length === 0) return ''
  const [primera, ...resto] = ps
  let html = tarjetaDestacada(primera)
  if (resto.length) {
    html += `<h2 style="margin:0 0 12px;font-family:${FUENTE};font-size:20px;line-height:27px;font-weight:700;color:${COLORES.negro}">${escapar(tituloResto)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">`
    for (let i = 0; i < resto.length; i += 2) {
      const par = resto.slice(i, i + 2)
      html += `<tr>${par.length === 2 ? tarjetaCompacta(par[0], 'izq') + tarjetaCompacta(par[1], 'der') : tarjetaCompacta(par[0], 'sola')}</tr>`
    }
    html += '</table>'
  }
  return html
}

export type OpcionesCampana = {
  preheader: string
  kicker: string
  saludo: string
  /** HTML ya escapado por quien llama. */
  intro?: string
  /** Lo que la persona pidió, en una línea («Según tu búsqueda: …»). Texto plano: aquí se escapa. */
  resumen?: string
  /** HTML ya escapado por quien llama. */
  cuerpo: string
  /** HTML ya escapado por quien llama (baja y motivo del envío). */
  pie: string
}

export function layoutCampana(o: OpcionesCampana): string {
  const intro = o.intro ? `<p style="margin:0 0 13px;font-family:${TEXTO};font-size:16px;line-height:25px;color:#535761">${o.intro}</p>` : ''
  const resumen = o.resumen ? `<p style="margin:0;font-family:${TEXTO};font-size:14px;line-height:23px;color:#4B5563">Según tu búsqueda: <strong style="color:#24262B">${escapar(o.resumen)}</strong></p>` : ''
  const filas =
    `<tr><td class="mobile-pad" style="padding:36px 42px 22px;background:${COLORES.blanco}">
      <!--et:${escapar(o.kicker)}-->
      <h1 class="headline" style="margin:0 0 18px;font-family:${FUENTE};font-size:34px;line-height:41px;font-weight:700;letter-spacing:-.7px;color:${COLORES.negro}">${escapar(o.saludo)}</h1>
      ${intro}${resumen}
    </td></tr>
    <tr><td class="mobile-pad" style="padding:0 42px 24px;background:${COLORES.blanco}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="3" style="height:3px;background:${COLORES.rojo};font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
    <tr><td class="mobile-pad" style="padding:0 42px 20px;background:${COLORES.blanco}">${o.cuerpo}</td></tr>
    ${filaWhatsApp()}`
  return marcoCorreo({ preheader: o.preheader, filas, pie: o.pie })
}
