import { afterEach, describe, expect, it, vi } from 'vitest'
import { pedirRelleno } from '@/lib/contabilidad-ia'

/** Si el proveedor rechaza el esfuerzo de razonamiento (400), se reintenta una vez sin él; el error de la pantalla dice qué código contestó. */
const FALSA = 'llave-de-prueba-falsa'
const entorno = { INCEPTION_API_KEY: FALSA, CONTABILIDAD_IA_PROVEEDOR: 'inception' }
const ok = (t: string) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: t } }] }) }) as unknown as Response
const mal = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('pedirRelleno · reintento sin reasoning_effort', () => {
  it('un 400 se reintenta sin el esfuerzo y funciona', async () => {
    const f = vi.fn().mockResolvedValueOnce(mal(400)).mockResolvedValueOnce(ok('{"tipo":"movimiento"}'))
    vi.stubGlobal('fetch', f)
    const r = await pedirRelleno('sistema', 'gasté 10 en papelería', { entorno })
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
    expect(JSON.parse(f.mock.calls[0][1].body)).toHaveProperty('reasoning_effort')
    expect(JSON.parse(f.mock.calls[1][1].body)).not.toHaveProperty('reasoning_effort')
  })
  it('un 500 no se reintenta y el error dice el código sin repetir la llave', async () => {
    const f = vi.fn().mockResolvedValue(mal(500))
    vi.stubGlobal('fetch', f)
    const r = await pedirRelleno('sistema', 'gasté 10 en papelería', { entorno })
    expect(r.ok).toBe(false)
    expect(f).toHaveBeenCalledTimes(1)
    if (!r.ok) { expect(r.error).toContain('500'); expect(r.error).not.toContain(FALSA) }
  })
})
