import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { catalogoCompleto, MUESTRA_POR_OMISION, vistaPrevia } from '../src/lib/correo/biblioteca'
import {
  plantillaBajaCuenta, plantillaCambioCorreo, plantillaConsultaRespuesta, plantillaNovedades, plantillaNuevoInteresado, plantillaPropiedadEnRevision,
  plantillaPropiedadRechazada, plantillaPropiedadRecibida, plantillaRecuperarContrasena,
} from '../src/lib/correo/plantillas/eventos-pendientes'

/**
 * Resto de las plantillas del catálogo (cambio de correo, baja de cuenta, consulta, propiedad recibida / en revisión / rechazada, nuevo interesado, novedades del blog y
 * recuperar contraseña). Datos SINTÉTICOS. Compatibilidad ESTÁTICA con Gmail, Outlook y Apple Mail; un render real en esos clientes NO se probó.
 */
const raiz = path.join(__dirname, '..')
const X = 'https://sitio.ejemplo.invalid'
const casa = { titulo: 'Casa de ejemplo B <script>', url: `${X}/p/1`, foto: `${X}/correo-ejemplo/propiedad-b.svg`, lugar: 'Colonia de ejemplo, León', precio: '$3,200,000', etiqueta: 'Casa · En venta', datos: ['3 recámaras'] }
const nave = { ...casa, titulo: 'Nave de ejemplo A' }
const n = 'Ana <b>Ejemplo</b>'

const correos: Array<[string, { asunto: string; html: string; texto: string }]> = [
  ['cambio de correo', plantillaCambioCorreo({ nombre: n, correoNuevo: 'n***@e***', urlConfirmar: `${X}/c`, urlNoFuiYo: `${X}/n` })],
  ['baja de cuenta', plantillaBajaCuenta({ nombre: n, fecha: '30 de octubre de 2026', urlAyuda: `${X}/ayuda` })],
  ['respuesta a una consulta', plantillaConsultaRespuesta({ nombre: n, propiedad: casa, anunciante: 'Anunciante <i>Ejemplo</i>', similares: [nave, casa], urlConsultas: `${X}/portal/consultas`, urlCatalogo: `${X}/propiedades`, urlPreferencias: `${X}/prefs` })],
  ['propiedad recibida', plantillaPropiedadRecibida({ nombre: n, propiedad: casa, folio: 'EJ-000', porcentaje: 62, urlPanel: `${X}/publicador` })],
  ['propiedad en revisión', plantillaPropiedadEnRevision({ nombre: n, propiedad: casa, folio: 'EJ-000', urlPanel: `${X}/publicador` })],
  ['propiedad con cambios', plantillaPropiedadRechazada({ nombre: n, propiedad: casa, folio: 'EJ-000', motivo: 'Faltan fotos <b>del exterior</b>.', pideCambios: true, urlEditar: `${X}/editar` })],
  ['propiedad rechazada', plantillaPropiedadRechazada({ nombre: n, propiedad: casa, folio: 'EJ-000', motivo: 'Motivo de ejemplo.', pideCambios: false, urlEditar: `${X}/ver` })],
  ['nuevo interesado', plantillaNuevoInteresado({ nombre: n, propiedad: casa, canal: 'el formulario', urlPanel: `${X}/publicador/consultas` })],
  ['novedades del blog', plantillaNovedades({ nombre: n, articulos: [{ titulo: 'Artículo de ejemplo <i>1</i>', resumen: 'Resumen de ejemplo.', url: `${X}/blog/1`, foto: `${X}/correo-ejemplo/propiedad-a.svg` }], propiedades: [nave, casa], urlBlog: `${X}/blog`, urlBaja: `${X}/baja`, urlPreferencias: `${X}/prefs` })],
  ['recuperar contraseña', plantillaRecuperarContrasena({ nombre: n, urlRestablecer: `${X}/restablecer?inerte=1` })],
]

