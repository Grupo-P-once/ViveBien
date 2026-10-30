import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Reporte quincenal: el cron y el envío manual. NINGUNA de estas pruebas manda un mensaje real: `avisar` está simulado y `fetch` falla si alguien lo llama.
 */
type Perfil = { uid: string; email: string; rol: string; superAdmin: boolean }
const estado = vi.hoisted(() => ({
  perfil: null as null | Perfil,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  reserva: { data: { resultado: 'ok' } as unknown, error: null as null | { message: string } },
  libro: true,
  avisos: [] as unknown[],
  avisarOk: true,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  return {
    ...real,
    exigir: async (_req: Request, permiso: string) => (estado.perfil && puede(estado.perfil as never, permiso as never)
      ? { perfil: estado.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: estado.perfil ? 403 : 401 }) }),
    supabaseAdmin: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpc.push({ fn, args }); return fn === 'contab_reporte_reservar' ? estado.reserva : { data: { resultado: 'ok' }, error: null } } }),
  }
})
vi.mock('@/lib/contabilidad-servidor', async (original) => {
  const real = await original<typeof import('../src/lib/contabilidad-servidor')>()
  return { ...real, leerLibro: async () => (estado.libro ? { operaciones: [], movimientos: [], cuentas: [], etiquetasDePropiedad: {}, propiedades: {}, truncado: false } : null) }
})
vi.mock('@/lib/alertas', () => ({ avisar: async (a: unknown) => { estado.avisos.push(a); return estado.avisarOk } }))

const SUPER: Perfil = { uid: 'su-rep', email: 'super@vb.mx', rol: 'admin', superAdmin: true }
const ADMIN: Perfil = { uid: 'ad-rep', email: 'admin@vb.mx', rol: 'admin', superAdmin: false }
const original = { ...process.env }
let contador = 0
const cron = (autorizacion?: string) => new Request('https://vb.test/api/alertas/contabilidad-quincenal', { headers: autorizacion ? { authorization: autorizacion } : {} })
const manual = (cuerpo: unknown) => new Request('https://vb.test/api/admin/contabilidad/reporte', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })

beforeEach(() => {
  estado.perfil = { ...SUPER, uid: `su-rep-${++contador}` }; estado.rpc = []; estado.avisos = []; estado.avisarOk = true; estado.libro = true
  estado.reserva = { data: { resultado: 'ok' }, error: null }
  process.env.CRON_SECRET = 'secreto-de-prueba'
  process.env.TELEGRAM_BOT_TOKEN = 'token-falso'; process.env.TELEGRAM_CHAT_ALERTAS = 'chat-falso'
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Una prueba intentó salir a la red') }))
})
afterEach(() => { process.env = { ...original }; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('cron quincenal', () => {
  it('sin el secreto, o con uno equivocado, responde 401 y no hace nada; sin CRON_SECRET configurado, también (falla cerrado)', async () => {
    const { GET } = await import('../src/app/api/alertas/contabilidad-quincenal/route')
    expect((await GET(cron())).status).toBe(401)
    expect((await GET(cron('Bearer otro'))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await GET(cron('Bearer undefined'))).status).toBe(401)
    expect((await GET(cron('Bearer '))).status).toBe(401)
    expect(estado.avisos).toHaveLength(0); expect(estado.rpc).toHaveLength(0)
  })
  it('reserva la quincena, manda UN aviso y la marca como enviada', async () => {
    const { GET } = await import('../src/app/api/alertas/contabilidad-quincenal/route')
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, estado: 'enviado' })
    expect(estado.rpc.map((x) => x.fn)).toEqual(['contab_reporte_reservar', 'contab_reporte_marcar_enviado'])
    expect(estado.rpc[0].args).toMatchObject({ p_tipo: 'quincenal', p_origen: 'cron' })
    expect(estado.avisos).toHaveLength(1)
  })
  it('si la quincena ya se envió, no manda otra vez', async () => {
    const { GET } = await import('../src/app/api/alertas/contabilidad-quincenal/route')
    estado.reserva = { data: { resultado: 'ya_enviado' }, error: null }
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(await r.json()).toMatchObject({ ok: true, estado: 'ya_enviado' })
    expect(estado.avisos).toHaveLength(0)
  })
  it('sin Telegram configurado no reserva ni manda (para poder enviarla cuando se configure)', async () => {
    const { GET } = await import('../src/app/api/alertas/contabilidad-quincenal/route')
    delete process.env.TELEGRAM_BOT_TOKEN
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(await r.json()).toMatchObject({ ok: false, estado: 'telegram_sin_configurar' })
    expect(estado.rpc).toHaveLength(0); expect(estado.avisos).toHaveLength(0)
  })
  it('si falta la migración 50 (la reserva falla) NO manda nada', async () => {
    const { GET } = await import('../src/app/api/alertas/contabilidad-quincenal/route')
    estado.reserva = { data: null, error: { message: 'function public.contab_reporte_reservar does not exist' } }
    expect((await GET(cron('Bearer secreto-de-prueba'))).status).toBe(503)
    expect(estado.avisos).toHaveLength(0)
  })
  it('si Telegram rechaza el mensaje, responde 502 y NO la marca como enviada (se reintenta)', async () => {
    const { GET } = await import('../src/app/api/alertas/contabilidad-quincenal/route')
    estado.avisarOk = false
    expect((await GET(cron('Bearer secreto-de-prueba'))).status).toBe(502)
    expect(estado.rpc.map((x) => x.fn)).toEqual(['contab_reporte_reservar'])
  })
})

describe('reporte manual (Super Admin)', () => {
  it('la vista previa no manda nada', async () => {
    const { GET } = await import('../src/app/api/admin/contabilidad/reporte/route')
    const r = await GET(new Request('https://vb.test/api/admin/contabilidad/reporte'))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ telegram: { configurado: true }, alerta: { titulo: expect.stringContaining('quincena') } })
    expect(estado.avisos).toHaveLength(0); expect(estado.rpc).toHaveLength(0)
  })
  it('enviar exige confirmar: true', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/reporte/route')
    expect((await POST(manual({}))).status).toBe(400)
    expect((await POST(manual({ confirmar: 'si' }))).status).toBe(400)
    expect(estado.avisos).toHaveLength(0)
  })
  it('con confirmación manda un aviso; si el cron ya la envió, responde 409 y no duplica', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/reporte/route')
    expect((await POST(manual({ confirmar: true }))).status).toBe(200)
    expect(estado.rpc[0].args).toMatchObject({ p_origen: 'manual' })
    expect(estado.avisos).toHaveLength(1)
    estado.reserva = { data: { resultado: 'ya_enviado' }, error: null }
    expect((await POST(manual({ confirmar: true }))).status).toBe(409)
    expect(estado.avisos).toHaveLength(1)
  })
  it('un administrador que no es Super Admin recibe 403 en ambas', async () => {
    const { GET, POST } = await import('../src/app/api/admin/contabilidad/reporte/route')
    estado.perfil = { ...ADMIN }
    expect((await GET(new Request('https://vb.test/x'))).status).toBe(403)
    expect((await POST(manual({ confirmar: true }))).status).toBe(403)
    expect(estado.avisos).toHaveLength(0)
  })
  it('tiene tope de envíos por hora', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/reporte/route')
    estado.perfil = { ...SUPER, uid: 'su-tope-reporte' }
    estado.reserva = { data: { resultado: 'en_curso' }, error: null }
    const estados: number[] = []
    for (let i = 0; i < 5; i++) estados.push((await POST(manual({ confirmar: true }))).status)
    expect(estados.slice(3)).toEqual([429, 429])
  })
})
