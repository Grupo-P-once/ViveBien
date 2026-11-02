import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearLibro, type Libro } from './dobles/libro-cupo'

// Todo correo reserva cupo en el libro (migración 62 REAL en PGlite): ningún envío de prueba se salta la cuenta del plan gratuito.
const libroH = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../src/lib/correo/libro', () => ({ dbDelLibro: () => libroH.db }))
let libro: Libro
beforeAll(async () => { libro = await crearLibro(); libroH.db = libro.db }, 60_000)
beforeEach(async () => { await libro.vaciar() })
afterAll(async () => { await libro?.cerrar() })
import { crearBase, type Fila } from './dobles/supabase-memoria'
import { correoDeBajaDePrecio } from '../src/lib/avisos-cliente'

// MKT-60: estas pruebas ejercitan el camino con la compuerta común ENCENDIDA; el camino apagado lo cubre tests/correo-compuerta-envio.test.ts.
process.env.CORREO_ENVIO = '1'

/**
 * CORREO de «baja de precio» con RESEND SIMULADO (28-oct-2026). Nada sale a la red. Se prueba: que un aviso en la bandeja NO es un correo; que solo con consentimiento PROPIO (`correo_precio`)
 * sale un correo, al destinatario correcto y con sus datos; que no se duplica; que un fallo de Resend no lo marca como enviado y se reintenta; que la baja en un clic apaga el correo;
 * que sin la migración 60 no sale ningún correo de precio (y lo demás sigue); y que todo va escapado.
 */
const estado = vi.hoisted(() => ({ perfil: null as null | { uid: string; email: string; rol: string; superAdmin: boolean }, base: null as null | ReturnType<typeof import('./dobles/supabase-memoria').crearBase>, bitacora: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/auth-server', () => ({ supabaseAdmin: () => estado.base }))
vi.mock('@/lib/portal/exigir-portal', async () => {
  const { NextResponse } = await import('next/server')
  return { exigirPortal: async () => (estado.perfil ? { perfil: estado.perfil } : { error: NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 }) }) }
})
vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Record<string, unknown>) => { estado.bitacora.push(e) } }))

