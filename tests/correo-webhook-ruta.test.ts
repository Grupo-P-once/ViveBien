import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { crearLibro, type Libro } from './dobles/libro-cupo'

/**
 * POST /api/correo/webhook (Resend, firmas Svix) ejercido COMPLETO contra el SQL real de las migraciones 62–63 en PGlite: nada toca ninguna base ni proveedor reales.
 * Reglas oficiales (resend.com/docs/webhooks): responder 200 al recibir; entrega «al menos una vez» (duplicados) y SIN garantía de orden; firma sobre el cuerpo CRUDO.
 */
const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/auth-server', () => ({ supabaseAdmin: () => h.db }))
vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))

const SECRETO = `whsec_${Buffer.from('secreto-de-prueba-solo-para-tests-1234').toString('base64')}`
const ahoraSeg = () => String(Math.floor(Date.now() / 1000))
const firmar = (id: string, marca: string, cuerpo: string, secreto = SECRETO) =>
  `v1,${createHmac('sha256', Buffer.from(secreto.replace(/^whsec_/, ''), 'base64')).update(`${id}.${marca}.${cuerpo}`).digest('base64')}`

let libro: Libro
let POST: (req: Request) => Promise<Response>
beforeAll(async () => {
  libro = await crearLibro(); h.db = libro.db
  await libro.pg.exec(readFileSync(path.join(__dirname, "..", "supabase", "63-correo-baja-promocional.sql"), "utf8")) // email.failed y la baja promocional viven en la 63
  POST = (await import('../src/app/api/correo/webhook/route')).POST
  vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRETO)
}, 60_000)
afterAll(async () => { vi.unstubAllEnvs(); await libro?.cerrar() })
beforeEach(async () => {
  await libro.vaciar()
  await libro.pg.exec('delete from public.correo_webhook_vistos; delete from public.correo_suscriptores;')
  vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRETO)
})
afterEach(() => { vi.restoreAllMocks() })

