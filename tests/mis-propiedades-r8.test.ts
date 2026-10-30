import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R8 (18-oct-2026): «Mis propiedades» dentro del sidebar y como primera cosa de la página.
 * Simulación LOCAL (doble de PostgREST + autorizador real de `auth-server`); la comprobación contra Preview/staging va aparte.
 *  · Aislamiento: cada cuenta recibe SOLO lo suyo, también un administrador cuando pide el resumen del menú.
 *  · Estados y permisos: lo que se puede editar sale de la regla que ya existía (`puedeEditarAnuncio`).
 *  · Navegación: la lista está en el sidebar con «Ver todas», con tope y desplazamiento; en la página va antes del alta.
 */

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'A', email: 'a@ejemplo.test', rol: 'publicador', superAdmin: false, estado: 'activo' } as Record<string, unknown>,
  props: [] as Array<Record<string, unknown>>,
  consultas: [] as Array<{ columnas: string; filtros: Array<[string, unknown]>; limite: number | null; conteo: boolean }>,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = () => {
    const filtros: Array<[string, unknown]> = []
    let columnas = '*'; let limite: number | null = null; let conteo = false
    const c: Record<string, unknown> = {}
    c.select = (cols?: string, o?: { count?: string }) => { columnas = cols ?? '*'; conteo = o?.count === 'exact'; return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.order = () => c
    c.limit = (n: number) => { limite = n; return c }
    c.maybeSingle = async () => ({ data: mundo.props.find((f) => filtros.every(([k, v]) => f[k] === v)) ?? null, error: null })
    c.then = (r: (v: unknown) => unknown) => {
      mundo.consultas.push({ columnas, filtros: [...filtros], limite, conteo })
      const todas = mundo.props.filter((f) => filtros.every(([k, v]) => f[k] === v))
      const cortadas = limite === null ? todas : todas.slice(0, limite)
      // Un doble fiel: con columnas explícitas solo devuelve esas; con `*` devuelve la fila completa.
      const lista = columnas.trim() === '*' ? cortadas : cortadas.map((f) => Object.fromEntries(columnas.split(',').map((k) => k.trim()).map((k) => [k, f[k]])))
      return r({ data: lista, error: null, count: conteo ? todas.length : null })
    }
    return c
  }
  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: mundo.sesion.uid as string, email: mundo.sesion.email as string, emailVerified: true }),
    perfil: async (u) => ({ ...u, emailVerified: true, nombre: null, ...mundo.sesion }) as Awaited<ReturnType<typeof real.getPerfil>>,
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({ from: () => cadena() }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    registrarIntentoDenegado: async () => {},
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))
vi.mock('@/lib/asignar-slug', () => ({ asignarSlugAlPublicar: async () => null, nombrarSiEstaPublicada: async () => {} }))

import { GET as listar } from '../src/app/api/publicador/propiedades/route'
import { GET as leer } from '../src/app/api/admin/propiedades/[id]/route'
import {
  COLUMNAS_RESUMEN, MAXIMO_EN_MENU, accesoAPropiedad, etiquetaDeEstado, nombreParaMenu, resumenParaMenu, rutaDeFicha,
} from '../src/lib/publicador/lista'

const leerFuente = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const R = (url: string) => new Request(`https://vivebienn.com${url}`, { headers: { authorization: 'Bearer t' } })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const A = { uid: 'A', email: 'a@ejemplo.test', rol: 'publicador', superAdmin: false, estado: 'activo' }
const B = { uid: 'B', email: 'b@ejemplo.test', rol: 'publicador', superAdmin: false, estado: 'activo' }
const ADMIN = { uid: 'ADM', email: 'adm@vivebienn.com', rol: 'admin', superAdmin: false, estado: 'activo' }
const CLIENTE = { uid: 'C', email: 'c@ejemplo.test', rol: 'cliente', superAdmin: false, estado: 'activo' }

const fila = (id: string, dueno: string, estado = 'borrador') => ({
  id, owner_id: dueno, estado_pub: estado, titulo: `Prop ${id}`, tipo: 'casa', operacion: 'venta', folio: `VB-2026-${id}`, completitud: 90,
  // Lo que NUNCA debe salir en el resumen del menú:
  whatsapp: '4770000000', telefono: '477', revisado_por: 'admin@vivebienn.com', nota_moderacion: 'nota interna', precio: 1000,
})

beforeEach(() => {
  mundo.sesion = A
  mundo.consultas = []
  mundo.props = [fila('a1', 'A', 'borrador'), fila('a2', 'A', 'en_revision'), fila('a3', 'A', 'publicada'), fila('b1', 'B', 'publicada'), fila('x1', 'ADM', 'publicada')]
})

