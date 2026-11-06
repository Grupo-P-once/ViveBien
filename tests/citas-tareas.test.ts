import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/citas/tareas (D-4, 5-nov-2026): no viaja ningún secreto; el cron manda tiempo + firma HMAC y la BASE decide.
 * Falla cerrado, solo POST, respuesta sin datos. Aquí la base, el servicio y el envío se simulan: se prueba la frontera de la ruta.
 */

const espias = vi.hoisted(() => ({
  vencer: 0, avisar: [] as string[], recordatorios: 0, fallaVencer: false,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  respuestaRpc: { data: true, error: null } as { data: unknown; error: { code?: string; message?: string } | null },
}))
vi.mock('@/lib/auth-server', () => ({
  supabaseAdmin: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => { espias.rpc.push({ fn, args }); return espias.respuestaRpc },
  }),
}))
vi.mock('@/lib/citas/servicio', () => ({
  vencerCitas: async () => { espias.vencer++; if (espias.fallaVencer) throw new Error('boom a@b.co'); return { revisadas: 3, expiradas: ['c1', 'c2'] } },
}))
vi.mock('@/lib/citas/enviar', () => ({
  avisarCambio: async (id: string) => { espias.avisar.push(id) },
  procesarRecordatorios: async () => { espias.recordatorios++; return { reclamados: 2, enviados: 2, omitidos: 0, fallidos: 0 } },
}))

describe('D-4 · POST /api/citas/tareas', () => {
  const T = '1793912400'
  const F = 'ab'.repeat(32)
  const peticion = (cabeceras: Record<string, string> = {}) => new Request('https://vivebienn.com/api/citas/tareas', { method: 'POST', headers: cabeceras })
  const valida = { 'x-citas-tiempo': T, 'x-citas-firma': F }
  const hizoAlgo = () => espias.vencer + espias.recordatorios + espias.avisar.length

  beforeEach(() => {
    espias.vencer = 0; espias.avisar = []; espias.recordatorios = 0; espias.fallaVencer = false; espias.rpc = []
    espias.respuestaRpc = { data: true, error: null }
  })

  it('sin tiempo o sin firma, o con algo que no tiene su forma: 401, sin ir siquiera a la base', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    const malas = [
      {}, { 'x-citas-tiempo': T }, { 'x-citas-firma': F },
      { 'x-citas-tiempo': '', 'x-citas-firma': F }, { 'x-citas-tiempo': T, 'x-citas-firma': '' },
      { 'x-citas-tiempo': '123', 'x-citas-firma': F }, { 'x-citas-tiempo': '17939124000', 'x-citas-firma': F }, { 'x-citas-tiempo': '1793912x00', 'x-citas-firma': F },
      { 'x-citas-tiempo': T, 'x-citas-firma': 'AB'.repeat(32) }, { 'x-citas-tiempo': T, 'x-citas-firma': F.slice(1) }, { 'x-citas-tiempo': T, 'x-citas-firma': F + '0' },
      { 'x-citas-tiempo': T, 'x-citas-firma': "' or 1=1 --".padEnd(64, 'a') },
      { authorization: `Bearer ${'x'.repeat(48)}` },   // el esquema anterior (token reutilizable) ya no existe
    ]
    for (const cab of malas) expect((await POST(peticion(cab))).status, JSON.stringify(cab).slice(0, 70)).toBe(401)
    expect(espias.rpc).toHaveLength(0)
    expect(hizoAlgo()).toBe(0)
  })

  it('una firma con forma válida que la base rechaza (mala, vieja o repetida): 401 y no hace nada', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    espias.respuestaRpc = { data: false, error: null }
    expect((await POST(peticion(valida))).status).toBe(401)
    expect(espias.rpc).toEqual([{ fn: 'citas_tarea_firma_valida', args: { p_tiempo: Number(T), p_firma: F } }])
    expect(hizoAlgo()).toBe(0)
    // Cualquier cosa que no sea exactamente `true` (null, 1, 'true') también cierra.
    for (const raro of [null, 1, 'true', undefined]) {
      espias.respuestaRpc = { data: raro, error: null }
      expect((await POST(peticion(valida))).status, String(raro)).toBe(401)
    }
    expect(hizoAlgo()).toBe(0)
  })

  it('si la base no puede validar (migración sin aplicar, caída): 503 sin ejecutar nada y sin repetir la firma en el registro', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {})
    espias.respuestaRpc = { data: null, error: { code: '42883', message: `function citas_tarea_firma_valida(p_tiempo => ${T}, p_firma => '${F}') does not exist` } }
    const r = await POST(peticion(valida))
    expect(r.status).toBe(503)
    expect(hizoAlgo()).toBe(0)
    expect(JSON.stringify(registro.mock.calls)).not.toContain(F)
    expect(JSON.stringify(await r.json())).not.toContain(F)
    registro.mockRestore()
  })

  it('con la firma válida hace expirar, avisa a las expiradas y procesa los recordatorios; la respuesta solo trae conteos', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    const r = await POST(peticion(valida))
    expect(r.status).toBe(200)
    const cuerpo = await r.json()
    expect(cuerpo).toEqual({ ok: true, revisadas: 3, expiradas: 2, recordatorios: { reclamados: 2, enviados: 2, omitidos: 0, fallidos: 0 } })
    expect(espias.avisar).toEqual(['c1', 'c2'])
    expect(espias.recordatorios).toBe(1)
    expect(JSON.stringify(cuerpo)).not.toMatch(/"c1"|"c2"|@/)   // ni ids de cita ni direcciones
  })

  it('un fallo interno responde 500 sin detalles, sin direcciones y sin la firma', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {})
    espias.fallaVencer = true
    const r = await POST(peticion(valida))
    expect(r.status).toBe(500)
    const texto = JSON.stringify(await r.json())
    expect(texto).not.toContain(F)
    expect(texto).not.toContain('a@b.co')
    expect(JSON.stringify(registro.mock.calls)).not.toContain(F)
    registro.mockRestore()
  })

  it('solo POST: no existe GET (un rastreador o una previsualización no ejecuta nada)', async () => {
    const modulo = await import('../src/app/api/citas/tareas/route') as Record<string, unknown>
    expect(modulo.GET).toBeUndefined()
    expect(modulo.PUT).toBeUndefined()
    expect(modulo.DELETE).toBeUndefined()
  })

  it('la ruta no lee ninguna variable de entorno: el secreto no está en Vercel', async () => {
    const { readFileSync } = await import('node:fs')
    const codigo = readFileSync(new URL('../src/app/api/citas/tareas/route.ts', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(codigo).not.toMatch(/process\.env/)
  })
})
