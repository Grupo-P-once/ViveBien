import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Cierre de Property Core — SOLO los tres puntos restantes:
 *   1 · slug: unicidad real (índice), manejo de colisiones y protección del servidor;
 *   2 · cualquier camino que pueda dejar una propiedad en `publicada` respeta la MISMA regla que `/estado`;
 *   3 · atomicidad de la bitácora de un cambio de estado (propuesta 33, probada en PGlite, NO aplicada).
 */

const RAIZ = path.join(__dirname, '..')
const leer = (r: string) => readFileSync(path.join(RAIZ, r), 'utf8')

// ───────────────────────────── 1 · SLUG ─────────────────────────────
import { slugUnico } from '../src/lib/slug'
import { asignarSlugAlPublicar } from '../src/lib/asignar-slug'

const FUENTE = { titulo: 'Casa bonita', tipo: 'casa', operacion: 'venta', ciudad: 'León' }
const ID = '3f2b8a52-9c4e-4a77-8d51-2f6a1e0c9b10' // un UUID: no es una dirección presentable, así que necesita slug
const PROP = { id: ID, titulo: 'Casa bonita', tipo: 'casa', operacion: 'venta', ubicacion: 'León, Gto.', slug: null as string | null }

/** Base falsa que imita lo que importa: slugs ocupados, ids, y el índice único (23505) al escribir. */
function baseFalsa(o: { ocupados?: string[]; idsAjenos?: string[]; violarAl?: string[]; errorDeEscritura?: { code?: string; message: string } }) {
  const escritos: string[] = []
  const db = {
    from: () => {
      const filtros: Record<string, unknown> = {}
      let cambios: Record<string, unknown> | null = null
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = (k: string, v: unknown) => { filtros[k] = v; return c }
      c.neq = () => c
      c.is = () => c
      c.limit = () => c
      c.update = (f: Record<string, unknown>) => { cambios = f; return c }
      c.then = (r: (v: unknown) => unknown) => {
        if (cambios) {
          const slug = cambios.slug as string
          if (o.errorDeEscritura) return r({ data: null, error: o.errorDeEscritura })
          if (o.violarAl?.includes(slug)) return r({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "propiedades_slug_unico"' } })
          escritos.push(slug)
          return r({ data: [{ slug }], error: null })
        }
        if ('slug' in filtros) return r({ data: (o.ocupados ?? []).includes(filtros.slug as string) ? [{ id: 'otra' }] : [], error: null })
        if ('id' in filtros) return r({ data: (o.idsAjenos ?? []).includes(filtros.id as string) ? [{ id: filtros.id }] : [], error: null })
        return r({ data: [], error: null })
      }
      return c
    },
  }
  return { db: db as never, escritos }
}

describe('1 · slug: índice único en la base + colisiones resueltas en el servidor', () => {
  it('la base TIENE el índice único parcial (migración 10) y la columna no la escribe el cliente', () => {
    expect(leer('supabase/10-slug-publico.sql')).toMatch(/create unique index if not exists propiedades_slug_unico\s+on public\.propiedades \(slug\)\s+where slug is not null/i)
    expect(leer('src/lib/publicacion.ts')).toMatch(/CAMPOS_RESERVADOS[\s\S]*'slug'/)
  })

  it('el intento 0 es el sufijo de siempre (los slugs ya publicados no cambian); los reintentos son otros y más largos', () => {
    const s0 = slugUnico(FUENTE, ID)!
    expect(slugUnico(FUENTE, ID, 0)).toBe(s0)
    const s1 = slugUnico(FUENTE, ID, 1)!
    const s2 = slugUnico(FUENTE, ID, 2)!
    expect(new Set([s0, s1, s2]).size).toBe(3)
    expect(s1.length).toBeGreaterThan(s0.length)
    expect(s2.length).toBeGreaterThan(s1.length)
    expect(slugUnico(FUENTE, ID, 1)).toBe(s1)                 // determinista
    expect(slugUnico(FUENTE, ID, 3)!.length).toBeLessThanOrEqual(90)
  })

  it('sin choque: se guarda el nombre normal', async () => {
    const { db, escritos } = baseFalsa({})
    const ruta = await asignarSlugAlPublicar(db, PROP)
    expect(ruta).toBe(`/propiedades/${slugUnico(FUENTE, ID, 0)}`)
    expect(escritos).toEqual([slugUnico(FUENTE, ID, 0)])
  })

  it('choque detectado ANTES de escribir (otro slug igual): reintenta con otro sufijo, no se queda con el id para siempre', async () => {
    const { db, escritos } = baseFalsa({ ocupados: [slugUnico(FUENTE, ID, 0)!] })
    const ruta = await asignarSlugAlPublicar(db, PROP)
    expect(ruta).toBe(`/propiedades/${slugUnico(FUENTE, ID, 1)}`)
    expect(escritos).toEqual([slugUnico(FUENTE, ID, 1)])
  })

  it('choque con el ID de otra propiedad: también se evita (la ficha busca primero por slug)', async () => {
    const { db, escritos } = baseFalsa({ idsAjenos: [slugUnico(FUENTE, ID, 0)!] })
    await asignarSlugAlPublicar(db, PROP)
    expect(escritos).toEqual([slugUnico(FUENTE, ID, 1)])
  })

  it('CARRERA: otra publicación toma el nombre entre la comprobación y la escritura → el índice único lo rechaza (23505) y se reintenta', async () => {
    const { db, escritos } = baseFalsa({ violarAl: [slugUnico(FUENTE, ID, 0)!, slugUnico(FUENTE, ID, 1)!] })
    const ruta = await asignarSlugAlPublicar(db, PROP)
    expect(ruta).toBe(`/propiedades/${slugUnico(FUENTE, ID, 2)}`)
    expect(escritos).toEqual([slugUnico(FUENTE, ID, 2)])
  })

  it('si TODOS los intentos chocan, la publicación NO falla: queda con su id y se avisa', async () => {
    const todos = [0, 1, 2, 3].map((i) => slugUnico(FUENTE, ID, i)!)
    const { db, escritos } = baseFalsa({ ocupados: todos })
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await asignarSlugAlPublicar(db, PROP)).toBe(`/propiedades/${ID}`)
    expect(escritos).toEqual([])
    aviso.mockRestore()
  })

  it('un error que NO es choque (p. ej. la base cae) no se confunde con uno: no reintenta y no revienta', async () => {
    const { db, escritos } = baseFalsa({ errorDeEscritura: { code: '57P01', message: 'terminating connection' } })
    const e = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await asignarSlugAlPublicar(db, PROP)).toBe(`/propiedades/${ID}`)
    expect(escritos).toEqual([])
    e.mockRestore()
  })

  it('una propiedad que YA tiene slug no se toca (una URL que cambia es una URL rota)', async () => {
    const { db, escritos } = baseFalsa({})
    expect(await asignarSlugAlPublicar(db, { ...PROP, slug: 'casa-vieja-leon-ab12' })).toBe('/propiedades/casa-vieja-leon-ab12')
    expect(escritos).toEqual([])
  })
})