type Envio = { to: string[]; subject: string; text: string; html: string; headers?: Record<string, string>; from: string }
let enviados: Envio[] = []
let resendOk = true
beforeEach(() => {
  process.env.RESEND_API_KEY = 're_prueba'; process.env.CRON_SECRET = 'secreto-de-prueba-largo-123456'
  process.env.AVISOS_BAJA_SECRETO = 'secreto-de-baja-de-prueba-largo-1234567890'
  enviados = []; resendOk = true; estado.perfil = { uid: 'u-ana', email: 'ana@ejemplo.invalid', rol: 'cliente', superAdmin: false }; estado.bitacora = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    if (String(url).includes('api.resend.com')) { if (!resendOk) return new Response('', { status: 500 }); enviados.push(JSON.parse(init.body)); return new Response('{"id":"re_1"}', { status: 200 }) }
    throw new Error('red no permitida en la prueba')
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

const aviso = (id: number, uid: string, propiedad: string, precioAntes: string, precioAhora: string, extra: Fila = {}): Fila => ({
  id, uid, tipo: 'baja_de_precio', titulo: `Bajó de precio: Casa ${propiedad}`, cuerpo: `VB-2026-0000${propiedad} · Antes ${precioAntes}, ahora ${precioAhora} (6% menos).`, enlace: `/propiedades/casa-${propiedad}`,
  busqueda_id: null, propiedad_id: propiedad, clave: `precio:${propiedad}:1`, creada_en: new Date().toISOString(), leida_en: null, correo_enviado_en: null, ...extra,
})
const montar = (prefs: Fila[], avisos: Fila[], extra: Record<string, Fila[]> = {}) => crearBase({
  usuarios: [{ uid: 'u-ana', email: 'ana@ejemplo.invalid', nombre: 'Ana', estado: 'activo' }, { uid: 'u-luis', email: 'luis@ejemplo.invalid', nombre: 'Luis', estado: 'activo' }, { uid: 'u-baja', email: 'baja@ejemplo.invalid', nombre: 'Baja', estado: 'eliminada' }],
  propiedades: [], busquedas_guardadas: [], legal_aceptaciones: [], cliente_avisos_precio: [], preferencias_notificacion: prefs, notificaciones: avisos, ...extra,
}, { unicas: { notificaciones: ['uid', 'clave'] } })
const tarea = async () => (await import('../src/lib/avisos-cliente-servidor')).avisosDeClientes()

describe('la plantilla', () => {
  const nuevos = [{ uid: 'u-ana', tipo: 'baja_de_precio' as const, titulo: 'Bajó de precio: <b>Casa</b>', cuerpo: 'Antes $2, ahora $1 & "más"', enlace: '/propiedades/x', busqueda_id: null, propiedad_id: 'x', clave: 'k:1' }]
  it('uno: el asunto es el título; varios: «Bajaron de precio N propiedades…»; trae baja, preferencias y el motivo', () => {
    const c = correoDeBajaDePrecio({ nombre: 'Ana', avisos: nuevos, sitio: 'https://vb.test', urlBaja: 'https://vb.test/api/avisos/baja?t=T', urlPreferencias: 'https://vb.test/portal/configuracion' })
    expect(c.asunto).toBe('Bajó de precio: <b>Casa</b>')
    const varios = correoDeBajaDePrecio({ nombre: 'Ana', avisos: [nuevos[0], { ...nuevos[0], clave: 'k:2' }, { ...nuevos[0], clave: 'k:3' }], sitio: 'https://vb.test', urlBaja: 'u', urlPreferencias: 'p' })
    expect(varios.asunto).toBe('Bajaron de precio 3 propiedades que sigues en Vive Bien')
    for (const t of [c.texto, c.html]) { expect(t).toContain('Dejar de recibirlos'.toLowerCase() === '' ? '' : 'api/avisos/baja?t=T'); expect(t).toMatch(/Avisarme cuando baje de precio/) }
  })
  it('TODO va escapado en el HTML (título, cuerpo)', () => {
    const c = correoDeBajaDePrecio({ nombre: '<i>Ana</i>', avisos: nuevos, sitio: 'https://vb.test', urlBaja: 'https://vb.test/b?x=1&y=2', urlPreferencias: 'p' })
    expect(c.html).not.toContain('<b>Casa</b>'); expect(c.html).toContain('&lt;b&gt;Casa&lt;/b&gt;')
    expect(c.html).not.toContain('<i>Ana</i>'); expect(c.html).toContain('&amp;')
    expect(c.html).toContain('x=1&amp;y=2')
  })
})

describe('el disparo (tarea real con Resend simulado)', () => {
  it('SIN consentimiento propio NO sale correo, aunque tenga activadas las alertas de búsquedas: el aviso queda en la bandeja', async () => {
    estado.base = montar([{ uid: 'u-ana', correo_alertas: true, correo_legal: true, correo_precio: false }], [aviso(1, 'u-ana', '1', '$3,200,000', '$3,000,000')])
    const r = await tarea()
    expect(enviados).toEqual([]); expect(r.correosEnviados).toBe(0)
    expect(estado.base.tablas.notificaciones[0].correo_enviado_en).toBeFalsy()
    expect(estado.base.tablas.notificaciones).toHaveLength(1)                    // la alerta DENTRO de la app existe
  })
  it('CON consentimiento: UN correo, al destinatario correcto, con el precio de antes y de ahora, enlace a la propiedad y baja en un clic; queda marcado como enviado', async () => {
    estado.base = montar([{ uid: 'u-ana', correo_alertas: false, correo_legal: true, correo_precio: true }], [aviso(1, 'u-ana', '1', '$3,200,000', '$3,000,000')])
    const r = await tarea()
    expect(r.correosEnviados).toBe(1); expect(r.correosFallidos).toBe(0)
    expect(enviados).toHaveLength(1)
    const e = enviados[0]
    expect(e.to).toEqual(['ana@ejemplo.invalid'])
    expect(e.subject).toBe('Bajó de precio: Casa 1')
    expect(e.text).toContain('Antes $3,200,000, ahora $3,000,000'); expect(e.text).toContain('/propiedades/casa-1')
    expect(e.html).toMatch(/\/api\/avisos\/baja\?t=/)
    expect(e.headers?.['List-Unsubscribe']).toMatch(/api\/avisos\/baja\?t=/); expect(e.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(e.from).toBeTruthy()
    expect(estado.base.tablas.notificaciones[0].correo_enviado_en).toBeTruthy()
    expect(JSON.stringify(e)).not.toContain('re_prueba')                          // la clave nunca va en el correo
  })
  it('IDEMPOTENTE: repetir la tarea no manda el mismo correo dos veces', async () => {
    estado.base = montar([{ uid: 'u-ana', correo_alertas: false, correo_legal: true, correo_precio: true }], [aviso(1, 'u-ana', '1', '$3,200,000', '$3,000,000')])
    await tarea(); await tarea(); await tarea()
    expect(enviados).toHaveLength(1)
  })
  it('varias bajas de la misma persona → UN solo correo con todas', async () => {
    estado.base = montar([{ uid: 'u-ana', correo_alertas: false, correo_legal: true, correo_precio: true }], [aviso(1, 'u-ana', '1', '$3,200,000', '$3,000,000'), aviso(2, 'u-ana', '2', '$2,500,000', '$2,300,000')])
    await tarea()
    expect(enviados).toHaveLength(1)
    expect(enviados[0].subject).toBe('Bajaron de precio 2 propiedades que sigues en Vive Bien')
    expect(enviados[0].text).toContain('Casa 1'); expect(enviados[0].text).toContain('Casa 2')
  })
  it('AISLAMIENTO: cada persona recibe solo lo suyo; quien no consintió no recibe nada', async () => {
    estado.base = montar(
      [{ uid: 'u-ana', correo_alertas: false, correo_legal: true, correo_precio: true }, { uid: 'u-luis', correo_alertas: true, correo_legal: true, correo_precio: false }],
      [aviso(1, 'u-ana', '1', '$3,200,000', '$3,000,000'), aviso(2, 'u-luis', '2', '$2,500,000', '$2,300,000')],
    )
    await tarea()
    expect(enviados.map((e) => e.to[0])).toEqual(['ana@ejemplo.invalid'])
    expect(enviados[0].text).toContain('Casa 1'); expect(enviados[0].text).not.toContain('Casa 2')
    expect(estado.base.tablas.notificaciones.find((n) => n.uid === 'u-luis')!.correo_enviado_en).toBeFalsy()
  })
  it('si Resend FALLA no se marca como enviado, se cuenta como fallido y se reintenta SIN duplicar el aviso', async () => {
    estado.base = montar([{ uid: 'u-ana', correo_alertas: false, correo_legal: true, correo_precio: true }], [aviso(1, 'u-ana', '1', '$3,200,000', '$3,000,000')])
    resendOk = false
    const r1 = await tarea()
    expect(r1.correosEnviados).toBe(0); expect(r1.correosFallidos).toBe(1)
    expect(estado.base.tablas.notificaciones[0].correo_enviado_en).toBeFalsy()
    resendOk = true
    // «Al día siguiente»: el envío fallido de la primera corrida ya tiene más de 10 minutos en el libro y se puede reintentar con su misma clave.
    await libro.pg.exec("update public.correo_envios set creado_en = now() - interval '11 minutes'")
    const r2 = await tarea()
    expect(r2.correosEnviados).toBe(1); expect(enviados).toHaveLength(1)
    expect(estado.base.tablas.notificaciones).toHaveLength(1)
  })
  it('cuenta eliminada o sin correo: no se manda nada', async () => {
    estado.base = montar([{ uid: 'u-baja', correo_alertas: true, correo_legal: true, correo_precio: true }], [aviso(1, 'u-baja', '1', '$3,200,000', '$3,000,000')])
    await tarea()
    expect(enviados).toEqual([])
  })
  it('sin la clave de Resend no se envía nada y no se rompe (el aviso queda pendiente)', async () => {
    delete process.env.RESEND_API_KEY
    estado.base = montar([{ uid: 'u-ana', correo_alertas: false, correo_legal: true, correo_precio: true }], [aviso(1, 'u-ana', '1', '$3,200,000', '$3,000,000')])
    const r = await tarea()
    expect(enviados).toEqual([]); expect(r.correosEnviados).toBe(0)
    expect(estado.base.tablas.notificaciones[0].correo_enviado_en).toBeFalsy()
  })
  it('SIN la migración 60 (no existe `correo_precio`): ningún correo de precio, y las alertas de búsquedas SIGUEN saliendo', async () => {
    const base = montar(
      [{ uid: 'u-ana', correo_alertas: true, correo_legal: true }],
      [aviso(1, 'u-ana', '1', '$3,200,000', '$3,000,000'), { id: 2, uid: 'u-ana', tipo: 'busqueda_nueva', titulo: 'Nueva propiedad', cuerpo: 'Casa en León', enlace: '/propiedades/x', busqueda_id: 1, propiedad_id: 'x', clave: 'busqueda:1:x', creada_en: new Date().toISOString(), leida_en: null, correo_enviado_en: null }],
      { busquedas_guardadas: [{ id: 1, uid: 'u-ana', nombre: 'Mi búsqueda', filtros: { op: 'venta' }, alertas: false, frecuencia: 'diaria', creado_en: new Date(Date.now() - 864e5).toISOString(), avisada_en: null }] },
    )
    const original = base.from.bind(base)
    ;(base as unknown as { from: (t: string) => unknown }).from = (t: string) => {
      const q = original(t) as Record<string, unknown>
      if (t === 'preferencias_notificacion' && typeof q.select === 'function') {
        return { ...q, select: (cols: string) => (String(cols).includes('correo_precio') ? { in: async () => ({ data: null, error: { code: '42703', message: 'column preferencias_notificacion.correo_precio does not exist' } }) } : (q.select as (c: string) => unknown)(cols)) }
      }
      return q
    }
    estado.base = base
    const r = await tarea()
    expect(r.correosEnviados).toBe(1)
    expect(enviados).toHaveLength(1)
    expect(enviados[0].subject).toMatch(/propiedad nueva para tu búsqueda/)       // la alerta de búsquedas
    expect(enviados.some((e) => /Bajó de precio/.test(e.subject))).toBe(false)     // y NINGUNA de precio
  })
})

describe('preferencias y baja en un clic', () => {
  it('PUT correoPrecio=true guarda el consentimiento con su fecha y deja bitácora (sin el correo); apagar lo quita', async () => {
    estado.base = montar([], [])
    const { PUT, GET } = await import('../src/app/api/portal/preferencias/route')
    const put = (c: unknown) => PUT(new Request('https://vb.test/api/portal/preferencias', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }))
    // 30-oct-2026: sin fila, el correo de precio nace ACTIVADO (decisión del dueño); para probar el consentimiento con fecha se apaga y se vuelve a encender.
    expect(((await (await put({ correoPrecio: false })).json()) as { correoPrecio: boolean }).correoPrecio).toBe(false)
    const r = await put({ correoPrecio: true })
    expect(r.status).toBe(200)
    const j = await r.json() as { correoPrecio: boolean; correoAlertas: boolean; consentimientoPrecioEn: string | null }
    expect(j.correoPrecio).toBe(true); expect(j.correoAlertas).toBe(true); expect(j.consentimientoPrecioEn).toBeTruthy()
    expect(estado.bitacora.map((b) => b.accion)).toContain('cuenta.avisos_precio_correo_activados')
    expect(JSON.stringify(estado.bitacora.map(({ actor, ...resto }) => { void actor; return resto }))).not.toContain('ana@ejemplo.invalid')   // el detalle de la bitácora no lleva el correo (el actor lo resuelve la propia bitácora)
    expect((await (await GET(new Request('https://vb.test/x'))).json() as { correoPrecio: boolean }).correoPrecio).toBe(true)
    const off = await (await put({ correoPrecio: false })).json() as { correoPrecio: boolean }
    expect(off.correoPrecio).toBe(false)
  })
  it('lo que NO es booleano o viene vacío se rechaza (400); el consentimiento de las alertas de búsquedas no cambia el de precio', async () => {
    estado.base = montar([{ uid: 'u-ana', correo_alertas: false, correo_legal: true, correo_precio: false }], [])
    const { PUT } = await import('../src/app/api/portal/preferencias/route')
    const put = (c: unknown) => PUT(new Request('https://vb.test/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }))
    expect((await put({ correoPrecio: 'si' })).status).toBe(400); expect((await put({})).status).toBe(400)
    const j = await (await put({ correoAlertas: true })).json() as { correoAlertas: boolean; correoPrecio: boolean }
    expect(j.correoAlertas).toBe(true); expect(j.correoPrecio).toBe(false)
  })
  it('SIN la migración 60 no se puede encender el correo de precio (503) y nada se guarda como consentido', async () => {
    estado.base = montar([], [])
    const original = estado.base.from.bind(estado.base)
    ;(estado.base as unknown as { from: (t: string) => unknown }).from = (t: string) => {
      const q = original(t) as Record<string, unknown>
      if (t === 'preferencias_notificacion' && typeof q.select === 'function') {
        return { ...q, select: (cols: string) => (String(cols).includes('correo_precio') ? { eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42703', message: 'column does not exist' } }) }) } : (q.select as (c: string) => unknown)(cols)) }
      }
      return q
    }
    const { PUT } = await import('../src/app/api/portal/preferencias/route')
    const r = await PUT(new Request('https://vb.test/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correoPrecio: true }) }))
    expect(r.status).toBe(503)
    expect(estado.base.tablas.preferencias_notificacion).toHaveLength(0)
  })
  it('«Dejar de recibirlos» (POST con el token del correo) apaga el correo de precio Y el de alertas, y nunca enciende nada', async () => {
    estado.base = montar([{ uid: 'u-ana', correo_alertas: true, correo_legal: true, correo_precio: true, consentimiento_alertas_en: '2026-10-01T00:00:00Z' }], [])
    const { crearTokenDeBaja } = await import('../src/lib/avisos-token')
    const t = crearTokenDeBaja('u-ana')
    expect(t).toBeTruthy()
    const { POST } = await import('../src/app/api/avisos/baja/route')
    const r = await POST(new Request(`https://vb.test/api/avisos/baja?t=${t}`, { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.7' } }))
    expect(r.status).toBe(200)
    const fila = estado.base.tablas.preferencias_notificacion[0]
    expect(fila.correo_alertas).toBe(false); expect(fila.correo_precio).toBe(false); expect(fila.correo_legal).toBe(true)
    // un token inválido no cambia nada
    estado.base.tablas.preferencias_notificacion[0].correo_precio = true
    await POST(new Request('https://vb.test/api/avisos/baja?t=basura', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.8' } }))
    expect(estado.base.tablas.preferencias_notificacion[0].correo_precio).toBe(true)
  })
})
