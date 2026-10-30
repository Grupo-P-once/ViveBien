import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coincide, filtrosDeUrl } from '../src/lib/busquedas'
import { memoria, reiniciarAlmacen } from '../src/lib/limites-almacen'
import { esVisibleAlPublico } from '../src/lib/visibilidad-publica'
import { filtrar, type Fila, type Instruccion } from './dobles/postgrest-evaluador'

/**
 * INTEGRACIÓN de GET /api/catalogo?<filtros> (28-oct-2026): la ruta real, con una base simulada que EVALÚA las cadenas de PostgREST que recibe (tests/dobles/postgrest-evaluador.ts).
 * Comprueba lo que se pidió: la consulta devuelve EXACTAMENTE las propiedades esperadas; el filtro actúa ANTES del límite de 500; si el filtro en la consulta falla hay respaldo correcto
 * y declarado; `truncado` avisa cuando puede haber más; sin datos de personas ni columnas internas en lo que sale hacia la base.
 * Sin red ni datos reales. El reloj se congela para que las fechas relativas («hoy», «últimos 7 días») sean reproducibles.
 */
const AHORA = Date.parse('2026-10-28T15:00:00Z')
let filasBase: Fila[] = []
let modo: 'ok' | 'rechazaFiltros' | 'caida' = 'ok'
const registro: Instruccion[][] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const inst: Instruccion[] = []
      let tope = Infinity
      const b: Record<string, unknown> = {
        select: () => b, order: () => b,
        filter: (col: string, op: string, val: unknown) => { inst.push({ tipo: 'filtro', col, op, val: String(val) }); return b },
        or: (expr: string) => { inst.push({ tipo: 'o', expr }); return b },
        limit: (n: number) => { tope = n; return b },
        then: (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => {
          registro.push([...inst])
          const res = modo === 'caida' ? Promise.reject(new Error('ECONNRESET'))
            : modo === 'rechazaFiltros' && inst.length ? Promise.resolve({ data: null, error: { message: 'PostgREST 400 simulado' } })
            : Promise.resolve({ data: filtrar(filasBase, inst).slice(0, tope), error: null })
          return res.then(ok, ko)
        },
      }
      return b
    },
  }),
}))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))

type Cat = Fila & { id: string }
const fila = (id: string, o: Record<string, unknown> = {}, car: Record<string, unknown> = {}): Cat => ({
  id, folio: `VB-${id}`, estado_pub: 'publicada', estatus: 'disponible', tipo: 'casa', operacion: 'venta', precio: 2_000_000, metros: 120, banos: 2, recamaras: 3,
  ubicacion: 'Calle Uno 1', colonia: 'Centro', ciudad: 'León', videos: [], planos: [], publicada_en: '2026-10-20T12:00:00Z', extras: { caracteristicas: { v: 1, ...car } }, ...o,
})