// ─────────────────── 2 · caminos a `publicada` ───────────────────
import { decidirPublicacionAutomatica, faltantes, puedeTransicionar } from '../src/lib/publicacion'
import { cambiarEstadoDePropiedad } from '../src/lib/cambiar-estado-propiedad'
import { propiedadCambiarEstado } from './dobles/propiedad-cambiar-estado'

const COMPLETA = {
  titulo: 'Casa en León', descripcion: 'Una casa muy bonita con jardín amplio.', ubicacion: 'León, Gto.',
  precio: 2_500_000, tipo: 'casa', operacion: 'venta', metros: 180,
  fotos: ['1', '2', '3', '4', '5', '6', '7', '8'].map((n) => `https://res.cloudinary.com/x/${n}.jpg`),
}

describe('2 · decidirPublicacionAutomatica: la MISMA regla que /estado', () => {
  const base = { activa: true, publicaSinRevision: false, prop: COMPLETA }
  it('un anuncio incompleto no se publica NI se envía a revisión (mismos faltantes que la web)', () => {
    const incompleto = { ...COMPLETA, fotos: ['1'], descripcion: '' }
    for (const rol of ['admin', 'publicador', null] as const) {
      const d = decidirPublicacionAutomatica({ ...base, rol, prop: incompleto })
      expect(d.ok).toBe(false)
      if (!d.ok) expect(d.falta).toEqual(faltantes(incompleto))
    }
  })
  it('admin: publica directo (como en la web)', () => {
    expect(decidirPublicacionAutomatica({ ...base, rol: 'admin' })).toEqual({ ok: true, destino: 'publicada', autopublica: false })
  })
  it('asociado (capacidad publicar_sin_revision): publica y queda marcado como sin revisión', () => {
    expect(decidirPublicacionAutomatica({ ...base, rol: 'publicador', publicaSinRevision: true })).toEqual({ ok: true, destino: 'publicada', autopublica: true })
  })
  it('publicador normal: NUNCA publicada; se manda a revisión', () => {
    expect(decidirPublicacionAutomatica({ ...base, rol: 'publicador' })).toEqual({ ok: true, destino: 'en_revision', autopublica: false })
  })
  it('sin cuenta que firme: falla cerrado → a revisión (no se adivinan capacidades)', () => {
    expect(decidirPublicacionAutomatica({ ...base, rol: null })).toEqual({ ok: true, destino: 'en_revision', autopublica: false })
  })
  it('cuenta suspendida/eliminada: no publica ni envía; un cliente tampoco', () => {
    expect(decidirPublicacionAutomatica({ ...base, rol: 'publicador', publicaSinRevision: true, activa: false }).ok).toBe(false)
    expect(decidirPublicacionAutomatica({ ...base, rol: 'cliente' }).ok).toBe(false)
  })
})

