import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capacidadesEfectivas } from '../src/lib/acceso/capacidades'

/**
 * ¿A quién se le guarda la cita como ASESOR cuando alguien agenda? (pregunta del dueño, 10-nov-2026)
 * Se prueba el servicio REAL (`createAppointment`) con una base de mentira que captura lo que se manda a `cita_crear`: `asesor_uid` (quien atiende) y `propietario_uid` (quien subió la propiedad).
 * Regla: asesor = el responsable asignado → el dueño SI atiende citas (admin/equipo, o asociado con `recibir_citas`) → el responsable del equipo configurado → el titular automático (admin activo más antiguo).
 * El dueño que no atiende (un publicador) queda como `propietario_uid`, nunca como asesor.
 */
type Fila = Record<string, unknown>
const estado = vi.hoisted(() => ({ tablas: {} as Record<string, Fila[]>, rpc: [] as Array<{ fn: string; args: Record<string, unknown> }> }))

vi.mock('../src/lib/auth-server', () => {
  const fab = (nombre: string) => {
    let filas = [...(estado.tablas[nombre] ?? [])]
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'limit', 'or', 'lt', 'gt', 'lte', 'gte', 'neq', 'not', 'is', 'range']) b[m] = () => b
    b.eq = (c: string, v: unknown) => { filas = filas.filter((f) => f[c] === v); return b }
    b.in = (c: string, vs: unknown[]) => { filas = filas.filter((f) => vs.includes(f[c])); return b }
    b.maybeSingle = async () => ({ data: filas[0] ?? null, error: null })
    b.single = b.maybeSingle
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(res, rej)
    return b
  }
  return {
    supabaseAdmin: () => ({
      from: fab,
      // Se detiene aquí: lo que importa es QUÉ se mandó a guardar.
      rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpc.push({ fn, args }); return { data: null, error: { code: 'XX000', message: 'detenido por la prueba' } } },
    }),
    resolverPerfil: vi.fn(),
  }
})

const CLIENTE = { uid: 'cli1', email: 'cli1@ejemplo.invalid', nombre: 'Clara Cliente', rol: 'cliente', superAdmin: false, estado: 'activo', capacidades: capacidadesEfectivas({ rol: 'cliente' }) } as never
const AHORA = new Date('2026-11-10T16:00:00Z')               // martes, 10:00 en León
const INICIO = '2026-11-12T17:00:00Z'                         // jueves 11:00 en León: dentro del horario por defecto

const usuarios = (extra: Fila[] = []): Fila[] => [
  { uid: 'adm1', rol: 'admin', estado: 'activo', creado_en: '2026-08-01T00:00:00Z' },        // el admin más antiguo
  { uid: 'adm2', rol: 'admin', estado: 'activo', creado_en: '2026-09-01T00:00:00Z' },
  { uid: 'sup', rol: 'super_admin', estado: 'activo', creado_en: '2026-07-01T00:00:00Z' },  // el Super Admin es independiente: NO es titular si hay admins
  { uid: 'pub', rol: 'publicador', estado: 'activo', creado_en: '2026-10-01T00:00:00Z', tipo_publicador: 'publicador', permisos_override: {} },
  { uid: 'aso', rol: 'publicador', estado: 'activo', creado_en: '2026-10-02T00:00:00Z', tipo_publicador: 'asociado', permisos_override: {} },
  { uid: 'aso-sin', rol: 'publicador', estado: 'activo', creado_en: '2026-10-03T00:00:00Z', tipo_publicador: 'asociado', permisos_override: { recibir_citas: false } },
  { uid: 'cli1', rol: 'cliente', estado: 'activo', creado_en: '2026-10-04T00:00:00Z', nombre: 'Clara Cliente', telefono: '4771234567', email: 'cli1@ejemplo.invalid' },
  ...extra,
]
const propiedad = (o: Fila): Fila => ({ id: 'p1', titulo: 'Casa de prueba', estado_pub: 'publicada', estatus: 'disponible', responsable_citas_uid: null, ...o })

