import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearLibro, type Libro } from './dobles/libro-cupo'

// Todo correo reserva cupo en el libro (migración 62 REAL en PGlite): ningún envío de prueba se salta la cuenta del plan gratuito.
const libroH = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../src/lib/correo/libro', () => ({ dbDelLibro: () => libroH.db }))
let libro: Libro
beforeAll(async () => { libro = await crearLibro(); libroH.db = libro.db }, 60_000)
beforeEach(async () => { await libro.vaciar() })
afterAll(async () => { await libro?.cerrar() })
import { DESTINO_PRUEBAS } from '../src/lib/correo/config'
import { cuerpoDePruebas, ENLACE_INERTE, exigirSoloDestinoDePruebas, llamarResend, modoPruebasActivo, neutralizarEnlaces, MARCA_PRUEBA } from '../src/lib/correo/resend'
import { avisarDeLead } from '../src/lib/aviso-lead'
import { enviarInvitacion } from '../src/lib/invitacion-correo'
import { mandar } from '../src/lib/citas/enviar'
import { CORREO_CONTACTO } from '../src/lib/contacto'

/**
 * D-80 — MODO DE PRUEBAS en TODOS los emisores de correo del sitio (los tres anteriores a D-80 incluidos).
 * `fetch` es un doble: no sale ningún correo ni se usa ninguna clave real.
 */
type Peticion = { url: string; headers: Record<string, string>; cuerpo: Record<string, unknown> }
let peticiones: Peticion[]
const CRLF = String.fromCharCode(13, 10)
const TOKEN = 'TOKENSECRETOREAL123'

beforeEach(() => {
  peticiones = []
  vi.stubEnv('RESEND_API_KEY', 're_clave_de_prueba_falsa')
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    peticiones.push({ url, headers: init.headers as Record<string, string>, cuerpo: JSON.parse(String(init.body)) })
    return new Response('{"id":"re_1"}', { status: 200 })
  })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const LEAD = { nombre: 'Visitante Real', telefono: '4771234567', email: 'visitante.real@cliente-real.test', mensaje: 'Hola', origen: 'contacto' }
const citaMandar = (x: Record<string, unknown> = {}) => mandar({
  clave: 'cita/1/v1/cliente', para: 'cliente.cita@cliente-real.test', asunto: 'Tu visita', ics: 'BEGIN:VCALENDAR' + CRLF + 'ORGANIZER:mailto:asesor.real@cliente-real.test' + CRLF + 'END:VCALENDAR',
  html: '<a href="https://vivebienn.com/citas/accion#' + TOKEN + '">Confirmar</a> <a href="https://vivebienn.com/portal">Ver</a>',
  texto: 'Confirmar: https://vivebienn.com/citas/accion#' + TOKEN, ...x,
})
const emisores: Array<[string, () => Promise<unknown>]> = [
  ['avisarDeLead', () => avisarDeLead(LEAD)],
  ['enviarInvitacion', () => enviarInvitacion({ email: 'invitado.real@cliente-real.test', rol: 'publicador', invitadoPor: 'jefe.real@cliente-real.test' })],
  ['citas/mandar', () => citaMandar()],
]