// El alta heredada del panel clásico: su propio cliente de Supabase → se simula `createClient`.
const mundo = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
  auditoria: [] as Array<Record<string, unknown>>,
  perfil: { uid: 'ADM', email: 'adm@vivebienn.com', rol: 'admin', superAdmin: false, estado: 'activo', nombre: 'Admin', emailVerified: true } as Record<string, unknown>,
  rpcFalla: null as null | { code?: string; message: string },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    // `propiedad_cambiar_estado` (migración 33): misma semántica que el SQL; `mundo.rpcFalla` simula una caída.
    rpc: async (fn: string, a: Parameters<typeof propiedadCambiarEstado>[2]) => {
      if (fn !== 'propiedad_cambiar_estado') return { data: null, error: { message: `rpc inesperada ${fn}` } }
      if (mundo.rpcFalla) return { data: null, error: mundo.rpcFalla }
      return propiedadCambiarEstado(mundo.props, mundo.auditoria, a)
    },
    from: () => {
      let fila: Record<string, unknown> | null = null
      const c: Record<string, unknown> = {}
      c.insert = (f: Record<string, unknown>) => { fila = f; return c }
      c.select = () => c
      c.eq = () => c
      c.order = () => c
      c.then = (r: (v: unknown) => unknown) => {
        if (fila) { mundo.props.push(fila); return r({ data: null, error: null }) }
        return r({ data: [], error: null })
      }
      return c
    },
  }),
}))
vi.mock('@/lib/auth-server', () => ({ requireAdmin: async () => ({ perfil: mundo.perfil }) }))
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Record<string, unknown>) => { mundo.auditoria.push(e) } }))
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))
// Se conserva la implementación REAL de `asignarSlugAlPublicar` (la prueba 1 la usa); sólo se silencia el nombrado de la alta.
vi.mock('@/lib/asignar-slug', async (original) => ({ ...(await original<typeof import('../src/lib/asignar-slug')>()), nombrarSiEstaPublicada: async () => {} }))

import { POST as altaHeredada } from '../src/app/api/admin/propiedades/route'

const R = (cuerpo: unknown) => new Request('https://vivebienn.com/api/admin/propiedades', {
  method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
})

