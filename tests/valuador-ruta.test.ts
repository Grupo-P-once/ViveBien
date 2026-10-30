import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/valuador con la base SIMULADA: valida en el servidor, devuelve la estimación o «insuficiente», falla cerrado si la base no responde,
 * no pide ni devuelve datos personales y respeta el tope de peticiones.
 */
let filas: unknown[] = []
let falla: string | null = null
vi.mock('@/lib/supabase-servidor', () => ({
  clienteServidor: () => ({ from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve(falla ? { data: null, error: { message: falla } } : { data: filas, error: null }) }) }) }) }),
}))

import { GET, POST } from '../src/app/api/valuador/route'

let ip = 0
const pedir = (cuerpo: unknown) => POST(new Request('http://localhost/api/valuador', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}` }, body: JSON.stringify(cuerpo) }))
const casa = (i: number, ppm: number, extra: Record<string, unknown> = {}) => ({ id: `p${i}`, slug: `casa-${i}`, titulo: `Casa ${i}`, tipo: 'casa', operacion: 'venta', precio: ppm * 150, moneda: 'MXN', colonia: 'Campestre', ciudad: 'León', metros: 150, recamaras: 3, banos: 2, estatus: 'disponible', estado_pub: 'publicada', ...extra })
const valido = { operacion: 'venta', tipo: 'casa', colonia: 'Campestre', metros: 150, recamaras: 3, banos: 2 }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54399'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-falsa'
  falla = null
  filas = [24000, 25000, 25500, 26000, 24500, 25200].map((p, i) => casa(i + 1, p))
})

describe('POST /api/valuador', () => {
  it('rechaza una entrada inválida con 400, el mensaje y el campo', async () => {
    const r = await pedir({ ...valido, metros: 3 })
    expect(r.status).toBe(400)
    const j = await r.json()
    expect(j.campo).toBe('metros'); expect(j.error).toMatch(/m²/)
  })
  it('un cuerpo que no es JSON da 400 y no revienta', async () => {
    const r = await POST(new Request('http://localhost/api/valuador', { method: 'POST', headers: { 'x-forwarded-for': '10.9.9.9' }, body: 'no es json' }))
    expect(r.status).toBe(400)
  })
  it('con comparables suficientes responde la estimación, el aviso y NINGÚN dato personal ni interno', async () => {
    const r = await pedir(valido)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.resultado.estado).toBe('estimado')
    expect(j.resultado.rango.min).toBeLessThanOrEqual(j.resultado.rango.max)
    expect(j.aviso).toMatch(/No es un avalúo/)
    expect(JSON.stringify(j)).not.toMatch(/owner_id|whatsapp|telefono|correo|email|nombre/i)
  })
  it('sin comparables suficientes responde «insuficiente» (y nunca una cifra)', async () => {
    filas = filas.slice(0, 2)
    const j = await (await pedir(valido)).json()
    expect(j.resultado.estado).toBe('insuficiente')
    expect(j.resultado).not.toHaveProperty('rango')
  })
  it('falla CERRADO: si la base no responde, 503 y ninguna estimación', async () => {
    falla = 'tiempo agotado'
    const r = await pedir(valido)
    expect(r.status).toBe(503)
    const j = await r.json()
    expect(j).not.toHaveProperty('resultado')
  })
  it('no usa anuncios no publicados ni pausados aunque la base los devuelva', async () => {
    filas = [...filas.slice(0, 3), casa(90, 90000, { estado_pub: 'borrador' }), casa(91, 90000, { estatus: 'pausada' })]
    const j = await (await pedir(valido)).json()
    expect(j.resultado.estado).toBe('estimado')
    expect(j.resultado.total_considerados).toBe(3)
  })
  it('frena las ráfagas (429 con Retry-After) por origen', async () => {
    const mismo = () => POST(new Request('http://localhost/api/valuador', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.8.8.8' }, body: JSON.stringify(valido) }))
    let ultimo = 200
    for (let i = 0; i < 45; i++) { const r = await mismo(); ultimo = r.status; if (r.status === 429) { expect(r.headers.get('Retry-After')).toBeTruthy(); break } }
    expect(ultimo).toBe(429)
  })
})

describe('GET /api/valuador', () => {
  it('devuelve las colonias con anuncios (sin repetir ni por acentos) y el conteo por operación y tipo', async () => {
    filas = [casa(1, 25000), casa(2, 25000, { colonia: 'CAMPESTRE' }), casa(3, 25000, { colonia: 'Cañada del Refugio' }), casa(4, 20, { operacion: 'renta' })]
    const r = await GET(new Request('http://localhost/api/valuador', { headers: { 'x-forwarded-for': '10.7.7.7' } }))
    const j = await r.json()
    expect(j.colonias.map((c: { nombre: string }) => c.nombre)).toEqual(['Campestre', 'Cañada del Refugio'])
    expect(j.colonias[0].n).toBe(3)   // 2 de venta + 1 de renta, todas de Campestre
    expect(j.conteo['venta:casa']).toBe(3); expect(j.conteo['renta:casa']).toBe(1)
  })
  it('si la base falla, 503 con lista vacía', async () => {
    falla = 'x'
    const r = await GET(new Request('http://localhost/api/valuador', { headers: { 'x-forwarded-for': '10.7.7.8' } }))
    expect(r.status).toBe(503)
    expect((await r.json()).colonias).toEqual([])
  })
})
