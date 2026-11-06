import { expect, test, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * SITIO PÚBLICO con oficinas y características (E-48 / lanzamiento, 16-oct-2026). Solo existe en la COPIA aislada.
 *
 * Navegador REAL contra el build local, y los datos pasan por el camino REAL: `/api/catalogo` (ruta de Next) → `SELECT_PUBLICO` →
 * réplica de Supabase en modo solo-fixtura con 6 anuncios SINTÉTICOS añadidos (`lanzamiento/etapa3/fixtura/publico-e48.json`) →
 * `esVisibleAlPublico` → filtros y ficha. Qué es de mentira: la réplica de Supabase y los terceros (fuentes, íconos, Cloudinary, mapas).
 * NO prueba: la base real, el CDN, otros navegadores. Requiere un build hecho CON esa fixtura.
 */

const DIR = process.env.EVIDENCIA_DIR ?? join(process.cwd(), '..', 'lanzamiento', 'etapa3', 'evidencia')
mkdirSync(DIR, { recursive: true })
const ruta = (nombre: string) => join(DIR, `${test.info().project.name}__${nombre}.png`)
/** Foto de UN elemento (la sección que se quiere ver, no sólo lo que cabe en la pantalla). */
const capturaDe = async (el: Locator, nombre: string) => el.screenshot({ path: ruta(nombre) })
const UN_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const hex = (n: number) => `a0000000-0000-4000-8000-0000000e48${String(n).padStart(2, '0')}`
const SLUG = (n: number, tipo: string, op: string) => `sintetica-e48-${n}-${tipo}-${op}`

async function guardas(page: Page) {
  await page.route((u) => /(^|\.)cloudinary\.com$/.test(u.hostname), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL }))
  await page.route((u) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|images\.unsplash\.com|api\.open-meteo\.com|apis\.google\.com|tile\.openstreetmap\.org|googletagmanager\.com|google-analytics\.com)$/.test(u.hostname), (r) => {
    const u = new URL(r.request().url())
    if (u.hostname === 'images.unsplash.com') return r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL })
    if (u.pathname.endsWith('.css') || u.hostname === 'fonts.googleapis.com') return r.fulfill({ status: 200, contentType: 'text/css', body: '' })
    return r.abort()
  })
  await page.route((u) => /(^|\.)(supabase\.co|supabase\.in|firebaseio\.com|vercel-insights\.com|vercel-scripts\.com)$/.test(u.hostname), (r) => r.abort())
}
const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
const titulos = (page: Page) => page.locator('main h3')
const resultados = async (page: Page, query: string) => {
  await page.goto(`/propiedades?${query}`)
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}
/** Títulos sintéticos que salen con esos filtros (la fixtura trae además los anuncios originales: se ignoran). */
const sinteticos = async (page: Page, query: string) => {
  await resultados(page, query)
  const t = await titulos(page).allTextContents()
  return t.filter((x) => /Anuncio|Oficina corporativa|Casa amueblada|Local comercial en venta|Departamento en venta con balc|Terreno residencial en venta|Consultorio/.test(x)).map((x) => x.replace(/\s+–\s+\d+\s*m².*$/, '').replace(/,\s*\d+\s*m²/g, '').trim())
}

test.beforeEach(async ({ page }) => { await guardas(page) })

