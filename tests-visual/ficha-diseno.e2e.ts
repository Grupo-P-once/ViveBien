import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { acotarTerceros } from './ayudas-red'

/**
 * Ficha individual de la propiedad (27-oct-2026): sistema visual unificado, panel de contacto PEGAJOSO de verdad (el `overflow-x:hidden` del body lo anulaba) y barra fija de
 * contacto en MÓVIL y tableta. Navegador REAL contra el build local, en los cuatro anchos (390 · 768 · 1024 · 1440). Capturas de la página COMPLETA en `EVIDENCIA_DIR/ficha/`.
 */
const CAPTURAS = join(process.env.EVIDENCIA_DIR || join(process.cwd(), 'evidencia-propiedades'), 'ficha')
mkdirSync(CAPTURAS, { recursive: true })
type Fila = Record<string, unknown> & { id: string; tipo: string; slug?: string }

async function abrirFicha(page: Page) {
  await acotarTerceros(page); await page.route('**/api.open-meteo.com/**', (r) => r.abort())
  const cat = await page.request.get('/api/catalogo'); const j = await cat.json() as { propiedades: Fila[] }
  await page.route('**/rest/v1/propiedades*', (r) => (r.request().url().includes('id=neq.') ? r.fulfill({ json: j.propiedades }) : r.fallback()))
  const p = j.propiedades.find((x) => x.slug) ?? j.propiedades[0]
  await page.goto(`/propiedades/${encodeURIComponent(String(p.slug ?? p.id))}`)
  await expect(page.locator('[data-ficha-datos]')).toBeVisible({ timeout: 30_000 })
}
const ancho = (page: Page) => page.viewportSize()!.width
const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

test.describe('ficha individual · diseño', () => {
  test('se ve completa, sin desborde, y usa el sistema de tarjetas', async ({ page }) => {
    test.setTimeout(120_000)
    await abrirFicha(page)
    expect(await sinDesborde(page)).toBe(true)
    expect(await page.locator('.fx-card, [data-ficha-datos]').count()).toBeGreaterThanOrEqual(1)
    // Ninguna tarjeta de la ficha se sale del ancho de la pantalla.
    const fuera = await page.evaluate(() => [...document.querySelectorAll('.fx-card, [data-ficha-datos]')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length)
    expect(fuera).toBe(0)
    await page.locator('[data-relacionadas]').scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, 0))      // la captura de página completa se toma desde arriba (el panel pegajoso se ve donde empieza)
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-ficha-completa.png`), fullPage: true })
    const graves = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ') + ' <' + n.html.slice(0, 140) + '>').join(' | ')}`)
    expect(graves).toEqual([])
  })

  test('el panel de contacto se queda pegado al bajar (escritorio y tableta ancha)', async ({ page }) => {
    test.skip(ancho(page) <= 900, 'En móvil y tableta el contacto va en la barra fija.')
    await abrirFicha(page)
    const maximo = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    const bajar = Math.min(900, Math.max(0, maximo - 400))
    test.skip(bajar < 200, 'Ficha demasiado corta para comprobar el scroll.')
    // El recorrido donde el panel PUEDE pegarse = alto de la fila − alto del panel. Antes la prueba bajaba un valor fijo (1300 px) que cabía por 28 px de margen: al añadir la tarjeta de la
    // campana (97 px) el recorrido se acortó 112 px y esa posición cayó FUERA del recorrido (el panel ya había terminado de pegarse y subía con la página). Ahora se baja a la MITAD del recorrido
    // real, y se exige que el recorrido siga siendo útil (≥ 500 px): si alguien agranda el panel hasta casi no dejar recorrido, esta prueba falla.
    const g = await page.locator('#contacto-ficha').evaluate((e) => ({ top: e.getBoundingClientRect().top + scrollY, alto: e.getBoundingClientRect().height, fila: (e.parentElement as HTMLElement).getBoundingClientRect().height }))
    const recorrido = g.fila - g.alto
    expect(recorrido, 'recorrido donde el panel permanece pegado').toBeGreaterThanOrEqual(500)
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(g.top - 100 + Math.min(recorrido / 2, 400)))
    await page.waitForTimeout(300)
    const caja = await page.locator('#contacto-ficha').boundingBox()
    expect(caja!.y).toBeGreaterThanOrEqual(90)
    expect(caja!.y).toBeLessThanOrEqual(115)       // `top: 100px`: pegado, no arrastrado con el scroll
    expect(await page.locator('[data-barra-movil]').isVisible()).toBe(false)
  })

  test('en móvil y tableta hay una barra fija de contacto y el botón flotante de WhatsApp se oculta', async ({ page }) => {
    test.skip(ancho(page) > 900, 'La barra solo existe hasta 900 px.')
    await abrirFicha(page)
    const barra = page.locator('[data-barra-movil]')
    await expect(barra).toBeVisible()
    const caja = await barra.boundingBox(); const alto = page.viewportSize()!.height
    expect(Math.round(caja!.y + caja!.height)).toBe(alto)               // pegada al borde inferior
    expect(caja!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1)
    for (const b of await barra.locator('button, a').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)   // área táctil cómoda
    await expect(page.locator('[data-wa-flotante]')).toBeHidden()        // no se apilan dos botones de WhatsApp
    // «Solicitar información» lleva al formulario.
    await barra.getByRole('link', { name: /Solicitar información/ }).click()
    await expect(page).toHaveURL(/#contacto-ficha$/)
    await expect(page.locator('#contacto-ficha')).toBeInViewport()
    // Al final de la página la barra no tapa el pie: el body reserva su alto.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    // Lo último que se LEE del pie (su texto) queda por encima de la barra; el fondo del pie sigue por debajo, sin franja blanca.
    const arriba = (await barra.boundingBox())!.y
    const finDelTexto = await page.evaluate(() => {
      const pie = [...document.querySelectorAll('footer')].pop()!
      let max = 0
      const it = document.createTreeWalker(pie, NodeFilter.SHOW_TEXT)
      for (let n = it.nextNode(); n; n = it.nextNode()) {
        if (!n.textContent?.trim()) continue
        const r = document.createRange(); r.selectNodeContents(n)
        for (const c of r.getClientRects()) max = Math.max(max, c.bottom)
      }
      return max
    })
    expect(finDelTexto).toBeLessThanOrEqual(arriba + 1)
    const hastaElFinal = await page.evaluate(() => Math.round(document.documentElement.scrollHeight - (scrollY + innerHeight)))
    expect(hastaElFinal).toBeLessThanOrEqual(1)
    expect(await sinDesborde(page)).toBe(true)
  })

  test('en pantallas anchas no hay barra y el botón flotante de WhatsApp sigue', async ({ page }) => {
    test.skip(ancho(page) <= 900, 'Solo escritorio.')
    await abrirFicha(page)
    await expect(page.locator('[data-barra-movil]')).toBeHidden()
    await expect(page.locator('[data-wa-flotante]').first()).toBeVisible()
  })
})
