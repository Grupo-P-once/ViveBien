import { beforeEach, describe, expect, it, vi } from 'vitest'

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'B', email: 'b@ejemplo.test', fila: { rol: 'publicador', estado: 'activo', tipo_publicador: 'asociado' } as Record<string, unknown> },
  tablas: { propiedades: [] as Array<Record<string, unknown>>, usuarios: [] as Array<Record<string, unknown>>, fotos: [] as Array<Record<string, unknown>> },
  auditoria: [] as Array<Record<string, unknown>>,
  /** Lo que «Cloudinary» aceptó y guardó: public_id → url entregada. */
  nube: new Map<string, string>(),
  /** Cuántas subidas rechazó «Cloudinary» y por qué (firma mala, formato…). */
  rechazos: [] as string[],
}))

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken: async () => 'token-de-prueba' } } }))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  type Tabla = keyof typeof mundo.tablas
  const cadena = (nombre: string) => {
    const tabla = nombre as Tabla
    const filtros: Array<[string, unknown]> = []
    const ins: Array<[string, unknown[]]> = []
    let soloConteo = false
    let cambios: Record<string, unknown> | null = null
    let nuevas: Array<Record<string, unknown>> | null = null
    let borrando = false
    const c: Record<string, unknown> = {}
    const filas = () => (mundo.tablas[tabla] ?? []).filter((f) => filtros.every(([k, v]) => f[k] === v) && ins.every(([k, vs]) => vs.includes(f[k])))
    c.select = (_c?: string, o?: { head?: boolean }) => { if (o?.head) soloConteo = true; return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.in = (k: string, vs: unknown[]) => { ins.push([k, vs]); return c }
    c.order = () => c
    c.delete = () => { borrando = true; return c }
    c.update = (f: Record<string, unknown>) => { cambios = f; return c }
    c.insert = (f: Record<string, unknown> | Array<Record<string, unknown>>) => { nuevas = Array.isArray(f) ? f : [f]; return c }
    c.maybeSingle = async () => ({ data: filas()[0] ? { ...filas()[0] } : null, error: null })
    c.then = (r: (v: unknown) => unknown) => {
      if (borrando) {
        const quitadas = filas()
        ;(mundo.tablas as Record<string, Array<Record<string, unknown>>>)[nombre] = mundo.tablas[tabla].filter((f) => !quitadas.includes(f))
        return r({ data: quitadas.map((f) => ({ id: f.id })), error: null })
      }
      if (nuevas) {
        for (const n of nuevas) (mundo.tablas[tabla] as Array<Record<string, unknown>>).push(tabla === 'propiedades' ? { folio: `VB-2026-${String(mundo.tablas.propiedades.length + 1).padStart(5, '0')}`, ...n } : { ...n })
        return r({ data: null, error: null })
      }
      if (cambios) { const afectadas = filas(); for (const f of afectadas) Object.assign(f, cambios); return r({ data: afectadas.map((f) => ({ id: f.id })), error: null }) }
      if (soloConteo) return r({ data: null, error: null, count: filas().length })
      return r({ data: filas().map((f) => ({ ...f })), error: null })
    }
    return c
  }
  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true }),
    perfil: async (u) => real.resolverPerfil(u, mundo.sesion.fila),
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({
      from: (t: string) => cadena(t),
      rpc: async (fn: string, a: Parameters<typeof propiedadCambiarEstado>[2]) =>
        fn === 'propiedad_cambiar_estado' ? propiedadCambiarEstado(mundo.tablas.propiedades, mundo.auditoria, a) : { data: null, error: { message: `rpc inesperada ${fn}` } },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    registrarIntentoDenegado: async () => {},
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Record<string, unknown>) => { mundo.auditoria.push(e) } }))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))
vi.mock('@/lib/config/flags-servidor', () => import('./dobles/flags-portal')) // R8.6: portal abierto por defecto
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))
vi.mock('@/lib/asignar-slug', () => ({ asignarSlugAlPublicar: async () => null, nombrarSiEstaPublicada: async () => {} }))

import { propiedadCambiarEstado } from './dobles/propiedad-cambiar-estado'
import { PATCH as editar, GET as leer } from '../src/app/api/admin/propiedades/[id]/route'
import { POST as crear, GET as listar } from '../src/app/api/publicador/propiedades/route'
import { POST as cambiarEstado } from '../src/app/api/propiedades/[id]/estado/route'
import { SELECT_PUBLICO } from '../src/lib/propiedad-publica'
import { gruposVisibles, VERSION_CARACTERISTICAS } from '../src/lib/caracteristicas'
import { coincide, normalizarFiltros } from '../src/lib/busquedas'
import { MINIMO_FOTOS } from '../src/lib/esquemas/propiedad'

