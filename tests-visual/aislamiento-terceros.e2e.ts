import { expect, test } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * Aislamiento de terceros (Etapa 6, bloqueo A: los timeouts intermitentes de 30 s).
 *
 * Demuestra el MECANISMO con un tercero atascado A PROPÓSITO (una ruta que nunca responde), y que la corrección lo contiene (que NO cambia lo medido con la red sana lo comprueba la comparación de axe contra la línea base):
 *   1. SIN límite, un solo tercero que no contesta impide que `/contacto` llegue a «red quieta»: el mismo `networkidle` que agotó 30 s en
 *      `axe · contacto` (v390), también contra la base promovida.
 *   2. CON `acotarTerceros`, el mismo tercero atascado se corta al límite y la página queda quieta.
 * Falla si alguien quita el límite de `ayudas-red.ts`/`prepararPaginaPublica`, o vuelve a depender de un tercero sin acotarlo.
 */
async function basePublica(page: import('@playwright/test').Page) {
  await page.route('**/api/eventos', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  await page.route('**/api/registro-lead', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"current_weather":{"temperature":24,"weathercode":1}}' }))
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
}
const atascar = (host: string) => ['**/' + host + '/**', () => { /* nunca responde: el tercero «no contesta» */ }] as const

test.describe('un tercero que no contesta', () => {
  test('1) SIN límite, UN solo tercero atascado deja la navegación colgada (el timeout de 30 s que se vio), y se ve QUÉ queda pendiente', async ({ page }) => {
    await basePublica(page)
    const pendientes = new Set<string>()
    page.on('request', (r) => pendientes.add(r.url()))
    page.on('requestfinished', (r) => pendientes.delete(r.url()))
    page.on('requestfailed', (r) => pendientes.delete(r.url()))
    await page.route(...atascar('fonts.googleapis.com'))
    // La hoja de estilos de Google Fonts bloquea el renderizado: ni «domcontentloaded» llega. Es el `page.goto` que agotó 30 s en `axe · portada`.
    await expect(page.goto('/contacto', { waitUntil: 'domcontentloaded', timeout: 6_000 })).rejects.toThrow(/Timeout/)
    expect([...pendientes].some((u) => /fonts\.googleapis\.com/.test(u))).toBe(true)
  })

  test('2) CON límite, el mismo tercero atascado se corta y la página llega a red quieta', async ({ page }) => {
    await basePublica(page)
    // El tercero «real» está atascado: la petición al tercero nunca termina; el límite la corta a los 1,5 s.
    await acotarTerceros(page, { limiteMs: 1_500, traer: () => new Promise(() => { /* atascado */ }) })
    await page.goto('/contacto', { waitUntil: 'domcontentloaded' })
    const t0 = Date.now()
    await page.waitForLoadState('networkidle', { timeout: 15_000 })
    expect(Date.now() - t0).toBeLessThan(12_000)
  })
})

test.describe('un tercero de IMÁGENES que falla (Etapa 7)', () => {
  test('3) con Unsplash inaccesible, el catálogo llega a red quieta y la imagen de reserva se prueba UNA vez (sin bucle de errores)', async ({ page }) => {
    await basePublica(page)
    const intentos = new Map<string, number>()
    // Todo Unsplash falla al instante (sin red, bloqueador de anuncios, filtro de oficina): también la imagen de reserva.
    await page.route('**/images.unsplash.com/**', (r) => {
      const u = r.request().url()
      intentos.set(u, (intentos.get(u) ?? 0) + 1)
      return r.abort('failed')
    })
    await page.goto('/propiedades', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 })
    await page.waitForTimeout(2_000)
    const total = [...intentos.values()].reduce((a, b) => a + b, 0)
    const urls = intentos.size
    // Con el bucle de antes: miles de intentos en 30 s. Ahora cada dirección se pide a lo sumo 2 veces (la original y, si es otra, la reserva).
    expect(total, `intentos a Unsplash: ${total} para ${urls} direcciones distintas`).toBeLessThanOrEqual(Math.max(4, urls * 2))
  })
})
