import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { correoDeLead, numeroParaWhatsApp, telefonoLegible } from '../src/lib/correo/plantillas/lead'
import { catalogoCompleto, vistaPrevia } from '../src/lib/correo/biblioteca'

/**
 * Aviso interno de nuevo interesado (rediseño del 30-oct-2026 a partir de una captura en Gmail modo oscuro). Datos SINTÉTICOS.
 * Lo que se vio mal y debe quedar corregido: sin marco ni logotipo, UUID crudo en «Propiedad», asunto torpe, teléfono sin formato, sin tarjeta de propiedad.
 */
const casa = { titulo: 'Casa de ejemplo B', url: 'https://sitio.ejemplo.invalid/propiedades/casa-b', foto: 'https://sitio.ejemplo.invalid/correo-ejemplo/propiedad-b.svg', lugar: 'Colonia de ejemplo, León', precio: '$3,200,000', etiqueta: 'Casa · En venta', datos: [] as string[] }
const UUID = '5243dab0-e301-4ce1-a5de-f5f57037e613'
const base = { nombre: 'Persona <b>Sintética</b>', telefono: '4770000000', mensaje: 'Estoy interesado.\nPor favor, contáctenme <script>x</script>', interes: 'Pide informes (ejemplo)', origen: 'una solicitud de una propiedad (con cuenta)', origenCorto: 'Solicitud de propiedad' }

