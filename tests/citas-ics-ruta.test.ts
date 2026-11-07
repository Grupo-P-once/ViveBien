import { beforeEach, describe, expect, it, vi } from 'vitest'

/** GET /api/citas/ics — «Descargar mi calendario»: mismas reglas de acceso que la lista, solo citas acordadas, sin datos personales. */
const estado = vi.hoisted(() => ({ perfil: { uid: 'u1', rol: 'cliente', superAdmin: false, estado: 'activo', capacidades: {} } as Record<string, unknown>, llamadas: [] as Array<Record<string, unknown>> }))
const manana = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const CITAS = [
  { id: '11111111-1111-4111-8111-111111111111', version: 2, estado: 'CONFIRMED', firme: true, papel: 'cliente', inicio: manana(24), fin: manana(25), lugar: 'León', propiedad: { titulo: 'Casa Álamos' }, cliente: { nombre: 'SECRETO-NOMBRE', telefono: '4770000000' } },
  { id: '22222222-2222-4222-8222-222222222222', version: 1, estado: 'REQUESTED', firme: false, papel: 'cliente', inicio: manana(30), fin: manana(31), lugar: null, propiedad: { titulo: 'Pendiente' } },
  { id: '33333333-3333-4333-8333-333333333333', version: 1, estado: 'PENDING_CONFIRMATION', firme: true, papel: 'cliente', inicio: manana(40), fin: manana(41), lugar: null, propiedad: { titulo: 'Por confirmar' } },
  { id: '44444444-4444-4444-8444-444444444444', version: 1, estado: 'CONFIRMED', firme: true, papel: 'cliente', inicio: manana(-30), fin: manana(-29), lugar: null, propiedad: { titulo: 'Ya pasó' } },
]
vi.mock('@/lib/auth-server', () => ({ exigir: async () => ({ perfil: estado.perfil }) }))
vi.mock('@/lib/limites', () => ({ frenarAsync: async () => null, TOPES: { citas: {} } }))
vi.mock('@/lib/citas/servicio', () => ({ listAppointments: async (o: Record<string, unknown>) => { estado.llamadas.push(o); return CITAS } }))

async function pedir(vista?: string) {
  const { GET } = await import('../src/app/api/citas/ics/route')
  return GET(new Request(`https://vivebienn.com/api/citas/ics${vista ? `?vista=${vista}` : ''}`))
}
beforeEach(() => { estado.perfil = { uid: 'u1', rol: 'cliente', superAdmin: false, estado: 'activo', capacidades: {} }; estado.llamadas = [] })

describe('/api/citas/ics', () => {
  it('el cliente descarga su calendario: solo las citas ACORDADAS y por venir, con tipo y nombre de archivo correctos', async () => {
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/calendar')
    expect(r.headers.get('content-disposition')).toContain('mis-citas-vive-bien.ics')
    expect(r.headers.get('cache-control')).toContain('no-store')
    const ics = await r.text()
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('UID:11111111-1111-4111-8111-111111111111@vivebienn.com')
    for (const fuera of ['22222222', '33333333', '44444444']) expect(ics, `no debe llevar ${fuera}`).not.toContain(fuera)
    expect(estado.llamadas[0]).toMatchObject({ vista: 'cliente', incluirCanceladas: false })
  })
  it('nunca lleva nombre, teléfono ni correo del interesado', async () => {
    const ics = await (await pedir()).text()
    expect(ics).not.toContain('SECRETO-NOMBRE')
    expect(ics).not.toContain('4770000000')
    expect(ics).toContain('Casa Álamos')
  })
  it('las vistas se piden con las MISMAS reglas que la lista: un cliente no puede pedir la del equipo, la de quien atiende ni la de propietario', async () => {
    for (const v of ['admin', 'asesor', 'propietario']) expect((await pedir(v)).status, v).toBe(403)
    expect(estado.llamadas).toHaveLength(0)
  })
  it('el equipo sí puede pedir la vista de administración; un publicador sin recibir_citas no la de quien atiende', async () => {
    estado.perfil = { uid: 'a1', rol: 'admin', superAdmin: false, estado: 'activo', capacidades: {} }
    expect((await pedir('admin')).status).toBe(200)
    estado.perfil = { uid: 'p1', rol: 'publicador', superAdmin: false, estado: 'activo', tipoPublicador: 'publicador', capacidades: {} }
    expect((await pedir('asesor')).status).toBe(403)
    expect((await pedir('propietario')).status).toBe(200)
  })
})
