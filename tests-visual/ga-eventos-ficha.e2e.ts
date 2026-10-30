import { expect, test } from '@playwright/test'

/** Contacto desde la FICHA (sin sesión): los botones no son enlaces; cada uno registra su canal antes de pedir el registro. Usa la ficha de la fixtura sintética (sin FIXTURA_DEFECTO). */
test.beforeEach(async ({ page }) => {
  await page.route('**/googletagmanager.com/**', (r) => r.abort())
  await page.route('**/google-analytics.com/**', (r) => r.abort())
})
const llamadas = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { dataLayer: unknown[] }).dataLayer.map((a) => Array.from(a as ArrayLike<unknown>)))

test('un visitante SIN sesión que pulsa WhatsApp o llamar en la ficha deja su clic registrado en ESA propiedad', async ({ page }) => {
  const enviados: Array<{ nombre: string; propiedadId: string | null; datos?: { canal?: string; lugar?: string } }> = []
  await page.route('**/api/eventos', async (r) => {
    if (r.request().method() === 'POST') enviados.push(JSON.parse(r.request().postData() || '{}'))
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/propiedades/sintetica-e48-2-casa-renta')
  const wa = page.getByRole('button', { name: /HABLAR POR WHATSAPP/ })
  await expect(wa).toBeVisible({ timeout: 45_000 })
  await wa.click()
  await expect.poll(() => enviados.find((x) => x.datos?.lugar === 'ficha' && x.datos?.canal === 'whatsapp')?.propiedadId).toBeTruthy()
  const id = enviados.find((x) => x.datos?.canal === 'whatsapp')!.propiedadId

  await page.getByRole('button', { name: /LLAMAR AHORA/ }).dispatchEvent('click')
  await expect.poll(() => enviados.find((x) => x.datos?.lugar === 'ficha' && x.datos?.canal === 'telefono')?.propiedadId).toBe(id)
  expect((await llamadas(page)).some((a) => a[0] === 'event' && a[1] === 'click_phone' && (a[2] as { item_id?: string }).item_id === id)).toBe(true)
})