test.describe('catálogo: oficinas y filtros de características (datos sintéticos por el camino real)', () => {
  test('«Oficina» está en el selector y en los accesos; el filtro por tipo devuelve las 2 oficinas', async ({ page }) => {
    const t = await sinteticos(page, 'tipo=oficina')
    expect(t.sort()).toEqual(['Consultorio en venta en torre médica', 'Oficina corporativa en renta, Torre Altus'].sort())
    await expect(page.locator('select').first()).toBeVisible()
    await expect(page.locator('select option[value="oficina"]').first()).toHaveCount(1)
    await sinDesborde(page)
    await capturaDe(page.locator('main').first(), 'catalogo-oficinas')
  })

  test('la tarjeta enseña pocos datos clave (sin saturar)', async ({ page }) => {
    await resultados(page, 'tipo=oficina&op=renta')
    const tarjeta = page.locator('article.tc').first()
    const datos = tarjeta.locator('[data-datos-tarjeta]')
    await expect(datos).toContainText('1 baño y medio')
    await expect(datos).toContainText('2 estac.')
    await expect(tarjeta.locator('.tc-extra')).toContainText('Semiamueblado')
    expect(await datos.locator('li').count()).toBeLessThanOrEqual(4)
  })

  const combos: [string, string, string[]][] = [
    ['tipo + operación', 'tipo=oficina&op=renta', ['Oficina corporativa en renta, Torre Altus']],
    ['estacionamientos 2+ (extras)', 'est=2&tipo=oficina', ['Oficina corporativa en renta, Torre Altus']],
    ['renta amueblado (sí o semi)', 'op=renta&amu=1&smin=90', ['Casa amueblada en renta, 3 recámaras, Cumbres', 'Oficina corporativa en renta, Torre Altus']],
    ['renta + mascotas', 'op=renta&masc=1', ['Casa amueblada en renta, 3 recámaras, Cumbres']],
    ['recámaras 3+ y baños 2+', 'rec=3&ban=2&op=renta', ['Casa amueblada en renta, 3 recámaras, Cumbres']],
    ['superficie 50–100 m² en venta', 'op=venta&smin=50&smax=100&tipo=departamento', ['Departamento en venta con balcón, 2 recámaras']],
    ['las oficinas no tienen recámaras', 'tipo=oficina&rec=1', []],
    ['mascotas sin renta se ignora (no filtra a cero)', 'masc=1&tipo=oficina', ['Consultorio en venta en torre médica', 'Oficina corporativa en renta, Torre Altus']],
    ['local comercial con vocabulario del sitio', 'tipo=comercial&est=3', ['Local comercial en venta en plaza']],
  ]
  for (const [nombre, query, esperados] of combos) {
    test(`filtros combinados · ${nombre}`, async ({ page }) => {
      expect((await sinteticos(page, query)).sort()).toEqual([...esperados].sort())
    })
  }

  test('«Más filtros» por la interfaz: se aplica, viaja en la URL, se puede limpiar', async ({ page }) => {
    await resultados(page, 'op=renta')
    await page.getByRole('button', { name: /Más filtros/ }).click()
    await expect(page.getByRole('group', { name: 'Más filtros' })).toBeVisible()
    // Estacionamientos son fichas «0 · 1+ · 2+ · 3+ · 4+» (antes un selector): se elige «2+» y queda marcada.
    // (al elegirla aparece además la etiqueta del filtro activo con el mismo nombre: se acota al panel «Más filtros»)
    const ficha = page.getByRole('group', { name: 'Más filtros' }).getByRole('button', { name: '2+ estacionamientos' })
    await ficha.click()
    await expect(ficha).toHaveAttribute('aria-pressed', 'true')
    await page.getByLabel('Amueblado').check()
    await expect(page).toHaveURL(/est=2/)
    await expect(page).toHaveURL(/gen=amueblado/)   // la interfaz ahora escribe el filtro de «Amueblado» como gen=amueblado
    const esperadas = ['Casa amueblada en renta, 3 recámaras, Cumbres', 'Oficina corporativa en renta, Torre Altus'].sort()
    expect((await sinteticos(page, 'op=renta&est=2&gen=amueblado')).sort()).toEqual(esperadas)
    // Compatibilidad: los enlaces viejos con amu=1 (alertas y búsquedas guardadas) dan el MISMO resultado.
    expect((await sinteticos(page, 'op=renta&est=2&amu=1')).sort()).toEqual(['Casa amueblada en renta, 3 recámaras, Cumbres', 'Oficina corporativa en renta, Torre Altus'].sort())
    await capturaDe(page.locator('.barra-filtros'), 'catalogo-barra-mas-filtros')
    // salir de «renta» quita lo que sólo existe en renta
    await page.getByRole('button', { name: 'Todo', exact: true }).click()
    await expect(page).not.toHaveURL(/gen=amueblado|amu=1/)
  })

  test('axe: la sección «Más filtros» no añade infracciones', async ({ page }) => {
    await resultados(page, 'op=renta&est=1&amu=1&masc=1')
    await expect(page.getByRole('group', { name: 'Más filtros' })).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#mas-filtros').analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
})

test.describe('ficha pública: características agrupadas, sin vacíos', () => {
  test('oficina en renta', async ({ page }) => {
    await page.goto(`/propiedades/${SLUG(1, 'oficina', 'renta')}`)
    const s = page.locator('[data-caracteristicas-ficha]')
    await expect(s).toBeVisible({ timeout: 30_000 })
    for (const t of ['Características', 'Espacios y distribución', 'Privados u oficinas cerradas', 'Salas de juntas', 'Tiene recepción', 'Fibra óptica', 'Elevador accesible', 'Semiamueblado', '2 meses', '12 meses', 'Condiciones de renta', 'Servicios incluidos en la renta']) await expect(s).toContainText(t)
    for (const t of ['Admite mascotas', 'Niveles', 'Frente']) await expect(s).not.toContainText(t)
    // R8.4: la seguridad/vigilancia es una AMENIDAD: sale bajo «Amenidades», no bajo «Características».
    await expect(s).not.toContainText('Vigilancia 24 horas')
    await expect(page.locator('[data-amenidades-ficha]')).toContainText('Vigilancia 24 horas')
    await expect(page.getByText('Superficie construida').first()).toBeVisible()
    await sinDesborde(page)
    await capturaDe(s, 'ficha-oficina-caracteristicas')
    const r = await new AxeBuilder({ page }).include('[data-caracteristicas-ficha]').analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
  test('casa en renta (mascotas, amueblado) y terreno (frente, fondo) y venta sin lo de renta', async ({ page }) => {
    await page.goto(`/propiedades/${SLUG(2, 'casa', 'renta')}`)
    const s = page.locator('[data-caracteristicas-ficha]')
    await expect(s).toBeVisible({ timeout: 30_000 })
    for (const t of ['Admite mascotas', 'Sí, se permiten', 'Amueblado', 'Niveles o plantas', 'Terraza']) await expect(s).toContainText(t)
    // El terreno total ya no se repite en «Características»: va primero, en el bloque principal.
    await expect(s).not.toContainText('Terreno (m²)')
    await page.goto(`/propiedades/${SLUG(5, 'terreno', 'venta')}`)
    const t = page.locator('[data-caracteristicas-ficha]')
    await expect(t).toBeVisible({ timeout: 30_000 })
    for (const x of ['Frente (m)', 'Fondo (m)', 'Topografía', 'Plano', 'Calle pavimentada']) await expect(t).toContainText(x)
    await expect(t).not.toContainText('Condiciones de renta')
    await page.goto(`/propiedades/${SLUG(4, 'departamento', 'venta')}`)
    await expect(page.locator('[data-caracteristicas-ficha]')).toContainText('A estrenar', { timeout: 30_000 })
  })
  test('una ficha sin características (anuncio original) queda igual: sin la sección', async ({ page }) => {
    await page.goto('/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-caracteristicas-ficha]')).toHaveCount(0)
  })
})

test.describe('comparar: sólo campos con sentido', () => {
  test('oficina vs casa en renta', async ({ page }) => {
    await page.goto(`/comparar?ids=${hex(1)},${hex(2)}`)
    const tabla = page.locator('table')
    await expect(tabla).toBeVisible({ timeout: 30_000 })
    for (const fila of ['Precio', 'Superficie', 'Terreno', 'Área útil', 'Baños', 'Estacionamientos', 'Privados', 'Antigüedad', 'Amueblado', 'Admite mascotas', 'Depósito']) await expect(tabla.getByRole('rowheader', { name: new RegExp(fila) }).first()).toBeVisible()
    await expect(tabla).toContainText('2 baños y medio')
    await expect(tabla).toContainText('Semiamueblado')
    await expect(tabla).toContainText('Sí, se permiten')
    await expect(tabla).not.toContainText('Niveles')
    await sinDesborde(page)
    await capturaDe(tabla, 'comparar-oficina-casa')
  })
})
