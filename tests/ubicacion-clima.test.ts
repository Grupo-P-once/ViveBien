import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GET } from '../src/app/api/clima/route'

/** Ubicación y clima del visitante en el hero (22-oct-2026): fuera del header, por IP en el servidor, sin mandar la IP a terceros. */
const raiz = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')

afterEach(() => { vi.unstubAllGlobals() })

function simular(respuesta: unknown, ok = true) {
  const f = vi.fn(async () => ({ ok, json: async () => respuesta }) as Response)
  vi.stubGlobal('fetch', f)
  return f
}
const peticion = (h: Record<string, string> = {}) => new Request('https://vivebienn.com/api/clima', { headers: h })

describe('/api/clima', () => {
  it('con la geolocalización de Vercel usa la ciudad del visitante, abrevia el estado y redondea las coordenadas', async () => {
    const f = simular({ current_weather: { temperature: 23.6, weathercode: 1 } })
    const r = await GET(peticion({ 'x-vercel-ip-country': 'MX', 'x-vercel-ip-city': 'Le%C3%B3n', 'x-vercel-ip-country-region': 'GUA', 'x-vercel-ip-latitude': '21.12908', 'x-vercel-ip-longitude': '-101.67374' }))
    const j = await r.json()
    expect(j).toMatchObject({ ciudad: 'León', region: 'Gto.', porIp: true, clima: { temp: 24, icono: 'sol', desc: 'Mayormente despejado' } })
    const url = String((f.mock.calls[0] as unknown[])[0])
    expect(url).toContain('latitude=21.1'); expect(url).toContain('longitude=-101.7')      // ≈ 11 km: nada preciso de la persona
    expect(url).not.toMatch(/21\.129|101\.673/)
  })
  it('fuera de México muestra la ciudad y el país', async () => {
    simular({ current_weather: { temperature: 5, weathercode: 61 } })
    const j = await (await GET(peticion({ 'x-vercel-ip-country': 'US', 'x-vercel-ip-city': 'Austin', 'x-vercel-ip-country-region': 'TX', 'x-vercel-ip-latitude': '30.27', 'x-vercel-ip-longitude': '-97.74' }))).json()
    expect(j).toMatchObject({ ciudad: 'Austin', region: 'US', porIp: true })
  })
  it('sin cabeceras (local, pruebas) responde León, Gto. — la sede', async () => {
    simular({ current_weather: { temperature: 20, weathercode: 3 } })
    const j = await (await GET(peticion())).json()
    expect(j).toMatchObject({ ciudad: 'León', region: 'Gto.', porIp: false })
  })
  it('si el clima falla, responde la ciudad sin temperatura (nunca inventa el dato ni rompe la portada)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red') }))
    const r = await GET(peticion({ 'x-vercel-ip-city': 'Silao', 'x-vercel-ip-country': 'MX', 'x-vercel-ip-country-region': 'GUA', 'x-vercel-ip-latitude': '20.9', 'x-vercel-ip-longitude': '-101.4' }))
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ ciudad: 'Silao', clima: null })
    simular({}, false)
    expect((await (await GET(peticion())).json()).clima).toBeNull()
  })
  it('descarta cabeceras con coordenadas inválidas y no devuelve la IP ni las coordenadas', async () => {
    simular({ current_weather: { temperature: 10, weathercode: 0 } })
    const j = await (await GET(peticion({ 'x-vercel-ip-city': 'X', 'x-vercel-ip-latitude': '999', 'x-vercel-ip-longitude': '0', 'x-forwarded-for': '203.0.113.9' }))).json()
    expect(j.porIp).toBe(false); expect(JSON.stringify(j)).not.toMatch(/203\.0\.113|latitud|lat|lon/i)
  })
  it('la respuesta es privada (no se comparte entre personas) y la ruta no guarda ni registra la IP', () => {
    const t = leer('src/app/api/clima/route.ts')
    expect(t).toContain("'Cache-Control': 'private")
    expect(t).not.toMatch(/console\.(log|info|warn)|x-forwarded-for|x-real-ip/)
  })
})

describe('inicio · ubicación con clima', () => {
  it('el header ya no trae el widget del clima ni llama a un tercero', () => {
    const h = leer('src/components/Header.tsx')
    expect(h).not.toMatch(/open-meteo|clima|setClima/i)
  })
  it('el hero usa la ubicación del visitante y no el texto fijo «León · Guanajuato · México»', () => {
    const t = leer('src/components/inicio/HeroInicio.tsx')
    expect(t).toContain('<UbicacionClima />'); expect(t).not.toContain('León · Guanajuato · México')
    const u = leer('src/components/inicio/UbicacionClima.tsx')
    expect(u).toContain("fetch('/api/clima'"); expect(u).not.toMatch(/open-meteo|ipapi|ipinfo/i)
  })
  it('el navegador ya no necesita conectarse al proveedor del clima (CSP más estricta)', () => {
    expect(leer('src/lib/csp.ts')).not.toMatch(/open-meteo/)
  })
  it('la marquesina entre las categorías y «Nuestro propósito» corre mucho más lento (≥ 90 s por vuelta)', () => {
    const m = leer('src/app/page-client.tsx').match(/animation: 'marquee (\d+)s linear infinite'/)
    expect(m).toBeTruthy(); expect(Number(m![1])).toBeGreaterThanOrEqual(90)
  })
})

describe('/api/clima · nombres', () => {
  it('«León de los Aldama» (nombre largo que da la geolocalización) se muestra como «León»', async () => {
    simular({ current_weather: { temperature: 16, weathercode: 1 } })
    const j = await (await GET(peticion({ 'x-vercel-ip-country': 'MX', 'x-vercel-ip-city': 'Le%C3%B3n%20de%20los%20Aldama', 'x-vercel-ip-country-region': 'GUA', 'x-vercel-ip-latitude': '21.1', 'x-vercel-ip-longitude': '-101.7' }))).json()
    expect(j).toMatchObject({ ciudad: 'León', region: 'Gto.' })
  })
})
