import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { prepararPaginaPublica } from './ayudas'

/**
 * D-80 — las páginas públicas del correo, en el navegador y en los 4 anchos. La API se simula: NO se manda ningún correo ni se
 * toca la base. El servidor de pruebas arranca con `CORREO_MARKETING=1` y un secreto FALSO (ver `scripts/qa/gate.cjs`), sin
 * clave de Resend: aunque algo llamara a la API real, no podría enviar nada.
 *
 *   · /recomendaciones: sin casilla ni trámite: el botón es el acto afirmativo y el aviso va junto a él; admite valores iniciales por la URL;
 *   · /correo/confirmar y /correo/baja: el token viaja en el fragmento (#), el botón hace un POST, y se ven éxito y error;
 *   · accesibilidad: sin violaciones graves ni críticas.
 */

async function simular(page: Page) {
  await prepararPaginaPublica(page)
  const llamadas: Array<{ ruta: string; cuerpo: Record<string, unknown> }> = []
  let respuesta = { status: 200, cuerpo: { ok: true } as Record<string, unknown> }
  await page.route('**/api/correo/**', async (r) => {
    const q = r.request()
    if (q.method() === 'GET') return r.continue()
    llamadas.push({ ruta: new URL(q.url()).pathname, cuerpo: JSON.parse(q.postData() || '{}') })
    return r.fulfill({ status: respuesta.status, contentType: 'application/json', body: JSON.stringify(respuesta.cuerpo) })
  })
  return { llamadas, responder: (status: number, cuerpo: Record<string, unknown>) => { respuesta = { status, cuerpo } } }
}

