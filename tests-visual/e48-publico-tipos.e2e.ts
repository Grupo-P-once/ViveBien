import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * SITIO PÚBLICO — subtipos y características ampliadas (verificación del candidato, 16-oct-2026). Sólo existe en copias aisladas.
 * Datos SINTÉTICOS (fixtura v2, 9 anuncios) por el camino real `/api/catalogo` → `SELECT_PUBLICO` → réplica de Supabase solo-fixtura.
 * Requiere un build hecho CON la fixtura v2. Qué no prueba: datos reales, CDN, otros navegadores.
 */
const DIR = process.env.EVIDENCIA_DIR ?? join(process.cwd(), '..', 'lanzamiento', 'etapa3', 'evidencia')
mkdirSync(DIR, { recursive: true })
const ruta = (n: string) => join(DIR, `${test.info().project.name}__${n}.png`)
const UN_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const SLUG = (n: number, tipo: string, op: string) => `sintetica-e48-${n}-${tipo}-${op}`

test.beforeEach(async ({ page }) => {
  await page.route((u) => /(^|\.)cloudinary\.com$/.test(u.hostname), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL }))
  await page.route((u) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|images\.unsplash\.com|api\.open-meteo\.com|apis\.google\.com|tile\.openstreetmap\.org|googletagmanager\.com|google-analytics\.com)$/.test(u.hostname), (r) => {
    const u = new URL(r.request().url())
    if (u.hostname === 'images.unsplash.com') return r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL })
    if (u.pathname.endsWith('.css') || u.hostname === 'fonts.googleapis.com') return r.fulfill({ status: 200, contentType: 'text/css', body: '' })
    return r.abort()
  })
  await page.route((u) => /(^|\.)(supabase\.co|supabase\.in|firebaseio\.com|vercel-insights\.com|vercel-scripts\.com)$/.test(u.hostname), (r) => r.abort())
})
const titulos = async (page: Page, query: string) => {
  await page.goto(`/propiedades?${query}`)
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  const t = await page.locator('main h3').allTextContents()
  return t.filter((x) => /Consultorio en venta|Oficina corporativa|Terreno industrial|Nave industrial en renta|Casa en venta en privada|Terreno residencial/.test(x)).map((x) => x.replace(/\s+–\s+[\d,]+\s*m².*$/, '').replace(/,\s*[\d,]+\s*m²/g, '').trim()).sort()
}
const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