/**
 * RECORRIDO DE LAS CARACTERÍSTICAS (oficinas y demás), de punta a punta y SIN servicios reales:
 *
 *   formulario (el mismo cuerpo que manda el editor) → rutas REALES de alta y edición (`sanearContenido` de verdad) → «almacenamiento»
 *   de prueba → lectura del publicador (REAL) → PUBLICAR con la ruta REAL de estado → lectura PÚBLICA (sólo las columnas de
 *   `SELECT_PUBLICO`) → ficha (`gruposVisibles`) y filtros (`coincide`).
 *
 * Qué es de mentira: el cliente de Supabase (una tabla en memoria con el filtro `eq`/`in`) y la sesión. Lo que NO se simula es lo que
 * se quiere probar: la validación del servidor, qué se guarda y qué se lee. Qué NO se prueba aquí: el esquema real de PostgREST y las
 * políticas RLS (necesitan staging), ni el navegador (lo cubre Playwright). Todo sintético: URLs de imagen inventadas con la forma de
 * nuestra nube de prueba; ninguna cuenta, clave ni medio reales.
 */

const NUBE = 'nube-prueba'
const R = (url: string, cuerpo?: unknown, metodo = 'POST') =>
  new Request(`https://vivebienn.com${url}`, {
    method: metodo,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const fila = (id: string) => mundo.tablas.propiedades.find((p) => p.id === id)!
const FOTOS = Array.from({ length: MINIMO_FOTOS }, (_, i) => `https://res.cloudinary.com/${NUBE}/image/upload/v1/usuarios/x/anuncios/oficina/a/sintetica-${i + 1}.jpg`)
const car = (c: Record<string, unknown>) => ({ caracteristicas: { v: VERSION_CARACTERISTICAS, ...c } })
/** Lo que ve un visitante anónimo: sólo las columnas públicas de la fila. */
const lecturaPublica = (id: string) => {
  const columnas = SELECT_PUBLICO.split(',').map((c) => c.trim())
  return Object.fromEntries(columnas.map((c) => [c, fila(id)[c]])) as Record<string, unknown>
}

const BASE = {
  titulo: 'Oficina corporativa en Torre Altus', descripcion: 'Oficina corporativa lista para operar, con recepción, dos privados y sala de juntas. Excelente ubicación.',
  ubicacion: 'Blvd. Campestre, León, Gto.', precio: 18_000, tipo: 'oficina', subtipo: 'corporativa', operacion: 'renta', metros: 95, banos: 1.5,
}

async function nuevoBorrador(extra: Record<string, unknown> = {}) {
  const c = await crear(R('/api/publicador/propiedades', { titulo: 'Borrador' }))
  expect(c.status).toBe(200)
  const { id } = await c.json()
  const r = await editar(R(`/api/admin/propiedades/${id}`, { ...BASE, ...extra }, 'PATCH'), ctx(id))
  return { id, r }
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', NUBE)
  mundo.sesion = { uid: 'B', email: 'b@ejemplo.test', fila: { rol: 'publicador', estado: 'activo', tipo_publicador: 'asociado' } }
  mundo.tablas = {
    propiedades: [],
    usuarios: [{ uid: 'B', email: 'b@ejemplo.test', rol: 'publicador', estado: 'activo', nombre: 'Asociada de prueba', telefono: '4771112233', whatsapp: '4771112233', tipo_publicador: 'asociado', permisos_override: {} }],
    fotos: [],
  }
  mundo.auditoria = []
})

describe('OFICINA: crear, editar, publicar, reabrir y leer en público', () => {
  const CARACT = car({ m_utiles: 88, piso: 3, elevador: true, estacionamientos: 2, privados: 2, salas_juntas: 1, recepcion: true, antiguedad_anos: 4,
    servicios: ['agua', 'luz', 'fibra_optica'], seguridad: ['vigilancia_24h', 'camaras'], accesibilidad: ['elevador_accesible', 'rampa'],
    amueblado: 'semi', deposito_meses: 2, plazo_minimo_meses: 12, disponible_desde: '2026-12-01', servicios_incluidos: ['mantenimiento', 'internet'] })

  it('todo lo que declara la persona se guarda validado, sobrevive a publicar y se lee igual al reabrir', async () => {
    const { id, r } = await nuevoBorrador({ extras: CARACT })
    expect(r.status).toBe(200)
    expect(fila(id)).toMatchObject({ tipo: 'oficina', subtipo: 'corporativa', banos: 1.5, metros: 95 })
    expect(fila(id).extras).toEqual(CARACT)

    // fotos y publicar (el asociado publica directo)
    expect((await editar(R(`/api/admin/propiedades/${id}`, { fotos: FOTOS }, 'PATCH'), ctx(id))).status).toBe(200)
    const pub = await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'publicada' }), ctx(id))
    expect(pub.status).toBe(200)
    expect(fila(id).estado_pub).toBe('publicada')
    expect(fila(id).extras, 'publicar no toca las características').toEqual(CARACT)

    // reabrir: listado del publicador y lectura del anuncio
    const lista = (await (await listar(R('/api/publicador/propiedades', undefined, 'GET'))).json()) as Array<Record<string, unknown>>
    expect(lista.find((p) => p.id === id)).toMatchObject({ extras: CARACT, subtipo: 'corporativa' })
    const abierto = await (await leer(R(`/api/admin/propiedades/${id}`, undefined, 'GET'), ctx(id))).json()
    expect(abierto.propiedad.extras).toEqual(CARACT)
  })

  it('lectura PÚBLICA: la ficha agrupa sin campos vacíos y los filtros combinados dan los resultados correctos', async () => {
    const { id } = await nuevoBorrador({ extras: CARACT })
    const pub = lecturaPublica(id)
    expect(pub.extras).toEqual(CARACT)
    const grupos = gruposVisibles(pub)
    const claves = grupos.flatMap((g) => [...g.items.map((i) => i.clave), ...g.listas.map((l) => l.clave)])
    expect(claves).toEqual(expect.arrayContaining(['privados', 'salas_juntas', 'recepcion', 'm_utiles', 'piso', 'servicios', 'amueblado', 'deposito_meses', 'disponible_desde']))
    expect(claves).not.toContain('mascotas')         // no aplica a oficinas
    expect(grupos.every((g) => g.items.length + g.listas.length > 0)).toBe(true)

    const prop = { ...pub, estatus: 'disponible' } as Record<string, unknown>
    const f = (o: Record<string, unknown>) => coincide(prop, normalizarFiltros(o)!)
    expect(f({ tipo: 'oficina', op: 'renta' })).toBe(true)
    expect(f({ tipo: 'oficina', op: 'renta', est: 2, smin: 90, smax: 100, amu: 1 })).toBe(true)
    expect(f({ tipo: 'oficina', op: 'renta', est: 3 })).toBe(false)               // sólo tiene 2
    expect(f({ tipo: 'oficina', op: 'renta', amu: 1, masc: 1 })).toBe(false)      // mascotas: no declaró
    expect(f({ tipo: 'oficina', op: 'venta' })).toBe(false)
    expect(f({ tipo: 'casa' })).toBe(false)
    expect(f({ tipo: 'oficina', rec: 1 })).toBe(false)                            // las oficinas no tienen recámaras
  })

  it('editar un campo suelto (el precio) no borra las características', async () => {
    const { id } = await nuevoBorrador({ extras: CARACT })
    expect((await editar(R(`/api/admin/propiedades/${id}`, { precio: 19_500 }, 'PATCH'), ctx(id))).status).toBe(200)
    expect(fila(id).extras).toEqual(CARACT)
    expect(fila(id).precio).toBe(19_500)
  })
})

