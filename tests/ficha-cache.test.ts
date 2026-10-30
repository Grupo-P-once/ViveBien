import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * R-09 / QA-009 (D-62): la lectura de la ficha se cachea SOLO cuando se encontró (y es visible), se tira al instante en cada guardado
 * y el cliente recibe la propiedad ya leída. Se simula `unstable_cache` con su semántica real (guarda lo que resuelve; lo que lanza, no).
 */
const llamadas: string[] = []
let respuesta: { data: unknown; error: unknown } = { data: null, error: null }
const memo = new Map<string, unknown>()
const revalidarTag = vi.fn()
const revalidarPath = vi.fn()

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: string[]) => Promise<unknown>, claveBase: string[]) => async (...args: string[]) => {
    const k = claveBase.join('|') + '|' + args.join('|')
    if (memo.has(k)) return memo.get(k)
    const v = await fn(...args) // si lanza, NO se guarda
    memo.set(k, v)
    return v
  },
  revalidateTag: (...a: unknown[]) => revalidarTag(...a),
  revalidatePath: (...a: unknown[]) => revalidarPath(...a),
}))
vi.mock('../src/lib/supabase-servidor', () => ({
  clienteServidor: () => ({ from: () => ({ select: () => ({ eq: (c: string) => ({ maybeSingle: async () => { llamadas.push(c); return c === 'slug' ? respuesta : { data: null, error: null } } }) }) }) }),
}))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))

const FILA = { id: 'p1', slug: 'casa-x', folio: 'VB-2026-00099', estado_pub: 'publicada', estatus: 'disponible', titulo: 'Casa' }

beforeEach(() => { llamadas.length = 0; memo.clear(); revalidarTag.mockClear(); revalidarPath.mockClear(); respuesta = { data: FILA, error: null } })

describe('qué se cachea', () => {
  it('una propiedad ENCONTRADA se lee una sola vez (la segunda sale de la caché)', async () => {
    const { resolverCacheada } = await import('../src/lib/ficha-servidor')
    expect((await resolverCacheada('casa-x')).estado).toBe('encontrada')
    expect((await resolverCacheada('casa-x')).estado).toBe('encontrada')
    expect(llamadas.filter((c) => c === 'slug')).toHaveLength(1)
  })
  it('NO se cachea el 404 (ni una propiedad inexistente ni una PAUSADA/eliminada por D-59): se vuelve a preguntar', async () => {
    const { resolverCacheada } = await import('../src/lib/ficha-servidor')
    respuesta = { data: null, error: null }
    expect((await resolverCacheada('no-existe')).estado).toBe('no-existe')
    await resolverCacheada('no-existe')
    expect(llamadas.filter((c) => c === 'slug')).toHaveLength(2)
    llamadas.length = 0
    respuesta = { data: { ...FILA, estatus: 'pausada' }, error: null }
    expect((await resolverCacheada('casa-x')).estado).toBe('no-existe')
    await resolverCacheada('casa-x')
    expect(llamadas.filter((c) => c === 'slug')).toHaveLength(2)
  })
  it('NO se cachea un ERROR de la base (no se queda pegado)', async () => {
    const { resolverCacheada } = await import('../src/lib/ficha-servidor')
    respuesta = { data: null, error: { code: '500', message: 'boom' } }
    expect((await resolverCacheada('casa-x')).estado).toBe('error')
    respuesta = { data: FILA, error: null }
    expect((await resolverCacheada('casa-x')).estado).toBe('encontrada') // se recuperó al instante
  })
  it('una propiedad que pasa a pausada tras guardar se ve como 404 en cuanto se tira la etiqueta', async () => {
    const { resolverCacheada } = await import('../src/lib/ficha-servidor')
    expect((await resolverCacheada('casa-x')).estado).toBe('encontrada')
    memo.clear() // lo que hace revalidateTag('ficha', { expire: 0 }) en la caché real
    respuesta = { data: { ...FILA, estatus: 'pausada' }, error: null }
    expect((await resolverCacheada('casa-x')).estado).toBe('no-existe')
  })
})

describe('invalidación en cada guardado', () => {
  it('refrescarCatalogo tira la etiqueta «ficha» sin servir nada viejo (expire: 0) además de las rutas', async () => {
    const { refrescarCatalogo } = await import('../src/lib/refrescar')
    refrescarCatalogo()
    expect(revalidarTag).toHaveBeenCalledWith('ficha', { expire: 0 })
    expect(revalidarPath).toHaveBeenCalledWith('/api/catalogo')
  })
  it('todas las rutas que modifican propiedades públicas llaman a refrescarCatalogo', () => {
    const SRC = path.join(__dirname, '..', 'src')
    for (const r of ['app/api/admin/propiedades/route.ts', 'app/api/admin/propiedades/[id]/route.ts', 'app/api/propiedades/[id]/estado/route.ts', 'app/api/telegram/webhook/route.ts']) {
      expect(readFileSync(path.join(SRC, r), 'utf8'), r).toMatch(/refrescarCatalogo\(\)/)
    }
  })
})

describe('R-07/R-09: imágenes y SSR de la foto principal', () => {
  const SRC = path.join(__dirname, '..', 'src')
  const leer = (r: string) => readFileSync(path.join(SRC, r), 'utf8')
  it('el servidor entrega la propiedad ya leída al cliente de la ficha', () => {
    expect(leer('app/propiedades/[id]/page.tsx')).toMatch(/<DetallePropiedad[^>]*inicial=\{data/)
    expect(leer('app/propiedades/[id]/page-client.tsx')).toMatch(/useState<Propiedad \| null>\(propInicial\)/)
  })
  it('la ficha, el listado y la portada sirven imágenes al tamaño que se pinta, con prioridad alta en el LCP', () => {
    // La foto principal de la ficha la pinta ahora la galería fluida: pide el tamaño que se ve, con prioridad alta la primera (es el LCP) y la ficha le pasa `prioridad`.
    expect(leer('components/catalogo/GaleriaFluida.tsx')).toMatch(/imgResponsiva\(url, sizes, ficha \? 1200 : 640\)[\s\S]*?fetchPriority=\{prioridad && i === 0 \? 'high' : undefined\}/)
    expect(leer('app/propiedades/[id]/page-client.tsx')).toMatch(/<GaleriaFluida variante="ficha"[^>]*sizes="\(max-width: 1000px\) 100vw, 920px" prioridad/)
    expect(leer('components/PropertyCard.tsx')).toMatch(/imgResponsiva\([\s\S]*?loading="lazy"/)
    expect(leer('app/propiedades/page-client.tsx')).toContain('/portadas/propiedades.webp') // portada local del propietario (antes: foto remota con srcset)
    expect(leer('app/propiedades/page-client.tsx')).toContain('fetchPriority="high"')
    // Portada rediseñada: el LCP ya no es la foto remota del hero viejo sino la PORTADA local del video (webp de ~20-30 KB, `<picture>` por ancho).
    expect(leer('components/inicio/HeroVideo.tsx')).toMatch(/<img src="\/inicio\/portada-movil\.webp"[^>]*fetchPriority="high"/)
    expect(leer('components/inicio/HeroVideo.tsx')).toContain('srcSet="/inicio/portada-escritorio.webp"')
  })
})