test.describe('catálogo: filtro por subtipo', () => {
  test('por URL: el subtipo exacto, sólo con un tipo elegido', async ({ page }) => {
    expect(await titulos(page, 'tipo=oficina&sub=consultorio')).toEqual(['Consultorio en venta en torre médica'])
    expect(await titulos(page, 'tipo=terreno&sub=industrial')).toEqual(['Terreno industrial en venta en parque'])
    expect(await titulos(page, 'tipo=nave&sub=en_parque')).toEqual(['Nave industrial en renta en parque'])
    expect(await titulos(page, 'tipo=oficina&sub=compartida')).toEqual([])
    expect(await titulos(page, 'sub=industrial&tipo=casa')).toEqual([])
  })
  test('por la interfaz: aparece al elegir un tipo con subtipos, viaja en la URL y se quita al cambiar de tipo', async ({ page }) => {
    await page.goto('/propiedades?tipo=oficina')
    await page.getByRole('button', { name: /Más filtros/ }).click()
    const sub = page.getByRole('combobox', { name: /^Subtipo/ })
    await expect(sub).toBeVisible({ timeout: 30_000 })
    expect(await sub.locator('option').allTextContents()).toEqual(['Cualquiera', 'Consultorio', 'Oficina corporativa', 'Oficina compartida o coworking', 'Oficina comercial'])
    await sub.selectOption('consultorio')
    await expect(page).toHaveURL(/sub=consultorio/)
    await page.locator('select').filter({ has: page.locator('option[value="terreno"]') }).first().selectOption('terreno')
    await expect(page).not.toHaveURL(/sub=/)
    await expect(sub.locator('option[value="industrial"]')).toHaveCount(1)
    await sub.selectOption('industrial')
    expect(await titulos(page, 'tipo=terreno&sub=industrial')).toEqual(['Terreno industrial en venta en parque'])
  })
  test('axe: el filtro de subtipo no añade infracciones', async ({ page }) => {
    await page.goto('/propiedades?tipo=oficina&sub=consultorio')
    await expect(page.getByRole('group', { name: 'Más filtros' })).toBeVisible({ timeout: 30_000 })
    const r = await new AxeBuilder({ page }).include('#mas-filtros').analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
})

test.describe('tarjeta y ficha de los tipos nuevos', () => {
  test('la tarjeta lleva el subtipo y los datos clave', async ({ page }) => {
    await page.goto('/propiedades?tipo=nave&sub=en_parque')
    const tarjeta = page.locator('article.tc').first()
    await expect(tarjeta.locator('.tc-extra')).toContainText('Nave en parque industrial', { timeout: 30_000 })
    await expect(tarjeta.locator('[data-datos-tarjeta]')).toContainText('18 estac.')
    expect(await tarjeta.locator('[data-datos-tarjeta] li').count()).toBeLessThanOrEqual(4)
  })
  test('nave en parque: kVA, patio de maniobras, oficinas, rampas, plazo', async ({ page }) => {
    await page.goto(`/propiedades/${SLUG(8, 'nave', 'renta')}`)
    const s = page.locator('[data-caracteristicas-ficha]')
    await expect(s).toBeVisible({ timeout: 30_000 })
    for (const t of ['Tipo específico', 'Nave en parque industrial', '3,000 kVA', 'Patio de maniobras (m²)', '12,540 m²', 'Oficinas administrativas (m²)', '331 m²', 'Rampas de acceso', '6 t/m²', 'Está dentro de un parque industrial', 'Contra incendio'.replace('Contra', 'Sistema contra'), '60 meses']) await expect(s).toContainText(t)
    await expect(s).not.toContainText('Mascotas')
    const r = await new AxeBuilder({ page }).include('[data-caracteristicas-ficha]').analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await sinDesborde(page)
    await s.screenshot({ path: ruta('ficha-nave-en-parque') })
  })
  test('terreno industrial y casa con muchas características', async ({ page }) => {
    await page.goto(`/propiedades/${SLUG(7, 'terreno', 'venta')}`)
    const t = page.locator('[data-caracteristicas-ficha]')
    await expect(t).toBeVisible({ timeout: 30_000 })
    for (const x of ['Terreno industrial', 'Frente (m)', '50 m', 'Está en esquina', 'Está bardeado o cercado', '1,500 kVA', 'Carretera']) await expect(t).toContainText(x)
    await expect(t).not.toContainText('Condiciones de renta')
    await t.screenshot({ path: ruta('ficha-terreno-industrial') })
    await page.goto(`/propiedades/${SLUG(9, 'casa', 'venta')}`)
    const c = page.locator('[data-caracteristicas-ficha]')
    await expect(c).toBeVisible({ timeout: 30_000 })
    for (const x of ['Estacionamientos techados', 'Tipo de desarrollo', 'En privada o fraccionamiento cerrado', 'Asador o área de BBQ', 'Vestidor', 'Cuarto de servicio con baño']) await expect(c).toContainText(x)
    await expect(c).not.toContainText('Terreno (m²)') // va primero, en el bloque principal de la ficha
    // R8.4: «Gimnasio» (amenidad común del conjunto) sale bajo «Amenidades», no bajo «Características».
    await expect(c).not.toContainText('Gimnasio')
    await expect(page.locator('[data-amenidades-ficha]')).toContainText('Gimnasio')
    const r = await new AxeBuilder({ page }).include('[data-caracteristicas-ficha]').analyze()
    expect(r.violations.map((v) => v.id)).toEqual([])
    await c.screenshot({ path: ruta('ficha-casa-muchas-caracteristicas') })
  })
  test('comparar nave vs casa: filas con sentido', async ({ page }) => {
    await page.goto('/comparar?ids=a0000000-0000-4000-8000-0000000e4808,a0000000-0000-4000-8000-0000000e4809')
    const tabla = page.locator('table')
    await expect(tabla).toBeVisible({ timeout: 30_000 })
    for (const f of ['Capacidad eléctrica', 'Patio de maniobras', 'Estacionamientos techados', 'Altura libre']) await expect(tabla.getByRole('rowheader', { name: new RegExp(f) }).first()).toBeVisible()
    await expect(tabla).toContainText('3,000 kVA')
    await expect(tabla).not.toContainText('Puestos de trabajo')
  })
})
