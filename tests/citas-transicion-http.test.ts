import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/citas/[id]/transicion — contrato HTTP de la ruta (el SQL `cita_transicionar` y las reglas por rol se prueban en citas-db / citas-matriz-roles).
 * Se simula SOLO la capa de servicio y los avisos; la validación de entrada, los códigos y el 409 por versión son los de la ruta real.
 */
const estado = vi.hoisted(() => ({
  perfil: { uid: 'u1', rol: 'cliente', superAdmin: false, estado: 'activo', capacidades: {} } as Record<string, unknown>,
  respuesta: { ok: true, valor: { id: '11111111-1111-4111-8111-111111111111', version: 3, estado: 'CONFIRMED' } } as Record<string, unknown>,
  llamadas: [] as Array<Record<string, unknown>>,
  denegados: [] as string[],
  avisos: [] as unknown[][],
}))
const ID = '11111111-1111-4111-8111-111111111111'

vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => void) => { fn() } }))
vi.mock('@/lib/auth-server', () => ({
  exigir: async () => ({ perfil: estado.perfil }),
  registrarIntentoDenegado: async (_p: unknown, _r: unknown, que: string) => { estado.denegados.push(que) },
}))
vi.mock('@/lib/limites', () => ({ frenarAsync: async () => null, TOPES: { citas: {} } }))
vi.mock('@/lib/citas/enviar', () => ({ avisarCambio: async (...a: unknown[]) => { estado.avisos.push(a) } }))
vi.mock('@/lib/citas/servicio', async (orig) => ({
  ...(await orig<typeof import('@/lib/citas/servicio')>()),
  transicionar: async (o: Record<string, unknown>) => { estado.llamadas.push(o); return estado.respuesta },
}))

async function llamar(cuerpo: unknown, id = ID) {
  const { POST } = await import('../src/app/api/citas/[id]/transicion/route')
  return POST(new Request(`https://vivebienn.com/api/citas/${id}/transicion`, { method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }), { params: Promise.resolve({ id }) })
}
beforeEach(() => {
  estado.perfil = { uid: 'u1', rol: 'cliente', superAdmin: false, estado: 'activo', capacidades: {} }
  estado.respuesta = { ok: true, valor: { id: ID, version: 3, estado: 'CONFIRMED' } }
  estado.llamadas = []; estado.denegados = []; estado.avisos = []
})

describe('/api/citas/[id]/transicion', () => {
  it('versión desfasada: 409 con la cita como quedó, para que la pantalla se recargue', async () => {
    estado.respuesta = { ok: false, status: 409, error: 'Esta visita cambió. Revisa cómo quedó.', cita: { id: ID, version: 5, estado: 'CANCELLED' } }
    const r = await llamar({ accion: 'cancelar', version: 2 })
    expect(r.status).toBe(409)
    const j = await r.json()
    expect(j.cita).toMatchObject({ version: 5, estado: 'CANCELLED' })
    expect(estado.avisos).toHaveLength(0) // un 409 no manda correos
  })
  it('lleva al servicio la versión que vio la pantalla y recorta motivo e inicio', async () => {
    await llamar({ accion: 'cancelar', version: 2, motivo: 'x'.repeat(900), inicio: 'y'.repeat(90) })
    const o = estado.llamadas[0] as { version: number; datos: { motivo: string; inicio: string } }
    expect(o.version).toBe(2)
    expect(o.datos.motivo).toHaveLength(500)
    expect(o.datos.inicio).toHaveLength(40)
  })
  it('«vencer» es solo del sistema, una acción inventada tampoco: 400 y el servicio ni se llama', async () => {
    for (const accion of ['vencer', 'borrar_todo', undefined]) expect((await llamar({ accion, version: 1 })).status, String(accion)).toBe(400)
    expect(estado.llamadas).toHaveLength(0)
  })
  it('versión ausente, cero, decimal o texto: 400', async () => {
    for (const version of [undefined, 0, 1.5, '2', -1]) expect((await llamar({ accion: 'cancelar', version })).status, String(version)).toBe(400)
    expect(estado.llamadas).toHaveLength(0)
  })
  it('un id que no es UUID da 404 sin tocar el servicio; un cuerpo que no es JSON da 400', async () => {
    expect((await llamar({ accion: 'cancelar', version: 1 }, 'no-es-uuid')).status).toBe(404)
    expect((await llamar('esto no es json')).status).toBe(400)
    expect(estado.llamadas).toHaveLength(0)
  })
  it('un 403 del servicio (acción sin permiso) queda en la bitácora de intentos denegados', async () => {
    estado.respuesta = { ok: false, status: 403, error: 'No puedes hacer eso con esta visita.' }
    const r = await llamar({ accion: 'confirmar', version: 1 })
    expect(r.status).toBe(403)
    expect(estado.denegados).toEqual(['cita.accion:confirmar'])
  })
  it('éxito: 200 con la cita y se programa el aviso del evento correspondiente', async () => {
    const r = await llamar({ accion: 'confirmar', version: 2 })
    expect(r.status).toBe(200)
    expect((await r.json()).cita).toMatchObject({ id: ID, version: 3 })
    expect(estado.avisos).toHaveLength(1)
    expect(estado.avisos[0][0]).toBe(ID)
  })
  it('si el servicio revienta: 500 genérico, sin filtrar el error interno', async () => {
    const { transicionar } = await import('@/lib/citas/servicio')
    void transicionar // el doble ya está montado; forzamos el fallo con una respuesta que lance
    estado.respuesta = new Proxy({}, { get() { throw new Error('SECRETO-INTERNO') } }) as unknown as Record<string, unknown>
    const r = await llamar({ accion: 'cancelar', version: 1 })
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json())).not.toContain('SECRETO-INTERNO')
  })
})
