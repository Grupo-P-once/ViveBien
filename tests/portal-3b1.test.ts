import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * V-1.1.85 (3b-1) — Guardadas, Mis búsquedas, Alertas y Mis consultas.
 * Y las reglas de D-32: nada de enlaces a pantallas que no existen, ningún
 * llamado a agendar con el módulo apagado, y nunca «guardado» sin guardar.
 */

const bd = vi.hoisted(() => ({
  uid: 'u-1',
  cerrado: false,
  favoritos: [] as unknown[],
  busquedas: [] as unknown[],
  propiedades: [] as unknown[],
  solicitudes: [] as unknown[],
  updates: [] as Array<{ tabla: string; fila: Record<string, unknown>; filtros: Array<[string, unknown]> }>,
  select: [] as Array<{ tabla: string; columnas: string; filtros: Array<[string, unknown]> }>,
  devolverFilas: [] as unknown[],
}))

vi.mock('@/lib/portal/exigir-portal', async () => {
  const { NextResponse } = await import('next/server')
  return {
    exigirPortal: async () => (bd.cerrado
      ? { error: NextResponse.json({ error: 'No disponible.' }, { status: 404 }) }
      : { perfil: { uid: bd.uid, email: 'cliente@ejemplo.test', rol: 'cliente', superAdmin: false, estado: 'activo', nombre: null } }),
  }
})

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const datos: Record<string, () => unknown[]> = {
    favoritos: () => bd.favoritos,
    busquedas_guardadas: () => bd.busquedas,
    propiedades: () => bd.propiedades,
    solicitudes_contacto: () => bd.solicitudes,
  }
  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    const c: Record<string, unknown> = {}
    let esUpdate: Record<string, unknown> | null = null
    c.select = (columnas: string) => { bd.select.push({ tabla, columnas, filtros }); return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.order = () => c
    c.limit = () => c
    c.update = (fila: Record<string, unknown>) => { esUpdate = fila; return c }
    // `await` sobre la cadena: devuelve lo que toque.
    c.then = (r: (v: unknown) => unknown) => {
      if (esUpdate) {
        bd.updates.push({ tabla, fila: esUpdate, filtros })
        return r({ data: bd.devolverFilas, error: null })
      }
      const mias = (datos[tabla]?.() ?? []).filter((f) => filtros.every(([k, v]) => {
        const fila = f as Record<string, unknown>
        return !(k in fila) || fila[k] === v
      }))
      return r({ data: mias, error: null })
    }
    return c
  }
  return { ...real, supabaseAdmin: () => ({ from: (t: string) => cadena(t) }) }
})

import {
  alertasVista, busquedasVista, consultasVista, desdeCuandoEsNuevo, guardadasVista, nuevasDe, totalNuevas,
} from '../src/lib/portal/pantallas'
import { PROPIEDADES_DE_PRUEBA } from '../src/lib/portal/datos-de-prueba'
import { PANTALLAS_DEL_PORTAL, pantallaExiste } from '../src/lib/portal/rutas'
import { GET as getGuardadas } from '../src/app/api/portal/guardadas/route'
import { GET as getBusquedas, PATCH as renombrar } from '../src/app/api/portal/busquedas/route'
import { GET as getAlertas, POST as marcarVistas } from '../src/app/api/portal/alertas/route'
import { GET as getConsultas } from '../src/app/api/portal/consultas/route'

const RAIZ = join(__dirname, '..')
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')
const prop = (id: string, extra: Record<string, unknown> = {}) => ({
  ...PROPIEDADES_DE_PRUEBA[0], id, ...extra,
})

