import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BARRERA (28-oct-2026) — «hice clic en WhatsApp y no apareció en Mis consultas».
 * Causas halladas: (1) en staging faltaba la migración 58 (la tabla no existía y el registro fallaba en silencio); (2) DOS superficies de contacto no anotaban nada:
 * la tarjeta clásica (`PropertyCard`) y el modal del listado. Esta prueba obliga a que TODA superficie que abre WhatsApp / llamada / correo de una propiedad anote el intento.
 */
const SUPERFICIES = ['src/app/propiedades/[id]/page-client.tsx', 'src/components/catalogo/TarjetaCompacta.tsx', 'src/components/PropertyCard.tsx', 'src/app/propiedades/page-client.tsx']
describe('toda superficie de contacto de una propiedad anota el intento', () => {
  for (const f of SUPERFICIES) {
    it(f, () => {
      const s = readFileSync(f, 'utf8')
      expect(s, 'abre WhatsApp con el mensaje de informes').toContain('textoDeInformes(')
      expect(s, 'debe anotar el contacto en el historial').toContain("registrarContactoDelCliente(")
      expect(s).toContain("'whatsapp'")
    })
  }
  it('PropertyCard anota también llamada y correo', () => {
    const s = readFileSync('src/components/PropertyCard.tsx', 'utf8')
    expect(s).toContain("registrarContactoDelCliente(p.id, 'telefono')")
    expect(s).toContain("registrarContactoDelCliente(p.id, 'correo')")
  })
  it('cualquier archivo NUEVO que abra WhatsApp con el mensaje de una propiedad también debe anotar (búsqueda en todo src)', () => {
    const archivos = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => /\.(tsx|ts)$/.test(f)).map((f) => join('src', f))
    const conMensaje = archivos.filter((f) => readFileSync(f, 'utf8').includes('textoDeInformes('))
    expect(conMensaje.length, 'control positivo: la búsqueda encuentra las superficies conocidas').toBeGreaterThanOrEqual(4)
    const sinAnotar = conMensaje.filter((f) => !f.endsWith('whatsapp-propiedad.ts') && !readFileSync(f, 'utf8').includes('registrarContactoDelCliente('))
    expect(sinAnotar, `abren WhatsApp pero no anotan el contacto: ${sinAnotar.join(', ')}`).toEqual([])
  })
})

describe('registrarContactoDelCliente solo devuelve true si el servidor lo guardó', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  async function cargar(token: string | null, respuesta: { ok: boolean; status: number } | 'cae') {
    vi.doMock('@/lib/firebase', () => ({ auth: { currentUser: token ? { getIdToken: async () => token } : null } }))
    const llamadas: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { llamadas.push({ url, init }); if (respuesta === 'cae') throw new Error('red'); return respuesta }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { registrarContactoDelCliente } = await import('../src/lib/registrar-contacto-cliente')
    return { registrar: registrarContactoDelCliente, llamadas }
  }
  it('201/200 → true, con keepalive, a /api/portal/contactos y con el token de la sesión', async () => {
    const { registrar, llamadas } = await cargar('tok', { ok: true, status: 201 })
    expect(await registrar('p1', 'whatsapp')).toBe(true)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe('/api/portal/contactos')
    expect(llamadas[0].init.keepalive).toBe(true)
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ propiedadId: 'p1', canal: 'whatsapp' })
    expect((llamadas[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
  it('503 (migración sin aplicar), 404 (portal cerrado) o red caída → false (no se finge éxito)', async () => {
    expect(await (await cargar('tok', { ok: false, status: 503 })).registrar('p1', 'whatsapp')).toBe(false)
    expect(await (await cargar('tok', { ok: false, status: 404 })).registrar('p1', 'telefono')).toBe(false)
    expect(await (await cargar('tok', 'cae')).registrar('p1', 'correo')).toBe(false)
  })
  it('sin sesión o sin propiedad: no llama a la red y devuelve false', async () => {
    const a = await cargar(null, { ok: true, status: 201 })
    expect(await a.registrar('p1', 'whatsapp')).toBe(false); expect(a.llamadas).toHaveLength(0)
    const b = await cargar('tok', { ok: true, status: 201 })
    expect(await b.registrar(null, 'whatsapp')).toBe(false); expect(b.llamadas).toHaveLength(0)
  })
})
