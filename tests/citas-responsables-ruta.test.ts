import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `/api/admin/citas/responsables` (decisión del dueño, 9-nov-2026): GET dice quién atiende cada propiedad y quién PUEDE hacerlo; PUT asigna con motivo.
 * La ruta es la real y `atiendeCitas` también; solo se simulan la base, el límite de ritmo y las cuentas.
 * Lo que se fija: solo admin, solo quien atiende citas puede ser responsable, la identidad sale de la SESIÓN, el motivo es obligatorio y todo fallo cierra sin cambiar nada.
 */
type Cuenta = { rol: string; capacidades?: Record<string, boolean> }
const estado = vi.hoisted(() => ({
  permitido: true,
  perfil: { uid: 'adm', email: 'adm@ejemplo.invalid', rol: 'admin' } as Record<string, unknown>,
  props: [] as Array<Record<string, unknown>>,
  cfg: null as Record<string, unknown> | null,
  usuarios: [] as Array<Record<string, unknown>>,
  cuentas: new Map<string, { rol: string; capacidades?: Record<string, boolean> }>(),
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcRespuesta: { data: { resultado: 'ok' }, error: null } as { data: unknown; error: { code?: string; message?: string } | null },
  lecturas: 0,
  titular: 'adm' as string | null,
}))

vi.mock('@/lib/auth-server', () => ({
  exigir: async () => (estado.permitido ? { perfil: estado.perfil } : { error: new Response(JSON.stringify({ error: 'No tienes permiso.' }), { status: 403 }) }),
  supabaseAdmin: () => ({
    from: (tabla: string) => {
      estado.lecturas++
      if (tabla === 'propiedades') return { select: () => ({ order: () => ({ limit: async () => ({ data: estado.props, error: null }) }) }) }
      if (tabla === 'configuracion') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: estado.cfg, error: null }) }) }) }
      return { select: () => ({ eq: () => ({ in: () => ({ limit: async () => ({ data: estado.usuarios, error: null }) }) }) }) }
    },
    rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpc.push({ fn, args }); return estado.rpcRespuesta },
  }),
}))
vi.mock('@/lib/limites', () => ({ frenarAsync: async () => null, TOPES: { citas: {} } }))
vi.mock('@/lib/citas/asesores', () => ({
  titularAutomaticoDelEquipo: async () => estado.titular,
  cuentasDeCitas: async (_db: unknown, uids: string[]) => new Map(uids.filter((u) => estado.cuentas.has(u)).map((u) => [u, estado.cuentas.get(u) as Cuenta])),
}))

const ADMIN: Cuenta = { rol: 'admin' }
const ASOCIADO_QUE_RECIBE: Cuenta = { rol: 'publicador', capacidades: { recibir_citas: true } }
const PUBLICADOR: Cuenta = { rol: 'publicador', capacidades: { recibir_citas: false } }

