import { NEGOCIO, DIRECCION_CORTA, enlaceWhatsApp } from '../../config/negocio'
import { SITIO } from '../../sitio'
import { AZUL, FUENTE, TEXTO } from './bloques'
import { COLORES, LOGO_URL, escapar, urlSegura, type TarjetaCorreo } from './marca'

/**
 * El correo de bienvenida con la cara del inicio del portal del cliente (D-80 v3). Parte de la maqueta del dueño
 * (`bienvenida_portal_vive_bien.html`): barra superior con el logotipo y «Tu portal de cliente», tarjeta de bienvenida
 * con texto y foto, tres cifras, «Lo más reciente» con tres propiedades y el recuadro «Tu búsqueda».
 *
 * Reglas propias de este correo:
 *  · Las cifras son las REALES de la cuenta y del sitio en el momento del envío; si no se pudieron leer, se omite la fila
 *    (nunca se rellena con ceros que parezcan datos).
 *  · «Lo más reciente» son propiedades publicadas de verdad; si no hay ninguna, el bloque no aparece.
 *  · La foto de la tarjeta es la de una propiedad real publicada; sin ella, el texto ocupa todo el ancho.
 *  · Sin género gramatical («Te damos la bienvenida»), sin símbolos que Outlook dibuja como cuadros, sin `tel:`.
 */

export type ResumenPortal = { guardadas: number; busquedas: number; citas: number }

const entero = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0)

function celdaCifra(valor: number, etiqueta: string, color: string, fondo: string, relleno: string): string {
  return `<td class="stat" width="33.33%" valign="top" style="width:33.33%;padding:${relleno}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORES.blanco};border:1px solid #E8E6E2;border-top:3px solid ${color};border-radius:10px"><tr><td style="padding:12px 12px 13px"><p style="margin:0 0 2px;font-family:${FUENTE};font-size:24px;line-height:28px;font-weight:800;color:${COLORES.negro}">${entero(valor)}</p><p style="margin:0;font-family:${TEXTO};font-size:12px;line-height:16px;color:#4B5563"><span style="display:inline-block;width:8px;height:8px;background:${fondo};border-radius:4px;margin-right:6px"></span>${escapar(etiqueta)}</p></td></tr></table></td>`
}

function tarjetaMini(p: TarjetaCorreo, relleno: string): string {
  const u = escapar(urlSegura(p.url))
  const foto = p.foto
    ? `<tr><td><a href="${u}" target="_blank"><img class="property-image" src="${escapar(urlSegura(p.foto))}" width="170" alt="${escapar(p.titulo)}" style="display:block;width:100%;height:auto;border:0;background:${COLORES.fondo};font-family:${FUENTE};font-size:12px;font-weight:700;color:${COLORES.negro}"></a></td></tr>`
    : ''
  const etiqueta = p.etiqueta ? `<p style="margin:0 0 5px;font-family:${FUENTE};font-size:9px;line-height:13px;letter-spacing:.8px;text-transform:uppercase;color:${COLORES.rojo};font-weight:700">${escapar(p.etiqueta)}</p>` : ''
  const lugar = p.lugar ? `<p style="margin:0 0 8px;font-family:${TEXTO};font-size:11px;line-height:15px;color:#6B7280">${escapar(p.lugar.length > 60 ? `${p.lugar.slice(0, 57)}…` : p.lugar)}</p>` : ''
  const precio = p.precio ? `<p style="margin:0;font-family:${FUENTE};font-size:14px;line-height:18px;font-weight:800;color:${COLORES.rojo}">${escapar(p.precio)}</p>` : ''
  return `<td class="stack" width="33.33%" valign="top" style="width:33.33%;padding:${relleno}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E6E2;border-radius:8px">${foto}<tr><td style="padding:10px 10px 12px">${etiqueta}<p style="margin:0 0 5px;font-family:${FUENTE};font-size:13px;line-height:17px;font-weight:700;color:#202228"><a href="${u}" target="_blank" style="color:#202228;text-decoration:none">${escapar(p.titulo)}</a></p>${lugar}${precio}</td></tr></table></td>`
}

