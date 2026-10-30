import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * V-1.1.85 (3b-1) — Aislamiento entre cuentas, con la puerta REAL del portal.
 *
 * No se simula `exigirPortal`: se simulan sólo sus dos extremos —el token de
 * Firebase y la base— para que la prueba recorra de verdad flags → sesión →
 * suspensión → etapa → filtro por `uid`.
 *
 * Lo que se demuestra:
 *   · el cliente A ve lo de A y sólo lo de A;
 *   · el cliente B ve lo de B (los mismos endpoints, otra sesión);
 *   · tocar lo ajeno no funciona ni aunque se mande el id de otro;
 *   · cuenta suspendida → 403; sin sesión → 401; portal cerrado → 404.
 */

const mundo = vi.hoisted(() => ({
  flags: { portalCliente: true, portalClienteInterno: false, citasEnLinea: false } as Record<string, boolean>,
  // Quién manda el token de esta petición (null = sin sesión).
  sesion: null as null | { uid: string; email: string; estado: string; rol: string; superAdmin: boolean },
  filas: {
    favoritos: [
      { uid: 'A', propiedad_id: 'pA', creado_en: '2026-09-20T00:00:00Z' },
      { uid: 'B', propiedad_id: 'pB', creado_en: '2026-09-20T00:00:00Z' },
    ],
    busquedas_guardadas: [
      { uid: 'A', id: 1, nombre: 'La de A', filtros: { op: 'venta' }, creado_en: '2026-09-01T00:00:00Z', revisadas_en: null },
      { uid: 'B', id: 2, nombre: 'La de B', filtros: { op: 'renta' }, creado_en: '2026-09-01T00:00:00Z', revisadas_en: null },
    ],
    solicitudes_contacto: [
      { cliente_uid: 'A', id: 11, propiedad_id: 'pA', propiedad_titulo: 'Nave de A', tipo: 'informacion', visita_preferida: null, mensaje: 'soy A', creado_en: '2026-09-10T00:00:00Z' },
      { cliente_uid: 'B', id: 22, propiedad_id: 'pB', propiedad_titulo: 'Casa de B', tipo: 'visita', visita_preferida: null, mensaje: 'soy B', creado_en: '2026-09-11T00:00:00Z' },
    ],
    citas: [
      { cliente_uid: 'A', id: 'c-a', propiedad_id: 'pA', estado: 'CONFIRMED', creada_en: '2026-09-05T00:00:00Z', inicio: '2026-10-01T17:00:00Z', fin: '2026-10-01T18:00:00Z', version: 1, asesor_uid: 'asesor', zona_horaria: 'America/Mexico_City', notas_cliente: null, notas_internas: 'privado del equipo', motivo_cancelacion: null, lugar: null, propiedad_titulo: 'Nave de A', actualizada_en: '2026-09-05T00:00:00Z', propuesta_inicio: null, propuesta_fin: null, propuesta_por: null, estado_previo: null, cliente_nombre: 'A', cliente_telefono: '477', cliente_email: 'a@ejemplo.test' },
      { cliente_uid: 'B', id: 'c-b', propiedad_id: 'pB', estado: 'CONFIRMED', creada_en: '2026-09-06T00:00:00Z', inicio: '2026-10-02T17:00:00Z', fin: '2026-10-02T18:00:00Z', version: 1, asesor_uid: 'asesor', zona_horaria: 'America/Mexico_City', notas_cliente: null, notas_internas: 'privado del equipo', motivo_cancelacion: null, lugar: null, propiedad_titulo: 'Casa de B', actualizada_en: '2026-09-06T00:00:00Z', propuesta_inicio: null, propuesta_fin: null, propuesta_por: null, estado_previo: null, cliente_nombre: 'B', cliente_telefono: '477', cliente_email: 'b@ejemplo.test' },
    ],
    propiedades: [
      { id: 'pA', titulo: 'Nave de A', tipo: 'nave', operacion: 'venta', precio: 1000, precio_incluye_iva: false, moneda: 'MXN', ubicacion: 'León', colonia: null, ciudad: 'León', metros: null, recamaras: null, banos: null, altura_libre: null, andenes: null, estatus: 'disponible', estado_pub: 'publicada', slug: 'nave-de-a', fotos: [], publicada_en: '2026-09-15T00:00:00Z', created_at: '2026-09-15T00:00:00Z' },
      { id: 'pB', titulo: 'Casa de B', tipo: 'casa', operacion: 'renta', precio: 2000, precio_incluye_iva: false, moneda: 'MXN', ubicacion: 'León', colonia: null, ciudad: 'León', metros: null, recamaras: null, banos: null, altura_libre: null, andenes: null, estatus: 'disponible', estado_pub: 'publicada', slug: 'casa-de-b', fotos: [], publicada_en: '2026-09-15T00:00:00Z', created_at: '2026-09-15T00:00:00Z' },
    ],
  } as Record<string, Array<Record<string, unknown>>>,
  escrituras: [] as Array<{ tabla: string; fila: Record<string, unknown>; filtros: Array<[string, unknown]> }>,
}))