async function cargar() { vi.resetModules(); return (await import('../src/app/api/catalogo/route')).GET }
const pedir = (GET: (r?: Request) => Promise<Response>, query: string, ip = '203.0.113.5') => GET(new Request(`http://localhost/api/catalogo${query}`, { headers: { 'x-forwarded-for': ip } }))
const idsDe = async (r: Response) => ((await r.json()).propiedades as { id: string }[]).map((p) => p.id)
/** La verdad: la regla exacta (`coincide`) sobre todo lo visible, en el mismo orden (más nuevo primero). */
const esperadoPara = (query: string) => {
  const nf = filtrosDeUrl(new URLSearchParams(query.replace(/^\?/, '')))!
  return filasBase.filter(esVisibleAlPublico).filter((p) => coincide(p as never, nf, AHORA)).map((p) => p.id as string)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba'; delete process.env.SUPABASE_SERVICE_ROLE_KEY
  registro.length = 0; modo = 'ok'; memoria.vaciar(); reiniciarAlmacen()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('la ruta devuelve EXACTAMENTE lo esperado para cada filtro', () => {
  beforeEach(() => {
    filasBase = [
      fila('a-jardin-estudio', { banos: 3, publicada_en: '2026-10-28T10:00:00Z' }, { exteriores: ['jardin'], interiores: ['estudio'], estacionamientos: 2, antiguedad_anos: 0 }),
      fila('b-patio', { banos: 1, ubicacion: 'Boulevard San Juan Bosco 4021', colonia: 'Buenaventura' }, { exteriores: ['patio'], estacionamientos: 0, antiguedad_anos: 8 }),
      fila('c-alberca-renta', { operacion: 'renta', precio: 30_000, publicada_en: '2026-10-27T08:00:00Z' }, { exteriores: ['alberca'], amueblado: 'si', mascotas: 'permitidas', antiguedad_anos: 15 }),
      fila('d-terreno', { tipo: 'terreno', metros: 1000, banos: null, recamaras: null, publicada_en: '2026-09-01T12:00:00Z' }),
      fila('e-video', { videos: ['https://www.youtube.com/watch?v=aaaaaaaaaaa'], tipo: 'departamento', metros: 85 }, { elevador: true, antiguedad_anos: 60 }),
      fila('f-cañada', { ubicacion: 'Calle Cañada 5', colonia: 'Cañada del Refugio', planos: ['https://res.cloudinary.com/demo/p.jpg'] }, { m_terreno: 300 }),
      fila('g-pausada', { estatus: 'pausada' }, { exteriores: ['jardin'] }),
      fila('h-sin-extras', { extras: null }),
      fila('i-borrador', { estado_pub: 'borrador' }, { exteriores: ['jardin'] }),
    ]
  })
  const CASOS = [
    '?ext=jardin', '?ext=jardin,patio', '?amb=estudio&ext=jardin', '?amb=estudio&ext=patio', '?gen=alberca', '?gen=amueblado', '?srv=servicios_basicos', '?mm=video', '?mm=planos', '?mm=video,planos',
    '?ban=2', '?ban=3', '?est=0', '?est=1', '?est=2', '?cmin=100', '?cmax=100', '?tmin=200', '?tmin=900', '?ant=estreno', '?ant=10', '?ant=mas50', '?pub=hoy', '?pub=ayer', '?pub=7', '?pub=45',
    '?dir=bosco', '?dir=SAN%20JUAN', '?dir=canada', '?dir=CAÑADA', '?car=alberca', '?car=permite%20mascotas', '?car=alberca,mascotas', '?car=amueblado', '?op=renta', '?op=Renta', '?tipo=depto',
    '?zona=buenaventura', '?zona=leon&ban=2', '?pmin=1000000&pmax=2500000', '?amb=estudio,bodega&ext=jardin&ban=3&est=2&ant=estreno&pub=hoy&cmin=100',
  ]
  for (const q of CASOS) {
    it(`${q}`, async () => {
      const GET = await cargar()
      const r = await pedir(GET, q)
      expect(r.status).toBe(200)
      expect(await idsDe(r)).toEqual(esperadoPara(q))
      const ultima = registro.at(-1)
      expect(ultima && ultima.length > 0, 'la consulta a la base debe llevar las condiciones en el WHERE').toBe(true)
    })
  }
  it('lo no visible al público (pausada, borrador) NUNCA sale, aunque cumpla el filtro', async () => {
    const GET = await cargar()
    const ids = await idsDe(await pedir(GET, '?ext=jardin'))
    expect(ids).toContain('a-jardin-estudio')
    expect(ids).not.toContain('g-pausada'); expect(ids).not.toContain('i-borrador')
  })
  it('cero coincidencias: lista vacía con 200 y `truncado: false` (no «todo» ni error)', async () => {
    const GET = await cargar()
    const r = await pedir(GET, '?amb=estudio&ext=patio')
    const j = await r.json()
    expect(r.status).toBe(200); expect(j.propiedades).toEqual([]); expect(j.truncado).toBe(false); expect(j.filtrado).toBe(true)
  })
  it('`?op=Venta` y `?op=venta` dan el MISMO resultado (comportamiento coherente decidido por el dueño)', async () => {
    const GET = await cargar()
    expect(await idsDe(await pedir(GET, '?op=Venta'))).toEqual(await idsDe(await pedir(GET, '?op=venta')))
  })
  it('un parámetro desconocido o un nombre en mayúsculas NO activa el camino filtrado: la consulta de siempre, sin condiciones', async () => {
    const GET = await cargar()
    for (const q of ['?foo=bar', '?AMB=estudio', '?Zona=leon', '?']) { registro.length = 0; const j = await (await pedir(GET, q)).json(); expect(j.filtrado, q).toBeUndefined(); expect(registro.at(-1), q).toEqual([]) }
  })
  it('un término de «Características» que no existe: respuesta vacía SIN consultar la base', async () => {
    const GET = await cargar()
    const j = await (await pedir(GET, '?car=jacuzzi')).json()
    expect(j.propiedades).toEqual([]); expect(registro).toHaveLength(0)
  })
  it('SEGURIDAD: lo hostil en la dirección llega a la base solo como patrón saneado', async () => {
    const GET = await cargar()
    for (const h of ['x),or=(id.eq.1', '"; drop table propiedades;--', 'a,b(c)']) {
      registro.length = 0
      await pedir(GET, `?dir=${encodeURIComponent(h)}&zona=${encodeURIComponent(h)}`)
      for (const i of registro.at(-1) ?? []) {
        if (i.tipo === 'o') expect(i.expr, h).toMatch(/^((ubicacion|colonia|ciudad)\.ilike\.%[a-z0-9_%]+%)(,(ubicacion|colonia|ciudad)\.ilike\.%[a-z0-9_%]+%)*$/)
      }
    }
  })
})

describe('el filtro actúa ANTES del límite de 500 y `truncado` avisa cuando puede haber más', () => {
  const MUCHAS = (n: number, coincidencias: number[]) => Array.from({ length: n }, (_, i) => fila(`n${i}`, {}, coincidencias.includes(i) ? { exteriores: ['jardin'] } : {}))
  it('la ÚNICA coincidencia es la más antigua de 600: la consulta SIN filtros no la ve (límite 500); la FILTRADA sí', async () => {
    filasBase = MUCHAS(600, [599])
    const GET = await cargar()
    const sin = await (await pedir(GET, '')).json()
    expect(sin.propiedades).toHaveLength(500); expect(sin.truncado).toBe(true)
    expect(sin.propiedades.map((p: { id: string }) => p.id)).not.toContain('n599')
    const con = await (await pedir(GET, '?ext=jardin')).json()
    expect(con.propiedades.map((p: { id: string }) => p.id)).toEqual(['n599'])
    expect(con.truncado).toBe(false)
    expect(con.degradado).toBe(false)
  })
  it('520 coincidencias: se devuelven 500 y `truncado: true` (puede haber más; hoy no hay paginación)', async () => {
    filasBase = MUCHAS(600, Array.from({ length: 520 }, (_, i) => i))
    const GET = await cargar()
    const j = await (await pedir(GET, '?ext=jardin')).json()
    expect(j.propiedades).toHaveLength(500); expect(j.truncado).toBe(true)
  })
  it('catálogo pequeño: `truncado` es false', async () => {
    filasBase = MUCHAS(12, [1])
    const GET = await cargar()
    expect((await (await pedir(GET, '')).json()).truncado).toBe(false)
  })
})

describe('si el filtro en la consulta FALLA: respaldo correcto y declarado (nunca un error ni un filtro a medias)', () => {
  beforeEach(() => { filasBase = [fila('si', {}, { exteriores: ['jardin'] }), fila('no'), fila('si2', {}, { exteriores: ['jardin', 'patio'] })] })
  it('PostgREST rechaza los filtros → se consulta sin ellos y se filtra en el servidor: mismo resultado, `degradado: true`, sin caché', async () => {
    modo = 'rechazaFiltros'
    const GET = await cargar()
    const r = await pedir(GET, '?ext=jardin')
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.propiedades.map((p: { id: string }) => p.id)).toEqual(['si', 'si2'])
    expect(j.degradado).toBe(true)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(registro).toHaveLength(2)                 // el intento filtrado y el respaldo sin filtros
    expect(registro[1]).toEqual([])
  })
  it('LIMITACIÓN declarada: en modo degradado con >500 propiedades una coincidencia antigua se pierde, pero se AVISA con `truncado: true`', async () => {
    filasBase = [...Array.from({ length: 510 }, (_, i) => fila(`r${i}`)), fila('antigua', {}, { exteriores: ['jardin'] })]
    modo = 'rechazaFiltros'
    const GET = await cargar()
    const j = await (await pedir(GET, '?ext=jardin')).json()
    expect(j.propiedades).toEqual([]); expect(j.degradado).toBe(true); expect(j.truncado).toBe(true)
  })
  it('la base NO responde y no hay copia previa → 503 (nunca una lista vacía con 200)', async () => {
    modo = 'caida'
    const GET = await cargar()
    const r = await pedir(GET, '?ext=jardin')
    expect(r.status).toBe(503)
  })
  it('CIERRE: la copia vieja venía del tope de 500 → la respuesta con la base caída NO parece completa (`truncado: true`)', async () => {
    filasBase = Array.from({ length: 520 }, (_, i) => fila(`r${i}`, i < 15 ? { estatus: 'pausada' } : {}, i === 30 ? { exteriores: ['jardin'] } : {}))   // 15 no visibles: la copia queda con < 500 filas aunque la base devolvió 500
    const GET = await cargar()
    await pedir(GET, '')                              // la copia guardada tiene 500 filas: hay 20 que nunca vio
    modo = 'caida'
    const j = await (await pedir(GET, '?ext=jardin')).json()
    expect(j.desactualizado).toBe(true); expect(j.degradado).toBe(true); expect(j.truncado).toBe(true)
  })
  it('la base cae DESPUÉS de una respuesta buena → la última copia, FILTRADA con la misma regla y marcada `desactualizado`', async () => {
    const GET = await cargar()
    await pedir(GET, '')                              // una consulta buena guarda la copia
    modo = 'caida'
    const r = await pedir(GET, '?ext=jardin')
    const j = await r.json()
    expect(r.status).toBe(200); expect(j.desactualizado).toBe(true); expect(j.propiedades.map((p: { id: string }) => p.id)).toEqual(['si', 'si2'])
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
})

describe('freno contra bucles: holgado, por IP y solo para el catálogo FILTRADO', () => {
  beforeEach(() => { filasBase = [fila('a', {}, { exteriores: ['jardin'] })] })
  it('hasta 300 peticiones por IP en 10 min; la 301 recibe 429 con Retry-After; otra IP no se ve afectada', async () => {
    const GET = await cargar()
    for (let i = 0; i < 300; i++) expect((await pedir(GET, '?ext=jardin', '198.51.100.9')).status).toBe(200)
    const r = await pedir(GET, '?ext=jardin', '198.51.100.9')
    expect(r.status).toBe(429); expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await pedir(GET, '?ext=jardin', '198.51.100.10')).status).toBe(200)
  }, 120_000)
  it('el catálogo SIN filtros no pasa por este tope (sigue cacheado en el borde)', async () => {
    const GET = await cargar()
    for (let i = 0; i < 320; i++) expect((await pedir(GET, '', '198.51.100.20')).status).toBe(200)
  }, 120_000)
})