async function agendar(prop: Fila, opts: { usuarios?: Fila[]; equipo?: string } = {}) {
  estado.rpc = []
  estado.tablas = { usuarios: opts.usuarios ?? usuarios(), propiedades: [propiedad(prop)], configuracion: opts.equipo ? [{ clave: 'citas', valor: { responsable_equipo_uid: opts.equipo } }] : [] }
  const { createAppointment } = await import('../src/lib/citas/servicio')
  const r = await createAppointment(CLIENTE, { propiedadId: 'p1', inicio: INICIO, consentimiento: true }, 'clave-de-prueba-1', AHORA)
  return { r, guardado: estado.rpc.find((x) => x.fn === 'cita_crear')?.args.p as Record<string, unknown> | undefined }
}

beforeEach(() => { estado.rpc = [] })

describe('qué asesor se guarda al agendar, según quién subió la propiedad', () => {
  it('la subió un ADMIN: el asesor es ESE admin (no el más antiguo) y él es también el propietario', async () => {
    const { guardado } = await agendar({ owner_id: 'adm2' })
    expect(guardado?.asesor_uid).toBe('adm2')
    expect(guardado?.propietario_uid).toBe('adm2')
  })

  it('la subió el SUPER ADMIN: el asesor es él mismo (es independiente de los admins) y también es el propietario', async () => {
    const { guardado } = await agendar({ owner_id: 'sup' })
    expect(guardado?.asesor_uid).toBe('sup')
    expect(guardado?.propietario_uid).toBe('sup')
  })

  it('la subió un PUBLICADOR: el asesor NO es él; es el titular automático (admin activo más antiguo, no el Super Admin) y el publicador queda como propietario', async () => {
    const { guardado } = await agendar({ owner_id: 'pub' })
    expect(guardado?.asesor_uid).toBe('adm1')
    expect(guardado?.propietario_uid).toBe('pub')
  })

  it('la subió un ASOCIADO (con recibir_citas): el asesor es el propio asociado', async () => {
    const { guardado } = await agendar({ owner_id: 'aso' })
    expect(guardado?.asesor_uid).toBe('aso')
    expect(guardado?.propietario_uid).toBe('aso')
  })

  it('la subió un asociado al que se le quitó recibir_citas: deja de atender y pasa al titular automático', async () => {
    const { guardado } = await agendar({ owner_id: 'aso-sin' })
    expect(guardado?.asesor_uid).toBe('adm1')
    expect(guardado?.propietario_uid).toBe('aso-sin')
  })

  it('un admin asignó la propiedad de un publicador a un asociado: el asesor es el asignado, el propietario sigue siendo el publicador', async () => {
    const { guardado } = await agendar({ owner_id: 'pub', responsable_citas_uid: 'aso' })
    expect(guardado?.asesor_uid).toBe('aso')
    expect(guardado?.propietario_uid).toBe('pub')
  })

  it('con un responsable del equipo CONFIGURADO, manda sobre el titular automático', async () => {
    const { guardado } = await agendar({ owner_id: 'pub' }, { equipo: 'adm2' })
    expect(guardado?.asesor_uid).toBe('adm2')
  })

  it('sin ningún admin activo atiende el Super Admin; y si no hay ni él, NO se guarda nada y se dice «sin asesor»', async () => {
    const sinAdmins = usuarios().filter((u) => u.rol !== 'admin')
    expect((await agendar({ owner_id: 'pub' }, { usuarios: sinAdmins })).guardado?.asesor_uid).toBe('sup')
    const nadie = usuarios().filter((u) => u.rol !== 'admin' && u.rol !== 'super_admin')
    const { r, guardado } = await agendar({ owner_id: 'pub' }, { usuarios: nadie })
    expect(guardado).toBeUndefined()
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.status).toBe(409); expect(r.error).toContain('todavía no tiene asesor') }
  })
})
