import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { acotarTerceros } from './ayudas-red'

/**
 * Blog (18 artículos), sus páginas, buscador, feed y sitemap, y los cambios del inicio de esta etapa (sección «Nuestro blog», ubicación con clima,
 * header sin widget, marquesina lenta, PROIN con la foto debajo en móvil). Navegador REAL contra el build local; terceros bloqueados.
 * Capturas en `EVIDENCIA_DIR/blog/`.
 */
const CAPTURAS = join(process.env.EVIDENCIA_DIR || join(process.cwd(), 'evidencia-blog'), 'blog')
mkdirSync(CAPTURAS, { recursive: true })
const ANCHO = (p: Page) => p.viewportSize()!.width
const SIN_DESBORDE = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
const GRAVES = async (page: Page, sel: string) => {
  const r = await new AxeBuilder({ page }).include(sel).analyze()
  return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
}
const preparar = async (page: Page) => { await acotarTerceros(page); await page.route('**/api.open-meteo.com/**', (r) => r.abort()) }

test.describe('blog · listado', () => {
  test('hero, buscador, filtros, destacada, 9 tarjetas por página, paginación, preguntas y contacto', async ({ page }) => {
    test.setTimeout(90_000)
    await preparar(page)
    await page.goto('/blog')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ideas y guías para')
    await expect(page.getByRole('navigation', { name: 'Categorías del blog' }).getByRole('link')).toHaveCount(7)
    await expect(page.getByRole('search').getByRole('searchbox')).toBeVisible()
    await expect(page.locator('article.blog-tarjeta-destacada')).toHaveCount(1)
    await expect(page.locator('article.blog-tarjeta')).toHaveCount(9)
    await expect(page.getByRole('navigation', { name: 'Paginación del blog' }).getByRole('link', { name: 'Página 2' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Preguntas frecuentes/ })).toBeVisible()
    await expect(page.locator('.blog-cierre').getByRole('link', { name: 'Contáctanos' })).toHaveAttribute('href', '/contacto')
    expect(await SIN_DESBORDE(page)).toBe(true)
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-blog.png`), fullPage: true })
    await page.getByRole('link', { name: 'Página 2' }).first().click()
    await expect(page).toHaveURL(/pagina=2/)
    await expect(page.locator('article.blog-tarjeta')).toHaveCount(9)
    expect(await GRAVES(page, 'main')).toEqual([])
  })

  test('el buscador filtra (sin acentos), las categorías y las búsquedas no se indexan', async ({ page }) => {
    await preparar(page)
    await page.goto('/blog?q=escrituracion')
    await expect(page.locator('.blog-resultados')).toContainText('resultado')
    await expect(page.locator('article.blog-tarjeta').first()).toContainText(/escrituración|escrituración/i)
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex')
    await page.goto('/blog?q=zzzzzzzz')
    await expect(page.getByRole('heading', { name: 'No encontramos guías con esa búsqueda' })).toBeVisible()
    await page.goto('/blog/categoria/naves-y-terrenos')
    await expect(page.locator('article.blog-tarjeta')).toHaveCount(3)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Naves y terrenos')
  })
})

test.describe('blog · artículo', () => {
  test('SEO (título, canónica, BlogPosting), tabla, referencias APA, índice, enlaces y accesibilidad', async ({ page }) => {
    test.setTimeout(90_000)
    await preparar(page)
    await page.goto('/blog/como-leer-el-cat-y-comparar-creditos-hipotecarios')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('CAT')
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(/\/blog\/como-leer-el-cat-y-comparar-creditos-hipotecarios$/)
    const ld = await page.locator('script[type="application/ld+json"]').evaluateAll((s) => s.map((x) => x.textContent ?? ''))
    const json = ld.map((t) => JSON.parse(t)).flatMap((o) => o['@graph'] ?? [o])
    const post = json.find((o) => o['@type'] === 'BlogPosting')
    expect(post.headline).toBeTruthy(); expect(post.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T/); expect(post.author['@type']).toBe('Organization'); expect(post.citation.length).toBeGreaterThanOrEqual(2)
    expect(json.some((o) => o['@type'] === 'BreadcrumbList')).toBe(true)
    await expect(page.locator('.blog-tabla').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Referencias' })).toBeVisible()
    expect(await page.locator('.blog-referencias li').count()).toBeGreaterThanOrEqual(2)
    for (const a of await page.locator('.blog-referencias a').all()) await expect(a).toHaveAttribute('rel', /noopener/)
    if (ANCHO(page) >= 900) await expect(page.getByRole('navigation', { name: 'Índice de contenido' })).toBeVisible()
    expect(await page.locator('.blog-cuerpo a[href^="/"]').count()).toBeGreaterThanOrEqual(3)
    await expect(page.locator('.blog-cierre').getByRole('link', { name: 'Ver propiedades' })).toHaveAttribute('href', '/propiedades')
    expect(await SIN_DESBORDE(page)).toBe(true)
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-articulo.png`), fullPage: true })
    expect(await GRAVES(page, 'main')).toEqual([])
  })

  test('un artículo que no existe responde 404', async ({ page }) => {
    const r = await page.goto('/blog/no-existe-este-articulo')
    expect(r!.status()).toBe(404)
  })

  test('feed RSS con los 18 artículos y sitemap con las páginas del blog', async ({ request }) => {
    const rss = await (await request.get('/blog/feed.xml')).text()
    expect((rss.match(/<item>/g) ?? []).length).toBe(18)
    const sm = await request.get('/sitemap.xml'); expect(sm.status()).toBe(200)
    const t = await sm.text()
    expect(t).toContain('/blog</loc>'); expect(t).toContain('/blog/como-comprar-una-casa-en-leon-guanajuato-guia-paso-a-paso'); expect(t).toContain('/blog/categoria/comprar')
    expect((t.match(/\/blog\/[a-z0-9-]+<\/loc>/g) ?? []).length).toBeGreaterThanOrEqual(18)
  })
})

