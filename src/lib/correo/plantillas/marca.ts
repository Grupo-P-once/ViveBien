import { NEGOCIO, DIRECCION_CORTA } from '../../config/negocio'
import { SITIO, urlDe } from '../../sitio'

/**
 * Sistema de diseño de los correos de VIVE BIEN (D-80).
 *
 * Reglas: una sola columna de 600 px (se ve bien en el teléfono, donde se abre más de la mitad de los correos);
 * tablas y estilos EN LÍNEA (los clientes de correo ignoran casi todo lo demás); sin JavaScript, sin formularios, sin
 * contenido oculto, sin imágenes de fondo; todo legible si las imágenes no cargan (cada imagen lleva `alt` y tamaño);
 * colores de la marca (rojo #A30D12, negro #1A1A1A, gris #6B7280, fondo cálido #F3F0EA, blanco). Montserrat si el cliente
 * la tiene instalada; si no, Arial. El logotipo registrado se usa tal cual, sin modificarlo.
 */

export const COLORES = {
  rojo: '#A30D12',
  negro: '#1A1A1A',
  gris: '#6B7280',
  fondo: '#F3F0EA',
  blanco: '#FFFFFF',
  linea: '#E5E0D6',
} as const

const FUENTE = "Montserrat, Arial, Helvetica, sans-serif"

/** Escapa texto que viene de personas o de la base antes de ponerlo en HTML (y en atributos). */
export function escapar(texto: unknown): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Sólo http(s) hacia afuera: una URL con otro esquema (javascript:, data:) no llega nunca a un enlace. */
export function urlSegura(url: unknown): string {
  const u = String(url ?? '').trim()
  return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : SITIO
}

export type Correo = { asunto: string; html: string; texto: string }

export const LOGO_URL = urlDe('/logo_transparent.png')

export function boton(texto: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px"><tr><td align="center" bgcolor="${COLORES.rojo}" style="border-radius:8px;background:${COLORES.rojo}"><a href="${escapar(urlSegura(url))}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FUENTE};font-size:15px;font-weight:700;line-height:20px;color:${COLORES.blanco};text-decoration:none;border-radius:8px">${escapar(texto)}</a></td></tr></table>`
}

export function parrafo(html: string, opciones: { gris?: boolean; pequeno?: boolean } = {}): string {
  const color = opciones.gris ? COLORES.gris : COLORES.negro
  const tam = opciones.pequeno ? '13px' : '16px'
  return `<p style="margin:0 0 14px;font-family:${FUENTE};font-size:${tam};line-height:1.6;color:${color}">${html}</p>`
}

export function titulo(texto: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${FUENTE};font-size:24px;line-height:1.3;font-weight:800;color:${COLORES.negro}">${escapar(texto)}</h1>`
}

export type OpcionesLayout = {
  /** Texto corto que algunos clientes enseñan junto al asunto. Debe decir lo mismo que el correo. */
  preheader: string
  contenido: string
  /** Pie adicional (por ejemplo, el motivo y la baja de un correo comercial). */
  pie?: string
}

export function layout({ preheader, contenido, pie = '' }: OpcionesLayout): string {
  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><title>VIVE BIEN Grupo Inmobiliario</title></head>
<body style="margin:0;padding:0;background:${COLORES.fondo}">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORES.fondo}">${escapar(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORES.fondo}" style="background:${COLORES.fondo}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td align="center" bgcolor="${COLORES.blanco}" style="background:${COLORES.blanco};border-radius:12px 12px 0 0;border-top:4px solid ${COLORES.rojo};padding:22px 24px 14px">
      <a href="${escapar(SITIO)}" target="_blank" style="text-decoration:none"><img src="${escapar(LOGO_URL)}" width="150" alt="VIVE BIEN Grupo Inmobiliario" style="display:block;border:0;outline:none;height:auto;max-width:150px;font-family:${FUENTE};font-size:16px;font-weight:800;color:${COLORES.rojo}"></a>
    </td></tr>
    <tr><td bgcolor="${COLORES.blanco}" style="background:${COLORES.blanco};padding:8px 28px 26px;border-radius:0 0 12px 12px">${contenido}</td></tr>
    <tr><td style="padding:18px 8px 6px;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${COLORES.gris};text-align:center">
      ${pie}
      <div>VIVE BIEN Grupo Inmobiliario · ${escapar(DIRECCION_CORTA)}, ${escapar(NEGOCIO.ciudad)}, ${escapar(NEGOCIO.estado)}</div>
      <div><a href="mailto:${escapar(NEGOCIO.email)}" style="color:${COLORES.gris}">${escapar(NEGOCIO.email)}</a> · ${escapar(NEGOCIO.telefonoVisible)}</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
}

export function pieTexto(): string {
  return `\n--\nVIVE BIEN Grupo Inmobiliario · ${DIRECCION_CORTA}, ${NEGOCIO.ciudad}, ${NEGOCIO.estado}\n${NEGOCIO.email} · ${NEGOCIO.telefonoVisible}\n${SITIO}\n`
}

/** Una propiedad lista para pintarse en un correo. Todos los datos salen de la base; si falta uno, se omite. */
export type TarjetaCorreo = {
  titulo: string
  url: string
  foto: string | null
  lugar: string | null
  precio: string | null
  etiqueta: string | null
  datos: string[]
}

export function tarjetaPropiedad(p: TarjetaCorreo): string {
  const foto = p.foto
    ? `<tr><td style="padding:0"><a href="${escapar(urlSegura(p.url))}" target="_blank"><img src="${escapar(urlSegura(p.foto))}" width="544" alt="${escapar(p.titulo)}" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:10px 10px 0 0;background:${COLORES.fondo};font-family:${FUENTE};font-size:15px;font-weight:700;line-height:1.4;color:${COLORES.negro}"></a></td></tr>`
    : ''
  const etiqueta = p.etiqueta
    ? `<div style="font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${COLORES.rojo};margin:0 0 4px">${escapar(p.etiqueta)}</div>`
    : ''
  const lugar = p.lugar ? `<div style="font-family:${FUENTE};font-size:14px;color:${COLORES.gris};margin:0 0 6px">${escapar(p.lugar)}</div>` : ''
  const datos = p.datos.length
    ? `<div style="font-family:${FUENTE};font-size:13px;color:${COLORES.gris};margin:0 0 8px">${p.datos.map(escapar).join(' · ')}</div>`
    : ''
  const precio = p.precio
    ? `<div style="font-family:${FUENTE};font-size:20px;font-weight:800;color:${COLORES.negro};margin:0 0 10px">${escapar(p.precio)}</div>`
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border:1px solid ${COLORES.linea};border-radius:10px">${foto}<tr><td style="padding:14px 16px 16px">${etiqueta}<div style="font-family:${FUENTE};font-size:17px;font-weight:700;line-height:1.35;color:${COLORES.negro};margin:0 0 4px"><a href="${escapar(urlSegura(p.url))}" target="_blank" style="color:${COLORES.negro};text-decoration:none">${escapar(p.titulo)}</a></div>${lugar}${datos}${precio}<a href="${escapar(urlSegura(p.url))}" target="_blank" style="font-family:${FUENTE};font-size:14px;font-weight:700;color:${COLORES.rojo};text-decoration:none">Ver propiedad →</a></td></tr></table>`
}