describe('con CORREO_MODO_PRUEBAS=1 cada emisor entrega SOLO al destino de pruebas', () => {
  beforeEach(() => { vi.stubEnv('CORREO_MODO_PRUEBAS', '1') })

  for (const [nombre, emitir] of emisores) {
    it(`${nombre}: destinatario fijo, sin copias, sin adjuntos, sin direcciones reales en ningún campo de destinatario`, async () => {
      await emitir()
      expect(peticiones).toHaveLength(1)
      const c = peticiones[0].cuerpo
      expect(peticiones[0].url).toBe('https://api.resend.com/emails')
      expect(c.to).toEqual([DESTINO_PRUEBAS])
      expect(c.reply_to).toBe('informes@vivebienn.com')
      expect(String(c.subject).startsWith(MARCA_PRUEBA)).toBe(true)
      expect(Object.keys(c).filter((k) => !['from', 'to', 'reply_to', 'subject', 'html', 'text', 'headers'].includes(k))).toEqual([])
      expect(Object.keys(c.headers as object)).toEqual(['X-Vive-Bien-Modo'])
      expect(JSON.stringify({ to: c.to, reply_to: c.reply_to, headers: c.headers })).not.toContain('cliente-real')
    })

    it(`${nombre}: con la bandera apagada o con cualquier valor distinto de «1», el envío real NO cambia`, async () => {
      for (const v of ['', '0', 'true', ' 1']) {
        vi.stubEnv('CORREO_MODO_PRUEBAS', v)
        peticiones = []
        await libro.vaciar()
        await emitir()
        // El aviso de leads va, de todos modos, al buzón institucional, que es también el destino de pruebas: ahí lo que distingue es el asunto y la cabecera.
        if (nombre !== 'avisarDeLead') expect(peticiones[0].cuerpo.to).not.toEqual([DESTINO_PRUEBAS])
        expect(String(peticiones[0].cuerpo.subject).startsWith(MARCA_PRUEBA)).toBe(false)
        expect(JSON.stringify(peticiones[0].cuerpo.headers ?? {})).not.toContain('X-Vive-Bien-Modo')
      }
    })
  }

  it('avisarDeLead: la persona que dejó sus datos NO recibe nada: ni como destinatario ni como respuesta (aunque su correo traiga una inyección)', async () => {
    await avisarDeLead({ ...LEAD, email: 'a@x.test' + CRLF + 'Bcc: victima@x.test' })
    expect(peticiones).toHaveLength(1)
    const c = peticiones[0].cuerpo
    expect(JSON.stringify({ t: c.to, r: c.reply_to, h: c.headers })).not.toMatch(/victima|a@x\.test/)
  })

  it('enviarInvitacion: «invitadoPor» y un invitado con varias direcciones no pueden ser copia ni respuesta', async () => {
    await enviarInvitacion({ email: 'uno@x.test, dos@x.test', rol: 'asesor', invitadoPor: 'copia@x.test' })
    const c = peticiones[0].cuerpo
    expect(c.to).toEqual([DESTINO_PRUEBAS])
    expect(c.reply_to).toBe('informes@vivebienn.com')
    expect(JSON.stringify({ to: c.to, reply_to: c.reply_to, headers: c.headers })).not.toMatch(/copia@|uno@|dos@/)
  })

  it('citas: los enlaces con token (aceptar/cancelar la cita) NO salen; el adjunto .ics (organizador/asistentes) tampoco', async () => {
    await citaMandar()
    const c = peticiones[0].cuerpo
    expect(JSON.stringify(c)).not.toContain(TOKEN)
    // F1: el contenido real se DESCARTA por completo (solo queda el tipo); no hay ningún enlace, ni siquiera inerte.
    expect(String(c.html)).toContain('contenido sintético')
    expect(String(c.text)).toContain('Tipo de mensaje: cita')
    expect(String(c.html) + String(c.text) + String(c.subject)).not.toMatch(/https?:|vivebienn\.com\/portal|Tu visita/)
    expect('attachments' in c).toBe(false)
    expect(JSON.stringify(c)).not.toMatch(/asesor\.real|cliente\.cita/)
  })

  it('F1 · con contenido declarado sintético (vista previa del diseñador) se conserva, pero los enlaces con token se neutralizan', () => {
    const c = cuerpoDePruebas({ from: 'a', to: ['x@y.test'], subject: 'Vista previa', html: '<a href="https://vivebienn.com/correo/baja#t=T0KEN">baja</a> <a href="https://vivebienn.com/portal">ver</a>', text: 'https://vivebienn.com/correo/baja#t=T0KEN' }, '0A1B2C3D', { sintetico: true, tipo: 'vista_previa' })
    expect(String(c.subject)).toBe('[PRUEBA VB · 0A1B2C3D] Vista previa')
    expect(JSON.stringify(c)).not.toContain('T0KEN')
    expect(String(c.html)).toContain(ENLACE_INERTE)
    expect(String(c.html)).toContain('https://vivebienn.com/portal')
  })

  it('sin clave del proveedor nadie envía nada, tampoco en modo de pruebas', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    for (const [, emitir] of emisores) await emitir()
    expect(peticiones).toEqual([])
  })
})

describe('sin modo de pruebas, producción queda como estaba', () => {
  beforeEach(() => { vi.stubEnv('CORREO_MODO_PRUEBAS', '') })
  it('aviso de lead va al buzón interno con respuesta al interesado; invitación al invitado; citas conserva enlaces, .ics e idempotencia', async () => {
    await avisarDeLead(LEAD)
    expect(peticiones[0].cuerpo).toMatchObject({ to: [CORREO_CONTACTO], reply_to: LEAD.email })
    await enviarInvitacion({ email: 'invitado.real@cliente-real.test', rol: 'publicador', invitadoPor: 'jefe@x.test' })
    expect(peticiones[1].cuerpo).toMatchObject({ to: ['invitado.real@cliente-real.test'], reply_to: 'jefe@x.test' })
    await citaMandar()
    expect(peticiones[2].cuerpo).toMatchObject({ to: ['cliente.cita@cliente-real.test'] })
    expect(JSON.stringify(peticiones[2].cuerpo)).toContain(TOKEN)
    expect(Array.isArray(peticiones[2].cuerpo.attachments)).toBe(true)
    expect(peticiones[2].headers['Idempotency-Key']).toBe('cita/1/v1/cliente')
  })
})

