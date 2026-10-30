import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBase, type Fila } from './dobles/supabase-memoria'
import { cambiosDePrecio, porcentajeDeBaja, type PropiedadConPrecio, type SuscripcionDePrecio } from '../src/lib/avisos-precio'

/**
 * «Avisarme cuando baje de precio» (28-oct-2026): la regla (código puro), la tarea diaria que guarda el aviso en la bandeja, y la ruta de la campana (solo con cuenta).
 * Supabase de memoria; nada sale a la red.
 */
const estado = vi.hoisted(() => ({ perfil: null as null | { uid: string }, base: null as null | ReturnType<typeof import('./dobles/supabase-memoria').crearBase> }))
vi.mock('@/lib/auth-server', () => ({ supabaseAdmin: () => estado.base }))
vi.mock('@/lib/portal/exigir-portal', async () => {
  const { NextResponse } = await import('next/server')
  return { exigirPortal: async () => (estado.perfil ? { perfil: estado.perfil } : { error: NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 }) }) }
})
vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))

const prop = (id: string, o: Partial<PropiedadConPrecio> = {}): PropiedadConPrecio => ({ id, slug: `casa-${id}`, titulo: `Casa ${id}`, folio: `VB-2026-0000${id}`, tipo: 'casa', operacion: 'venta', precio: 3_000_000, moneda: 'MXN', estado_pub: 'publicada', estatus: 'disponible', ...o })
const sub = (uid: string, id: string, base: number | string, moneda = 'MXN'): SuscripcionDePrecio => ({ uid, propiedad_id: id, precio_base: base, moneda })

describe('la regla: qué es una baja', () => {
  it('baja → aviso con antes, ahora y porcentaje; el enlace va a la ficha; la clave lleva el precio nuevo', () => {
    const [c] = cambiosDePrecio([sub('u1', '1', 3_500_000)], [prop('1', { precio: 3_000_000 })], Date.parse('2026-10-29T12:00:00Z'))
    expect(c.aviso).toMatchObject({ uid: 'u1', tipo: 'baja_de_precio', propiedad_id: '1', enlace: '/propiedades/casa-1', clave: 'precio:1:3000000:2026-10-29', busqueda_id: null })
    expect(c.aviso!.titulo).toContain('Bajó de precio')
    expect(c.aviso!.cuerpo).toContain('$3,500,000'); expect(c.aviso!.cuerpo).toContain('$3,000,000'); expect(c.aviso!.cuerpo).toContain('14% menos')
  })
  it('precio que llega como texto (numeric de la base) también compara', () => {
    expect(cambiosDePrecio([sub('u1', '1', '3500000')], [prop('1', { precio: '3000000' })])[0].aviso).not.toBeNull()
  })
  it('igual → nada; subida → sin aviso pero el precio de partida se mueve', () => {
    expect(cambiosDePrecio([sub('u1', '1', 3_000_000)], [prop('1')])).toEqual([])
    const [c] = cambiosDePrecio([sub('u1', '1', 2_500_000)], [prop('1', { precio: 3_000_000 })])
    expect(c.aviso).toBeNull(); expect(c.nuevo).toBe(3_000_000)
  })
  it('NO avisa de propiedades no disponibles, sin precio o inexistentes (el cambio de moneda se prueba aparte: no avisa pero reinicia la partida)', () => {
    const casos: Array<PropiedadConPrecio | null> = [prop('1', { estatus: 'vendida' }), prop('1', { estado_pub: 'borrador' }), prop('1', { estatus: 'pausada' }), prop('1', { precio: null }), prop('1', { precio: 0 }), null]
    for (const p of casos) expect(cambiosDePrecio([sub('u1', '1', 9_000_000)], p ? [p] : []), JSON.stringify(p)).toEqual([])
  })
  it('varias personas, una propiedad: cada una recibe SU aviso', () => {
    const r = cambiosDePrecio([sub('u1', '1', 4_000_000), sub('u2', '1', 3_200_000), sub('u3', '1', 3_000_000)], [prop('1')])
    expect(r.map((x) => x.uid).sort()).toEqual(['u1', 'u2'])
  })
  it('porcentaje: mínimo 1 y redondeado', () => { expect(porcentajeDeBaja(1000, 999)).toBe(1); expect(porcentajeDeBaja(1000, 900)).toBe(10) })
})

