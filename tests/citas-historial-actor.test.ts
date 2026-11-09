import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auditoría visible (decisión del dueño, 9-nov-2026): GET /api/citas/[id] dice QUIÉN hizo cada cambio, por su nombre, SOLO a quien tiene alcance global (admin / super admin).
 * Ruta real; la base y el servicio se simulan. Lo que se fija: el nombre solo llega al admin, el uid NUNCA llega a nadie, y si no se puede resolver el nombre no se manda nada.
 */
const estado = vi.hoisted(() => ({
  perfil: { uid: 'adm', rol: 'admin', superAdmin: false, estado: 'activo', capacidades: {} } as Record<string, unknown>,
  papel: 'admin',
  eventos: [] as Array<Record<string, unknown>>,
  usuarios: [] as Array<{ uid: string; nombre: string | null }>,
  usuariosFalla: false,
  consultasDeUsuarios: 0,
}))
const ID = '11111111-1111-4111-8111-111111111111'

vi.mock('@/lib/auth-server', () => ({
  exigir: async () => ({ perfil: estado.perfil }),
  supabaseAdmin: () => ({
    from: (tabla: string) => tabla === 'citas_eventos'
      ? { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: estado.eventos }) }) }) }) }
      : { select: () => ({ in: async () => { estado.consultasDeUsuarios++; return estado.usuariosFalla ? { data: null, error: { message: 'caída' } } : { data: estado.usuarios } } }) },
  }),
}))
vi.mock('@/lib/citas/servicio', () => ({ getAppointment: async () => ({ id: ID, papel: estado.papel }) }))

const evento = (o: Record<string, unknown> = {}) => ({ tipo: 'CONFIRMED', estado_antes: 'REQUESTED', estado_despues: 'CONFIRMED', actor_rol: 'admin', actor_uid: 'uid-secreto-1', via: 'panel', datos: {}, creado_en: '2026-11-09T10:00:00Z', ...o })

async function leer() {
  const { GET } = await import('../src/app/api/citas/[id]/route')
  const r = await GET(new Request(`https://vivebienn.com/api/citas/${ID}`), { params: Promise.resolve({ id: ID }) })
  return { status: r.status, cuerpo: await r.json() as { historial: Array<Record<string, unknown>> } }
}
beforeEach(() => {
  estado.perfil = { uid: 'adm', rol: 'admin', superAdmin: false, estado: 'activo', capacidades: {} }
  estado.papel = 'admin'
  estado.eventos = [evento(), evento({ tipo: 'CANCELLED', actor_rol: 'cliente', actor_uid: 'uid-secreto-2' })]
  estado.usuarios = [{ uid: 'uid-secreto-1', nombre: 'Ana Admin' }, { uid: 'uid-secreto-2', nombre: 'Cliente Prueba' }]
  estado.usuariosFalla = false
  estado.consultasDeUsuarios = 0
})

describe('GET /api/citas/[id] · quién hizo cada cambio', () => {
  it('el ADMIN ve el nombre de quien hizo cada cambio, junto al papel', async () => {
    const { status, cuerpo } = await leer()
    expect(status).toBe(200)
    expect(cuerpo.historial.map((e) => e.actor)).toEqual(['Ana Admin', 'Cliente Prueba'])
    expect(cuerpo.historial.map((e) => e.por)).toEqual(['admin', 'cliente'])
  })
  it('el uid NUNCA se manda, ni siquiera al admin', async () => {
    const { cuerpo } = await leer()
    expect(JSON.stringify(cuerpo)).not.toContain('uid-secreto')
  })
  it('el super admin también lo ve', async () => {
    estado.perfil = { uid: 'sup', rol: 'admin', superAdmin: true, estado: 'activo', capacidades: {} }
    expect((await leer()).cuerpo.historial[0].actor).toBe('Ana Admin')
  })
  it('el CLIENTE, el PROPIETARIO y el PUBLICADOR que atiende NO reciben ningún nombre, y ni se consulta la tabla de usuarios', async () => {
    const casos: Array<[string, Record<string, unknown>]> = [
      ['cliente', { uid: 'cli', rol: 'cliente', superAdmin: false, estado: 'activo', capacidades: {} }],
      ['propietario', { uid: 'dueno', rol: 'publicador', superAdmin: false, estado: 'activo', tipoPublicador: 'asociado', capacidades: {} }],
      ['asesor', { uid: 'pub', rol: 'publicador', superAdmin: false, estado: 'activo', tipoPublicador: 'asociado', capacidades: { recibir_citas: true } }],
    ]
    for (const [papel, perfil] of casos) {
      estado.perfil = perfil; estado.papel = papel; estado.consultasDeUsuarios = 0
      const { cuerpo } = await leer()
      expect(cuerpo.historial.length, papel).toBeGreaterThan(0)
      for (const e of cuerpo.historial) expect(e, papel).not.toHaveProperty('actor')
      expect(estado.consultasDeUsuarios, `${papel}: no debe consultar nombres`).toBe(0)
      expect(JSON.stringify(cuerpo), papel).not.toContain('Ana Admin')
    }
  })
  it('un admin que es CLIENTE de esa cita (papel «cliente») sigue viendo los nombres: la auditoría es un poder de admin, no del papel en la cita', async () => {
    estado.papel = 'cliente'
    expect((await leer()).cuerpo.historial[0].actor).toBe('Ana Admin')
  })
  it('si no se pueden leer los nombres (error o sin nombre), NO se manda ninguno y el historial se entrega igual (ausente = sin permiso)', async () => {
    estado.usuariosFalla = true
    let r = await leer()
    expect(r.status).toBe(200)
    for (const e of r.cuerpo.historial) expect(e).not.toHaveProperty('actor')
    estado.usuariosFalla = false
    estado.usuarios = [{ uid: 'uid-secreto-1', nombre: '   ' }, { uid: 'uid-secreto-2', nombre: null }]
    r = await leer()
    for (const e of r.cuerpo.historial) expect(e).not.toHaveProperty('actor')
  })
  it('un evento del sistema (sin actor_uid) sale sin nombre, con su papel «sistema»', async () => {
    estado.eventos = [evento({ tipo: 'EXPIRED', actor_rol: 'sistema', actor_uid: null })]
    const { cuerpo } = await leer()
    expect(cuerpo.historial[0]).not.toHaveProperty('actor')
    expect(cuerpo.historial[0].por).toBe('sistema')
  })
})
