import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/citas/tareas (D-4, 5-nov-2026): token propio de un solo propósito, falla cerrado, solo POST, respuesta sin datos.
 * Aquí el servicio y el envío se simulan: lo que se prueba es la frontera de la ruta, no los correos (eso lo cubren
 * `citas-correos`, `publicador-citas` y la base real en staging).
 */

const espias = vi.hoisted(() => ({ vencer: 0, avisar: [] as string[], recordatorios: 0, fallaVencer: false }))
vi.mock('@/lib/citas/servicio', () => ({
  vencerCitas: async () => { espias.vencer++; if (espias.fallaVencer) throw new Error('boom a@b.co'); return { revisadas: 3, expiradas: ['c1', 'c2'] } },
}))
vi.mock('@/lib/citas/enviar', () => ({
  avisarCambio: async (id: string) => { espias.avisar.push(id) },
  procesarRecordatorios: async () => { espias.recordatorios++; return { reclamados: 2, enviados: 2, omitidos: 0, fallidos: 0 } },
}))

describe('D-4 · POST /api/citas/tareas', () => {
  const URL_TAREA = 'https://vivebienn.com/api/citas/tareas'
  const TOKEN = 'x'.repeat(48)
  const peticion = (cabeceras: Record<string, string> = {}, method = 'POST') => new Request(URL_TAREA, { method, headers: cabeceras })

  beforeEach(() => {
    espias.vencer = 0; espias.avisar = []; espias.recordatorios = 0; espias.fallaVencer = false
    vi.unstubAllEnvs()
  })

  it('sin la variable (o con una demasiado corta) responde 503 y no hace nada: falla cerrado', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    vi.stubEnv('CITAS_TAREAS_TOKEN', '')
    expect((await POST(peticion({ authorization: `Bearer ${TOKEN}` }))).status).toBe(503)
    vi.stubEnv('CITAS_TAREAS_TOKEN', 'corto')
    expect((await POST(peticion({ authorization: 'Bearer corto' }))).status).toBe(503)
    expect(espias.vencer + espias.recordatorios).toBe(0)
  })

  it('sin token, con un token distinto o con otro esquema responde 401 y no hace nada', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    vi.stubEnv('CITAS_TAREAS_TOKEN', TOKEN)
    for (const cab of [{}, { authorization: '' }, { authorization: 'Bearer ' }, { authorization: `Bearer ${'y'.repeat(48)}` }, { authorization: `Bearer ${TOKEN}x` }, { authorization: TOKEN.slice(1) }]) {
      expect((await POST(peticion(cab))).status, JSON.stringify(cab)).toBe(401)
    }
    expect(espias.vencer + espias.recordatorios).toBe(0)
  })

  it('con el token correcto hace expirar, avisa a las expiradas y procesa los recordatorios; la respuesta solo trae conteos', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    vi.stubEnv('CITAS_TAREAS_TOKEN', TOKEN)
    const r = await POST(peticion({ authorization: `Bearer ${TOKEN}` }))
    expect(r.status).toBe(200)
    const cuerpo = await r.json()
    expect(cuerpo).toEqual({ ok: true, revisadas: 3, expiradas: 2, recordatorios: { reclamados: 2, enviados: 2, omitidos: 0, fallidos: 0 } })
    expect(espias.avisar).toEqual(['c1', 'c2'])
    expect(espias.recordatorios).toBe(1)
    expect(JSON.stringify(cuerpo)).not.toMatch(/"c1"|"c2"|@/)   // ni ids de cita ni direcciones
  })

  it('un fallo interno responde 500 sin detalles, sin direcciones y sin el token', async () => {
    const { POST } = await import('../src/app/api/citas/tareas/route')
    vi.stubEnv('CITAS_TAREAS_TOKEN', TOKEN)
    espias.fallaVencer = true
    const r = await POST(peticion({ authorization: `Bearer ${TOKEN}` }))
    expect(r.status).toBe(500)
    const texto = JSON.stringify(await r.json())
    expect(texto).not.toContain(TOKEN)
    expect(texto).not.toContain('a@b.co')
  })

  it('solo POST: no existe GET (un rastreador o una previsualización no ejecuta nada)', async () => {
    const modulo = await import('../src/app/api/citas/tareas/route') as Record<string, unknown>
    expect(modulo.GET).toBeUndefined()
    expect(modulo.PUT).toBeUndefined()
    expect(modulo.DELETE).toBeUndefined()
  })
})