vi.mock('@/lib/config/flags-servidor', async (original) => {
  const real = await original<typeof import('../src/lib/config/flags-servidor')>()
  // `FLAGS_APAGADOS` es puro y, desde D-42, vive en `config/flags`.
  const { FLAGS_APAGADOS } = await import('../src/lib/config/flags')
  return { ...real, leerFlags: async () => ({ ...FLAGS_APAGADOS, ...mundo.flags }) }
})

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    let update: Record<string, unknown> | null = null
    const c: Record<string, unknown> = {}
    c.select = () => c
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.order = () => c
    c.limit = () => c
    for (const m of ['lt', 'gt', 'gte', 'lte', 'neq', 'in']) c[m] = () => c
    c.update = (f: Record<string, unknown>) => { update = f; return c }
    c.then = (r: (v: unknown) => unknown) => {
      const filas = (mundo.filas[tabla] ?? []).filter((f) => filtros.every(([k, v]) => !(k in f) || f[k] === v))
      if (update) {
        mundo.escrituras.push({ tabla, fila: update, filtros })
        for (const f of filas) Object.assign(f, update)
        return r({ data: filas, error: null })
      }
      return r({ data: filas, error: null })
    }
    return c
  }
  const { puede } = await import('../src/lib/acceso/permisos')
  // El MISMO autorizador de producción, con sus dependencias inyectadas: así la
  // prueba recorre sesión, suspensión y permiso de verdad (no una imitación).
  const autorizar = real.crearAutorizador({
    verificar: async () => (mundo.sesion ? { uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true } : null),
    perfil: async (u) => ({
      uid: u.uid, email: u.email, emailVerified: true,
      rol: mundo.sesion!.rol as 'cliente' | 'publicador' | 'admin',
      superAdmin: mundo.sesion!.superAdmin,
      estado: mundo.sesion!.estado as 'activo' | 'suspendido',
      nombre: null,
    }),
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({ from: (t: string) => cadena(t) }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar(req, (perfil) => puede(perfil, permiso), permiso),
  }
})

import { GET as guardadas } from '../src/app/api/portal/guardadas/route'
import { GET as busquedas, PATCH as renombrar } from '../src/app/api/portal/busquedas/route'
import { GET as alertas, POST as marcarVistas } from '../src/app/api/portal/alertas/route'
import { GET as consultas } from '../src/app/api/portal/consultas/route'
import { GET as meInteresan } from '../src/app/api/portal/me-interesan/route'
import { GET as visitas } from '../src/app/api/portal/visitas/route'

const CLIENTE_A = { uid: 'A', email: 'a@ejemplo.test', estado: 'activo', rol: 'cliente', superAdmin: false }
const CLIENTE_B = { uid: 'B', email: 'b@ejemplo.test', estado: 'activo', rol: 'cliente', superAdmin: false }