describe('correoDeLead', () => {
  const c = correoDeLead({ ...base, propiedadId: UUID })

  it('usa el marco de VIVE BIEN: logotipo con alt, borde rojo, bloque de color con el nombre, pie del equipo y preencabezado con el teléfono', () => {
    expect(c.html).toContain('alt="VIVE BIEN Grupo Inmobiliario"')
    expect(c.html).toMatch(/border-top:4px solid/)
    expect(c.html).toContain('Nuevo interesado')
    expect(c.html).toMatch(/<div style="display:none;max-height:0[^>]*>[^<]*\+52 477 000 0000/)
    expect(c.html).toContain('Aviso interno de VIVE BIEN')
  })

  it('no enseña el UUID de la propiedad: pone una referencia corta y un enlace a la ficha', () => {
    expect(c.html.replace(/href="[^"]*"/g, '')).not.toContain(UUID) // visible: nunca el UUID (solo viaja dentro del enlace)
    expect(c.texto).not.toContain(`Propiedad: ${UUID}`)
    expect(c.html).toContain('ref. 5243dab0')
    expect(c.html).toContain(`/propiedades/${UUID}`) // el enlace sí lleva el identificador completo
    expect(c.html).toContain('Ver propiedad')
  })

  it('con los datos de la propiedad la dibuja como tarjeta (foto, operación, precio y zona)', () => {
    const t = correoDeLead({ ...base, propiedad: casa })
    for (const frag of ['Casa de ejemplo B', '$3,200,000', 'Colonia de ejemplo, León', 'Casa · En venta', 'propiedad-b.svg']) expect(t.html, frag).toContain(frag)
    expect(t.html).not.toContain('ref. ')
  })

  it('el teléfono sale con formato y el enlace de WhatsApp lleva la lada de país (un número de 10 dígitos sin ella no abre el chat)', () => {
    expect(telefonoLegible('4770000000')).toBe('+52 477 000 0000')
    expect(telefonoLegible('+52 477 000 0000')).toBe('+52 477 000 0000')
    expect(telefonoLegible('+1 (555) 010-9999')).toBe('+1 (555) 010-9999')
    expect(numeroParaWhatsApp('477 000 0000')).toBe('524770000000')
    expect(numeroParaWhatsApp('+52 1 477 000 0000')).toBe('524770000000')
    expect(c.html).toContain('https://wa.me/524770000000')
    expect(c.texto).toContain('https://wa.me/524770000000')
  })

  it('el asunto es claro: nombre y origen corto, sin la frase «una solicitud de una propiedad (con cuenta)»', () => {
    expect(c.asunto).toBe('Nuevo interesado: Persona <b>Sintética</b> · Solicitud de propiedad')
    expect(c.asunto).not.toMatch(/con cuenta/)
    expect(correoDeLead({ ...base, sinGuardar: true }).asunto.startsWith('SIN GUARDAR · ')).toBe(true)
  })

  it('escapa todo lo que escribe un desconocido y no inventa correos', () => {
    expect(c.html).not.toContain('<script>')
    expect(c.html).not.toContain('<b>Sintética</b>')
    expect(c.html).toContain('&lt;script&gt;')
    expect(c.html).not.toContain('mailto:persona') // sin correo del interesado no hay enlace a él
    const con = correoDeLead({ ...base, email: 'persona@ejemplo.invalid' })
    expect(con.html).toContain('mailto:persona@ejemplo.invalid')
    const malo = correoDeLead({ ...base, email: 'a@x.test\r\nBcc: victima@x.test' })
    expect(malo.html).not.toContain('Bcc')
  })

  it('si la base no respondió lo dice arriba, en un recuadro de alerta, y en el texto plano', () => {
    const s = correoDeLead({ ...base, sinGuardar: true })
    expect(s.html).toContain('La base de datos no respondió')
    expect(s.texto).toContain('LA BASE DE DATOS NO RESPONDIÓ')
  })

  it('el botón de WhatsApp usa texto oscuro (blanco sobre #25D366 no pasa AA) y los fondos son explícitos para el modo oscuro', () => {
    expect(c.html).toMatch(/bgcolor="#25D366"[^>]*>[\s\S]*color:#0B1F12/)
    expect(c.html).not.toMatch(/background:#25D366[^"]*"[^>]*>\s*<a[^>]*color:#fff/i)
    expect(c.html).toContain('<meta name="color-scheme" content="light only">')
    expect(c.html).toMatch(/bgcolor="#F3F0EA"/)
  })

  it('compatibilidad estática con Gmail, Outlook y Apple Mail: tablas, estilos en línea, menos de 102 KB, sin flex, grid ni scripts; https o mailto; texto plano', () => {
    expect(Buffer.byteLength(c.html, 'utf8')).toBeLessThan(102_000)
    expect(c.html).not.toMatch(/display:\s*(flex|grid)|float:|<script|<form|<link|@import|javascript:|<iframe/i)
    for (const [, u] of c.html.matchAll(/href="([^"]+)"/g)) expect(u.replace(/&amp;/g, '&'), u).toMatch(/^(https:\/\/|mailto:)/)
    expect(c.texto).toContain('VIVE BIEN')
    expect(c.texto).not.toMatch(/<(table|td|tr|div|p|a|img|span)[\s>]/i)
  })
})

describe('el aviso real usa esta plantilla', () => {
  it('aviso-lead.ts arma el correo con correoDeLead y sigue mandando por el emisor único', () => {
    const src = readFileSync(path.join(__dirname, '..', 'src', 'lib', 'aviso-lead.ts'), 'utf8')
    expect(src).toContain("from './correo/plantillas/lead'")
    expect(src).toMatch(/correoDeLead\(/)
    expect(src).toMatch(/enviarPorEmisorUnico\(/)
    expect(src).not.toMatch(/font-family:system-ui/) // se fue el HTML suelto
  })
  it('el catálogo lo muestra como «se envía hoy», con rastro y vista previa; la vista previa es la misma plantilla', () => {
    const e = catalogoCompleto().find((x) => x.id === 'aviso_lead')!
    expect(e).toMatchObject({ existencia: 'envia_hoy', rastro: 'src/lib/aviso-lead.ts', conVista: true, grupo: 'Equipo de VIVE BIEN' })
    const v = vistaPrevia('aviso_lead')!
    expect(v.html).toContain('Nuevo interesado')
    expect(v.html).not.toMatch(/@(?!vivebienn\.com)[a-z0-9-]+\.[a-z]{2,}/i) // la muestra no lleva ningún correo, salvo el del propio negocio en el pie
  })
})