describe('2 · alta heredada POST /api/admin/propiedades (antes publicaba por el DEFAULT de la base, sin bitácora)', () => {
  beforeEach(() => { mundo.props = []; mundo.auditoria = []; mundo.rpcFalla = null })

  it('SIN estado_pub explícito nace BORRADOR (no «publicada» por el default) y deja bitácora', async () => {
    const r = await altaHeredada(R({ ...COMPLETA, id: 'casa-nueva' }))
    expect(r.status).toBe(200)
    expect(mundo.props[0]).toMatchObject({ id: 'casa-nueva', estado_pub: 'borrador', owner_id: 'ADM', estatus: 'disponible' })
    expect(mundo.props[0].publicada_en).toBeUndefined()
    expect(mundo.auditoria.map((a) => a.accion)).toEqual(['propiedad.crear'])
  })

  it('publicada pedida pero INCOMPLETA → 400 y no se inserta nada', async () => {
    const r = await altaHeredada(R({ ...COMPLETA, fotos: ['1'], estado_pub: 'publicada' }))
    expect(r.status).toBe(400)
    expect(mundo.props).toHaveLength(0)
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('si la transición atómica falla, la propiedad queda BORRADOR (falla cerrado) y se dice; nunca publicada sin su huella', async () => {
    mundo.rpcFalla = { code: 'XX000', message: 'connection terminated' }
    const r = await altaHeredada(R({ ...COMPLETA, estado_pub: 'publicada' }))
    expect(r.status).toBe(503)
    const j = await r.json()
    expect(j.creada).toBe(true)
    expect(j.error).toMatch(/borrador/)
    expect(mundo.props[0].estado_pub).toBe('borrador')
    expect(mundo.props[0].publicada_en).toBeUndefined()
    expect(mundo.auditoria.map((a) => a.accion)).toEqual(['propiedad.crear'])
  })

  it('publicada pedida y COMPLETA → publicada con fecha, revisor y las dos huellas (crear + publicada)', async () => {
    const r = await altaHeredada(R({ ...COMPLETA, estado_pub: 'publicada' }))
    expect(r.status).toBe(200)
    const { id } = await r.json()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(mundo.props[0]).toMatchObject({ estado_pub: 'publicada', revisado_por: 'adm@vivebienn.com' })
    expect(typeof mundo.props[0].publicada_en).toBe('string')
    expect(mundo.auditoria.map((a) => a.accion)).toEqual(['propiedad.crear', 'propiedad.publicada'])
  })

  it('lo que sólo fija el servidor se descarta (folio, slug, dueño, contadores, completitud falsa)', async () => {
    await altaHeredada(R({ ...COMPLETA, folio: 'VB-1999-99999', slug: 'mi-url', owner_id: 'OTRO', vistas: 9999, completitud: 100, id: 'MAL ID/<x>' }))
    const f = mundo.props[0]
    expect(f).toMatchObject({ owner_id: 'ADM', estado_pub: 'borrador' })
    expect(f.folio).toBeUndefined()
    expect(f.slug).toBeUndefined()
    expect(f.vistas).toBeUndefined()
    expect(f.completitud).toBeLessThan(100 + 1)
    expect(String(f.id)).toMatch(/^[0-9a-f-]{36}$/) // un id sucio se sustituye por un UUID
    // lo que de verdad llega a la base: sólo contenido válido + lo que pone el servidor
    const permitidas = new Set(['titulo', 'descripcion', 'ubicacion', 'precio', 'tipo', 'operacion', 'metros', 'fotos', 'id', 'owner_id', 'estado_pub', 'estatus', 'completitud'])
    expect(Object.keys(f).filter((k) => !permitidas.has(k))).toEqual([])
  })

  it('situación comercial inventada → 400', async () => {
    expect((await altaHeredada(R({ ...COMPLETA, estatus: 'xyz' }))).status).toBe(400)
  })
})

// Guardia estructural: no aparece un camino nuevo a `publicada` sin pasar por la misma regla.
function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) archivos(p, acc)
    else if (/\.(ts|tsx)$/.test(n)) acc.push(p)
  }
  return acc
}