test.describe('inicio · cambios de esta etapa', () => {
  test('sección del blog entre redes y contacto, ubicación con clima, header sin widget y marquesina lenta', async ({ page }) => {
    test.setTimeout(90_000)
    await preparar(page)
    await page.route('**/api/clima', (r) => r.fulfill({ json: { ciudad: 'León', region: 'Gto.', porIp: false, clima: { temp: 22, icono: 'sol', desc: 'Despejado' } } }))
    await page.goto('/')
    await expect(page.locator('h1#hero-titulo')).toBeVisible()
    await expect(page.locator('p.ini-clima')).toContainText('22°C')
    await expect(page.locator('p.ini-clima')).toContainText('León')
    await expect(page.locator('.vb-header')).not.toContainText('°C')
    const hamburguesa = page.getByRole('button', { name: 'Abrir menú' })
    if (await hamburguesa.isVisible()) { await hamburguesa.click(); await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: /Blog/ }).first()).toBeVisible() }
    else await expect(page.locator('nav').getByRole('link', { name: 'Blog' }).first()).toBeVisible()
    const y = await page.evaluate(() => ['[data-seccion="redes"]', '[data-seccion="blog"]', '.ini-contacto'].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? NaN))
    expect(y[0]).toBeLessThan(y[1]); expect(y[1]).toBeLessThan(y[2])
    expect(await page.locator('[data-seccion="blog"] .ini-blog-tarjeta').count()).toBe(4)
    await expect(page.locator('[data-seccion="blog"]').getByRole('link', { name: /Ver todos los artículos/ })).toHaveAttribute('href', '/blog')
    expect(await page.locator('.ini-marquesina').evaluate((e) => getComputedStyle(e).animationDuration)).toBe('120s')
    expect(await SIN_DESBORDE(page)).toBe(true)
    expect(await GRAVES(page, '[data-seccion="blog"]')).toEqual([])
    await page.locator('[data-seccion="blog"]').screenshot({ path: join(CAPTURAS, `${test.info().project.name}-inicio-blog.png`) })
  })

  test('PROIN: en móvil la foto va DEBAJO del texto; en escritorio, a la izquierda', async ({ page }) => {
    await preparar(page)
    await page.goto('/')
    const s = page.locator('[data-seccion="proin"]'); await s.scrollIntoViewIfNeeded()
    const [t, f] = await s.evaluate((e) => [e.querySelector('.ini-inst-texto')!.getBoundingClientRect(), e.querySelector('.ini-inst-foto')!.getBoundingClientRect()].map((r) => ({ top: r.top, left: r.left })))
    if (ANCHO(page) < 900) expect(t.top).toBeLessThan(f.top); else expect(f.left).toBeLessThan(t.left)
  })
})

test.describe('/api/clima', () => {
  test('responde ciudad (y clima si hay) sin exponer la IP', async ({ request }) => {
    const r = await request.get('/api/clima', { headers: { 'x-vercel-ip-city': 'Silao', 'x-vercel-ip-country': 'MX', 'x-vercel-ip-country-region': 'GUA', 'x-vercel-ip-latitude': '20.9', 'x-vercel-ip-longitude': '-101.4', 'x-forwarded-for': '203.0.113.7' } })
    expect(r.status()).toBe(200)
    const j = await r.json(); expect(j.ciudad).toBe('Silao'); expect(JSON.stringify(j)).not.toContain('203.0.113')
    expect(r.headers()['cache-control']).toContain('private')
  })
})

test.describe('blog · fotografías con crédito', () => {
  test('el artículo con foto de Wikimedia Commons muestra autor, título, licencia, enlace de origen y la nota de adaptación', async ({ page }) => {
    await preparar(page)
    await page.goto('/blog/silao-o-leon-donde-conviene-ubicar-tu-negocio-o-tu-nave')
    const credito = page.locator('.blog-credito')
    await expect(credito).toContainText('Juan Carlos Fonseca Mata')
    await expect(credito).toContainText('Wikimedia Commons')
    await expect(credito).toContainText('Recortada a formato 16:10')
    await expect(credito.getByRole('link', { name: /Guanajuato Puerto Interior \(Silao\) I\.jpg/ })).toHaveAttribute('href', /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    await expect(credito.getByRole('link', { name: /CC BY-SA 4\.0/ })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0')
    for (const a of await credito.locator('a').all()) expect(await a.getAttribute('rel')).toMatch(/noopener/)
    const foto = page.locator('.blog-portada img')
    await expect.poll(() => foto.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    expect(await foto.getAttribute('src')).toMatch(/foto-silao-o-leon/)
    expect(await GRAVES(page, 'main')).toEqual([])
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-articulo-con-foto.png`), fullPage: false })
  })
  test('un artículo con foto de Pexels muestra su crédito, la licencia de Pexels y la nota de imagen ilustrativa', async ({ page }) => {
    await preparar(page)
    await page.goto('/blog/como-leer-el-cat-y-comparar-creditos-hipotecarios')
    const credito = page.locator('.blog-credito')
    await expect(credito).toContainText('Kampus Production')
    await expect(credito).toContainText('Pexels')
    await expect(credito).toContainText('Imagen ilustrativa')
    await expect(credito.getByRole('link', { name: /Licencia de Pexels/ })).toHaveAttribute('href', 'https://www.pexels.com/license/')
  })
})