describe('CASA con características, cambio de operación y datos históricos', () => {
  it('conserva las claves históricas de extras al guardar y quita lo de renta al pasar a venta', async () => {
    const { id } = await nuevoBorrador({
      tipo: 'casa', subtipo: 'sola', operacion: 'renta', recamaras: 3, banos: 2.5, metros: 140,
      extras: { ...car({ m_terreno: 200, niveles: 2, estacionamientos: 2, exteriores: ['jardin', 'alberca'], interiores: ['closets', 'cisterna'], mascotas: 'con_restricciones', amueblado: 'no', deposito_meses: 1 }) },
    })
    expect(fila(id).tipo).toBe('casa')
    // un dato histórico (de antes de este módulo) en extras
    ;(fila(id).extras as Record<string, unknown>).importado = { origen: 'hoja-1' }

    // guardar otras características no pierde lo histórico
    expect((await editar(R(`/api/admin/propiedades/${id}`, { extras: { ...car({ m_terreno: 210, estacionamientos: 2 }) } }, 'PATCH'), ctx(id))).status).toBe(200)
    expect(fila(id).extras).toMatchObject({ importado: { origen: 'hoja-1' }, caracteristicas: { v: 1, m_terreno: 210, estacionamientos: 2 } })

    // reponer renta y pasar a venta SIN mandar extras: el servidor poda lo que ya no aplica
    await editar(R(`/api/admin/propiedades/${id}`, { extras: { importado: { origen: 'hoja-1' }, ...car({ estacionamientos: 2, mascotas: 'permitidas', deposito_meses: 2 }) } }, 'PATCH'), ctx(id))
    expect((await editar(R(`/api/admin/propiedades/${id}`, { operacion: 'venta' }, 'PATCH'), ctx(id))).status).toBe(200)
    expect(fila(id).extras).toEqual({ importado: { origen: 'hoja-1' }, caracteristicas: { v: 1, estacionamientos: 2 } })
  })

  it('banos: enteros y medios baños con UNA sola representación (la columna), sin medio_bano', async () => {
    for (const [banos, texto] of [[2, '2 baños'], [2.5, '2 baños y medio'], [1, '1 baño'], [0.5, 'Medio baño']] as const) {
      const { id, r } = await nuevoBorrador({ tipo: 'casa', subtipo: 'sola', banos })
      expect(r.status).toBe(200)
      expect(fila(id).banos).toBe(banos)
      const { textoBanos } = await import('../src/lib/caracteristicas')
      expect(textoBanos(fila(id).banos as number)).toBe(texto)
    }
    const { id } = await nuevoBorrador({ tipo: 'casa', subtipo: 'sola' })
    const r = await editar(R(`/api/admin/propiedades/${id}`, { medio_bano: 1 }, 'PATCH'), ctx(id))
    expect(r.status).toBe(200)                                   // se ignora como cualquier columna que no es de contenido
    expect(fila(id)).not.toHaveProperty('medio_bano')
  })
})

