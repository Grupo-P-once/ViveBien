import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import path from 'node:path'

/**
 * E-39 · ENDURECIMIENTO DE WEBHOOKS (Telegram y WhatsApp/Meta). Pruebas nacidas ROJAS contra E-35:
 *  · el secreto de Telegram se comparaba con `!==` (no es de tiempo constante) y nadie acotaba el tamaño del cuerpo;
 *  · una misma actualización reenviada se procesaba dos veces (sin idempotencia);
 *  · los registros llevaban texto del usuario y objetos de error completos (PII / detalles internos);
 *  · en WhatsApp, el token de verificación del GET se comparaba con `===` y el cuerpo no tenía tope.
 * NO cambia la lógica de publicación de Telegram ni los contratos con Telegram/Meta.
 */
const RAIZ = path.join(__dirname, '..')
const leer = (rel: string) => readFileSync(path.join(RAIZ, ...rel.split('/')), 'utf8')

vi.mock('@/lib/auth-server', () => ({ supabaseAdmin: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }) }))

describe('Telegram · autenticación, tamaño, repetición y registros', () => {
  const SECRETO = 'secreto-tg-de-prueba'
  let warn: ReturnType<typeof vi.spyOn>, error: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRETO); vi.stubEnv('TELEGRAM_CHATS_PERMITIDOS', '111'); vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { warn.mockRestore(); error.mockRestore(); vi.unstubAllEnvs() })
  const post = (cuerpo: unknown, cab: Record<string, string> = { 'x-telegram-bot-api-secret-token': SECRETO }) =>
    new Request('https://vivebienn.com/api/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...cab }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
  const act = (id: number, chat = 999, texto = 'hola') => ({ update_id: id, message: { message_id: 1, chat: { id: chat }, text: texto } })

  it('secreto ausente o incorrecto → rechazado; correcto → 200', async () => {
    const { POST } = await import('../src/app/api/telegram/webhook/route')
    expect((await POST(post(act(1), {}))).status).toBeGreaterThanOrEqual(401)
    expect((await POST(post(act(2), { 'x-telegram-bot-api-secret-token': SECRETO + 'x' }))).status).toBeGreaterThanOrEqual(401)
    expect((await POST(post(act(3)))).status).toBe(200)
  })
  it('el secreto se compara en TIEMPO CONSTANTE (timingSafeEqual), no con !==', () => {
    const s = leer('src/app/api/telegram/webhook/route.ts')
    expect(s).toMatch(/timingSafeEqual/)
    expect(s).not.toMatch(/get\('x-telegram-bot-api-secret-token'\) !== secreto/)
  })
  it('un cuerpo mayor de 64 KB se rechaza con 413 sin procesarse', async () => {
    const { POST } = await import('../src/app/api/telegram/webhook/route')
    const grande = JSON.stringify({ update_id: 50, message: { chat: { id: 111 }, text: 'x'.repeat(70_000) } })
    const r = await POST(post(grande))
    expect(r.status).toBe(413)
  })
  it('la MISMA actualización (update_id) enviada dos veces se procesa una sola vez', async () => {
    const { POST } = await import('../src/app/api/telegram/webhook/route')
    const a = await POST(post(act(777)))
    const b = await POST(post(act(777)))
    expect(a.status).toBe(200); expect(b.status).toBe(200)
    expect(await b.json()).toMatchObject({ duplicado: true })
    expect((await (await POST(post(act(778)))).json()).duplicado).toBeUndefined()
  })
  it('los registros no llevan texto del usuario ni objetos de error completos', () => {
    const s = leer('src/app/api/telegram/webhook/route.ts')
    const llamadas = s.split('\n').filter((l) => /console\.(error|warn|log)\(/.test(l))
    expect(llamadas.length).toBeGreaterThan(5)
    for (const l of llamadas) {
      expect(l, l.trim()).not.toMatch(/texto\.slice|\$\{texto\}/) // el LARGO del texto (texto.length) sí; el texto, no                       // texto libre del usuario
      expect(l, l.trim()).not.toMatch(/, e\)|, e instanceof Error \? e\.message : e\)/) // error crudo sin limpiar
    }
  })
})

describe('WhatsApp (Meta) · verificación, firma, tamaño y registros', () => {
  const APP_SECRET = 'app-secret-de-prueba', VERIFY = 'verify-token-de-prueba'
  beforeEach(() => { vi.resetModules(); vi.stubEnv('WHATSAPP_APP_SECRET', APP_SECRET); vi.stubEnv('WHATSAPP_VERIFY_TOKEN', VERIFY) })
  afterEach(() => vi.unstubAllEnvs())
  const firmar = (c: string) => 'sha256=' + createHmac('sha256', APP_SECRET).update(c).digest('hex')
  const cuerpoOk = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }] })

  it('GET de verificación: token correcto → reto; incorrecto o sin token → 403', async () => {
    const { GET } = await import('../src/app/api/whatsapp/webhook/route')
    const u = (t: string) => new Request(`https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=RETO`)
    expect(await (await GET(u(VERIFY))).text()).toBe('RETO')
    expect((await GET(u('otro'))).status).toBe(403)
    expect((await GET(new Request('https://x.test/api/whatsapp/webhook'))).status).toBe(403)
  })
  it('el token de verificación se compara en tiempo constante', () => {
    const s = leer('src/app/api/whatsapp/webhook/route.ts')
    expect(s).not.toMatch(/token === VERIFY_TOKEN/)
    expect(s).toMatch(/timingSafeEqual/)
  })
  it('POST: sin firma o con firma falsa → 403; con firma válida → 200', async () => {
    const { POST } = await import('../src/app/api/whatsapp/webhook/route')
    const mk = (c: string, f?: string) => new Request('https://x.test/api/whatsapp/webhook', { method: 'POST', headers: f ? { 'x-hub-signature-256': f } : {}, body: c })
    expect((await POST(mk(cuerpoOk))).status).toBe(403)
    expect((await POST(mk(cuerpoOk, firmar(cuerpoOk + 'x')))).status).toBe(403)
    expect((await POST(mk(cuerpoOk, firmar(cuerpoOk)))).status).toBe(200)
  })
  it('un cuerpo mayor de 256 KB se rechaza con 413 ANTES de calcular la firma', async () => {
    const { POST } = await import('../src/app/api/whatsapp/webhook/route')
    const grande = JSON.stringify({ x: 'y'.repeat(300_000) })
    const r = await POST(new Request('https://x.test/api/whatsapp/webhook', { method: 'POST', headers: { 'x-hub-signature-256': firmar(grande), 'content-length': String(grande.length) }, body: grande }))
    expect(r.status).toBe(413)
  })
  it('los registros no vuelcan objetos de error completos', () => {
    const s = leer('src/app/api/whatsapp/webhook/route.ts')
    expect(s).not.toMatch(/console\.error\('\[whatsapp\] error procesando el acuse:', e\)/)
  })
})
