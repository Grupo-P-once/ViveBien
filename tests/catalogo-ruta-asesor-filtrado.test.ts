import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoria, reiniciarAlmacen } from '../src/lib/limites-almacen'

/**
 * REVISIÓN INDEPENDIENTE (28-oct-2026) — «Publicado por» en una consulta FILTRADA.
 * Antes los dueños se leían de las 500 propiedades más nuevas; una consulta filtrada puede devolver una más antigua y se atribuía a VIVE BIEN aunque fuera de un asociado.
 * La base simulada se comporta como la real: la lectura «las 500 más nuevas» NO incluye la propiedad antigua; solo `.in('id', …)` la encuentra.
 */
const PUBLICA = { id: 'vieja', folio: 'VB-1', estado_pub: 'publicada', estatus: 'disponible', tipo: 'casa', operacion: 'venta', precio: 1_000_000, metros: 100, banos: 2, recamaras: 3, ubicacion: 'Calle Uno 1', colonia: 'Centro', ciudad: 'León', videos: [], planos: [], publicada_en: '2020-01-01T00:00:00Z', extras: null }
const CUENTA = { uid: 'U1', nombre: 'Ana López', foto_url: null, rol: 'publicador', tipo_publicador: 'asociado', permisos_override: null, estado: 'activo' }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      let ids: string[] | null = null
      let soloColumnasDueno = false
      const b: Record<string, unknown> = {
        select: (cols: string) => { soloColumnasDueno = cols === 'id, owner_id'; return b },
        order: () => b, filter: () => b, or: () => b, limit: () => b,
        in: (_col: string, valores: string[]) => { ids = valores; return b },
        then: (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => {
          let data: unknown[] = []
          if (tabla === 'usuarios') data = ids?.includes('U1') ? [CUENTA] : []
          else if (soloColumnasDueno) data = ids?.includes('vieja') ? [{ id: 'vieja', owner_id: 'U1' }] : []   // «las 500 más nuevas» (sin .in) → no la incluye
          else data = [PUBLICA]
          return Promise.resolve({ data, error: null }).then(ok, ko)
        },
      }
      return b
    },
  }),
}))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'servicio-de-prueba'
  memoria.vaciar(); reiniciarAlmacen()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); delete process.env.SUPABASE_SERVICE_ROLE_KEY })

describe('«Publicado por» con filtros', () => {
  it('una propiedad ANTIGUA devuelta por una consulta filtrada conserva a su asesor (no se atribuye a VIVE BIEN)', async () => {
    vi.resetModules()
    const { GET } = await import('../src/app/api/catalogo/route')
    const r = await GET(new Request('http://localhost/api/catalogo?op=venta', { headers: { 'x-forwarded-for': '203.0.113.9' } }))
    const j = await r.json() as { propiedades: Array<{ id: string; asesor?: { nombre: string } | null }> }
    expect(j.propiedades.map((p) => p.id)).toEqual(['vieja'])
    expect(j.propiedades[0].asesor?.nombre).toBe('Ana López')
    expect(JSON.stringify(j)).not.toContain('owner_id')
    expect(JSON.stringify(j)).not.toContain('U1')
  })
})
