import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { plantillaContactoWhatsApp, plantillaEvaluacionAtencion, plantillaPublicadorPublicada, plantillaVerificacionCuenta } from '../src/lib/correo/plantillas'
import { correoDeAlertas, correoDeBajaDePrecio, correoLegal, type NotificacionNueva } from '../src/lib/avisos-cliente'
import { catalogoCompleto, MUESTRA_POR_OMISION, vistaPrevia } from '../src/lib/correo/biblioteca'

/**
 * Plantillas de los eventos del dueño (contacto por WhatsApp, evaluación de la atención, verificación de cuenta, propiedad publicada) y avisos con el marco de marca.
 * Todo con datos SINTÉTICOS. «Compatibilidad» aquí es ESTÁTICA (reglas que Gmail, Outlook y Apple Mail respetan); un render real en esos clientes NO se probó.
 */
const raiz = path.join(__dirname, '..')
const SITIO_X = 'https://sitio.ejemplo.invalid'
const casa = { titulo: 'Casa de ejemplo B <script>', url: `${SITIO_X}/p/1`, foto: `${SITIO_X}/correo-ejemplo/propiedad-b.svg`, lugar: 'Colonia de ejemplo, León', precio: '$3,200,000', etiqueta: 'Casa · En venta', datos: ['3 recámaras', '2 baños'] }
const nave = { ...casa, titulo: 'Nave de ejemplo A', datos: ['1,800 m²'] }
const aviso = (titulo: string): NotificacionNueva => ({ uid: 'sintetico', tipo: 'baja_de_precio', titulo, cuerpo: 'Antes $3,400,000, ahora $3,200,000.', enlace: '/propiedades', busqueda_id: null, propiedad_id: null, clave: 'x/1' })

const correos: Array<[string, { asunto: string; html: string; texto: string }]> = [
  ['contacto por WhatsApp', plantillaContactoWhatsApp({ nombre: 'Ana <b>Ejemplo</b>', propiedad: casa, anunciante: { nombre: 'Anunciante <i>Ejemplo</i>', telefono: '+52 477 000 0000', codigo: 'EJ-000' }, similares: [nave, casa], urlCatalogo: `${SITIO_X}/propiedades`, urlPreferencias: `${SITIO_X}/portal/configuracion` })],
  ['evaluación de la atención', plantillaEvaluacionAtencion({ nombre: 'Ana Ejemplo', anunciante: 'Anunciante <i>Ejemplo</i>', propiedad: casa, urlSi: `${SITIO_X}/si`, urlNo: `${SITIO_X}/no`, urlActividad: `${SITIO_X}/portal` })],
  ['verificación de cuenta', plantillaVerificacionCuenta({ nombre: 'Ana Ejemplo', urlVerificar: `${SITIO_X}/verificar?inerte=1` })],
  ['propiedad publicada', plantillaPublicadorPublicada({ nombre: 'Ana Ejemplo', propiedad: casa, folio: 'EJ-000', urlPanel: `${SITIO_X}/publicador` })],
  ['alertas (con marco)', correoDeAlertas({ nombre: 'Ana Ejemplo', grupos: [{ busquedaNombre: 'Naves en venta (ejemplo)', href: '/propiedades', items: [{ titulo: 'Nave de ejemplo A', cuerpo: '1,800 m²', url: `${SITIO_X}/p/2` }] }], sitio: SITIO_X, urlBaja: `${SITIO_X}/baja`, urlPreferencias: `${SITIO_X}/prefs` })],
  ['baja de precio (con marco)', correoDeBajaDePrecio({ nombre: 'Ana Ejemplo', avisos: [aviso('Bajó de precio: Casa de ejemplo B')], sitio: SITIO_X, urlBaja: `${SITIO_X}/baja`, urlPreferencias: `${SITIO_X}/prefs` })],
  ['aviso legal (con marco)', correoLegal({ nombre: 'Ana Ejemplo', avisos: [aviso('Actualizamos los Términos')], sitio: SITIO_X, urlPreferencias: `${SITIO_X}/prefs` })],
]