describe('aislamiento: el resumen del menú es SIEMPRE de la cuenta de la sesión', () => {
  it('un publicador recibe solo lo suyo (y el servidor filtra por su uid, no el navegador)', async () => {
    const j = await (await listar(R('/api/publicador/propiedades?resumen=1'))).json() as { propiedades: Array<{ id: string }>; total: number }
    expect(j.propiedades.map((p) => p.id).sort()).toEqual(['a1', 'a2', 'a3'])
    expect(j.total).toBe(3)
    expect(mundo.consultas.at(-1)?.filtros).toContainEqual(['owner_id', 'A'])
  })

  it('otro publicador (B) no ve nada de A: la sesión decide, aunque la URL traiga un uid o un id ajeno', async () => {
    mundo.sesion = B
    const j = await (await listar(R('/api/publicador/propiedades?resumen=1&owner_id=A&uid=A'))).json() as { propiedades: Array<{ id: string }> }
    expect(j.propiedades.map((p) => p.id)).toEqual(['b1'])
    expect(mundo.consultas.at(-1)?.filtros).toContainEqual(['owner_id', 'B'])
    expect(mundo.consultas.at(-1)?.filtros.filter(([k]) => k === 'owner_id')).toHaveLength(1)
  })

  it('un ADMIN con ?resumen=1 recibe solo lo que ÉL subió, no el inventario; sin resumen, la lista completa sigue igual (no se cambió su permiso)', async () => {
    mundo.sesion = ADMIN
    const resumen = await (await listar(R('/api/publicador/propiedades?resumen=1'))).json() as { propiedades: Array<{ id: string }> }
    expect(resumen.propiedades.map((p) => p.id)).toEqual(['x1'])
    const completa = await (await listar(R('/api/publicador/propiedades'))).json() as Array<{ id: string }>
    expect(completa.map((p) => p.id).sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'x1'])
  })

  it('el resumen no lleva contacto, notas del revisor, dueño ni precio: solo las columnas del menú', async () => {
    const j = await (await listar(R('/api/publicador/propiedades?resumen=1'))).json() as { propiedades: Array<Record<string, unknown>> }
    const permitidas = new Set(COLUMNAS_RESUMEN.split(',').map((c) => c.trim()))
    for (const p of j.propiedades) for (const k of Object.keys(p)) expect(permitidas.has(k), k).toBe(true)
    const crudo = JSON.stringify(j)
    for (const secreto of ['4770000000', 'admin@vivebienn.com', 'nota interna', 'owner_id', 'whatsapp', 'revisado_por']) expect(crudo).not.toContain(secreto)
  })

  it('con muchas propiedades el menú trae solo las más recientes (tope) y el total real viaja aparte', async () => {
    mundo.props = Array.from({ length: 45 }, (_, i) => fila(`m${i}`, 'A', 'borrador'))
    const j = await (await listar(R('/api/publicador/propiedades?resumen=1'))).json() as { propiedades: unknown[]; total: number }
    expect(j.propiedades).toHaveLength(MAXIMO_EN_MENU)
    expect(j.total).toBe(45)
    expect(mundo.consultas.at(-1)?.limite).toBe(MAXIMO_EN_MENU)
  })

  it('sin propiedades: lista vacía y total 0 (no un error)', async () => {
    mundo.props = [fila('b1', 'B')]
    const r = await listar(R('/api/publicador/propiedades?resumen=1'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ propiedades: [], total: 0 })
  })

  it('un cliente (sin permiso para gestionar propiedades) recibe 403 y ninguna fila', async () => {
    mundo.sesion = CLIENTE
    const r = await listar(R('/api/publicador/propiedades?resumen=1'))
    expect(r.status).toBe(403)
    expect(mundo.consultas).toHaveLength(0)
  })

  it('abrir una propiedad AJENA por id (lo que haría un enlace pegado a mano) responde 403 en el servidor', async () => {
    expect((await leer(R('/x'), ctx('b1'))).status).toBe(403)
    expect((await leer(R('/x'), ctx('a1'))).status).toBe(200)
  })

  it('el asistente solo encuentra una propiedad si está en la lista que el servidor le da a ESA sesión (la ajena no existe para él)', async () => {
    // El asistente (/publicador/propiedades/[id]/editar) pide la lista de la sesión y busca el id ahí; sin fila, dice «no existe o no es tuya».
    const lista = (await (await listar(R('/api/publicador/propiedades'))).json()) as Array<{ id: string }>
    expect(lista.some((p) => p.id === 'a1')).toBe(true)
    expect(lista.some((p) => p.id === 'b1')).toBe(false)
    const editor = leerFuente('src/app/publicador/propiedades/[id]/editar/page.tsx')
    expect(editor).toContain("fetch('/api/publicador/propiedades'")
    expect(editor).toContain('todas.find(p => p.id === id)')
    expect(editor).toContain('Esa propiedad no existe o no es tuya.')
  })
})

