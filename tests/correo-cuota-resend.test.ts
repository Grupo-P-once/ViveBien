import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cuotaDeCabeceras } from '../src/lib/correo/resend'
import { ACTOR_DE_ENVIO, ESTRANGULADOR_MS, NOTA_DE_ENVIO, registrarCuotaVista, reiniciarEstranguladorDeCuota } from '../src/lib/correo/cuota-resend'
import { enviarCorreo, type DbCorreo, type SolicitudCorreo } from '../src/lib/correo/enviar'
import type { EntornoCorreo } from '../src/lib/correo/config'

/**
 * Lectura automática del consumo de Resend (D-82). NINGUNA prueba sale a la red: `fetch` es un doble. La llave que se usa aquí es inventada.
 */
const LLAVE = 're_llave_inventada_para_pruebas'

/** Doble de `from('correo_envios').select(…).eq().eq().gte()` que termina en `{ count }` (los envíos «pendiente» en vuelo). */
const enVuelo = (count: number | null, error: { message: string } | null = null, rastro?: { tabla?: string; filtros: Array<[string, unknown]> }) => (tabla: string) => {
  if (rastro) rastro.tabla = tabla
  const c = { select: () => c, eq: (k: string, v: unknown) => { rastro?.filtros.push([k, v]); return c }, gte: async (k: string, v: unknown) => { rastro?.filtros.push([k, typeof v]); return { count, error } } }
  return c
}
const bd = (rpc: DbCorreo['rpc'], pendientes: number | null = 0): DbCorreo => ({ rpc, from: enVuelo(pendientes) as unknown as DbCorreo['from'] })

describe('cuotaDeCabeceras (las cabeceras de la respuesta de un envío)', () => {
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