// ── Guardadas ──────────────────────────────────────────────────────────────
describe('Guardadas', () => {
  const props = [
    prop('p1', { titulo: 'Nave A', publicada_en: '2026-09-01T00:00:00Z' }),
    prop('p2', { titulo: 'Casa B', estatus: 'vendida' }),
    prop('p3', { titulo: 'Local C', estado_pub: 'borrador' }),
  ]

  it('de la más reciente a la más antigua, con su fecha', () => {
    const r = guardadasVista([
      { propiedad_id: 'p1', creado_en: '2026-09-10T00:00:00Z' },
      { propiedad_id: 'p2', creado_en: '2026-09-20T00:00:00Z' },
    ], props)
    expect(r.map((g) => g.id)).toEqual(['p2', 'p1'])
    expect(r[0].guardadaEn).toBe('2026-09-20T00:00:00Z')
  })

  it('lo que se vendió o se pausó NO desaparece: se dice que ya no está', () => {
    const [vendida] = guardadasVista([{ propiedad_id: 'p2', creado_en: '2026-09-20T00:00:00Z' }], props)
    expect(vendida.disponible).toBe(false)
    expect(vendida.titulo).toBe('Casa B')
    const [borrador] = guardadasVista([{ propiedad_id: 'p3', creado_en: '2026-09-20T00:00:00Z' }], props)
    expect(borrador.disponible).toBe(false)
  })

  it('si la propiedad ya no existe, no se inventa una tarjeta vacía', () => {
    expect(guardadasVista([{ propiedad_id: 'fantasma', creado_en: '2026-09-20T00:00:00Z' }], props)).toEqual([])
  })
})

// ── Búsquedas y alertas ────────────────────────────────────────────────────
describe('Mis búsquedas y Alertas', () => {
  const filtros = { op: 'venta', tipo: 'nave' } as const
  const guardadaEn = '2026-09-01T00:00:00Z'
  const props = [
    prop('vieja', { tipo: 'nave', operacion: 'venta', publicada_en: '2026-08-01T00:00:00Z' }),
    prop('nueva', { tipo: 'nave', operacion: 'venta', publicada_en: '2026-09-15T00:00:00Z' }),
    prop('otra', { tipo: 'casa', operacion: 'venta', publicada_en: '2026-09-15T00:00:00Z' }),
  ]

  it('«nuevas» cuenta desde que se guardó… hasta que las mira', () => {
    const sinVer = { id: 1, nombre: null, filtros, creado_en: guardadaEn }
    expect(nuevasDe(sinVer, props).map((p) => p.id)).toEqual(['nueva'])

    // D-28.2: al mirarlas, deja de contar. Esto es lo que antes nunca bajaba.
    const vista = { ...sinVer, revisadas_en: '2026-09-20T00:00:00Z' }
    expect(nuevasDe(vista, props)).toEqual([])
    expect(desdeCuandoEsNuevo(vista)).toBe(Date.parse('2026-09-20T00:00:00Z'))
    expect(desdeCuandoEsNuevo(sinVer)).toBe(Date.parse(guardadaEn))
  })

  it('mirar una búsqueda no apaga el contador de otra', () => {
    const b1 = { id: 1, nombre: null, filtros, creado_en: guardadaEn, revisadas_en: '2026-09-20T00:00:00Z' }
    const b2 = { id: 2, nombre: null, filtros, creado_en: guardadaEn }
    expect(totalNuevas([b1, b2], props)).toBe(1)
    expect(totalNuevas([b1], props)).toBe(0)
  })

  it('una propiedad que encaja en dos búsquedas se cuenta una vez', () => {
    const b1 = { id: 1, nombre: null, filtros, creado_en: guardadaEn }
    const b2 = { id: 2, nombre: null, filtros: { op: 'venta' } as const, creado_en: guardadaEn }
    expect(totalNuevas([b1, b2], props)).toBe(2) // «nueva» y «otra», sin repetir «nueva»
  })

  it('la lista trae total, nuevas, enlace y el nombre que puso la persona', () => {
    const [v] = busquedasVista([{ id: 1, nombre: '  Naves en venta  ', filtros, creado_en: guardadaEn }], props)
    expect(v).toMatchObject({ id: 1, nombre: 'Naves en venta', total: 2, nuevas: 1 })
    expect(v.href).toContain('op=venta')
    expect(v.descripcion.length).toBeGreaterThan(0)
  })

  it('sin nombre propio, se describe sola (nunca «sin título»)', () => {
    const [v] = busquedasVista([{ id: 1, nombre: '   ', filtros, creado_en: guardadaEn }], props)
    expect(v.nombre).toBe(v.descripcion)
    expect(v.nombre).not.toMatch(/sin t[ií]tulo/i)
  })

  it('las alertas llevan las tarjetas de lo nuevo, con tope', () => {
    const muchas = Array.from({ length: 20 }, (_, i) => prop(`n${i}`, { tipo: 'nave', operacion: 'venta', publicada_en: '2026-09-15T00:00:00Z' }))
    const [a] = alertasVista([{ id: 1, nombre: 'Naves', filtros, creado_en: guardadaEn }], muchas, 12)
    expect(a.nuevas).toHaveLength(12)
    expect(a.nuevas[0]).toHaveProperty('ruta')
    expect(a.busquedaId).toBe(1)
  })
})