describe('la tarea diaria guarda el aviso en la bandeja (idempotente)', () => {
  const montar = () => crearBase({
    usuarios: [{ uid: 'u-ana', email: 'ana@ejemplo.invalid', nombre: 'Ana', estado: 'activo' }],
    propiedades: [prop('1', { precio: 3_000_000 }) as Fila, prop('2', { precio: 2_000_000 }) as Fila],
    cliente_avisos_precio: [{ uid: 'u-ana', propiedad_id: '1', precio_base: 3_500_000, moneda: 'MXN', avisado_en: null }, { uid: 'u-ana', propiedad_id: '2', precio_base: 2_000_000, moneda: 'MXN', avisado_en: null }],
    busquedas_guardadas: [], preferencias_notificacion: [], legal_aceptaciones: [], notificaciones: [],
  }, { unicas: { notificaciones: ['uid', 'clave'] } }, { notificaciones: () => ({ creada_en: new Date().toISOString() }) })

  it('avisa SOLO de la que bajó, mueve el precio de partida y repetir la tarea no duplica', async () => {
    delete process.env.RESEND_API_KEY
    estado.base = montar()
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r1 = await avisosDeClientes()
    expect(r1.bajasDePrecio).toBe(1)
    const ns = estado.base!.tablas.notificaciones
    expect(ns).toHaveLength(1); expect(ns[0]).toMatchObject({ uid: 'u-ana', tipo: 'baja_de_precio', propiedad_id: '1' })
    expect(estado.base!.tablas.cliente_avisos_precio.find((s) => s.propiedad_id === '1')).toMatchObject({ precio_base: 3_000_000 })
    expect(estado.base!.tablas.cliente_avisos_precio.find((s) => s.propiedad_id === '1')!.avisado_en).toBeTruthy()
    await avisosDeClientes()
    expect(estado.base!.tablas.notificaciones).toHaveLength(1)          // idempotente
    // otra baja posterior → otro aviso (clave con el precio nuevo)
    estado.base!.tablas.propiedades.find((p) => p.id === '1')!.precio = 2_800_000
    await avisosDeClientes()
    expect(estado.base!.tablas.notificaciones).toHaveLength(2)
  })

  it('sin la tabla (migración 59 sin aplicar) la tarea sigue y no rompe', async () => {
    delete process.env.RESEND_API_KEY
    const b = crearBase({ usuarios: [], propiedades: [], busquedas_guardadas: [], preferencias_notificacion: [], legal_aceptaciones: [], notificaciones: [] }, { unicas: { notificaciones: ['uid', 'clave'] } })
    estado.base = b
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    await expect(avisosDeClientes()).resolves.toBeTruthy()
  })
})

