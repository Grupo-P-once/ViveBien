import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * El aviso de analítica (alineación legal, 2-nov-2026): sin elección guardada aparece con DOS botones del mismo peso, GA no carga ni se descarga
 * nada de Google, y la elección se recuerda. Abre un contexto LIMPIO a propósito: el arnés (playwright.sesion.config.ts) parte de quien ya eligió.
 */
test('sin elección guardada: aparece el aviso, GA no carga; al rechazar desaparece, se recuerda y sigue sin cargar', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, locale: 'es-MX', storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const pedidos: string[] = []
  page.on('request', (r) => { if (/googletagmanager\.com|google-analytics\.com/.test(r.url())) pedidos.push(r.url()) })

  await page.goto('/contacto')
  const aviso = page.getByRole('region', { name: 'Preferencias de analítica' })
  await expect(aviso).toBeVisible()
  // Dos botones del mismo tamaño: elegir «no» no cuesta más que elegir «sí».
  const a = await aviso.getByRole('button', { name: 'Aceptar' }).boundingBox()
  const r = await aviso.getByRole('button', { name: 'Rechazar' }).boundingBox()
  expect(Math.abs((a?.height ?? 0) - (r?.height ?? 1))).toBeLessThanOrEqual(2)
  const graves = (await new AxeBuilder({ page }).include('[data-aviso-analitica]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(graves.map((v) => v.id)).toEqual([])
  expect(pedidos).toEqual([])

  await aviso.getByRole('button', { name: 'Rechazar' }).click()
  await expect(aviso).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('vb_analitica'))).toBe('no')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Preferencias de analítica' })).toHaveCount(0)
  expect(pedidos).toEqual([])
  await ctx.close()
})

test('al aceptar: se guarda la elección y GA se carga solo entonces', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, locale: 'es-MX', storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.route('**/googletagmanager.com/**', (r) => r.abort())
  await page.route('**/google-analytics.com/**', (r) => r.abort())
  await page.goto('/contacto')
  expect(await page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag)).toBe('undefined')
  await page.getByRole('region', { name: 'Preferencias de analítica' }).getByRole('button', { name: 'Aceptar' }).click()
  expect(await page.evaluate(() => localStorage.getItem('vb_analitica'))).toBe('si')
  expect(await page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag)).toBe('function')
  await ctx.close()
})
