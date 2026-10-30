import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * V-1.1.86 (3b-2) · J-01 — El perfil devuelve lo GUARDADO.
 *
 * Los valores se limpian al escribir (zonas sin repetir, tipos por su clave,
 * presupuesto convertido). Si la pantalla pintara lo que se tecleó, enseñaría
 * algo que no está en la base: es la misma trampa que el `precio_incluye_iva`
 * (D-32, «No Silent Data Loss»).
 */

const bd = vi.hoisted(() => ({
  fila: null as null | Record<string, unknown>,
  perfil: { uid: 'u-1', email: 'cliente@ejemplo.test', emailVerified: true, rol: 'cliente', superAdmin: false, estado: 'activo', nombre: null },
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) c[m] = () => c
    c.maybeSingle = async () => ({ data: bd.fila, error: null })
    c.upsert = async (f: Record<string, unknown>) => {
      // Como la base: guarda lo que se le manda (ya limpio por la ruta).
      bd.fila = { ...(bd.fila ?? {}), ...f }
      return { error: null }
    }
    c.update = () => c
    c.insert = async () => ({ error: null })
    return c
  }
  return {
    ...real,
    // V-1.1.87 (etapa 1): la ruta ya no llama a `verifyIdToken`, sino a
    // `exigir`. Se arma el autorizador REAL con los extremos de esta prueba,
    // para que recorra de verdad sesión → estado → permiso.
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      real.crearAutorizador({ verificar: async () => ({ uid: 'u-1', email: 'cliente@ejemplo.test', emailVerified: true }), perfil: async () => bd.perfil as Awaited<ReturnType<typeof real.getPerfil>>, denegado: async () => {} })(
        req, (p) => puede(p, permiso), permiso,
      ),
    verifyIdToken: async () => ({ uid: 'u-1', email: 'cliente@ejemplo.test', emailVerified: true }),
    getPerfil: async () => bd.perfil,
    supabaseAdmin: () => ({ from: () => cadena() }),
  }
})
vi.mock('@/lib/invitaciones', () => ({ aplicarInvitacion: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))

import { GET, PATCH } from '../src/app/api/usuarios/me/route'

const guardar = (cuerpo: unknown) => PATCH(new Request('https://vivebienn.com/api/usuarios/me', {
  method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify(cuerpo),
}))
const leer = () => GET(new Request('https://vivebienn.com/api/usuarios/me', { headers: { authorization: 'Bearer t' } }))

beforeEach(() => { bd.fila = null; bd.perfil = { ...bd.perfil, rol: 'cliente', estado: 'activo' } })

describe('guardar el perfil devuelve lo guardado', () => {
  it('lo limpio, no lo tecleado: zonas sin repetir, tipos por clave, presupuesto en número', async () => {
    const r = await guardar({
      nombre: '  Ana  ',
      busca_zonas: ['  Centro ', 'centro', 'Campestre'],
      busca_tipos: ['Casa', 'CASA', 'Nave industrial'],
      presupuesto_max: '2,500,000',
      busca_operacion: 'venta',
    })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.busca_zonas).toEqual(['Centro', 'Campestre'])
    expect(j.busca_tipos).toEqual(['casa', 'nave'])
    expect(j.presupuesto_max).toBe(2_500_000)
    expect(j.nombre).toBe('Ana')
    expect(j.ok).toBe(true)
  })

  it('lo que devuelve al guardar es lo mismo que se ve al recargar', async () => {
    const guardado = await (await guardar({ nombre: 'Ana', busca_tipos: ['Depto'] })).json()
    const releido = await (await leer()).json()
    for (const campo of ['nombre', 'busca_tipos', 'busca_zonas', 'presupuesto_max', 'completitud']) {
      expect(releido[campo], campo).toEqual(guardado[campo])
    }
  })

  it('un campo que no se guarda se DICE (no se finge que sí)', async () => {
    const j = await (await guardar({ nombre: 'Ana', busca_zona: 'Centro', color_favorito: 'rojo' })).json()
    expect(j.ignorados).toEqual(expect.arrayContaining(['busca_zona', 'color_favorito']))
    expect(j.nombre).toBe('Ana')
  })

  it('sin nada que cambiar, también contesta con el perfil de verdad', async () => {
    bd.fila = { uid: 'u-1', nombre: 'Ana', busca_tipos: ['casa'] }
    const j = await (await guardar({ busca_zona: 'Centro' })).json()
    expect(j).toMatchObject({ ok: true, sinCambios: true, nombre: 'Ana' })
    expect(j.busca_tipos).toEqual(['casa'])
    expect(j.ignorados).toContain('busca_zona')
  })

  it('la completitud que devuelve es la de lo guardado', async () => {
    const vacio = await (await guardar({ nombre: '' })).json()
    const conNombre = await (await guardar({ nombre: 'Ana', telefono: '4771234567' })).json()
    expect(conNombre.completitud).toBeGreaterThan(vacio.completitud)
    expect(conNombre.faltantes.map((f: { campo: string }) => f.campo)).not.toContain('nombre')
  })

  it('una cuenta suspendida no guarda nada (403)', async () => {
    bd.perfil = { ...bd.perfil, estado: 'suspendido' }
    expect((await guardar({ nombre: 'Ana' })).status).toBe(403)
  })
})