export type OpcionesPortal = {
  preheader: string
  /** Nombre de pila, ya limpio. Si no hay, la barra dice «Tu cuenta VIVE BIEN». */
  nombre: string | null
  titulo: string
  intro: string
  boton: { texto: string; url: string }
  heroImagen: string | null
  heroAlt: string
  resumen: ResumenPortal | null
  propiedades: TarjetaCorreo[]
  urlCatalogo: string
  urlPreferencias: string
  /** Texto del pie, ya escapado. */
  pie: string
}

export function layoutPortal(o: OpcionesPortal): string {
  const barra = `<tr><td style="background:${COLORES.blanco};border:1px solid #E8E6E2;border-bottom:0;border-top:4px solid ${COLORES.rojo};padding:15px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" width="45%"><a href="${escapar(SITIO)}" target="_blank"><img src="${escapar(LOGO_URL)}" width="128" alt="VIVE BIEN Grupo Inmobiliario" style="display:block;border:0;width:128px;max-width:128px;height:auto;font-family:${FUENTE};font-size:14px;font-weight:800;color:${COLORES.rojo}"></a></td><td valign="middle" align="right" style="font-family:${TEXTO};font-size:11px;line-height:16px;color:#6B7280;text-transform:uppercase">Tu portal de cliente<br><strong style="color:#292B30;text-transform:none">${escapar(o.nombre ?? 'Tu cuenta VIVE BIEN')}</strong></td></tr></table></td></tr>`

  const textoHero = `<p style="margin:0 0 12px;font-family:${FUENTE};font-size:10px;line-height:14px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#4B5563">Portal de cliente</p><h1 class="hero-title" style="margin:0 0 14px;font-family:${FUENTE};font-size:30px;line-height:37px;font-weight:600;color:${COLORES.negro}">${escapar(o.titulo)}</h1><p style="margin:0 0 20px;font-family:${TEXTO};font-size:14px;line-height:22px;color:#4B5563">${escapar(o.intro)}</p><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORES.rojo}" style="background:${COLORES.rojo};border-radius:7px"><a href="${escapar(urlSegura(o.boton.url))}" target="_blank" style="display:inline-block;padding:13px 18px;font-family:${FUENTE};font-size:12px;line-height:16px;font-weight:800;color:${COLORES.blanco};text-decoration:none">${escapar(o.boton.texto)}</a></td></tr></table>`
  const hero = o.heroImagen
    ? `<td class="stack" width="56%" valign="middle" style="width:56%;padding:28px 22px 29px;background:${COLORES.blanco}">${textoHero}</td><td class="stack" width="44%" valign="middle" style="width:44%;padding:0;background:#E8E5E0"><img class="hero-img" src="${escapar(urlSegura(o.heroImagen))}" width="290" alt="${escapar(o.heroAlt)}" style="display:block;width:100%;max-width:290px;height:auto;border:0;font-family:${FUENTE};font-size:13px;color:${COLORES.negro}"></td>`
    : `<td style="padding:28px 22px 29px;background:${COLORES.blanco}">${textoHero}</td>`
  const filaHero = `<tr><td style="background:${COLORES.blanco};border-left:1px solid #E8E6E2;border-right:1px solid #E8E6E2;padding:0 20px 17px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E5E0D9;border-radius:15px;background:${COLORES.blanco}"><tr>${hero}</tr></table></td></tr>`

  const r = o.resumen
  const filaCifras = r
    ? `<tr><td style="padding:0 20px 17px;background:${COLORES.blanco};border-left:1px solid #E8E6E2;border-right:1px solid #E8E6E2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${celdaCifra(r.guardadas, 'Propiedades guardadas', COLORES.rojo, COLORES.rojo, '0 5px 8px 0')}${celdaCifra(r.busquedas, 'Búsquedas guardadas', AZUL, AZUL, '0 3px 8px')}${celdaCifra(r.citas, 'Visitas agendadas', '#287C5A', '#287C5A', '0 0 8px 5px')}</tr></table></td></tr>`
    : ''

  const mini = o.propiedades.slice(0, 3)
  const reciente = mini.length
    ? `<td class="stack" width="73%" valign="top" style="width:73%;padding:0 10px 0 0"><p style="margin:0 0 5px;font-family:${FUENTE};font-size:16px;line-height:22px;font-weight:800;color:${COLORES.negro}"><span style="color:${COLORES.rojo}">—</span> Lo más reciente</p><p style="margin:0 0 12px;font-family:${TEXTO};font-size:12px;line-height:17px;color:#6B7280">Una primera selección para empezar. Puedes ajustar tus preferencias cuando quieras.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${mini.map((p, i) => tarjetaMini(p, i === 0 ? '0 4px 8px 0' : i === mini.length - 1 ? '0 0 8px 4px' : '0 2px 8px')).join('')}</tr></table><p style="margin:10px 0 0"><a href="${escapar(urlSegura(o.urlCatalogo))}" target="_blank" style="font-family:${FUENTE};font-size:12px;line-height:16px;font-weight:800;color:${COLORES.rojo};text-decoration:none">Ver todas las propiedades →</a></p></td>`
    : ''
  const lateral = `<td class="stack" width="${mini.length ? '27%' : '100%'}" valign="top" style="width:${mini.length ? '27%' : '100%'};padding:0 0 0 ${mini.length ? '7px' : '0'}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E6E2;border-radius:10px"><tr><td style="padding:14px 12px 13px"><p style="margin:0 0 9px;font-family:${FUENTE};font-size:14px;line-height:18px;font-weight:800;color:${COLORES.negro}">Tu búsqueda</p><p style="margin:0 0 12px;font-family:${TEXTO};font-size:12px;line-height:17px;color:#6B7280">Dinos tu presupuesto, zonas y tipo de propiedad para mostrarte opciones que tengan más sentido para ti.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border:1px solid ${COLORES.rojo};border-radius:7px"><a href="${escapar(urlSegura(o.urlPreferencias))}" target="_blank" style="display:block;padding:10px 6px;font-family:${FUENTE};font-size:11px;line-height:14px;font-weight:700;color:${COLORES.rojo};text-decoration:none">Contar qué busco</a></td></tr></table></td></tr></table></td>`
  const filaReciente = `<tr><td style="padding:0 20px 20px;background:${COLORES.blanco};border-left:1px solid #E8E6E2;border-right:1px solid #E8E6E2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${reciente}${lateral}</tr></table></td></tr>`

  const cierre = `<tr><td align="center" style="padding:22px 22px 23px;background:${COLORES.fondo};border:1px solid #E8E6E2"><p style="margin:0 0 7px;font-family:${FUENTE};font-size:16px;line-height:23px;font-weight:800;color:${COLORES.negro}">Qué bueno que ya eres parte de VIVE BIEN</p><p style="margin:0 0 14px;font-family:${TEXTO};font-size:12px;line-height:19px;color:#4B5563">Más que propiedades, mejores historias.</p><p style="margin:0;font-family:${TEXTO};font-size:12px;line-height:18px;color:#4B5563"><a href="${escapar(SITIO)}" target="_blank" style="color:${COLORES.rojo};text-decoration:none">vivebienn.com</a> · <a href="mailto:${escapar(NEGOCIO.email)}" style="color:#4B5563">${escapar(NEGOCIO.email)}</a> · ${escapar(NEGOCIO.telefonoVisible)} · <a href="${escapar(enlaceWhatsApp())}" target="_blank" style="color:#4B5563">WhatsApp</a></p><p style="margin:12px 0 0;font-family:${TEXTO};font-size:11px;line-height:16px;color:#6B7280">${escapar(DIRECCION_CORTA)}, ${escapar(NEGOCIO.ciudad)}, ${escapar(NEGOCIO.estado)}.</p><p style="margin:12px 0 0;font-family:${TEXTO};font-size:11px;line-height:17px;color:#6B7280">${o.pie}</p></td></tr>`

  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><title>VIVE BIEN Grupo Inmobiliario</title>
<style>
  @media screen and (max-width:620px) {
    .stack { display:block !important; width:100% !important; max-width:100% !important; padding-left:0 !important; padding-right:0 !important; }
    .stat { display:inline-block !important; width:50% !important; box-sizing:border-box !important; }
    .hero-title { font-size:26px !important; line-height:32px !important; }
    .hero-img { max-width:100% !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:${COLORES.fondo}">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORES.fondo}">${escapar(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORES.fondo}" style="background:${COLORES.fondo}"><tr><td align="center" style="padding:22px 12px 30px">
  <table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px">
    ${barra}${filaHero}${filaCifras}${filaReciente}${cierre}
  </table>
</td></tr></table>
</body></html>`
}