describe('2 · guardia: los únicos caminos a `publicada` en el servidor', () => {
  const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, '/')
  const api = archivos(path.join(RAIZ, 'src', 'app', 'api')).map((p) => ({ r: rel(p), t: readFileSync(p, 'utf8') }))

  it('ningún endpoint escribe el literal `estado_pub: \'publicada\'` (el destino sale SIEMPRE de una decisión)', () => {
    expect(api.filter((f) => /estado_pub:\s*'publicada'/.test(f.t)).map((f) => f.r)).toEqual([])
  })

  it('las ALTAS sólo escriben `estado_pub: \'borrador\'`; ningún `.update(` de la API toca estado_pub (todo cambio pasa por la función atómica)', () => {
    const valores = api.flatMap((f) => [...f.t.matchAll(/estado_pub:\s*'([a-z_]+)'/g)].map((m) => `${f.r}:${m[1]}`))
    expect(valores.filter((v) => !v.endsWith(':borrador'))).toEqual([])
    // un `.update({ … estado_pub …})` directo sería el patrón viejo (update + registrar separado)
    expect(api.filter((f) => /\.update\(\s*\{[^}]*estado_pub/.test(f.t)).map((f) => f.r)).toEqual([])
  })

  it('la función de la base sólo se llama desde UN helper, y ese helper sólo desde los tres escritores', () => {
    const lib = readFileSync(path.join(RAIZ, 'src', 'lib', 'cambiar-estado-propiedad.ts'), 'utf8')
    expect(lib).toContain("db.rpc('propiedad_cambiar_estado'")
    const todo = archivos(path.join(RAIZ, 'src')).map((p) => ({ r: rel(p), t: readFileSync(p, 'utf8') }))
    expect(todo.filter((f) => f.t.includes("rpc('propiedad_cambiar_estado'")).map((f) => f.r)).toEqual(['src/lib/cambiar-estado-propiedad.ts'])
    expect(todo.filter((f) => /cambiarEstadoDePropiedad\(/.test(f.t) && !f.r.endsWith('cambiar-estado-propiedad.ts')).map((f) => f.r).sort()).toEqual([
      'src/app/api/admin/propiedades/route.ts',
      'src/app/api/propiedades/[id]/estado/route.ts',
      'src/app/api/telegram/webhook/route.ts',
    ])
  })

  it('quien escribe `estado_pub` en propiedades: /estado (máquina de estados), alta heredada y Telegram — y los tres usan la regla', () => {
    const escriben = api.filter((f) => /cambiarEstadoDePropiedad\(/.test(f.t)).map((f) => f.r).sort()
    expect(escriben).toEqual([
      'src/app/api/admin/propiedades/route.ts',
      'src/app/api/propiedades/[id]/estado/route.ts',
      'src/app/api/telegram/webhook/route.ts',
    ])
    const estado = api.find((f) => f.r.endsWith('[id]/estado/route.ts'))!.t
    expect(estado).toContain('puedeTransicionar(origen, destino')
    expect(estado).toContain('antes: prop.estado_pub')       // la base compara con el estado que se LEYÓ
    expect(estado).not.toMatch(/await registrar\(/)           // ya no hay update + registrar() separado
    for (const r of ['src/app/api/admin/propiedades/route.ts', 'src/app/api/telegram/webhook/route.ts']) {
      expect(api.find((f) => f.r === r)!.t, r).toContain('decidirPublicacionAutomatica(')
    }
  })

  it('Telegram: concurrencia (sólo desde borrador), bitácora y contacto del dueño; ya no usa su regla paralela de 1 foto', () => {
    const t = api.find((f) => f.r.endsWith('telegram/webhook/route.ts'))!.t
    expect(t).toContain("antes: 'borrador'")                 // la base compara que SIGA siendo borrador
    expect(t).toContain('accion: `propiedad.${destino}`')
    expect(t).not.toMatch(/await registrar\(/)
    expect(t).toContain('puedePublicar(')
    expect(t).not.toContain('faltaParaPublicar')
  })

  it('el PATCH de contenido y el panel nunca escriben estado_pub (está en CAMPOS_RESERVADOS)', () => {
    expect(leer('src/lib/publicacion.ts')).toMatch(/CAMPOS_RESERVADOS[\s\S]*'estado_pub'/)
    expect(api.find((f) => f.r === 'src/app/api/admin/propiedades/[id]/route.ts')!.t).toContain('quitarCamposReservados(body')
  })
})

// ─────────────────── 3 · atomicidad de la bitácora (propuesta 33) ───────────────────
describe('3 · cambiarEstadoDePropiedad: de la respuesta de la base a una respuesta HTTP', () => {
  const BASE_ARGS = {
    id: 'p', antes: 'borrador', estado: 'en_revision' as const, cambios: {}, actor: { uid: 'A', email: 'a@x.test', rol: 'admin' as const },
    accion: 'propiedad.en_revision', auditAntes: { estado_pub: 'borrador' }, auditDespues: { estado_pub: 'en_revision' },
  }
  const db = (r: { data?: unknown; error?: { code?: string; message: string } | null }) => ({ rpc: async () => ({ data: r.data ?? null, error: r.error ?? null }) }) as never

  it('ok / conflicto / no_existe', async () => {
    expect(await cambiarEstadoDePropiedad(db({ data: { resultado: 'ok' } }), BASE_ARGS)).toEqual({ ok: true })
    expect(await cambiarEstadoDePropiedad(db({ data: { resultado: 'conflicto' } }), BASE_ARGS)).toMatchObject({ ok: false, codigo: 'conflicto', status: 409 })
    expect(await cambiarEstadoDePropiedad(db({ data: { resultado: 'no_existe' } }), BASE_ARGS)).toMatchObject({ ok: false, codigo: 'no_existe', status: 404 })
  })
  it('función ausente (migración sin aplicar) → 503 que lo dice (falla cerrado)', async () => {
    for (const error of [{ code: 'PGRST202', message: 'x' }, { code: '42883', message: 'x' }, { message: 'Could not find the function public.propiedad_cambiar_estado' }]) {
      expect(await cambiarEstadoDePropiedad(db({ error }), BASE_ARGS)).toMatchObject({ ok: false, codigo: 'sin_migracion', status: 503 })
    }
  })
  it('lo que la base rechaza por contenido → 400; cualquier otro fallo → 503 «no se hizo nada»; respuesta rara → 500', async () => {
    expect(await cambiarEstadoDePropiedad(db({ error: { code: '22023', message: 'auditoria_incompleta' } }), BASE_ARGS)).toMatchObject({ codigo: 'invalido', status: 400 })
    expect(await cambiarEstadoDePropiedad(db({ error: { code: '22023', message: 'cambio_invalido' } }), BASE_ARGS)).toMatchObject({ codigo: 'invalido', status: 400 })
    const caida = await cambiarEstadoDePropiedad(db({ error: { code: '57P01', message: 'terminating connection' } }), BASE_ARGS)
    expect(caida).toMatchObject({ ok: false, codigo: 'error', status: 503 })
    if (!caida.ok) expect(caida.mensaje).toMatch(/no se hizo nada/)
    expect(await cambiarEstadoDePropiedad(db({ data: { resultado: '???' } }), BASE_ARGS)).toMatchObject({ ok: false, status: 500 })
    expect(await cambiarEstadoDePropiedad(db({ data: null }), BASE_ARGS)).toMatchObject({ ok: false, status: 500 })
  })
  it('manda a la base EXACTAMENTE lo decidido: huella con actor/acción/antes/después y lista de cambios', async () => {
    let visto: Record<string, unknown> = {}
    const espia = { rpc: async (fn: string, a: Record<string, unknown>) => { visto = { fn, ...a }; return { data: { resultado: 'ok' }, error: null } } } as never
    await cambiarEstadoDePropiedad(espia, { ...BASE_ARGS, cambios: { enviada_en: '2026-10-04T00:00:00Z', completitud: 90 } })
    expect(visto).toMatchObject({
      fn: 'propiedad_cambiar_estado', p_id: 'p', p_antes_estado: 'borrador', p_estado: 'en_revision', p_cambios: { enviada_en: '2026-10-04T00:00:00Z', completitud: 90 },
      p_audit: { actor_uid: 'A', actor_email: 'a@x.test', actor_rol: 'admin', accion: 'propiedad.en_revision', antes: { estado_pub: 'borrador' }, despues: { estado_pub: 'en_revision' } },
    })
  })
})

const MIGRACION = leer('supabase/33-propiedad-cambiar-estado.sql')
const REVERSA = leer('supabase/33-propiedad-cambiar-estado.REVERTIR.sql')

const BASE = `
  create role anon; create role authenticated; create role service_role;
  create table public.propiedades (
    id text primary key, estado_pub text not null default 'publicada'
      check (estado_pub in ('borrador','en_revision','cambios_solicitados','rechazada','publicada')),
    estatus text default 'disponible', completitud smallint not null default 0,
    enviada_en timestamptz, publicada_en timestamptz, revisado_por text, revisado_en timestamptz, nota_moderacion text,
    owner_id text, folio text, slug text, vistas integer not null default 0);
  create table public.audit_logs (
    id bigint generated always as identity primary key, actor_uid text not null, actor_email text, actor_rol text,
    accion text not null, entidad text not null, entidad_id text, antes jsonb, despues jsonb, creado_en timestamptz not null default now());
  insert into public.propiedades (id, estado_pub, owner_id, folio) values ('p1','en_revision','A','VB-2026-00001'), ('p2','borrador','A','VB-2026-00002');
`
const AUD = (extra: Record<string, unknown> = {}) => JSON.stringify({
  actor_uid: 'ADM', actor_email: 'adm@x.test', actor_rol: 'admin', accion: 'propiedad.publicada',
  antes: { estado_pub: 'en_revision' }, despues: { estado_pub: 'publicada' }, ...extra,
})

describe('3 · migración 33: cambio de estado + bitácora en UNA transacción (PGlite)', () => {
  let d: PGlite
  beforeAll(async () => { d = new PGlite(); await d.exec(BASE); await d.exec(MIGRACION) }, 60_000)
  afterAll(async () => { await d.close() })

  const mover = async (o: { id?: string; antes?: string; a?: string; cambios?: unknown; audit?: string }) =>
    (await d.query<{ r: { resultado: string } }>(`select public.propiedad_cambiar_estado($1,$2,$3,$4::jsonb,$5::jsonb) as r`,
      [o.id ?? 'p1', o.antes ?? 'en_revision', o.a ?? 'publicada', JSON.stringify(o.cambios ?? { publicada_en: '2026-10-04T00:00:00Z' }), o.audit ?? AUD()])).rows[0].r.resultado
  const fila = async (id: string) => (await d.query<Record<string, unknown>>(`select * from public.propiedades where id=$1`, [id])).rows[0]
  const nAud = async () => (await d.query<{ n: number }>(`select count(*)::int as n from public.audit_logs`)).rows[0].n

  it('ok: cambia el estado y escribe la huella a la vez', async () => {
    expect(await mover({})).toBe('ok')
    expect(await fila('p1')).toMatchObject({ estado_pub: 'publicada' })
    expect(await nAud()).toBe(1)
    const a = (await d.query<{ entidad_id: string; accion: string }>(`select entidad_id, accion from public.audit_logs`)).rows[0]
    expect(a).toEqual({ entidad_id: 'p1', accion: 'propiedad.publicada' })
  })

  it('conflicto: si otra persona ya la movió, NO cambia nada ni audita', async () => {
    const antes = await nAud()
    expect(await mover({ id: 'p1', antes: 'en_revision', a: 'rechazada', cambios: { nota_moderacion: 'Faltan fotos de la cocina' } })).toBe('conflicto')
    expect(await fila('p1')).toMatchObject({ estado_pub: 'publicada' })
    expect(await nAud()).toBe(antes)
  })

  it('no_existe', async () => {
    expect(await mover({ id: 'nada', antes: 'borrador' })).toBe('no_existe')
  })

  it('ATOMICIDAD: huella incompleta aborta TODO (el cambio no queda sin bitácora)', async () => {
    const antes = await nAud()
    for (const audit of [AUD({ actor_uid: '' }), AUD({ accion: '  ' }), JSON.stringify({ actor_uid: 'X', accion: 'a' }), 'null']) {
      await expect(mover({ id: 'p2', antes: 'borrador', a: 'en_revision', audit })).rejects.toThrow(/auditoria_incompleta/)
    }
    expect(await fila('p2')).toMatchObject({ estado_pub: 'borrador' })
    expect(await nAud()).toBe(antes)
  })

  it('rechazar / pedir cambios exige la nota (≥ 10) también en la base', async () => {
    await d.exec(`update public.propiedades set estado_pub='en_revision' where id='p2'`)
    for (const nota of [undefined, '', 'corta']) {
      await expect(mover({ id: 'p2', antes: 'en_revision', a: 'rechazada', cambios: nota === undefined ? {} : { nota_moderacion: nota } })).rejects.toThrow(/auditoria_incompleta/)
    }
    expect(await mover({ id: 'p2', antes: 'en_revision', a: 'cambios_solicitados', cambios: { nota_moderacion: 'Faltan fotos de la cocina' }, audit: AUD({ accion: 'propiedad.cambios_solicitados' }) })).toBe('ok')
    expect(await fila('p2')).toMatchObject({ estado_pub: 'cambios_solicitados', nota_moderacion: 'Faltan fotos de la cocina' })
  })

  it('lista blanca: no se puede colar dueño, folio, slug ni contadores por el cambio; estado inventado, tampoco', async () => {
    await expect(mover({ id: 'p2', antes: 'cambios_solicitados', a: 'borrador', cambios: { owner_id: 'X' } })).rejects.toThrow(/cambio_invalido/)
    await expect(mover({ id: 'p2', antes: 'cambios_solicitados', a: 'borrador', cambios: { folio: 'VB-1' } })).rejects.toThrow(/cambio_invalido/)
    await expect(mover({ id: 'p2', antes: 'cambios_solicitados', a: 'borrador', cambios: { vistas: 99 } })).rejects.toThrow(/cambio_invalido/)
    await expect(mover({ id: 'p2', antes: 'cambios_solicitados', a: 'archivada' })).rejects.toThrow(/cambio_invalido/)
    expect(await fila('p2')).toMatchObject({ owner_id: 'A', folio: 'VB-2026-00002', vistas: 0, estado_pub: 'cambios_solicitados' })
  })

  it('la máquina de estados de la base == la de la aplicación (las 25 combinaciones, unión de roles)', async () => {
    const estados = ['borrador', 'en_revision', 'cambios_solicitados', 'rechazada', 'publicada'] as const
    for (const desde of estados) {
      for (const hacia of estados) {
        const app = puedeTransicionar(desde, hacia, 'admin').ok
          || puedeTransicionar(desde, hacia, 'publicador', false).ok
          || puedeTransicionar(desde, hacia, 'publicador', true).ok
        await d.exec(`update public.propiedades set estado_pub='${desde}' where id='p1'`)
        let sql: string
        try { sql = await mover({ id: 'p1', antes: desde, a: hacia, cambios: hacia === 'rechazada' || hacia === 'cambios_solicitados' ? { nota_moderacion: 'Motivo suficientemente largo' } : {} }) }
        catch (e) { sql = /cambio_invalido/.test(String(e)) ? 'invalida' : `error:${String(e)}` }
        expect(sql === 'ok', `${desde} → ${hacia}`).toBe(app)
        if (desde === hacia) expect(sql).toBe('invalida')
      }
    }
  })

  it('el DOBLE de las pruebas de rutas se comporta como el SQL real (25 combinaciones + rechazos)', async () => {
    const estados = ['borrador', 'en_revision', 'cambios_solicitados', 'rechazada', 'publicada'] as const
    const casos: Array<{ desde: string; hacia: string; cambios: Record<string, unknown>; audit?: string }> = []
    for (const desde of estados) for (const hacia of estados) {
      casos.push({ desde, hacia, cambios: hacia === 'rechazada' || hacia === 'cambios_solicitados' ? { nota_moderacion: 'Motivo suficientemente largo' } : {} })
    }
    casos.push({ desde: 'en_revision', hacia: 'rechazada', cambios: { nota_moderacion: 'corta' } })
    casos.push({ desde: 'borrador', hacia: 'en_revision', cambios: { owner_id: 'X' } })
    casos.push({ desde: 'borrador', hacia: 'en_revision', cambios: { estatus: 'xyz' } })
    casos.push({ desde: 'borrador', hacia: 'en_revision', cambios: { publicada_en: 'no-es-fecha' } })
    casos.push({ desde: 'borrador', hacia: 'en_revision', cambios: {}, audit: AUD({ actor_uid: '' }) })
    casos.push({ desde: 'borrador', hacia: 'archivada', cambios: {} })
    for (const c of casos) {
      await d.exec(`update public.propiedades set estado_pub='${c.desde}' where id='p1'`)
      let sql: string
      try { sql = await mover({ id: 'p1', antes: c.desde, a: c.hacia, cambios: c.cambios, audit: c.audit }) } catch (e) { sql = /auditoria_incompleta/.test(String(e)) ? 'auditoria_incompleta' : /cambio_invalido/.test(String(e)) ? 'cambio_invalido' : `error:${String(e)}` }
      const doble = propiedadCambiarEstado([{ id: 'p1', estado_pub: c.desde }], [], {
        p_id: 'p1', p_antes_estado: c.desde, p_estado: c.hacia, p_cambios: c.cambios, p_audit: JSON.parse(c.audit ?? AUD()),
      })
      expect(doble.error ? doble.error.message : doble.data!.resultado, `${c.desde} → ${c.hacia} ${JSON.stringify(c.cambios)}`).toBe(sql)
    }
  })

  it('valores, no sólo nombres: estatus inventado, fecha o número mal formados → cambio_invalido y nada se escribe', async () => {
    await d.exec(`update public.propiedades set estado_pub='borrador' where id='p2'`)
    const antes = await nAud()
    for (const cambios of [{ estatus: 'xyz' }, { publicada_en: 'no-es-fecha' }, { completitud: 'abc' }, { completitud: 99999999 }]) {
      await expect(mover({ id: 'p2', antes: 'borrador', a: 'en_revision', cambios })).rejects.toThrow(/cambio_invalido/)
    }
    expect(await fila('p2')).toMatchObject({ estado_pub: 'borrador' })
    expect(await nAud()).toBe(antes)
  })

  it('es ADITIVA (sólo crea una función) y su reversa sólo la quita: no toca datos', async () => {
    // Una sola función; fuera de su cuerpo no hay DML ni DDL de tablas (sólo comment / revoke / grant).
    expect(MIGRACION.match(/create or replace function/gi)).toHaveLength(1)
    const fuera = MIGRACION.replace(/\$fn\$[^]*?\$fn\$/, '').replace(/--.*$/gm, '')
    expect(fuera).not.toMatch(/\b(insert|update|delete|truncate|alter|drop)\b|create table/i)
    expect(REVERSA.replace(/--.*$/gm, '').trim()).toBe('drop function if exists public.propiedad_cambiar_estado(text, text, text, jsonb, jsonb);')
    const e = await PGlite.create()
    await e.exec(BASE)
    const antes = (await e.query<{ n: number }>(`select count(*)::int as n from public.propiedades`)).rows[0].n
    await e.exec(MIGRACION)
    expect((await e.query<{ n: number }>(`select count(*)::int as n from public.propiedades`)).rows[0].n).toBe(antes)
    expect((await e.query<{ n: number }>(`select count(*)::int as n from public.audit_logs`)).rows[0].n).toBe(0)
    await e.exec(REVERSA)
    expect((await e.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname='propiedad_cambiar_estado'`)).rows[0].n).toBe(0)
    await e.close()
  })

  it('security invoker + search_path vacío (como las hermanas 28/31/32)', async () => {
    const r = await d.query<{ sec: boolean; cfg: string[] }>(`select prosecdef as sec, proconfig as cfg from pg_proc where proname='propiedad_cambiar_estado'`)
    expect(r.rows[0].sec).toBe(false)
    expect(r.rows[0].cfg).toEqual(['search_path=""'])
  })

  it('sólo service_role puede ejecutarla', async () => {
    const r = await d.query<{ g: string }>(`select grantee as g from information_schema.routine_privileges where routine_name='propiedad_cambiar_estado' and grantee in ('anon','authenticated','service_role','PUBLIC')`)
    expect(r.rows.map((x) => x.g).sort()).toEqual(['service_role'])
  })
})
