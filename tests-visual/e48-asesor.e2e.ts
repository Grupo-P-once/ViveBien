import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'

/**
 * «Publicado por» en las tarjetas del catálogo, en 390/768/1024/1440.
 *
 * QUÉ ES DE MENTIRA: la respuesta de `/api/catalogo` se intercepta en el navegador y se le inyecta el campo `asesor` (el servidor real
 * y su regla están probados en `tests/asesor-tarjeta.test.ts`); Cloudinary responde con un PNG de 1 px; los terceros se cortan. Lo que se
 * prueba aquí es lo que VE la persona: el círculo de un asociado (foto o iniciales), el de VIVE BIEN, y que sin dato del servidor no se
 * pinta nada. No prueba producción ni la base real.
 */

const NUBE = 'nube-prueba'
const FOTO = `https://res.cloudinary.com/${NUBE}/image/upload/v1/usuarios/ana/perfil.jpg`
const UN_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const DIR_E = process.env.EVIDENCIA_DIR ?? join(process.cwd(), '..', 'lanzamiento', 'etapa3', 'evidencia')
mkdirSync(DIR_E, { recursive: true })

async function preparar(page: Page, asesores: Array<Record<string, unknown> | null | undefined>, o: { fotosRotas?: boolean } = {}) {
  await page.route((u) => /(^|\.)cloudinary\.com$/.test(u.hostname), (r) => (o.fotosRotas ? r.abort() : r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL })))
  await page.route((u) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|api\.open-meteo\.com|apis\.google\.com|googletagmanager\.com|google-analytics\.com)$/.test(u.hostname), (r) => {
    const u = new URL(r.request().url())
    if (u.pathname.endsWith('.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: '' })
    return r.abort()
  })
  await page.route((u) => u.hostname === 'images.unsplash.com', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL }))
  await page.route('**/api/catalogo', async (r) => {
    const res = await r.fetch()
    const j = await res.json()
    j.propiedades = (j.propiedades as Array<Record<string, unknown>>).map((p, i) => {
      const { asesor: _quitar, ...resto } = p
      void _quitar
      return i < asesores.length && asesores[i] !== undefined ? { ...resto, asesor: asesores[i] } : resto
    })
    return r.fulfill({ response: res, json: j })
  })
  await page.goto('/propiedades')
  await expect(page.locator('[data-asesor]').first()).toBeVisible({ timeout: 45_000 })
}

const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

test.describe('círculo «Publicado por» en las tarjetas', () => {
  test('asociado con foto, asociado sin foto (iniciales), VIVE BIEN, y sin dato = nada', async ({ page }) => {
    await preparar(page, [
      { nombre: 'Ana López Ruiz', foto: FOTO },
      { nombre: 'Beto Núñez', foto: null },
      null,
      // 4.ª tarjeta en adelante: sin la clave `asesor` (el servidor no pudo calcularlo)
    ])

    const asociados = page.locator('[data-asesor="persona"]')
    const casa = page.locator('[data-asesor="vivebien"]')
    await expect(asociados).toHaveCount(2)
    await expect(casa).toHaveCount(1)
    // No hay un círculo por cada tarjeta: las que no traen dato no pintan nada (antes que atribuir mal).
    expect(await page.locator('[data-asesor]').count()).toBe(3)

    // Contenido
    // La página reordena las tarjetas: cada persona se identifica por su nombre, no por la posición.
    const ana = asociados.filter({ hasText: 'Ana López Ruiz' })
    const beto = asociados.filter({ hasText: 'Beto Núñez' })
    await expect(ana).toContainText('Publicado por Ana López Ruiz')
    await expect(ana.locator('img')).toHaveAttribute('src', /res\.cloudinary\.com\/nube-prueba\/image\/upload\/c_fill,g_face,w_64,h_64,f_auto,q_auto\//)
    await expect(beto).toContainText('Publicado por Beto Núñez')
    await expect(beto.locator('img')).toHaveCount(0)
    await expect(beto.locator('span[aria-hidden="true"]')).toHaveText('BN')
    await expect(casa).toContainText('Publicado por VIVE BIEN')
    await expect(casa.locator('img')).toHaveAttribute('src', '/icon.png')

    // Es informativo: ni enlace ni contacto dentro del círculo.
    for (const b of await page.locator('[data-asesor]').all()) {
      expect(await b.locator('a, button').count()).toBe(0)
      expect(await b.innerText()).not.toMatch(/@|\d{7,}|tel|whatsapp/i)
    }
    // Muy sutil: 22 px de círculo y texto pequeño.
    const caja = await ana.locator('span[aria-hidden="true"]').boundingBox()
    expect(Math.round(caja!.width)).toBe(22)
    expect(Math.round(caja!.height)).toBe(22)

    await sinDesborde(page)
    await ana.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(DIR_E, `${test.info().project.name}__asesor-tarjetas.png`), fullPage: false })
  })

  test('un nombre muy largo se recorta con puntos suspensivos y no rompe la tarjeta', async ({ page }) => {
    await preparar(page, [{ nombre: 'María Guadalupe Hernández de la Cruz y Villaseñor Márquez', foto: null }])
    const b = page.locator('[data-asesor="persona"]').first()
    await expect(b).toBeVisible()
    const card = await b.evaluate((el) => {
      const r = el.getBoundingClientRect()
      let p: HTMLElement | null = el.parentElement
      while (p && p.getBoundingClientRect().width < r.width + 8) p = p.parentElement
      return { b: r.right, p: p ? p.getBoundingClientRect().right : null }
    })
    expect(card.p === null || card.b <= card.p + 1).toBe(true)
    await sinDesborde(page)
  })

  test('si la foto no carga se cae a las iniciales (sin imagen rota)', async ({ page }) => {
    await preparar(page, [{ nombre: 'Ana López Ruiz', foto: FOTO }], { fotosRotas: true })
    const b = page.locator('[data-asesor="persona"]').first()
    await expect(b).toBeVisible({ timeout: 45_000 })
    // La foto es `loading="lazy"`: solo intenta cargar (y por tanto solo puede fallar) cuando la tarjeta entra en pantalla.
    await b.scrollIntoViewIfNeeded()
    await expect(b.locator('span[aria-hidden="true"]')).toHaveText('AR', { timeout: 15_000 })
    await expect(b.locator('img')).toHaveCount(0)
  })

  test('axe sobre el círculo: sin infracciones (contraste y nombre accesible)', async ({ page }) => {
    await preparar(page, [{ nombre: 'Ana López Ruiz', foto: FOTO }, null])
    const r = await new AxeBuilder({ page }).include('[data-asesor]').analyze()
    expect(r.violations.map((v) => `${v.id}:${v.nodes.length}`)).toEqual([])
  })
})