const pedir = (f: (r: Request) => Promise<Response>, cuerpo?: unknown) => f(new Request('https://vivebienn.com/api/portal/x', {
  method: cuerpo === undefined ? 'GET' : 'POST',
  headers: { authorization: 'Bearer token-de-quien-sea', 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${Math.floor(Math.random() * 250)}` },
  ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
}))

const json = async (r: Response) => r.json() as Promise<Record<string, unknown>>

beforeEach(() => {
  mundo.flags = { portalCliente: true, portalClienteInterno: false, citasEnLinea: false }
  mundo.sesion = CLIENTE_A
  mundo.escrituras = []
  mundo.filas.busquedas_guardadas.forEach((b) => { b.revisadas_en = null })
})

describe('cada quien ve lo suyo', () => {
  it('el cliente A ve sólo lo de A', async () => {
    mundo.sesion = CLIENTE_A
    expect((await json(await pedir(guardadas))).guardadas).toMatchObject([{ id: 'pA' }])
    expect((await json(await pedir(busquedas))).busquedas).toMatchObject([{ id: 1, nombre: 'La de A' }])
    expect((await json(await pedir(consultas))).consultas).toMatchObject([{ id: 11 }])
    expect(JSON.stringify(await json(await pedir(consultas)))).not.toContain('soy B')
  })

  it('el cliente B, con los mismos endpoints, ve sólo lo de B', async () => {
    mundo.sesion = CLIENTE_B
    expect((await json(await pedir(guardadas))).guardadas).toMatchObject([{ id: 'pB' }])
    expect((await json(await pedir(busquedas))).busquedas).toMatchObject([{ id: 2, nombre: 'La de B' }])
    expect((await json(await pedir(consultas))).consultas).toMatchObject([{ id: 22 }])
    expect(JSON.stringify(await json(await pedir(consultas)))).not.toContain('soy A')
  })

  it('«Me interesan» de A trae lo de A; el de B, lo de B', async () => {
    mundo.sesion = CLIENTE_A
    expect((await json(await pedir(meInteresan))).interesan).toMatchObject([{ id: 'pA' }])
    mundo.sesion = CLIENTE_B
    expect((await json(await pedir(meInteresan))).interesan).toMatchObject([{ id: 'pB' }])
  })

  it('«Mis visitas» de cada quien, y sin notas internas del equipo', async () => {
    mundo.sesion = CLIENTE_A
    const deA = await json(await pedir(visitas))
    expect(JSON.stringify(deA)).not.toContain('privado del equipo')
    expect(JSON.stringify(deA)).not.toContain('c-b')
    mundo.sesion = CLIENTE_B
    expect(JSON.stringify(await json(await pedir(visitas)))).not.toContain('c-a')
  })

  it('las alertas de cada quien salen de SUS búsquedas', async () => {
    mundo.sesion = CLIENTE_A
    const deA = (await json(await pedir(alertas))).alertas as Array<{ busquedaId: number }>
    expect(deA.map((a) => a.busquedaId)).toEqual([1])
    mundo.sesion = CLIENTE_B
    const deB = (await json(await pedir(alertas))).alertas as Array<{ busquedaId: number }>
    expect(deB.map((a) => a.busquedaId)).toEqual([2])
  })
})

describe('tocar lo ajeno no funciona', () => {
  it('A no puede renombrar la búsqueda de B aunque mande su id', async () => {
    mundo.sesion = CLIENTE_A
    const r = await pedir(renombrar, { id: 2, nombre: 'Ahora es mía' })
    expect(r.status).toBe(404)
    expect(mundo.filas.busquedas_guardadas.find((b) => b.id === 2)!.nombre).toBe('La de B')
  })

  it('A no puede marcar como vistas las alertas de B', async () => {
    mundo.sesion = CLIENTE_A
    await pedir(marcarVistas, { busquedaId: 2 })
    // La escritura lleva SIEMPRE el uid de quien pide, así que no alcanza a B.
    expect(mundo.escrituras[0].filtros).toEqual([['uid', 'A'], ['id', 2]])
    expect(mundo.filas.busquedas_guardadas.find((b) => b.id === 2)!.revisadas_en).toBeNull()
  })

  it('B tampoco puede tocar lo de A (el caso espejo)', async () => {
    mundo.sesion = CLIENTE_B
    expect((await pedir(renombrar, { id: 1, nombre: 'Ahora es de B' })).status).toBe(404)
    expect(mundo.filas.busquedas_guardadas.find((b) => b.id === 1)!.nombre).toBe('La de A')

    await pedir(marcarVistas, { busquedaId: 1 })
    // Ambos intentos llevan SIEMPRE el uid de quien pide, así que no alcanzan a A.
    expect(mundo.escrituras.at(-1)!.filtros).toEqual([['uid', 'B'], ['id', 1]])
    for (const e of mundo.escrituras) expect(e.filtros).toContainEqual(['uid', 'B'])
    expect(mundo.filas.busquedas_guardadas.find((b) => b.id === 1)!.revisadas_en).toBeNull()
  })

  it('marcar todas sólo marca las propias', async () => {
    mundo.sesion = CLIENTE_A
    await pedir(marcarVistas, {})
    expect(mundo.filas.busquedas_guardadas.find((b) => b.id === 1)!.revisadas_en).toBeTruthy()
    expect(mundo.filas.busquedas_guardadas.find((b) => b.id === 2)!.revisadas_en).toBeNull()
  })
})

describe('la puerta', () => {
  const todas = [
    ['guardadas', guardadas], ['busquedas', busquedas], ['alertas', alertas], ['consultas', consultas],
    ['me-interesan', meInteresan], ['visitas', visitas],
  ] as const

  it('sin sesión: 401 en las cuatro', async () => {
    mundo.sesion = null
    for (const [nombre, f] of todas) expect((await pedir(f)).status, nombre).toBe(401)
  })

  it('cuenta suspendida: 403 en las cuatro', async () => {
    mundo.sesion = { ...CLIENTE_A, estado: 'suspendido' }
    for (const [nombre, f] of todas) expect((await pedir(f)).status, nombre).toBe(403)
  })

  it('portal cerrado: 404 aunque la sesión sea válida', async () => {
    mundo.flags = { portalCliente: false, portalClienteInterno: false, citasEnLinea: false }
    mundo.sesion = CLIENTE_A
    for (const [nombre, f] of todas) expect((await pedir(f)).status, nombre).toBe(404)
  })

  it('etapa interna: el cliente recibe 404 y el admin entra', async () => {
    mundo.flags = { portalCliente: false, portalClienteInterno: true, citasEnLinea: false }
    mundo.sesion = CLIENTE_A
    expect((await pedir(guardadas)).status).toBe(404)

    mundo.sesion = { uid: 'A', email: 'admin@vivebienn.com', estado: 'activo', rol: 'admin', superAdmin: false }
    expect((await pedir(guardadas)).status).toBe(200)
  })

  it('escribir tampoco se salta la puerta (cerrado y suspendido)', async () => {
    mundo.flags = { portalCliente: false, portalClienteInterno: false, citasEnLinea: false }
    mundo.sesion = CLIENTE_A
    expect((await pedir(marcarVistas, {})).status).toBe(404)
    expect((await pedir(renombrar, { id: 1, nombre: 'x' })).status).toBe(404)

    mundo.flags = { portalCliente: true, portalClienteInterno: false, citasEnLinea: false }
    mundo.sesion = { ...CLIENTE_A, estado: 'suspendido' }
    expect((await pedir(marcarVistas, {})).status).toBe(403)
    expect(mundo.escrituras).toEqual([])
  })
})

describe('Feature Flags: exclusivamente Super Admin (D-31)', () => {
  it('el permiso sólo lo tiene el super admin, en el catálogo real', async () => {
    const { puede } = await import('../src/lib/acceso/permisos')
    expect(puede({ rol: 'cliente', superAdmin: false }, 'configuracion.flags')).toBe(false)
    expect(puede({ rol: 'publicador', superAdmin: false }, 'configuracion.flags')).toBe(false)
    expect(puede({ rol: 'admin', superAdmin: false }, 'configuracion.flags')).toBe(false)
    expect(puede({ rol: 'admin', superAdmin: true }, 'configuracion.flags')).toBe(true)
  })

  it('la API de flags exige ese permiso en TODOS sus métodos', async () => {
    const { readFileSync } = await import('node:fs')
    const ruta = readFileSync(new URL('../src/app/api/admin/flags/route.ts', import.meta.url), 'utf8')
    const metodos = [...ruta.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)/g)].map((m) => m[1])
    expect(metodos.sort()).toEqual(['GET', 'POST'])
    expect([...ruta.matchAll(/exigir\(req, 'configuracion\.flags'\)/g)]).toHaveLength(metodos.length)
  })

  it('un admin normal que llegue a la API recibe 403 (no 200 con los flags)', async () => {
    const { NextResponse } = await import('next/server')
    const { crearAutorizador } = await import('../src/lib/auth-server')
    const { puede } = await import('../src/lib/acceso/permisos')
    const autorizar = crearAutorizador({
      verificar: async () => ({ uid: 'adm', email: 'admin@vivebienn.com', emailVerified: true }),
      perfil: async () => ({ uid: 'adm', email: 'admin@vivebienn.com', emailVerified: true, rol: 'admin', superAdmin: false, estado: 'activo', nombre: null }),
      denegado: async () => {},
    })
    const r = await autorizar(
      new Request('https://vivebienn.com/api/admin/flags', { headers: { authorization: 'Bearer x' } }),
      (perfil) => puede(perfil, 'configuracion.flags'),
      'configuracion.flags',
    )
    expect(r.error).toBeInstanceOf(NextResponse)
    expect(r.error?.status).toBe(403)
  })
})