describe('estados y permisos: qué ofrece el acceso a cada propiedad', () => {
  const o = (estadoPub: string, esAdmin = false, editaPublicadas = false, completa = true) => accesoAPropiedad({ estadoPub, esAdmin, editaPublicadas, completa })

  it('borrador, cambios pedidos y rechazada se editan; si falta avance dice «Completar ficha»', () => {
    for (const e of ['borrador', 'cambios_solicitados', 'rechazada']) {
      expect(o(e)).toEqual({ editable: true, texto: 'Editar ficha' })
      expect(o(e, false, false, false)).toEqual({ editable: true, texto: 'Completar ficha' })
    }
  })

  it('en revisión NO se edita (solo se ve), con o sin capacidad; un administrador sí puede', () => {
    expect(o('en_revision')).toEqual({ editable: false, texto: 'Ver ficha' })
    expect(o('en_revision', false, true)).toEqual({ editable: false, texto: 'Ver ficha' })
    expect(o('en_revision', true).editable).toBe(true)
  })

  it('publicada: solo con `editar_publicadas` (asociado por defecto) se edita; un publicador normal la ve', () => {
    expect(o('publicada', false, false)).toEqual({ editable: false, texto: 'Ver ficha' })
    expect(o('publicada', false, true)).toEqual({ editable: true, texto: 'Editar ficha' })
    expect(o('publicada', true, false).editable).toBe(true)
  })

  it('las etiquetas de estado son claras y un estado raro no se inventa', () => {
    expect(etiquetaDeEstado('borrador')).toBe('Borrador')
    expect(etiquetaDeEstado('en_revision')).toBe('En revisión')
    expect(etiquetaDeEstado('publicada')).toBe('Publicada')
    expect(etiquetaDeEstado('loquesea')).toBe('Sin estado')
    expect(etiquetaDeEstado(null)).toBe('Sin estado')
  })

  it('la modalidad decide por capacidades, no por el nombre: el asociado edita publicadas porque su capacidad lo dice', async () => {
    const { capacidadesEfectivas } = await import('../src/lib/acceso/capacidades')
    const aso = capacidadesEfectivas({ rol: 'publicador', tipo: 'asociado', overrides: {} })
    const pub = capacidadesEfectivas({ rol: 'publicador', tipo: 'publicador', overrides: {} })
    expect(accesoAPropiedad({ estadoPub: 'publicada', esAdmin: false, editaPublicadas: aso.editar_publicadas, completa: true }).editable).toBe(true)
    expect(accesoAPropiedad({ estadoPub: 'publicada', esAdmin: false, editaPublicadas: pub.editar_publicadas, completa: true }).editable).toBe(false)
    // …y un override individual manda sobre la modalidad (ADR-0013)
    const quitada = capacidadesEfectivas({ rol: 'publicador', tipo: 'asociado', overrides: { editar_publicadas: false } })
    expect(accesoAPropiedad({ estadoPub: 'publicada', esAdmin: false, editaPublicadas: quitada.editar_publicadas, completa: true }).editable).toBe(false)
  })
})

describe('resumen y enlaces', () => {
  it('el enlace de cada propiedad apunta a SU asistente, con el id codificado', () => {
    expect(rutaDeFicha('abc-123')).toBe('/portal/mis-propiedades/abc-123/editar')
    expect(rutaDeFicha('a/b?c')).toBe('/portal/mis-propiedades/a%2Fb%3Fc/editar')
  })

  it('resumenParaMenu solo conserva lo que se muestra, descarta filas rotas y respeta el tope', () => {
    const r = resumenParaMenu([fila('a1', 'A'), null, 7, { titulo: 'sin id' }, { id: '' }, { ...fila('a2', 'A'), estado_pub: undefined }])
    expect(r.map((x) => x.id)).toEqual(['a1', 'a2'])
    expect(Object.keys(r[0]).sort()).toEqual(['completitud', 'estado_pub', 'folio', 'id', 'operacion', 'tipo', 'titulo'])
    expect(r[1].estado_pub).toBe('borrador')
    expect(resumenParaMenu('no es lista')).toEqual([])
    expect(resumenParaMenu(Array.from({ length: 80 }, (_, i) => fila(`z${i}`, 'A')))).toHaveLength(MAXIMO_EN_MENU)
  })

  it('una propiedad sin título se nombra con su tipo/operación y se marca como provisional', () => {
    expect(nombreParaMenu({ titulo: 'Casa del Parque', tipo: 'casa', operacion: 'venta' })).toEqual({ texto: 'Casa del Parque', provisional: false })
    const sin = nombreParaMenu({ titulo: null, tipo: 'casa', operacion: 'venta' })
    expect(sin.provisional).toBe(true)
    expect(sin.texto).toMatch(/casa/i)
  })
})

describe('congruencia (R8.2): una sola pantalla de propiedades, sin marcos ni listas aparte', () => {
  it('el servidor sigue poniendo el filtro por dueño en el resumen (no se pasa a un parámetro del navegador)', () => {
    const api = leerFuente('src/app/api/publicador/propiedades/route.ts')
    const resumen = api.slice(api.indexOf("get('resumen') === '1'"), api.indexOf("let q = db.from('propiedades').select('*')"))
    expect(resumen).toContain(".eq('owner_id', perfil.uid)")
    expect(resumen).not.toMatch(/searchParams\.get\('(owner|uid|id)/)
  })
})
