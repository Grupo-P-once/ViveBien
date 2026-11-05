import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cuotaDeCabeceras, leerCuotaDeResend, URL_RESEND } from '../src/lib/correo/resend'
import { ACTOR_AUTOMATICO, ACTOR_DE_ENVIO, conciliarCuotaDeResend, ESTRANGULADOR_MS, NOTA_AUTOMATICA, NOTA_DE_ENVIO, registrarCuotaVista, reiniciarEstranguladorDeCuota } from '../src/lib/correo/cuota-resend'
import { enviarCorreo, type DbCorreo, type SolicitudCorreo } from '../src/lib/correo/enviar'
import type { EntornoCorreo } from '../src/lib/correo/config'

/**
 * Lectura automática del consumo de Resend (D-82). NINGUNA prueba sale a la red: `fetch` es un doble. La llave que se usa aquí es inventada.
 */
const LLAVE = 're_llave_inventada_para_pruebas'
const PRODUCCION = { VERCEL_ENV: 'production' }
const respuesta = (cabeceras: Record<string, string>, estado = 422) => new Response(JSON.stringify({ name: 'missing_required_field' }), { status: estado, headers: cabeceras })
const dobleFetch = (r: Response | Error) => vi.fn<typeof fetch>(async () => { if (r instanceof Error) throw r; return r.clone() })