describe.each(correos)('%s', (_n, c) => {
  it('usa el marco de VIVE BIEN: logotipo con alt, borde rojo, pie con el negocio y preencabezado oculto', () => {
    expect(c.html).toContain('alt="VIVE BIEN Grupo Inmobiliario"')
    expect(c.html).toMatch(/border-top:4px solid/)
    expect(c.html).toContain('VIVE BIEN')
    expect(c.html).toMatch(/<div style="display:none;max-height:0[^>]*>[^<]{15,}<\/div>/)
  })
  it('compatibilidad estática con Gmail, Outlook y Apple Mail: tablas, estilos en línea, menos de 102 KB y sin flex, grid, float, scripts ni formularios', () => {
    expect(Buffer.byteLength(c.html, 'utf8')).toBeLessThan(102_000) // Gmail recorta por encima de ~102 KB
    expect(c.html).not.toMatch(/display:\s*(flex|grid)|float:|position:\s*(absolute|fixed)|<script|<form|<link|@import|javascript:|<iframe/i)
    expect(c.html).toContain('role="presentation"')
    expect(c.html).toContain('@media screen and (max-width:600px)') // el teléfono: se apila y afloja márgenes
    for (const img of c.html.match(/<img[^>]*>/g) ?? []) { expect(img).toMatch(/alt="/); expect(img).toMatch(/width="?\d+/) }
  })
  it('todos los enlaces son https o mailto', () => {
    for (const [, u] of c.html.matchAll(/href="([^"]+)"/g)) expect(u.replace(/&amp;/g, '&'), u).toMatch(/^(https:\/\/|mailto:)/)
  })
  it('trae versión de texto plano con el contenido y el pie', () => {
    expect(c.texto.length).toBeGreaterThan(80)
    expect(c.texto).toContain('VIVE BIEN')
    expect(c.texto).not.toMatch(/<(table|td|tr|div|p|a|img|span|h[1-6])[s>]/i) // el texto plano no lleva el HTML de la plantilla
  })
  it('el asunto no tiene emojis, signos de exclamación ni mayúsculas gritadas', () => {
    expect(c.asunto).not.toMatch(/[!¡]|\p{Extended_Pictographic}/u)
    expect(c.asunto).not.toMatch(/\b[A-ZÁÉÍÓÚÑ]{6,}\b/)
    expect(c.asunto.length).toBeLessThanOrEqual(80)
  })
  it('escapa los datos: nada de HTML inyectado por nombres o títulos', () => {
    expect(c.html).not.toContain('<script>')
    expect(c.html).not.toContain('<b>Ejemplo</b>')
    expect(c.html).not.toContain('<i>Ejemplo</i>')
  })
})

const visible = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') // el titular lleva la segunda mitad en rojo (otro <span>): se compara el texto que se ve

describe('contenido por evento', () => {
  const [wa, ev, ver, pub] = correos.map(([, c]) => c)
  it('contacto por WhatsApp: propiedad con foto, precio, zona y operación; datos del anunciante; propiedades parecidas y botón', () => {
    for (const frag of ['Te contactaste por WhatsApp con', 'Datos del anunciante', 'Teléfono:', 'Código de aviso:', 'Más propiedades que podrían gustarte', 'Encontrar más opciones', '$3,200,000', 'Colonia de ejemplo, León', 'Casa · En venta', 'propiedad-b.svg']) expect(wa.html, frag).toContain(frag)
  })
  it('evaluación: saludo con nombre, propiedad en una fila, pregunta, Sí y No, y «Mi actividad»', () => {
    for (const frag of ['Ana, tu opinión nos importa', 'se contactó contigo?', '>Sí<', '>No<', 'Mi actividad', '$3,200,000']) expect(frag.includes('<') ? ev.html : visible(ev.html), frag).toContain(frag)
  })
  it('verificación: botón, enlace de respaldo visible y aviso de qué hacer si no creó la cuenta', () => {
    for (const frag of ['Verificar mi correo', 'copia y pega esta dirección', 'Si no creaste una cuenta']) expect(ver.html, frag).toContain(frag)
    expect(ver.texto).toContain('verificar?inerte=1')
  })
  it('propiedad publicada: folio, botón al panel y tres consejos reales (sin prometer funciones que no existen)', () => {
    for (const frag of ['Folio: EJ-000', 'Ir a mis propiedades', 'Mantén tu ficha completa', 'Responde con rapidez', 'Actualiza precio y estatus']) expect(pub.html, frag).toContain(frag)
    expect(pub.html).not.toMatch(/SmartLead|Panoramix|se renuevan automáticamente/i)
  })
  it('no copian marca ni textos de terceros', () => {
    for (const [, c] of correos) expect(c.html + c.texto).not.toMatch(/inmuebles24|quintoandar|navent|zonaprop|SmartLead/i)
  })
})

describe('estado de las plantillas nuevas: ninguna se envía todavía', () => {
  it('el catálogo las marca «plantilla lista · evento pendiente» (o Firebase) y sin rastro de envío', () => {
    const c = catalogoCompleto()
    expect(c.find((e) => e.id === 'evaluacion_atencion')).toMatchObject({ existencia: 'plantilla_sin_evento', rastro: null, conVista: true }) // sin tarea programada ni rutas Sí/No
    // Conectadas a su evento (4-nov-2026): código listo, apagado por CORREO_TRANSACCIONAL y CORREO_ENVIO, con el archivo que las manda como rastro.
    for (const id of ['contacto_whatsapp', 'propiedad_aprobada']) expect(c.find((e) => e.id === id), id).toMatchObject({ existencia: 'codigo_apagado', rastro: 'src/lib/correo/eventos-cuenta.ts', conVista: true })
    expect(c.find((e) => e.id === 'verificacion_correo')).toMatchObject({ existencia: 'lo_manda_firebase', rastro: null, conVista: true })
  })
  it('solo el módulo de eventos de cuenta (eventos-cuenta.ts) manda las plantillas nuevas: ningún otro código de envío las importa', () => {
    const nombres = /plantillaContactoWhatsApp|plantillaEvaluacionAtencion|plantillaPublicadorPublicada|plantillaVerificacionCuenta/
    const usos: string[] = []
    const recorrer = (dir: string) => { for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) recorrer(p); else if (/\.(ts|tsx)$/.test(n) && nombres.test(readFileSync(p, 'utf8'))) usos.push(path.relative(raiz, p).replace(/\\/g, '/')) } }
    recorrer(path.join(raiz, 'src'))
    expect(usos.sort()).toEqual(['src/lib/correo/biblioteca.ts', 'src/lib/correo/eventos-cuenta.ts', 'src/lib/correo/plantillas/eventos.ts', 'src/lib/correo/plantillas/index.ts'])
  })
  it('la vista previa usa exactamente la plantilla (mismo HTML y mismo texto)', () => {
    const v = vistaPrevia('evaluacion_atencion', { ...MUESTRA_POR_OMISION, imagenes: false })!
    expect(visible(v.html)).toContain('tu opinión nos importa')
    expect(v.texto).toContain('se contactó contigo?')
    expect(v.categoria).toBe('servicio')
  })
})