describe('el módulo central', () => {
  it('modoPruebasActivo: sólo «1»', () => {
    expect(modoPruebasActivo({})).toBe(false)
    for (const v of ['', '0', 'true', 'yes', ' 1', '1 ']) expect(modoPruebasActivo({ CORREO_MODO_PRUEBAS: v })).toBe(false)
    expect(modoPruebasActivo({ CORREO_MODO_PRUEBAS: '1' })).toBe(true)
  })

  it('cuerpoDePruebas reconstruye desde una lista blanca: CC/CCO en cualquier forma, varios destinatarios, adjuntos y cabeceras de copia desaparecen', () => {
    const hostil = {
      from: 'Vive Bien <informes@vivebienn.com>', to: ['x@x.test', 'y@x.test'], cc: ['c@x.test'], bcc: ['b@x.test'], BCC: 'B@x.test', Cco: ['o@x.test'], ' cc ': 'z@x.test',
      reply_to: 'r@x.test', subject: 'Hola' + CRLF + 'Bcc: s@x.test', html: '<p>x</p>', text: 'x', scheduled_at: 'in 1 min', tags: [{ name: 'a', value: 'b' }],
      attachments: [{ filename: 'a.ics', content: 'eA==' }],
      headers: { Bcc: 'h@x.test', CC: 'h2@x.test', To: 'h3@x.test', 'Reply-To': 'h4@x.test', 'List-Unsubscribe': '<https://vivebienn.com/api/correo/baja?t=T>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', 'X-Ok': 'bien', 'X-Mal': 'a' + CRLF + 'Bcc: q@x.test' },
    }
    const c = cuerpoDePruebas(hostil, '0A1B2C3D')
    expect(() => exigirSoloDestinoDePruebas(c)).not.toThrow()
    expect(c.to).toEqual([DESTINO_PRUEBAS])
    expect(Object.keys(c).sort()).toEqual(['from', 'headers', 'html', 'reply_to', 'subject', 'text', 'to'])
    expect(c.headers).toEqual({ 'X-Ok': 'bien', 'X-Vive-Bien-Modo': 'pruebas' })
    expect(String(c.subject)).not.toMatch(/[\r\n]/)
    expect(JSON.stringify({ ...c, subject: "" })).not.toMatch(/@x.test/) // el asunto es texto de una sola línea: no puede abrir una cabecera
    expect(cuerpoDePruebas(c, '0A1B2C3D').subject).toBe(c.subject) // idempotente: no duplica el prefijo
  })

  it('llamarResend: en modo de pruebas el proveedor recibe el cuerpo reconstruido, nunca el original', async () => {
    const vistos: string[] = []
    const fetchDoble = (async (_u: string, init: RequestInit) => { vistos.push(String(init.body)); return new Response('{}', { status: 200 }) }) as unknown as typeof fetch
    await llamarResend({ apiKey: 'k', modoPruebas: true, fetch: fetchDoble, cuerpo: { from: 'a', to: ['real@x.test'], cc: ['c@x.test'], bcc: ['b@x.test'], subject: 's', html: 'h', text: 't' } })
    expect(vistos).toHaveLength(1)
    expect(vistos[0]).not.toMatch(/real@x|c@x|b@x|"cc"|"bcc"/)
    expect(JSON.parse(vistos[0]).to).toEqual([DESTINO_PRUEBAS])
  })

  it('neutralizarEnlaces: tokens de cita, confirmación, baja, preferencias y cualquier t= quedan inertes; los demás enlaces no', () => {
    const t = [
      'https://vivebienn.com/citas/accion#' + TOKEN, 'https://vivebienn.com/correo/confirmar#t=' + TOKEN, 'https://vivebienn.com/correo/baja#t=' + TOKEN,
      'https://vivebienn.com/api/correo/baja?t=' + TOKEN, 'https://vivebienn.com/correo/preferencias#t=' + TOKEN, 'https://otro.test/x?a=1&t=' + TOKEN, 'https://vivebienn.com/api/citas/accion?x=' + TOKEN,
    ].join(' ')
    const r = neutralizarEnlaces(t)
    expect(r).not.toContain(TOKEN)
    expect(r.split(ENLACE_INERTE)).toHaveLength(8)
    expect(neutralizarEnlaces('https://vivebienn.com/propiedades/casa-1')).toBe('https://vivebienn.com/propiedades/casa-1')
    expect(neutralizarEnlaces(undefined)).toBe('')
  })
})