async function get() {
  const { GET } = await import('../src/app/api/admin/citas/responsables/route')
  const r = await GET(new Request('https://vivebienn.com/api/admin/citas/responsables'))
  return { status: r.status, cuerpo: await r.json() as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function put(cuerpo: unknown) {
  const { PUT } = await import('../src/app/api/admin/citas/responsables/route')
  const r = await PUT(new Request('https://vivebienn.com/api/admin/citas/responsables', { method: 'PUT', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }))
  return { status: r.status, cuerpo: await r.json() as Record<string, unknown> }
}
const base = { ambito: 'propiedad', propiedadId: 'p1', antes: null, a: 'ase', motivo: 'El asociado atiende las visitas de esta nave' }

beforeEach(() => {
  estado.permitido = true
  estado.perfil = { uid: 'adm', email: 'adm@ejemplo.invalid', rol: 'admin' }
  estado.props = [
    { id: 'p1', titulo: 'Nave A', owner_id: 'pub', responsable_citas_uid: null, estado_pub: 'publicada' },
    { id: 'p2', titulo: 'Casa B', owner_id: 'adm', responsable_citas_uid: null, estado_pub: 'borrador' },
    { id: 'p3', titulo: 'Local C', owner_id: 'pub', responsable_citas_uid: 'ase', estado_pub: 'publicada' },
  ]
  estado.cfg = { valor: { responsable_equipo_uid: 'adm' } }
  estado.usuarios = [{ uid: 'adm', nombre: 'Ana Admin', rol: 'admin' }, { uid: 'ase', nombre: 'Beto Asociado', rol: 'publicador' }, { uid: 'pub', nombre: 'Carla Publicadora', rol: 'publicador' }]
  estado.cuentas = new Map([['adm', ADMIN], ['ase', ASOCIADO_QUE_RECIBE], ['pub', PUBLICADOR]])
  estado.rpc = []
  estado.rpcRespuesta = { data: { resultado: 'ok' }, error: null }
  estado.lecturas = 0
  estado.titular = 'adm'
})

describe('GET · quién atiende cada propiedad', () => {
  it('sin permiso de admin: 403 y no se lee nada de la base', async () => {
    estado.permitido = false
    expect((await get()).status).toBe(403)
    expect(estado.lecturas).toBe(0)
  })
  it('solo pueden ser responsables las cuentas que ATIENDEN citas (el equipo y el asociado con recibir_citas); un publicador sin ese permiso no', async () => {
    const { cuerpo } = await get()
    expect(cuerpo.candidatos.map((c: { uid: string }) => c.uid).sort()).toEqual(['adm', 'ase'])
  })
  it('el que de hecho atiende sale por el mismo orden del servicio: asignado → dueño → equipo, con su origen', async () => {
    const { cuerpo } = await get()
    const por = Object.fromEntries(cuerpo.propiedades.map((p: { id: string; efectivo: unknown }) => [p.id, p.efectivo]))
    expect(por.p3).toEqual({ uid: 'ase', nombre: 'Beto Asociado', origen: 'asignado' })   // tiene responsable asignado que atiende
    expect(por.p2).toEqual({ uid: 'adm', nombre: 'Ana Admin', origen: 'dueno' })          // sin asignar; el dueño es del equipo
    expect(por.p1).toEqual({ uid: 'adm', nombre: 'Ana Admin', origen: 'equipo' })         // el dueño es un publicador que no atiende: cae al responsable del equipo
  })
  it('sin responsable del equipo y con un dueño que no atiende: atiende el TITULAR AUTOMÁTICO (origen «automatico»), y la respuesta lo dice', async () => {
    estado.cfg = null
    const { cuerpo } = await get()
    expect(cuerpo.equipo).toBeNull()
    expect(cuerpo.titularAutomatico).toEqual({ uid: 'adm', nombre: 'Ana Admin' })
    expect(cuerpo.propiedades.find((p: { id: string }) => p.id === 'p1').efectivo).toEqual({ uid: 'adm', nombre: 'Ana Admin', origen: 'automatico' })
  })
  it('sin responsable del equipo Y sin ningún admin activo: nadie atiende (null), no se inventa uno', async () => {
    estado.cfg = null
    estado.titular = null
    const { cuerpo } = await get()
    expect(cuerpo.titularAutomatico).toBeNull()
    expect(cuerpo.propiedades.find((p: { id: string }) => p.id === 'p1').efectivo).toBeNull()
  })
  it('un responsable asignado que dejó de atender citas se salta (falla cerrado hacia el siguiente)', async () => {
    estado.cuentas.set('ase', PUBLICADOR)
    const { cuerpo } = await get()
    expect(cuerpo.propiedades.find((p: { id: string }) => p.id === 'p3').efectivo).toMatchObject({ uid: 'adm', origen: 'equipo' })
  })
})

describe('PUT · asignar', () => {
  it('sin permiso de admin: 403 y no se llama a la base', async () => {
    estado.permitido = false
    expect((await put(base)).status).toBe(403)
    expect(estado.rpc).toHaveLength(0)
  })
  it('asigna una propiedad con la función atómica; la identidad del actor sale de la SESIÓN, aunque el cuerpo traiga otra', async () => {
    const r = await put({ ...base, actor_uid: 'falso', actor_rol: 'super_admin', perfil: { uid: 'otro' } })
    expect(r.status).toBe(200)
    expect(estado.rpc).toHaveLength(1)
    expect(estado.rpc[0].fn).toBe('citas_asignar_responsable_propiedad')
    expect(estado.rpc[0].args).toMatchObject({ p_propiedad: 'p1', p_antes: null, p_a: 'ase' })
    expect(estado.rpc[0].args.p_audit).toEqual({
      actor_uid: 'adm', actor_email: 'adm@ejemplo.invalid', actor_rol: 'admin', accion: 'citas.responsable_propiedad',
      antes: { responsable: null }, despues: { responsable: 'ase', motivo: 'El asociado atiende las visitas de esta nave' },
    })
  })
  it('el responsable del equipo usa su propia función', async () => {
    const r = await put({ ambito: 'equipo', antes: 'adm', a: 'ase', motivo: 'Cambia quien coordina las visitas del equipo' })
    expect(r.status).toBe(200)
    expect(estado.rpc[0].fn).toBe('citas_asignar_responsable_equipo')
    expect(estado.rpc[0].args).toMatchObject({ p_antes: 'adm', p_a: 'ase' })
    expect((estado.rpc[0].args.p_audit as { accion: string }).accion).toBe('citas.responsable_equipo')
  })
  it('quitar al responsable (a = null) es válido y no consulta cuentas', async () => {
    const r = await put({ ...base, antes: 'ase', a: null, motivo: 'Vuelve a atenderla el responsable del equipo' })
    expect(r.status).toBe(200)
    expect(estado.rpc[0].args).toMatchObject({ p_antes: 'ase', p_a: null })
  })
  it('alguien que NO atiende citas no puede ser responsable: 400 y la base no se toca', async () => {
    for (const a of ['pub', 'fantasma']) {
      const r = await put({ ...base, a })
      expect(r.status, a).toBe(400)
      expect(String(r.cuerpo.error)).toContain('no atiende citas')
    }
    expect(estado.rpc).toHaveLength(0)
  })
  it('entradas inválidas: ámbito, propiedad, uids raros, nada que cambiar o motivo corto/largo → 400 sin tocar la base', async () => {
    const malas: unknown[] = [
      {}, 'no es json', { ...base, ambito: 'todo' }, { ...base, propiedadId: '' }, { ...base, propiedadId: 'a b; drop table' },
      { ...base, a: 'x' }, { ...base, a: 7 }, { ...base, antes: 'con espacios' }, { ...base, antes: 'ase', a: 'ase' },
      { ...base, motivo: 'corto' }, { ...base, motivo: '' }, { ...base, motivo: 'x'.repeat(501) }, { ...base, motivo: 42 },
    ]
    for (const m of malas) expect((await put(m)).status, JSON.stringify(m)).toBe(400)
    expect(estado.rpc).toHaveLength(0)
  })
  it('el resultado de la base se traduce: conflicto 409, propiedad inexistente 404, cuenta inválida 400, otro resultado 500', async () => {
    const casos: Array<[string, number]> = [['conflicto', 409], ['no_existe', 404], ['responsable_invalido', 400], ['rarisimo', 500]]
    for (const [resultado, status] of casos) {
      estado.rpcRespuesta = { data: { resultado }, error: null }
      expect((await put(base)).status, resultado).toBe(status)
    }
  })
  it('sin la migración 76 (función ausente): 503 que lo dice; cualquier otro error de la base: 503 genérico sin filtrar nada', async () => {
    estado.rpcRespuesta = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    const sinFuncion = await put(base)
    expect(sinFuncion.status).toBe(503)
    expect(String(sinFuncion.cuerpo.error)).toContain('migración 76')
    estado.rpcRespuesta = { data: null, error: { code: 'XX000', message: 'SECRETO-INTERNO de la base' } }
    const otro = await put(base)
    expect(otro.status).toBe(503)
    expect(JSON.stringify(otro.cuerpo)).not.toContain('SECRETO-INTERNO')
  })
})