const evento = (tipo: string, extra: Record<string, unknown> = {}) => JSON.stringify({ type: tipo, created_at: new Date().toISOString(), data: { email_id: 're_prueba_1', to: ['persona.ejemplo@ejemplo.invalid'], ...extra } })
function peticion(cuerpo: string, o: { id?: string | null; marca?: string | null; firma?: string | null; secretoFirma?: string } = {}) {
  const id = o.id === undefined ? 'msg_1' : o.id
  const marca = o.marca === undefined ? ahoraSeg() : o.marca
  const firma = o.firma === undefined ? (id && marca ? firmar(id, marca, cuerpo, o.secretoFirma) : null) : o.firma
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (id) headers['svix-id'] = id
  if (marca) headers['svix-timestamp'] = marca
  if (firma) headers['svix-signature'] = firma
  return new Request('https://vb.test/api/correo/webhook', { method: 'POST', headers, body: cuerpo })
}
const sembrar = async (estado = 'enviado', resendId: string | null = 're_prueba_1', clave = 'k-prueba-1') =>
  libro.pg.query(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado, resend_id, entorno) values ($1, 'servicio', 'alertas', 'hash-ejemplo', $2, $3, 'pruebas')`, [clave, estado, resendId])
const estadoDe = async (clave = 'k-prueba-1') => (await libro.pg.query<{ estado: string }>('select estado from public.correo_envios where clave = $1', [clave])).rows[0]?.estado
const cuenta = async (tabla: string) => Number((await libro.pg.query<{ n: string }>(`select count(*) n from public.${tabla}`)).rows[0].n)

describe('la ruta solo acepta POST y falla cerrada', () => {
  it('solo exporta POST (cualquier otro método lo rechaza Next con 405)', async () => {
    const m = await import('../src/app/api/correo/webhook/route')
    expect(Object.keys(m).filter((k) => /^(GET|PUT|PATCH|DELETE|POST|HEAD|OPTIONS)$/.test(k))).toEqual(['POST'])
  })

  it('SIN secreto configurado: 503 y NO procesa ni guarda nada, aunque la firma sea «válida» con cualquier clave', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
    await sembrar()
    const c = evento('email.delivered')
    const r = await POST(peticion(c))
    expect(r.status).toBe(503)
    expect(await cuenta('correo_webhook_vistos')).toBe(0)
    expect(await estadoDe()).toBe('enviado')
  })

  it.each([
    ['sin svix-id', { id: null }],
    ['sin svix-timestamp', { marca: null }],
    ['sin svix-signature', { firma: null as string | null }],
    ['firma de otro secreto', { secretoFirma: `whsec_${Buffer.from('otro-secreto-distinto').toString('base64')}` }],
    ['firma mal formada', { firma: 'v1,esto-no-es-una-firma' }],
    ['marca de tiempo vieja (repetición de una captura)', { marca: String(Math.floor(Date.now() / 1000) - 3600) }],
  ])('%s: rechazo 401 y CERO efectos (no lee el JSON, no marca visto, no cambia estados)', async (_n, o) => {
    await sembrar()
    const r = await POST(peticion(evento('email.delivered'), o as never))
    expect(r.status).toBe(401)
    expect(await cuenta('correo_webhook_vistos')).toBe(0)
    expect(await estadoDe()).toBe('enviado')
  })

  it('cuerpo modificado después de firmar: 401 y cero efectos (la firma cubre los bytes originales)', async () => {
    await sembrar()
    const original = evento('email.delivered')
    const marca = ahoraSeg()
    const firma = firmar('msg_1', marca, original)
    const r = await POST(peticion(original.replace('re_prueba_1', 're_prueba_2'), { id: 'msg_1', marca, firma }))
    expect(r.status).toBe(401)
    expect(await cuenta('correo_webhook_vistos')).toBe(0)
  })
})

describe('evento válido: se aplica UNA vez, aunque Resend lo entregue varias', () => {
  it('delivered: enviado → entregado; repetir el MISMO svix-id responde 200 «duplicado» y no cambia ni cuenta de nuevo', async () => {
    await sembrar()
    const c = evento('email.delivered')
    const r1 = await POST(peticion(c, { id: 'msg_dup' }))
    expect(r1.status).toBe(200); expect(await r1.json()).toMatchObject({ ok: true, resultado: 'aplicado' })
    expect(await estadoDe()).toBe('entregado'); expect(await cuenta('correo_webhook_vistos')).toBe(1)
    await libro.pg.query(`update public.correo_envios set estado = 'enviado'`) // si se reaplicara, volvería a «entregado»
    const r2 = await POST(peticion(c, { id: 'msg_dup' }))
    expect(r2.status).toBe(200); expect(await r2.json()).toMatchObject({ resultado: 'duplicado' })
    expect(await estadoDe()).toBe('enviado'); expect(await cuenta('correo_webhook_vistos')).toBe(1)
  })

  it('bounced PERMANENTE: rebotado + dirección suprimida (una sola supresión aunque se repita); el rebote temporal no suprime', async () => {
    await sembrar()
    const r = await POST(peticion(evento('email.bounced', { bounce: { type: 'Permanent' } }), { id: 'msg_b1' }))
    expect(r.status).toBe(200)
    expect(await estadoDe()).toBe('rebotado'); expect(await cuenta('correo_supresiones')).toBe(1)
    await POST(peticion(evento('email.bounced', { bounce: { type: 'Permanent' } }), { id: 'msg_b2' })) // otro evento del mismo hecho
    expect(await cuenta('correo_supresiones')).toBe(1)
    await libro.pg.exec('delete from public.correo_supresiones')
    await libro.pg.query(`update public.correo_envios set estado = 'enviado'`)
    await POST(peticion(evento('email.bounced', { bounce: { type: 'Transient' } }), { id: 'msg_b3' }))
    expect(await cuenta('correo_supresiones')).toBe(0)
    expect(await estadoDe()).toBe('enviado')
  })

  it('complained: queja + supresión; failed: error del proveedor', async () => {
    await sembrar()
    await POST(peticion(evento('email.complained'), { id: 'msg_c1' }))
    expect(await estadoDe()).toBe('queja'); expect(await cuenta('correo_supresiones')).toBe(1)
    await libro.pg.query(`update public.correo_envios set estado = 'enviado'`)
    await POST(peticion(evento('email.failed'), { id: 'msg_f1' }))
    expect(await estadoDe()).toBe('error')
  })

  it('suppressed (Resend suprimió el envío): el envío queda «suprimido» y la dirección se suprime por huella, una sola vez aunque se repita', async () => {
    await sembrar()
    const r = await POST(peticion(evento('email.suppressed'), { id: 'msg_s1' }))
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ resultado: 'aplicado' })
    expect(await estadoDe()).toBe('suprimido'); expect(await cuenta('correo_supresiones')).toBe(1)
    await POST(peticion(evento('email.suppressed'), { id: 'msg_s2' }))
    expect(await cuenta('correo_supresiones')).toBe(1)
  })

  it.each(['email.sent', 'email.delivery_delayed', 'email.opened', 'email.clicked', 'email.scheduled', 'domain.updated', 'contact.created', 'tipo.inventado'])(
    'evento %s: con firma válida responde 200 «ignorado» (para que Resend no reintente), sin tocar la base ni marcarlo visto',
    async (tipo) => {
      await sembrar()
      const r = await POST(peticion(evento(tipo), { id: `msg_${tipo}` }))
      expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ resultado: 'ignorado' })
      expect(await estadoDe()).toBe('enviado'); expect(await cuenta('correo_webhook_vistos')).toBe(0)
    })

  it('cuerpo que no es JSON (con firma válida): 400 sin efectos', async () => {
    const r = await POST(peticion('esto no es json'))
    expect(r.status).toBe(400); expect(await cuenta('correo_webhook_vistos')).toBe(0)
  })
})

describe('sin garantía de orden (Resend): el estado final no depende de quién llegue primero', () => {
  it('delivered DESPUÉS de bounced no «resucita» un correo rebotado; bounced después de delivered sí lo marca rebotado', async () => {
    await sembrar()
    await POST(peticion(evento('email.bounced', { bounce: { type: 'Permanent' } }), { id: 'orden_1' }))
    await POST(peticion(evento('email.delivered'), { id: 'orden_2' }))
    expect(await estadoDe()).toBe('rebotado')
    await libro.pg.query(`update public.correo_envios set estado = 'enviado'`)
    await POST(peticion(evento('email.delivered'), { id: 'orden_3' }))
    await POST(peticion(evento('email.bounced', { bounce: { type: 'Permanent' } }), { id: 'orden_4' }))
    expect(await estadoDe()).toBe('rebotado')
  })

  it('failed DESPUÉS de delivered no cambia un correo ya entregado', async () => {
    await sembrar()
    await POST(peticion(evento('email.delivered'), { id: 'pos_1' }))
    await POST(peticion(evento('email.failed'), { id: 'pos_2' }))
    expect(await estadoDe()).toBe('entregado')
  })

  it('LÍMITE CONOCIDO (a corregir antes de habilitar envíos): un evento que llega ANTES de que el envío tenga su resend_id no encuentra fila, queda marcado «visto» y un replay del proveedor ya no lo aplica', async () => {
    await sembrar('pendiente', null)
    const c = evento('email.delivered')
    const r = await POST(peticion(c, { id: 'carrera_1' }))
    expect(r.status).toBe(200)
    expect(await estadoDe()).toBe('pendiente') // no hubo fila con ese resend_id todavía
    await libro.pg.query(`update public.correo_envios set estado = 'enviado', resend_id = 're_prueba_1'`) // el emisor termina de anotar el envío
    await POST(peticion(c, { id: 'carrera_1' })) // replay oficial del MISMO evento
    expect(await estadoDe()).toBe('enviado') // sigue sin «entregado»: el dedup lo bloquea
  })
})

describe('no filtra secretos ni datos personales a los registros', () => {
  it('en un recorrido con firmas válidas e inválidas, ninguna salida de consola contiene el secreto, la dirección completa ni el cuerpo', async () => {
    const espías = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})]
    await sembrar()
    await POST(peticion(evento('email.delivered'), { id: 'log_1' }))
    await POST(peticion(evento('email.delivered'), { id: 'log_2', firma: 'v1,mala' }))
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
    await POST(peticion(evento('email.delivered'), { id: 'log_3' }))
    const salida = JSON.stringify(espías.flatMap((s) => s.mock.calls))
    expect(salida).not.toContain(SECRETO.replace('whsec_', ''))
    expect(salida).not.toContain('persona.ejemplo@ejemplo.invalid')
    expect(salida).not.toContain('re_prueba_1')
  })
})