describe.each(correos)('%s', (_n, c) => {
  it('usa el marco de VIVE BIEN con logotipo, borde rojo, preencabezado y pie', () => {
    expect(c.html).toContain('alt="VIVE BIEN Grupo Inmobiliario"')
    expect(c.html).toMatch(/border-top:4px solid/)
    expect(c.html).toMatch(/<div style="display:none;max-height:0[^>]*>[^<]{15,}<\/div>/)
  })
  it('compatibilidad estática: tablas y estilos en línea, menos de 102 KB, sin flex, grid, float, scripts ni formularios, y hoja para el teléfono', () => {
    expect(Buffer.byteLength(c.html, 'utf8')).toBeLessThan(102_000)
    expect(c.html).not.toMatch(/display:\s*(flex|grid)|float:|position:\s*(absolute|fixed)|<script|<form|<link|@import|javascript:|<iframe/i)
    expect(c.html).toContain('role="presentation"')
    expect(c.html).toContain('@media screen and (max-width:600px)')
    for (const img of c.html.match(/<img[^>]*>/g) ?? []) { expect(img).toMatch(/alt="/); expect(img).toMatch(/width="?\d+/) }
  })
  it('enlaces https o mailto; texto plano sin HTML de la plantilla; asunto sin emojis, exclamaciones ni mayúsculas gritadas', () => {
    for (const [, u] of c.html.matchAll(/href="([^"]+)"/g)) expect(u.replace(/&amp;/g, '&'), u).toMatch(/^(https:\/\/|mailto:)/)
    expect(c.texto.length).toBeGreaterThan(80)
    expect(c.texto).toContain('VIVE BIEN')
    expect(c.texto).not.toMatch(/<(table|td|tr|div|p|a|img|span|h[1-6])[\s>]/i)
    expect(c.asunto).not.toMatch(/[!¡]|\p{Extended_Pictographic}/u)
    expect(c.asunto).not.toMatch(/\b[A-ZÁÉÍÓÚÑ]{6,}\b/)
    expect(c.asunto.length).toBeLessThanOrEqual(80)
  })
  it('escapa todo dato: sin HTML inyectado y sin marcas de terceros', () => {
    expect(c.html).not.toContain('<script>')
    for (const crudo of ['<b>Ejemplo</b>', '<i>Ejemplo</i>', '<b>del exterior</b>', '<i>1</i>']) expect(c.html).not.toContain(crudo)
    expect(c.html + c.texto).not.toMatch(/inmuebles24|quintoandar|navent|zonaprop|SmartLead/i)
  })
})

const visible = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') // el titular lleva la segunda mitad en rojo (otro <span>): se compara el texto que se ve

describe('contenido por evento', () => {
  const get = (nombre: string) => correos.find(([x]) => x === nombre)![1]
  it('cada correo trae lo que su evento necesita', () => {
    expect(get('cambio de correo').html).toContain('No fui yo')
    expect(get('baja de cuenta').html).toContain('Qué pasó con tus datos')
    expect(get('respuesta a una consulta').html).toContain('Más propiedades que podrían gustarte')
    expect(get('propiedad recibida').html).toContain('62 %')
    expect(get('propiedad recibida').html).toContain('Folio:')
    expect(visible(get('propiedad en revisión').html)).toContain('Estamos revisando tu propiedad')
    expect(get('propiedad con cambios').html).toContain('Corregir mi propiedad')
    expect(visible(get('propiedad rechazada').html)).toContain('No pudimos publicar tu propiedad')
    expect(get('nuevo interesado').html).toContain('no en este correo') // sin datos personales del interesado
    expect(get('novedades del blog').html).toContain('Darme de baja con un clic')
    expect(get('recuperar contraseña').html).toContain('copia y pega esta dirección')
  })
  it('los correos de servicio no llevan baja de marketing; el promocional sí y dice por qué se recibe', () => {
    expect(get('novedades del blog').html).toContain('aceptaste recibir novedades')
    for (const x of ['cambio de correo', 'baja de cuenta', 'propiedad en revisión', 'nuevo interesado']) expect(get(x).html).not.toContain('Darme de baja')
  })
})

describe('estado: plantilla lista · evento pendiente; ninguna se envía', () => {
  const ids = ['cambio_correo', 'baja_cuenta', 'consulta_respuesta', 'propiedad_recibida', 'propiedad_en_revision', 'propiedad_rechazada', 'nuevo_interesado', 'articulos_blog']
  it('el catálogo las marca «plantilla_sin_evento» (y la de contraseña como diseño para Firebase), sin rastro de envío y con vista', () => {
    const c = catalogoCompleto()
    // Sin evento que las dispare: el cambio de correo (la app no lo permite) y el blog (sin campañas ni texto legal). El resto ya está conectado (4-nov-2026), apagado.
    for (const id of ['cambio_correo', 'articulos_blog']) expect(c.find((e) => e.id === id), id).toMatchObject({ existencia: 'plantilla_sin_evento', rastro: null, conVista: true })
    for (const id of ids.filter((x) => x !== 'cambio_correo' && x !== 'articulos_blog')) expect(c.find((e) => e.id === id), id).toMatchObject({ existencia: 'codigo_apagado', rastro: 'src/lib/correo/eventos-cuenta.ts', conVista: true })
    expect(c.find((e) => e.id === 'recuperar_contrasena')).toMatchObject({ existencia: 'lo_manda_firebase', rastro: null, conVista: true })
    for (const id of [...ids, 'recuperar_contrasena']) expect(vistaPrevia(id, MUESTRA_POR_OMISION), id).not.toBeNull()
  })
  it('solo el módulo de eventos de cuenta (eventos-cuenta.ts) las manda: ningún otro código de envío las importa', () => {
    const nombres = /plantillaCambioCorreo|plantillaBajaCuenta|plantillaConsultaRespuesta|plantillaPropiedadRecibida|plantillaPropiedadEnRevision|plantillaPropiedadRechazada|plantillaNuevoInteresado|plantillaNovedades|plantillaRecuperarContrasena/
    const usos: string[] = []
    const recorrer = (dir: string) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) recorrer(p); else if (/\.(ts|tsx)$/.test(f) && nombres.test(readFileSync(p, 'utf8'))) usos.push(path.relative(raiz, p).replace(/\\/g, '/')) } }
    recorrer(path.join(raiz, 'src'))
    expect(usos.sort()).toEqual(['src/lib/correo/biblioteca.ts', 'src/lib/correo/eventos-cuenta.ts', 'src/lib/correo/plantillas/eventos-pendientes.ts', 'src/lib/correo/plantillas/index.ts'])
  })
})
