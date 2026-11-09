import { devices, expect, test } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * R-08 / QA-008 (D-62): /entrar no debe saltar al hidratar. ANTES: CLS 0,31 (teléfono) y 0,48 (tableta vertical), porque el servidor pintaba SIEMPRE
 * la disposición de escritorio. Se corre una sola vez (proyecto v1440) con perfiles de dispositivo REALES de Playwright (User-Agent y pistas de
 * cliente incluidos), porque la corrección depende de lo que el navegador anuncia en la petición.
 */
async function cls(page: import('@playwright/test').Page, ruta: string): Promise<{ total: number; saltos: number }> {
  await acotarTerceros(page) // con la red sana las fuentes reales cargan igual; un tercero atascado se corta y no cuelga `networkidle`
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number[] }).__cls = []
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as Array<{ hadRecentInput: boolean; value: number }>) if (!e.hadRecentInput) (window as unknown as { __cls: number[] }).__cls.push(e.value)
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(ruta, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const v = await page.evaluate(() => (window as unknown as { __cls: number[] }).__cls)
  return { total: v.reduce((a, x) => a + x, 0), saltos: v.length }
}

test.describe('CLS de /entrar por dispositivo', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'v1440', 'una sola vez; usa sus propios perfiles de dispositivo') })

  // Los perfiles se aplican con `browser.newContext`: `test.use` no admite `defaultBrowserType` dentro de un describe.
  const perfil = (d: keyof typeof devices) => { return Object.fromEntries(Object.entries(devices[d]).filter(([clave]) => clave !== 'defaultBrowserType')) }

  for (const [nombre, opciones] of [
    ['teléfono (Pixel 7)', perfil('Pixel 7')],
    ['tableta vertical (iPad)', perfil('iPad (gen 7)')],
    ['escritorio (no se rompe lo que ya iba bien)', { ...perfil('Desktop Chrome'), viewport: { width: 1440, height: 900 } }],
  ] as const) {
    test(`${nombre}: CLS < 0,1`, async ({ browser }) => {
      const ctx = await browser.newContext(opciones)
      const page = await ctx.newPage()
      const r = await cls(page, '/entrar')
      await ctx.close()
      expect(r.total, `saltos: ${r.saltos}`).toBeLessThan(0.1)
    })
  }
})