describe('LOCAL COMERCIAL: «comercial» se conserva y acepta lo de local', () => {
  it('se crea y se edita con el vocabulario del sitio, sin convertirse en «local»', async () => {
    const { id, r } = await nuevoBorrador({ tipo: 'comercial', subtipo: 'plaza', operacion: 'venta', extras: car({ giro: 'Cafetería', frente: 6.5, estacionamientos: 3, m_terreno: 120 }) })
    expect(r.status).toBe(200)
    expect(fila(id)).toMatchObject({ tipo: 'comercial', subtipo: 'plaza' })
    expect((await editar(R(`/api/admin/propiedades/${id}`, { precio: 3_100_000 }, 'PATCH'), ctx(id))).status).toBe(200)
    expect(fila(id).tipo).toBe('comercial')
    const grupos = gruposVisibles(lecturaPublica(id))
    expect(grupos.flatMap((g) => g.items.map((i) => i.clave))).toEqual(expect.arrayContaining(['giro', 'frente', 'estacionamientos', 'm_terreno']))
  })
})

describe('el servidor RECHAZA y no cambia nada (pruebas negativas por la ruta real)', () => {
  const casos: [string, Record<string, unknown>, RegExp][] = [
    ['clave inventada', { extras: car({ inventada: 1 }) }, /no permitida/],
    ['característica que no aplica al tipo (privados en casa)', { tipo: 'casa', subtipo: 'sola', extras: car({ privados: 2 }) }, /no aplica/],
    ['característica de renta en una venta', { operacion: 'venta', extras: car({ mascotas: 'permitidas' }) }, /no aplica/],
    ['valor fuera de rango', { extras: car({ piso: 999 }) }, /fuera de rango/],
    ['entero con decimales', { extras: car({ estacionamientos: 1.5 }) }, /entero/],
    ['tipo de dato incorrecto', { extras: car({ elevador: 'si' }) }, /verdadero o falso/],
    ['opción de lista inexistente', { extras: car({ servicios: ['piscina'] }) }, /no aplican/],
    ['fecha imposible', { extras: car({ disponible_desde: '2026-02-30' }) }, /fecha/],
    ['clave nueva en extras', { extras: { secreto: 'x', ...car({ piso: 1 }) } }, /secreto/],
    ['subtipo de otro tipo', { subtipo: 'duplex' }, /subtipo/i],
    ['tipo inventado', { tipo: 'castillo' }, /Tipo de inmueble/],
  ]
  for (const [nombre, cuerpo, mensaje] of casos) {
    it(`${nombre} → 400 en español y la fila queda igual`, async () => {
      const { id } = await nuevoBorrador({ extras: car({ piso: 2, privados: 1 }) })
      const antes = JSON.stringify(fila(id))
      const r = await editar(R(`/api/admin/propiedades/${id}`, cuerpo, 'PATCH'), ctx(id))
      expect(r.status).toBe(400)
      expect(JSON.stringify(await r.json())).toMatch(mensaje)
      expect(JSON.stringify(fila(id))).toBe(antes)
    })
  }
  it('lo mismo en el ALTA (POST): un cuerpo inválido no crea el borrador', async () => {
    const r = await crear(R('/api/publicador/propiedades', { titulo: 'X', tipo: 'oficina', operacion: 'venta', extras: car({ mascotas: 'permitidas' }) }))
    expect(r.status).toBe(400)
    expect(mundo.tablas.propiedades).toHaveLength(0)
  })
})