describe('leerCuotaDeResend', () => {
  it('fuera de producción NO toca la red (ni con llave ni con fetch inyectado)', async () => {
    const f = dobleFetch(respuesta({ 'x-resend-daily-quota': '1', 'x-resend-monthly-quota': '2' }))
    for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) {
      expect(await leerCuotaDeResend({ apiKey: LLAVE, fetch: f as unknown as typeof fetch, env })).toEqual({ ok: false, motivo: 'fuera_de_produccion' })
    }
    expect(f).not.toHaveBeenCalled()
  })

  it('sin llave no llama al proveedor', async () => {
    const f = dobleFetch(respuesta({}))
    expect(await leerCuotaDeResend({ apiKey: '  ', fetch: f as unknown as typeof fetch, env: PRODUCCION })).toEqual({ ok: false, motivo: 'sin_llave' })
    expect(await leerCuotaDeResend({ fetch: f as unknown as typeof fetch, env: PRODUCCION })).toEqual({ ok: false, motivo: 'sin_llave' })
    expect(f).not.toHaveBeenCalled()
  })

  it('lee los enteros de las dos cabeceras y la petición NO puede enviar un correo: cuerpo vacío, un solo POST a /emails', async () => {
    const f = dobleFetch(respuesta({ 'x-resend-daily-quota': '3', 'x-resend-monthly-quota': '31', 'ratelimit-limit': '10' }))
    const r = await leerCuotaDeResend({ apiKey: LLAVE, fetch: f as unknown as typeof fetch, env: PRODUCCION })
    expect(r).toEqual({ ok: true, dia: 3, mes: 31 })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe(URL_RESEND)
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{}') // sin remitente, destinatario ni asunto: Resend lo rechaza por validación y no manda nada
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('to')
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${LLAVE}`)
    expect(init?.signal).toBeInstanceOf(AbortSignal) // tiene tope de tiempo
  })

  it('acepta cero (cuenta nueva) y espacios alrededor', async () => {
    const f = dobleFetch(respuesta({ 'x-resend-daily-quota': ' 0 ', 'x-resend-monthly-quota': '0' }))
    expect(await leerCuotaDeResend({ apiKey: LLAVE, fetch: f as unknown as typeof fetch, env: PRODUCCION })).toEqual({ ok: true, dia: 0, mes: 0 })
  })

  it('si falta una cabecera NO inventa nada: dice cuál y qué cabeceras de Resend sí llegaron (sólo nombres)', async () => {
    const sinDia = await leerCuotaDeResend({ apiKey: LLAVE, env: PRODUCCION, fetch: dobleFetch(respuesta({ 'x-resend-monthly-quota': '9', 'ratelimit-limit': '10', 'content-type': 'x' }, 401)) as unknown as typeof fetch })
    expect(sinDia).toEqual({ ok: false, motivo: 'sin_cabecera_diaria', estado: 401, cabeceras: ['ratelimit-limit', 'x-resend-monthly-quota'] })
    const sinMes = await leerCuotaDeResend({ apiKey: LLAVE, env: PRODUCCION, fetch: dobleFetch(respuesta({ 'x-resend-daily-quota': '9' })) as unknown as typeof fetch })
    expect(sinMes).toMatchObject({ ok: false, motivo: 'sin_cabecera_mensual', estado: 422 })
  })

  it.each(['12/100', '-1', '1e3', '', '3.5', 'abc', '99999999', '1 2'])('un valor que no es un entero limpio (%j) no se guarda', async (valor) => {
    const r = await leerCuotaDeResend({ apiKey: LLAVE, env: PRODUCCION, fetch: dobleFetch(respuesta({ 'x-resend-daily-quota': valor, 'x-resend-monthly-quota': '5' })) as unknown as typeof fetch })
    expect(r).toMatchObject({ ok: false, motivo: 'cabecera_invalida' })
  })

  it('un fallo de red o un tiempo agotado devuelve «red», sin lanzar', async () => {
    expect(await leerCuotaDeResend({ apiKey: LLAVE, env: PRODUCCION, fetch: dobleFetch(new Error('boom')) as unknown as typeof fetch })).toEqual({ ok: false, motivo: 'red' })
  })

  it('el resultado nunca contiene la llave', async () => {
    const f = dobleFetch(respuesta({ 'x-resend-daily-quota': 'x', 'x-resend-monthly-quota': '1' }))
    const r = await leerCuotaDeResend({ apiKey: LLAVE, env: PRODUCCION, fetch: f as unknown as typeof fetch })
    expect(JSON.stringify(r)).not.toContain(LLAVE)
  })
})

/** Doble de `from('correo_envios').select(…).eq().eq().gte()` que termina en `{ count }` (los envíos «pendiente» en vuelo). */
const enVuelo = (count: number | null, error: { message: string } | null = null, rastro?: { tabla?: string; filtros: Array<[string, unknown]> }) => (tabla: string) => {
  if (rastro) rastro.tabla = tabla
  const c = { select: () => c, eq: (k: string, v: unknown) => { rastro?.filtros.push([k, v]); return c }, gte: async (k: string, v: unknown) => { rastro?.filtros.push([k, typeof v]); return { count, error } } }
  return c
}
const bd = (rpc: DbCorreo['rpc'], pendientes: number | null = 0): DbCorreo => ({ rpc, from: enVuelo(pendientes) as unknown as DbCorreo['from'] })

describe('conciliarCuotaDeResend', () => {
  it('guarda por la MISMA función SQL que el panel, con actor y nota automáticos', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 5, dia: 2, mes: 30 }, error: null }))
    const f = dobleFetch(respuesta({ 'x-resend-daily-quota': '2', 'x-resend-monthly-quota': '30' }))
    const r = await conciliarCuotaDeResend(bd(rpc as unknown as DbCorreo['rpc']), { apiKey: LLAVE, fetch: f as unknown as typeof fetch, env: PRODUCCION })
    expect(r).toEqual({ ok: true, dia: 2, mes: 30 })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('correo_conciliar', { p_dia: 2, p_mes: 30, p_actor: ACTOR_AUTOMATICO, p_nota: NOTA_AUTOMATICA })
    expect(ACTOR_AUTOMATICO).toMatch(/^automatico:/) // jamás se confunde con el uid de una persona
  })

  it('si no se pudo leer, NO escribe nada en la base', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 1 }, error: null }))
    const casos: Array<[string, Response | Error]> = [['sin_cabecera_diaria', respuesta({})], ['red', new Error('x')]]
    for (const [motivo, r] of casos) {
      const res = await conciliarCuotaDeResend(bd(rpc as unknown as DbCorreo['rpc']), { apiKey: LLAVE, fetch: dobleFetch(r) as unknown as typeof fetch, env: PRODUCCION })
      expect(res).toMatchObject({ ok: false, motivo })
    }
    expect(await conciliarCuotaDeResend(bd(rpc as unknown as DbCorreo['rpc']), { apiKey: LLAVE, env: {} })).toMatchObject({ ok: false, motivo: 'fuera_de_produccion' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('si la base falla (error, sin datos o excepción) dice «no_se_guardo» y no lanza', async () => {
    const f = () => dobleFetch(respuesta({ 'x-resend-daily-quota': '1', 'x-resend-monthly-quota': '1' })) as unknown as typeof fetch
    for (const rpc of [
      async () => ({ data: null, error: { message: 'falta la función' } }),
      async () => ({ data: null, error: null }),
      async () => { throw new Error('caída') },
    ]) {
      expect(await conciliarCuotaDeResend(bd(rpc as unknown as DbCorreo['rpc']), { apiKey: LLAVE, fetch: f(), env: PRODUCCION })).toEqual({ ok: false, motivo: 'no_se_guardo' })
    }
  })
})

describe('cuotaDeCabeceras (lo que comparten la sonda diaria y los envíos)', () => {
  it('lee las dos cabeceras sin importar mayúsculas y acepta sólo enteros limpios', () => {
    expect(cuotaDeCabeceras(new Headers({ 'X-Resend-Daily-Quota': '7', 'X-Resend-Monthly-Quota': '70' }))).toEqual({ ok: true, dia: 7, mes: 70 })
    expect(cuotaDeCabeceras(new Headers({ 'x-resend-monthly-quota': '70' }))).toMatchObject({ ok: false, motivo: 'sin_cabecera_diaria' })
    expect(cuotaDeCabeceras(new Headers({ 'x-resend-daily-quota': '1', 'x-resend-monthly-quota': '7/10' }))).toMatchObject({ ok: false, motivo: 'cabecera_invalida', crudo: { dia: '1', mes: '7/10' } })
  })
  it('el diagnóstico de un valor raro no deja pasar caracteres de control ni más de 24', () => {
    const r = cuotaDeCabeceras(new Headers({ 'x-resend-daily-quota': 'a'.repeat(80), 'x-resend-monthly-quota': '1' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.crudo?.dia).toHaveLength(24)
  })
})

describe('registrarCuotaVista (cada envío real exitoso)', () => {
  const CABECERAS = new Headers({ 'x-resend-daily-quota': '5', 'x-resend-monthly-quota': '50' })
  beforeEach(() => reiniciarEstranguladorDeCuota())

  it('guarda una lectura con actor propio y, durante 10 minutos, no vuelve a escribir', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 9 }, error: null }))
    const db = bd(rpc as unknown as DbCorreo['rpc'])
    expect(await registrarCuotaVista(db, CABECERAS, 1_000_000)).toBe(true)
    expect(rpc).toHaveBeenCalledWith('correo_conciliar', { p_dia: 5, p_mes: 50, p_actor: ACTOR_DE_ENVIO, p_nota: NOTA_DE_ENVIO })
    expect(await registrarCuotaVista(db, CABECERAS, 1_000_000 + ESTRANGULADOR_MS - 1)).toBe(false)
    expect(await registrarCuotaVista(db, CABECERAS, 1_000_000 + ESTRANGULADOR_MS)).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('sin cabeceras de cuota (respuesta simulada, plan de pago o error) no escribe y NO consume el turno del estrangulador', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 1 }, error: null }))
    const db = bd(rpc as unknown as DbCorreo['rpc'])
    expect(await registrarCuotaVista(db, new Headers(), 5_000_000)).toBe(false)
    expect(await registrarCuotaVista(db, new Headers({ 'x-resend-monthly-quota': '4' }), 5_000_001)).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(await registrarCuotaVista(db, CABECERAS, 5_000_002)).toBe(true)
  })
  it('si la base falla no lanza y el siguiente envío vuelve a intentarlo', async () => {
    let falla = true
    const rpc = vi.fn(async () => { if (falla) throw new Error('caída'); return { data: { id: 2 }, error: null } })
    const db = bd(rpc as unknown as DbCorreo['rpc'])
    expect(await registrarCuotaVista(db, CABECERAS, 9_000_000)).toBe(false)
    falla = false
    expect(await registrarCuotaVista(db, CABECERAS, 9_000_001)).toBe(true)
  })
  it('P1 (Codex): SUMA a la lectura los envíos de producción «pendiente» en vuelo, para que ninguno quede sin contar', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 3 }, error: null }))
    const rastro = { filtros: [] as Array<[string, unknown]> } as { tabla?: string; filtros: Array<[string, unknown]> }
    const db: DbCorreo = { rpc: rpc as unknown as DbCorreo['rpc'], from: enVuelo(3, null, rastro) as unknown as DbCorreo['from'] }
    expect(await registrarCuotaVista(db, CABECERAS, 2_000_000)).toBe(true)
    expect(rpc).toHaveBeenCalledWith('correo_conciliar', { p_dia: 5 + 3, p_mes: 50 + 3, p_actor: ACTOR_DE_ENVIO, p_nota: NOTA_DE_ENVIO })
    expect(rastro.tabla).toBe('correo_envios')
    expect(rastro.filtros).toEqual([['entorno', 'produccion'], ['estado', 'pendiente'], ['creado_en', 'string']])
  })
  it('P1: si no se puede contar lo que está en vuelo (error, sin conteo o excepción) NO guarda nada', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 3 }, error: null }))
    for (const from of [enVuelo(null), enVuelo(1, { message: 'x' }), () => { throw new Error('caída') }]) {
      reiniciarEstranguladorDeCuota()
      expect(await registrarCuotaVista({ rpc: rpc as unknown as DbCorreo['rpc'], from: from as unknown as DbCorreo['from'] }, CABECERAS, 3_000_000)).toBe(false)
    }
    expect(rpc).not.toHaveBeenCalled()
  })
  it('P2 (Codex): si la base se cuelga, el envío no espera más del tope y el siguiente vuelve a intentarlo', async () => {
    const colgada = vi.fn(() => new Promise<never>(() => undefined)) // nunca responde
    const t0 = Date.now()
    expect(await registrarCuotaVista(bd(colgada as unknown as DbCorreo['rpc']), CABECERAS, 4_000_000, 40)).toBe(false)
    expect(Date.now() - t0).toBeLessThan(1500)
    const rpc = vi.fn(async () => ({ data: { id: 4 }, error: null }))
    expect(await registrarCuotaVista(bd(rpc as unknown as DbCorreo['rpc']), CABECERAS, 4_000_001)).toBe(true)
  })
  it('unas cabeceras que no existen (respuesta de otro tipo) no lanzan', async () => {
    const db = bd((async () => ({ data: { id: 1 }, error: null })) as unknown as DbCorreo['rpc'])
    expect(await registrarCuotaVista(db, undefined as unknown as Headers)).toBe(false)
  })
})

describe('integración: un envío real exitoso refresca la lectura sin cambiar su resultado', () => {
  const ENV = { transaccional: true, marketing: false, resendKey: LLAVE, secreto: '', webhookSecret: '', remitente: null, remitenteMarketing: null } as EntornoCorreo
  const SOLICITUD: SolicitudCorreo = { clave: 'bienvenida/uid-cuota', categoria: 'transaccional', tipo: 'bienvenida', para: 'persona@ejemplo.test', asunto: 'Hola', html: '<p>hola</p>', texto: 'hola' }
  const fabricaDb = (conciliar: () => Promise<{ data: unknown; error: null }>) => {
    const fns: string[] = []
    const db: DbCorreo = {
      rpc: async (fn) => { fns.push(fn); return fn === 'correo_reservar_envio' ? { data: { accion: 'enviar', id: 3 }, error: null } : fn === 'correo_conciliar' ? conciliar() : { data: null, error: null } },
      from: enVuelo(0) as unknown as DbCorreo['from'],
    }
    return { db, fns }
  }
  const conCuota = () => vi.fn<typeof fetch>(async () => new Response('{"id":"re_9"}', { status: 200, headers: { 'x-resend-daily-quota': '6', 'x-resend-monthly-quota': '60' } }))
  beforeEach(() => { reiniciarEstranguladorDeCuota(); process.env.CORREO_ENVIO = '1' })
  afterEach(() => { delete process.env.CORREO_ENVIO })

  it('enviarCorreo: tras marcar «enviado» registra la lectura de la respuesta', async () => {
    const { db, fns } = fabricaDb(async () => ({ data: { id: 1 }, error: null }))
    const r = await enviarCorreo(db, SOLICITUD, { entorno: ENV, fetch: conCuota(), entornoCupo: 'produccion' })
    expect(r).toEqual({ estado: 'enviado' })
    expect(fns).toEqual(['correo_reservar_envio', 'correo_marcar_envio', 'correo_conciliar'])
  })
  it('enviarCorreo: si guardar la lectura FALLA, el envío sigue siendo «enviado»', async () => {
    const { db } = fabricaDb(async () => { throw new Error('caída de la base') })
    expect(await enviarCorreo(db, SOLICITUD, { entorno: ENV, fetch: conCuota(), entornoCupo: 'produccion' })).toEqual({ estado: 'enviado' })
  })
  it('enviarCorreo: un envío RECHAZADO por el proveedor no guarda ninguna lectura', async () => {
    const { db, fns } = fabricaDb(async () => ({ data: { id: 1 }, error: null }))
    const rechazo = vi.fn<typeof fetch>(async () => new Response('{}', { status: 422, headers: { 'x-resend-daily-quota': '6', 'x-resend-monthly-quota': '60' } }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await enviarCorreo(db, SOLICITUD, { entorno: ENV, fetch: rechazo, entornoCupo: 'produccion' })).estado).toBe('error')
    expect(fns).not.toContain('correo_conciliar')
  })
})

const estado = vi.hoisted(() => ({ rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>, rpcResp: { data: { id: 1 } as unknown, error: null as null | { message: string } }, avisos: [] as unknown[] }))
vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  return { ...real, supabaseAdmin: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpc.push({ fn, args }); return estado.rpcResp }, from: () => { const c = { select: () => c, eq: () => c, gte: async () => ({ count: 0, error: null }) }; return c } }) }
})
vi.mock('@/lib/alertas', () => ({ avisar: async (a: unknown) => { estado.avisos.push(a); return true } }))

const cron = (autorizacion?: string) => new Request('https://vb.test/api/alertas/cuota-resend', { headers: autorizacion ? { authorization: autorizacion } : {} })
const original = { ...process.env }

describe('ruta /api/alertas/cuota-resend', () => {
  beforeEach(() => {
    estado.rpc = []; estado.avisos = []; estado.rpcResp = { data: { id: 1 }, error: null }
    process.env.CRON_SECRET = 'secreto-de-prueba'
    process.env.RESEND_API_KEY = LLAVE
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Una prueba intentó salir a la red') }))
  })
  afterEach(() => { process.env = { ...original }; vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('sin el secreto, con uno equivocado o sin CRON_SECRET configurado: 401 y no hace nada (falla cerrado)', async () => {
    const { GET } = await import('../src/app/api/alertas/cuota-resend/route')
    expect((await GET(cron())).status).toBe(401)
    expect((await GET(cron('Bearer otro'))).status).toBe(401)
    expect((await GET(cron('Bearer secreto-de-prueb'))).status).toBe(401) // un carácter menos
    expect((await GET(cron('bearer secreto-de-prueba'))).status).toBe(401) // el esquema distingue mayúsculas
    delete process.env.CRON_SECRET
    expect((await GET(cron('Bearer undefined'))).status).toBe(401)
    expect((await GET(cron('Bearer '))).status).toBe(401)
    expect(estado.rpc).toHaveLength(0); expect(estado.avisos).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fuera de producción responde sin error, no llama a Resend, no guarda y no alerta', async () => {
    const { GET } = await import('../src/app/api/alertas/cuota-resend/route')
    delete process.env.VERCEL_ENV
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: false, motivo: 'fuera_de_produccion' })
    expect(fetch).not.toHaveBeenCalled(); expect(estado.rpc).toHaveLength(0); expect(estado.avisos).toHaveLength(0)
  })

  it('en producción, con cabeceras válidas: registra UNA lectura automática y devuelve los números', async () => {
    const { GET } = await import('../src/app/api/alertas/cuota-resend/route')
    process.env.VERCEL_ENV = 'production'
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ 'x-resend-daily-quota': '4', 'x-resend-monthly-quota': '33' })))
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, dia: 4, mes: 33 })
    expect(estado.rpc).toEqual([{ fn: 'correo_conciliar', args: { p_dia: 4, p_mes: 33, p_actor: ACTOR_AUTOMATICO, p_nota: NOTA_AUTOMATICA } }])
    expect(estado.avisos).toHaveLength(0)
  })

  it('en producción, si Resend no manda las cabeceras: 502, NO guarda y avisa al grupo (sin llave ni datos personales)', async () => {
    const { GET } = await import('../src/app/api/alertas/cuota-resend/route')
    process.env.VERCEL_ENV = 'production'
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ 'ratelimit-limit': '10' }, 401)))
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(r.status).toBe(502)
    expect(await r.json()).toMatchObject({ ok: false, motivo: 'sin_cabecera_diaria', estado: 401, cabeceras: ['ratelimit-limit'] })
    expect(estado.rpc).toHaveLength(0)
    expect(estado.avisos).toHaveLength(1)
    const texto = JSON.stringify(estado.avisos[0])
    expect(texto).not.toContain(LLAVE); expect(texto).not.toContain('secreto-de-prueba')
    expect(texto).toContain('sin_cabecera_diaria')
  })

  it('en producción, si la base no guarda: 503 y avisa', async () => {
    const { GET } = await import('../src/app/api/alertas/cuota-resend/route')
    process.env.VERCEL_ENV = 'production'
    estado.rpcResp = { data: null, error: { message: 'falta la función' } }
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ 'x-resend-daily-quota': '1', 'x-resend-monthly-quota': '1' })))
    const r = await GET(cron('Bearer secreto-de-prueba'))
    expect(r.status).toBe(503)
    expect(estado.avisos).toHaveLength(1)
  })
})