test('recomendaciones: sin casilla ni trámite; el aviso de qué recibirá está junto al botón', async ({ page }) => {
  await simular(page)
  await page.goto('/recomendaciones', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel(/Correo electrónico/)).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('checkbox', { name: /Acepto/ })).toHaveCount(0)
  await expect(page.locator('main')).toContainText('como máximo una cada tres días')
  await expect(page.locator('main').getByRole('link', { name: 'Aviso de privacidad' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviarme propiedades' })).toBeVisible()
})

test('recomendaciones: el enlace «Aviso de privacidad» se subraya (no depende sólo del color) y se alcanza con el teclado', async ({ page }) => {
  await simular(page)
  await page.goto('/recomendaciones', { waitUntil: 'domcontentloaded' })
  const enlace = page.locator('main').getByRole('link', { name: 'Aviso de privacidad' })
  await expect(enlace).toBeVisible({ timeout: 45_000 })
  expect(await enlace.evaluate((e) => getComputedStyle(e).textDecorationLine)).toBe('underline')
  await enlace.focus()
  await expect(enlace).toBeFocused()
})

test('recomendaciones: el botón manda las preferencias y el acto afirmativo, y dice que las propiedades van en camino', async ({ page }) => {
  const { llamadas } = await simular(page)
  await page.goto('/recomendaciones', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel(/Correo electrónico/)).toBeVisible({ timeout: 45_000 })
  await page.getByLabel(/Correo electrónico/).fill('  Persona@Ejemplo.test ')
  await page.getByLabel(/Nombre/).fill('Ana')
  await page.getByLabel('¿Compra o renta?').selectOption('venta')
  await page.getByRole('checkbox', { name: 'Naves industriales' }).check()
  await page.getByLabel(/Zona o colonia/).fill('León')
  await page.getByLabel(/Presupuesto máximo/).fill('3000000')
  await page.getByRole('button', { name: 'Enviarme propiedades' }).click()
  await expect(page.locator('main').getByRole('status')).toContainText('ya van en camino')
  expect(llamadas).toHaveLength(1)
  expect(llamadas[0].ruta).toBe('/api/correo/suscribir')
  expect(llamadas[0].cuerpo).toMatchObject({ acepto: true, operacion: 'venta', tipos: ['nave'], zona: 'León', presupuesto: '3000000', fuente: 'recomendaciones' })
  expect(String(llamadas[0].cuerpo.correo).trim().toLowerCase()).toBe('persona@ejemplo.test')
})

test('recomendaciones: un enlace con parámetros llega con el formulario ya llenado', async ({ page }) => {
  await simular(page)
  await page.goto('/recomendaciones?operacion=renta&tipo=casa,nave&zona=Centro&presupuesto=25000', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('¿Compra o renta?')).toHaveValue('renta', { timeout: 45_000 })
  await expect(page.getByRole('checkbox', { name: 'Casas' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Naves industriales' })).toBeChecked()
  await expect(page.getByLabel(/Zona o colonia/)).toHaveValue('Centro')
  await expect(page.getByLabel(/Presupuesto máximo/)).toHaveValue('25000')
})

test('recomendaciones: un error del servidor se dice con claridad y no pierde lo escrito', async ({ page }) => {
  const { responder } = await simular(page)
  responder(400, { error: 'Revisa tu correo electrónico.' })
  await page.goto('/recomendaciones', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel(/Correo electrónico/)).toBeVisible({ timeout: 45_000 })
  await page.getByLabel(/Correo electrónico/).fill('malo')
  await page.getByRole('button', { name: 'Enviarme propiedades' }).click()
  await expect(page.locator('main').getByRole('alert')).toContainText('Revisa tu correo electrónico.')
  await expect(page.getByLabel(/Correo electrónico/)).toHaveValue('malo')
})

for (const [ruta, boton, ok] of [
  ['/correo/confirmar', 'Sí, quiero seguir recibiéndolas', /seguirás recibiendo propiedades/],
  ['/correo/baja', 'Darme de baja', /quedaste dado de baja/],
] as const) {
  test(`${ruta}: el token va en el # y la acción es un POST con un botón`, async ({ page }) => {
    const { llamadas } = await simular(page)
    await page.goto(`${ruta}#t=ID.0.FIRMA`, { waitUntil: 'domcontentloaded' })
    const b = page.getByRole('button', { name: boton })
    await expect(b).toBeVisible({ timeout: 45_000 })
    expect(llamadas).toEqual([]) // abrir el enlace NO hace nada (un escáner de correo no confirma ni da de baja)
    await b.click()
    await expect(page.locator('main').getByRole('status')).toContainText(ok)
    expect(llamadas).toEqual([{ ruta: ruta.replace('/correo/', '/api/correo/'), cuerpo: { token: 'ID.0.FIRMA' } }])
  })

  test(`${ruta}: enlace incompleto o rechazado se explica y no se pierde`, async ({ page }) => {
    const { responder } = await simular(page)
    await page.goto(ruta, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main').getByRole('alert')).toContainText('incompleto', { timeout: 45_000 })
    responder(400, { error: 'El enlace no es válido.' })
    await page.goto(`${ruta}#t=mal`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: boton }).click()
    await expect(page.locator('main').getByRole('alert')).toContainText('El enlace no es válido.')
  })

  test(`${ruta}: si el # cambia con la página abierta se vuelve a leer, sin confirmar nada solo y sin arrastrar el estado anterior`, async ({ page }) => {
    const { llamadas } = await simular(page)
    await page.goto(ruta, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main').getByRole('alert')).toContainText('incompleto', { timeout: 45_000 })
    await page.evaluate(() => { window.location.hash = '#t=ID.0.FIRMA' }) // dispara `hashchange`: mismo documento, sin recarga
    const b = page.getByRole('button', { name: boton })
    await expect(b).toBeVisible()
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0)
    expect(llamadas).toEqual([]) // cambiar el fragmento NO ejecuta la acción: sólo la ejecuta el botón
    await b.click()
    await expect(page.locator('main').getByRole('status')).toContainText(ok)
    expect(llamadas).toEqual([{ ruta: ruta.replace('/correo/', '/api/correo/'), cuerpo: { token: 'ID.0.FIRMA' } }])
    // volver a un enlace vacío: otra vez «incompleto», sin botón ni el éxito anterior
    await page.evaluate(() => { window.location.hash = '' })
    await expect(page.locator('main').getByRole('alert')).toContainText('incompleto')
    await expect(page.getByRole('button', { name: boton })).toHaveCount(0)
  })
}

test('accesibilidad: sin violaciones graves ni críticas en las tres páginas', async ({ page }) => {
  await simular(page)
  for (const ruta of ['/recomendaciones', '/correo/confirmar#t=a.0.b', '/correo/baja#t=a.0.b']) {
    await page.goto(ruta, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible({ timeout: 45_000 })
    await page.waitForLoadState('networkidle').catch(() => undefined)
    const r = await new AxeBuilder({ page }).include('main').analyze() // el contenido propio de la página; el pie y la cabecera tienen su propia línea base
    const graves = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.length}`)
    expect(graves, ruta).toEqual([])
  }
})

test('las páginas de enlace no se indexan', async ({ page }) => {
  await simular(page)
  for (const ruta of ['/correo/confirmar', '/correo/baja']) {
    await page.goto(ruta, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  }
})
