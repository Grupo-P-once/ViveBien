import { expect, test } from '@playwright/test'

/**
 * Google Analytics (24-oct-2026), navegador REAL contra el build local, sin salir a internet (se bloquea el script de Google; se lee `window.dataLayer`,
 * donde `gtag()` deja cada llamada). Se comprueba: las dos propiedades quedan configuradas, un clic en teléfono/WhatsApp/correo manda su evento con
 * la ubicación, y NUNCA viaja el número ni el correo.
 */
test.beforeEach(async ({ page }) => {
  // Desde la alineación legal (2-nov-2026, commit 2a6984c) GA4 solo carga cuando la persona lo aceptó (`vb_analitica` = 'si'). Estas pruebas miden los
  // eventos de quien SÍ aceptó; la conducta contraria (sin aceptar, nada carga) la comprueba la prueba «sin aceptar» de ga-eventos.e2e.ts.
  await page.addInitScript(() => { try { localStorage.setItem('vb_analitica', 'si') } catch { /* sin almacenamiento */ } })
  await page.route('**/googletagmanager.com/**', (r) => r.abort())
  await page.route('**/google-analytics.com/**', (r) => r.abort())
})

const llamadas = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { dataLayer: unknown[] }).dataLayer.map((a) => Array.from(a as ArrayLike<unknown>)))

test('las dos propiedades de GA4 quedan configuradas en la primera carga', async ({ page }) => {
  await page.goto('/contacto')
  const l = await llamadas(page)
  const configs = l.filter((a) => a[0] === 'config').map((a) => a[1])
  expect(configs).toEqual(['G-7TQQEQ97S2', 'G-BKCPFJVTG5'])
})

test('un clic en teléfono, WhatsApp o correo manda su evento con la ubicación y sin datos personales', async ({ page }) => {
  await page.goto('/contacto')
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true))   // no navegar: solo medir
  for (const [selector, evento] of [['a[href^="tel:"]', 'click_phone'], ['a[href^="mailto:"]', 'click_email'], ['a[href^="https://wa.me"]', 'click_whatsapp']] as const) {
    const enlace = page.locator(selector).first()
    await enlace.scrollIntoViewIfNeeded()
    await enlace.click({ trial: false, force: true })
    await expect.poll(async () => (await llamadas(page)).some((a) => a[0] === 'event' && a[1] === evento), { message: evento }).toBe(true)
  }
  const eventos = (await llamadas(page)).filter((a) => a[0] === 'event')
  for (const e of eventos) expect(e[2]).toMatchObject({ page_path: '/contacto', link_location: expect.stringMatching(/^(pagina|pie|menu|boton_flotante)$/) })
  // Lo que viajó no contiene ni el número ni el correo del negocio.
  const todo = JSON.stringify(eventos)
  expect(todo).not.toMatch(/\d{3}\s?\d{3}\s?\d{4}|@/)
})

test('el botón flotante de WhatsApp se mide como «boton_flotante»', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true))
  const flotante = page.locator('a[data-wa-flotante]')
  await expect(flotante).toBeAttached({ timeout: 8000 })
  // Se dispara el clic sobre el propio enlace: el botón aparece con una animación y Playwright no lo da por «visible» a tiempo; lo que se prueba es la medición.
  await flotante.dispatchEvent('click')
  await expect.poll(async () => (await llamadas(page)).find((a) => a[0] === 'event' && a[1] === 'click_whatsapp')?.[2]).toMatchObject({ link_location: 'boton_flotante', page_path: '/' })
})

test('un clic en un enlace cualquiera no manda nada', async ({ page }) => {
  await page.goto('/contacto')
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true))
  await page.locator('a[href="/propiedades"]').first().dispatchEvent('click')
  expect((await llamadas(page)).filter((a) => a[0] === 'event')).toEqual([])
})

test('catálogo: un clic en la tarjeta se registra con el id de ESA propiedad, en la base propia y en Analytics', async ({ page }) => {
  const enviados: Array<{ nombre: string; propiedadId: string | null }> = []
  await page.route('**/api/eventos', async (r) => {
    if (r.request().method() === 'POST') enviados.push(JSON.parse(r.request().postData() || '{}'))
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/propiedades')
  const tarjeta = page.locator('article.tc').first()
  await expect(tarjeta).toBeVisible({ timeout: 30_000 })
  const id = await tarjeta.getAttribute('data-prop-id')
  expect(id).toBeTruthy()
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true))
  await tarjeta.locator('a.tc-enlace').dispatchEvent('click')
  await expect.poll(() => enviados.find((x) => x.nombre === 'property_card_click')?.propiedadId).toBe(id)
  const ga = (await llamadas(page)).find((a) => a[0] === 'event' && a[1] === 'select_item')
  expect(ga?.[2]).toMatchObject({ item_id: id })
})

test('un visitante SIN sesión que pulsa WhatsApp o llamar, en la tarjeta, deja su clic registrado en ESA propiedad', async ({ page }) => {
  const enviados: Array<{ nombre: string; propiedadId: string | null; datos?: { canal?: string; lugar?: string } }> = []
  await page.route('**/api/eventos', async (r) => {
    if (r.request().method() === 'POST') enviados.push(JSON.parse(r.request().postData() || '{}'))
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/propiedades')
  const tarjeta = page.locator('article.tc').first()
  await expect(tarjeta).toBeVisible({ timeout: 30_000 })
  const id = await tarjeta.getAttribute('data-prop-id')
  expect(id).toBeTruthy()

  // Tarjeta: sin sesión se abre el registro, pero el clic ya quedó medido.
  await tarjeta.locator('.tc-ic-wa').click()
  await expect.poll(() => enviados.find((x) => x.nombre === 'property_contact_click' && x.datos?.lugar === 'tarjeta')?.propiedadId).toBe(id)
  expect(enviados.find((x) => x.datos?.lugar === 'tarjeta')?.datos).toEqual({ canal: 'whatsapp', lugar: 'tarjeta' })
  expect((await llamadas(page)).find((a) => a[0] === 'event' && a[1] === 'click_whatsapp')?.[2]).toMatchObject({ item_id: id, link_location: 'tarjeta' })

})

test('sin aceptar la analítica, GA4 NO carga: ni dataLayer, ni gtag, ni petición a Google', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, locale: 'es-MX', storageState: { cookies: [], origins: [] } })   // contexto limpio: sin la elección guardada por el beforeEach
  const page = await ctx.newPage()
  const pedidos: string[] = []
  page.on('request', (r) => { if (/googletagmanager.com|google-analytics.com/.test(r.url())) pedidos.push(r.url()) })
  await page.goto('/contacto')
  expect(await page.evaluate(() => ({ gtag: typeof (window as unknown as { gtag?: unknown }).gtag, dl: typeof (window as unknown as { dataLayer?: unknown }).dataLayer }))).toEqual({ gtag: 'undefined', dl: 'undefined' })
  expect(pedidos).toEqual([])
  await ctx.close()
})