describe('la ruta de la campana: solo con cuenta, solo lo suyo', () => {
  const POST = (cuerpo: unknown) => new Request('https://vb.test/api/portal/avisos-precio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const GET = (id: string) => new Request(`https://vb.test/api/portal/avisos-precio?propiedadId=${id}`)
  beforeEach(() => {
    estado.perfil = { uid: 'u-ana' }
    estado.base = crearBase({ propiedades: [prop('1', { precio: 3_000_000 }) as Fila, prop('v', { estatus: 'vendida' }) as Fila, prop('sp', { precio: null }) as Fila, prop('b', { estado_pub: 'borrador' }) as Fila], cliente_avisos_precio: [] }, { unicas: { cliente_avisos_precio: ['uid', 'propiedad_id'] } })
  })

  it('SIN sesión: 401 y no guarda nada', async () => {
    estado.perfil = null
    const { POST: post, GET: get } = await import('../src/app/api/portal/avisos-precio/route')
    expect((await post(POST({ propiedadId: '1', activo: true }))).status).toBe(401)
    expect((await get(GET('1'))).status).toBe(401)
    expect(estado.base!.tablas.cliente_avisos_precio).toHaveLength(0)
  })
  it('enciende con el precio de AHORA a nombre de la sesión (el cuerpo no manda de quién es), lo consulta y lo apaga', async () => {
    const { POST: post, GET: get } = await import('../src/app/api/portal/avisos-precio/route')
    const r = await post(new Request('https://vb.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ propiedadId: '1', activo: true, uid: 'u-otro' }) }))
    expect(r.status).toBe(201)
    expect(estado.base!.tablas.cliente_avisos_precio).toEqual([expect.objectContaining({ uid: 'u-ana', propiedad_id: '1', precio_base: 3_000_000, moneda: 'MXN' })])
    expect(await (await get(GET('1'))).json()).toMatchObject({ activo: true })
    expect((await (await post(POST({ propiedadId: '1', activo: true }))).json())).toMatchObject({ yaEstaba: true })   // no pisa el precio de partida
    expect((await post(POST({ propiedadId: '1', activo: false }))).status).toBe(200)
    expect(estado.base!.tablas.cliente_avisos_precio).toHaveLength(0)
    expect(await (await get(GET('1'))).json()).toMatchObject({ activo: false })
  })
  it('rechaza lo inválido: propiedad vendida/borrador/inexistente (404), sin precio (422), cuerpo roto (400)', async () => {
    const { POST: post } = await import('../src/app/api/portal/avisos-precio/route')
    for (const id of ['v', 'b', 'no-existe']) expect((await post(POST({ propiedadId: id, activo: true }))).status, id).toBe(404)
    expect((await post(POST({ propiedadId: 'sp', activo: true }))).status).toBe(422)
    expect((await post(POST({ propiedadId: '1' }))).status).toBe(400)
    expect((await post(POST({ propiedadId: 'a b', activo: true }))).status).toBe(400)
    expect(estado.base!.tablas.cliente_avisos_precio).toHaveLength(0)
  })
  it('una persona no ve ni quita los avisos de otra', async () => {
    const { POST: post, GET: get } = await import('../src/app/api/portal/avisos-precio/route')
    await post(POST({ propiedadId: '1', activo: true }))
    estado.perfil = { uid: 'u-luis' }
    expect(await (await get(GET('1'))).json()).toMatchObject({ activo: false })
    await post(POST({ propiedadId: '1', activo: false }))
    expect(estado.base!.tablas.cliente_avisos_precio).toHaveLength(1)           // el de Ana sigue
  })
})

describe('REVISIÓN: defectos hallados en la tercera revisión independiente', () => {
  it('baja → sube → vuelve a bajar al MISMO precio: la segunda baja sí es otro aviso (la clave lleva el día)', () => {
    const a = cambiosDePrecio([sub('u1', '1', 100)], [prop('1', { precio: 90 })], Date.parse('2026-10-29T12:00:00Z'))[0].aviso!
    const b = cambiosDePrecio([sub('u1', '1', 100)], [prop('1', { precio: 90 })], Date.parse('2026-10-31T12:00:00Z'))[0].aviso!
    expect(a.clave).not.toBe(b.clave)
    const mismoDia = cambiosDePrecio([sub('u1', '1', 100)], [prop('1', { precio: 90 })], Date.parse('2026-10-29T23:00:00Z'))[0].aviso!
    expect(mismoDia.clave).toBe(a.clave)                         // el mismo día no se duplica
  })
  it('cambio de moneda: no se avisa pero la partida se reinicia en la moneda nueva', () => {
    const [c] = cambiosDePrecio([sub('u1', '1', 100, 'MXN')], [prop('1', { precio: 5000, moneda: 'USD' })])
    expect(c.aviso).toBeNull(); expect(c.moneda).toBe('USD'); expect(c.nuevo).toBe(5000)
  })

  const montar = (extra: Record<string, unknown[]> = {}) => crearBase({
    usuarios: [{ uid: 'u-ana', email: 'ana@ejemplo.invalid', nombre: 'Ana', estado: 'activo' }],
    propiedades: [prop('1', { precio: 3_000_000 }) as Fila],
    cliente_avisos_precio: [{ uid: 'u-ana', propiedad_id: '1', precio_base: 3_500_000, moneda: 'MXN', avisado_en: null }],
    busquedas_guardadas: [], preferencias_notificacion: [], legal_aceptaciones: [], notificaciones: [], ...extra,
  }, { unicas: { notificaciones: ['uid', 'clave'] } }, { notificaciones: () => ({ creada_en: new Date().toISOString() }) })

  it('si NO se pudo guardar el aviso, el precio de partida NO se mueve y mañana se reintenta sin perder la baja', async () => {
    delete process.env.RESEND_API_KEY
    const base = montar()
    estado.base = base
    const original = base.from.bind(base)
    let falla = true
    ;(base as unknown as { from: (t: string) => unknown }).from = (t: string) => {
      const q = original(t) as Record<string, unknown>
      if (t === 'notificaciones' && falla && typeof q.upsert === 'function') return { ...q, upsert: async () => ({ data: null, error: { message: 'caída transitoria' } }) }
      return q
    }
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    await avisosDeClientes()
    expect(base.tablas.cliente_avisos_precio[0].precio_base).toBe(3_500_000)       // no se movió
    expect(base.tablas.notificaciones).toHaveLength(0)
    falla = false
    await avisosDeClientes()
    expect(base.tablas.notificaciones).toHaveLength(1)                              // reintento: la baja se avisa
    expect(base.tablas.cliente_avisos_precio[0].precio_base).toBe(3_000_000)
  })

  it('los avisos de precio corren aunque la lectura de las búsquedas guardadas falle', async () => {
    delete process.env.RESEND_API_KEY
    const base = montar()
    delete (base.tablas as Record<string, unknown>).busquedas_guardadas              // la tabla "no existe": esa lectura falla
    estado.base = base
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r = await avisosDeClientes()
    expect(r.bajasDePrecio).toBe(1)
  })
})