// ── Consultas ──────────────────────────────────────────────────────────────
describe('Mis consultas', () => {
  const consulta = {
    id: 7, propiedadId: 'p1', propiedadTitulo: 'Nave A', tipo: 'visita' as const,
    visitaPreferida: null, mensaje: 'Me interesa', creadoEn: '2026-09-10T00:00:00Z', estado: 'enviada' as const,
  }

  it('pega la tarjeta de la propiedad cuando sigue publicada', () => {
    const [c] = consultasVista([consulta], [prop('p1', { titulo: 'Nave A' })])
    expect(c.propiedad?.titulo).toBe('Nave A')
    expect(c.propiedadDisponible).toBe(true)
    expect(c.estado).toBe('enviada')
  })

  it('si ya no está publicada, la consulta se conserva y se dice', () => {
    const [c] = consultasVista([consulta], [])
    expect(c.propiedad).toBeNull()
    expect(c.propiedadDisponible).toBe(false)
    expect(c.propiedadTitulo).toBe('Nave A')
  })
})

// ── Las APIs ───────────────────────────────────────────────────────────────
describe('las APIs del portal', () => {
  const pedir = (f: (r: Request) => Promise<Response>, url: string, init?: RequestInit) =>
    f(new Request(`https://vivebienn.com${url}`, {
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.2.0.${Math.floor(Math.random() * 250)}` },
      ...init,
    }))

  beforeEach(() => {
    bd.cerrado = false
    bd.updates = []
    bd.select = []
    bd.devolverFilas = []
    bd.propiedades = [prop('p1', { titulo: 'Nave A', tipo: 'nave', operacion: 'venta', publicada_en: '2026-09-15T00:00:00Z' })]
    bd.favoritos = [{ uid: 'u-1', propiedad_id: 'p1', creado_en: '2026-09-16T00:00:00Z' }, { uid: 'otro', propiedad_id: 'p1', creado_en: '2026-09-16T00:00:00Z' }]
    bd.busquedas = [{ uid: 'u-1', id: 1, nombre: null, filtros: { op: 'venta' }, creado_en: '2026-09-01T00:00:00Z', revisadas_en: null }]
    bd.solicitudes = [{ cliente_uid: 'u-1', id: 5, propiedad_id: 'p1', propiedad_titulo: 'Nave A', tipo: 'informacion', visita_preferida: null, mensaje: null, creado_en: '2026-09-10T00:00:00Z' }]
  })

  it('con el portal cerrado, las cuatro responden 404 sin mirar nada', async () => {
    bd.cerrado = true
    for (const [f, url] of [[getGuardadas, '/api/portal/guardadas'], [getBusquedas, '/api/portal/busquedas'], [getAlertas, '/api/portal/alertas'], [getConsultas, '/api/portal/consultas']] as const) {
      expect((await pedir(f as (r: Request) => Promise<Response>, url)).status).toBe(404)
    }
    expect(bd.select).toEqual([])
  })

  it('cada una pide sólo lo de esta cuenta', async () => {
    await pedir(getGuardadas, '/api/portal/guardadas')
    await pedir(getBusquedas, '/api/portal/busquedas')
    await pedir(getConsultas, '/api/portal/consultas')
    const porTabla = (t: string) => bd.select.filter((s) => s.tabla === t)
    expect(porTabla('favoritos')[0].filtros).toEqual([['uid', 'u-1']])
    expect(porTabla('busquedas_guardadas')[0].filtros).toEqual([['uid', 'u-1']])
    expect(porTabla('solicitudes_contacto')[0].filtros).toEqual([['cliente_uid', 'u-1']])
    // Y de propiedades, sólo columnas públicas.
    for (const s of porTabla('propiedades')) expect(s.columnas).not.toMatch(/owner_id|whatsapp|telefono/)
  })

  it('guardadas: devuelve tarjetas, no identificadores', async () => {
    const j = await (await pedir(getGuardadas, '/api/portal/guardadas')).json()
    expect(j.guardadas).toHaveLength(1)
    expect(j.guardadas[0]).toMatchObject({ id: 'p1', titulo: 'Nave A', disponible: true })
    expect(j.guardadas[0]).toHaveProperty('ruta')
  })

  it('consultas: sale el DTO de cliente, sin nada interno', async () => {
    const j = await (await pedir(getConsultas, '/api/portal/consultas')).json()
    expect(j.consultas[0]).toMatchObject({ id: 5, estado: 'enviada' })
    const texto = JSON.stringify(j)
    for (const interno of ['owner_id', 'whatsapp_estado', 'whatsapp_id', 'origen', 'telefono']) {
      expect(texto, interno).not.toContain(interno)
    }
  })

  it('alertas: marcar todas escribe la fecha sólo en las mías', async () => {
    const r = await pedir(marcarVistas, '/api/portal/alertas', { method: 'POST', body: '{}' })
    expect(r.status).toBe(200)
    expect(bd.updates).toHaveLength(1)
    expect(bd.updates[0].tabla).toBe('busquedas_guardadas')
    expect(bd.updates[0].filtros).toEqual([['uid', 'u-1']])
    expect(typeof bd.updates[0].fila.revisadas_en).toBe('string')
    // Responde con el estado ya guardado (D-32).
    expect(await r.json()).toHaveProperty('alertas')
  })

  it('alertas: marcar una sola, sólo esa', async () => {
    await pedir(marcarVistas, '/api/portal/alertas', { method: 'POST', body: JSON.stringify({ busquedaId: 1 }) })
    expect(bd.updates[0].filtros).toEqual([['uid', 'u-1'], ['id', 1]])
  })

  it('renombrar: guarda lo que se pide y DEVUELVE lo guardado', async () => {
    bd.devolverFilas = [{ id: 1, nombre: 'Naves en venta' }]
    const r = await pedir(renombrar, '/api/portal/busquedas', { method: 'PATCH', body: JSON.stringify({ id: 1, nombre: '  Naves en venta  ' }) })
    expect(r.status).toBe(200)
    expect(bd.updates[0].fila).toEqual({ nombre: 'Naves en venta' })
    expect(bd.updates[0].filtros).toEqual([['id', 1], ['uid', 'u-1']])
    expect(await r.json()).toMatchObject({ ok: true, nombre: 'Naves en venta' })
  })

  it('renombrar: vaciar el nombre lo deja en automático; un nombre larguísimo se rechaza', async () => {
    bd.devolverFilas = [{ id: 1, nombre: null }]
    await pedir(renombrar, '/api/portal/busquedas', { method: 'PATCH', body: JSON.stringify({ id: 1, nombre: '   ' }) })
    expect(bd.updates[0].fila).toEqual({ nombre: null })

    bd.updates = []
    const largo = await pedir(renombrar, '/api/portal/busquedas', { method: 'PATCH', body: JSON.stringify({ id: 1, nombre: 'x'.repeat(61) }) })
    expect(largo.status).toBe(400)
    expect(bd.updates).toEqual([])
  })

  it('renombrar la búsqueda de otra persona: 404 y no se guarda nada', async () => {
    bd.devolverFilas = []
    const r = await pedir(renombrar, '/api/portal/busquedas', { method: 'PATCH', body: JSON.stringify({ id: 99, nombre: 'mía ahora' }) })
    expect(r.status).toBe(404)
    expect(await r.json()).toMatchObject({ error: expect.stringContaining('no es tuya') })
  })
})

// ── Las reglas de D-32 ─────────────────────────────────────────────────────
describe('reglas de cierre (D-32)', () => {
  const rutasDelPortal = (): string[] => {
    const base = join(RAIZ, 'src/app/portal')
    const recorrer = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) return recorrer(p)
      return n === 'page.tsx' ? [`/${relative(join(RAIZ, 'src/app'), dir).replace(/\\/g, '/')}`] : []
    })
    return recorrer(base)
  }

  it('cada pantalla que se declara existente tiene su página de verdad', () => {
    const existen = new Set(rutasDelPortal())
    for (const r of PANTALLAS_DEL_PORTAL) expect(existen, r).toContain(r)
    // Y no sobra ninguna: si hay una página, se declara (para que salga en el menú).
    // (las rutas dinámicas, como el editor de una propiedad, cuelgan de una pantalla declarada y no son entradas de menú)
    for (const r of existen) if (!r.includes('[')) expect(PANTALLAS_DEL_PORTAL as readonly string[], r).toContain(r)
  })

  it('el menú sólo enseña lo que existe (y lo que falta está declarado como pendiente)', () => {
    const menu = leer('src/components/portal/BarraLateralPortal.tsx')
    expect(menu).toContain('pantallaExiste')
    // Lo que todavía no existe (3b-3) sigue escrito en el menú pero no se pinta.
    for (const pendiente of ['/portal/mi-propiedad']) {
      expect(pantallaExiste(pendiente), pendiente).toBe(false)
    }
    for (const lista of PANTALLAS_DEL_PORTAL) expect(pantallaExiste(lista), lista).toBe(true)
    // Lo de fuera del portal (buscador, valuador, panel) no lo filtra nadie.
    expect(pantallaExiste('/propiedades')).toBe(true)
    expect(pantallaExiste('/portal/propiedades?vista=guardadas')).toBe(true)
  })

  it('«Por revisar» no está en el menú, y no lo estará sin dato que la llene (D-27.1)', () => {
    const menu = leer('src/components/portal/BarraLateralPortal.tsx')
    expect(menu).not.toMatch(/titulo: 'Por revisar'/)
    // «Me interesan» se juntó con «Mis consultas» (24-oct-2026): ya no hay entrada propia.
    expect(menu).not.toMatch(/titulo: 'Me interesan'/)
    expect(menu).toMatch(/titulo: 'Mis consultas'/)
  })

  it('lo del cliente nunca se llama «Mis propiedades» y lo de quien publica va aparte, con la capacidad (V-1.1.86; menú por secciones desde el 24-oct-2026)', () => {
    const menu = leer('src/components/portal/BarraLateralPortal.tsx')
    // Lo de quien PUBLICA («Mis propiedades», «Nueva propiedad», «En revisión», «Mis métricas») va aparte, con la capacidad; nunca dentro del MENU del cliente.
    const delCliente = menu.slice(menu.indexOf('const MENU'), menu.indexOf('const TITULO_SECCION'))
    expect(delCliente).not.toMatch(/titulo: 'Mis propiedades'/)
    expect(delCliente).not.toMatch(/Nueva propiedad|En revisión|Mis métricas/)
    expect(menu).toContain('const propias: Entrada[] = publica')
    // Y «Guardadas» sigue llevando a la misma pantalla de siempre.
    expect(menu).toContain("titulo: 'Guardadas', icono: Heart, enlace: '/portal/propiedades?vista=guardadas'")
  })

  it('no hay ningún llamado a solicitar visita fuera de `citasEnLinea`', () => {
    const inicio = leer('src/components/portal/InicioPortal.tsx')
    const i = inicio.indexOf('Solicitar visita')
    expect(i).toBeGreaterThan(0)
    // El bloque que lo contiene está dentro de la condición del flag.
    const antes = inicio.slice(0, i)
    expect(antes.lastIndexOf('resumen.citasEnLinea &&')).toBeGreaterThan(antes.lastIndexOf('</Seccion>'))
  })

  it('todas las APIs del portal pasan por `exigirPortal`', () => {
    const base = join(RAIZ, 'src/app/api/portal')
    const rutas = readdirSync(base).flatMap((n) => {
      const p = join(base, n, 'route.ts')
      return statSync(join(base, n)).isDirectory() ? [p] : []
    })
    expect(rutas.length).toBeGreaterThanOrEqual(4)
    for (const r of rutas) expect(readFileSync(r, 'utf8'), r).toContain('exigirPortal')
  })

  it('Firestore ya no arranca con la sesión (D-28.8)', () => {
    const fb = leer('src/lib/firebase.ts')
    expect(fb).not.toMatch(/getFirestore|getStorage/)
    expect(() => leer('src/lib/firestore.ts')).toThrow()
    expect(() => leer('src/app/api/seed/route.ts')).toThrow()
  })
})
