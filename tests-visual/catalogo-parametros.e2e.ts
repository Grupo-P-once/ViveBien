import { expect, test, type Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * Auditoría del rol CLIENTE (28-oct-2026) — catálogo `/propiedades`: parámetros de la URL con distinta capitalización, valores inesperados, entradas hostiles y folio.
 * Navegador REAL contra el build local; el catálogo sale de la réplica con fixtura. Las comprobaciones son RELATIVAS (el catálogo contra sí mismo) para no depender de los datos.
 *
 * Cada caso fija el comportamiento ACTUAL con la etiqueta de su naturaleza, para que cualquier cambio llegue a decisión del dueño y no se cuele:
 *   · LIMITACIÓN DOCUMENTADA — el diseño de hoy, no necesariamente el deseado.
 *   · HALLAZGO DE PRODUCTO — comportamiento engañoso o incompleto que requiere decisión (NO se cambia sin ella).
 * Lectura de la página: `.tc` = tarjetas; «Limpiar» aparece cuando la página cree que hay un filtro activo.
 */
const tarjetas = (page: Page) => page.locator('.tc').count()
const limpiar = (page: Page) => page.locator('button', { hasText: /^\s*Limpiar\s*$/ }).first().isVisible().catch(() => false)

async function abrir(page: Page, query: string, errores: string[]) {
  await page.goto(`/propiedades${query}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  // la lista se pinta en el navegador: se espera a que el conteo se estabilice
  let previo = -1
  for (let i = 0; i < 10; i++) { const n = await tarjetas(page); if (n === previo) break; previo = n; await page.waitForTimeout(400) }
  return { n: await tarjetas(page), limpiar: await limpiar(page), url: page.url(), errores: [...errores] }
}

test.describe('catálogo — parámetros de la URL', () => {
  test.use({ reducedMotion: 'reduce' })
  test.setTimeout(150_000)
  let errores: string[] = []
  test.beforeEach(async ({ page }) => {
    errores = []
    await acotarTerceros(page)
    await page.route('**/api.open-meteo.com/**', (r) => r.abort())
    page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|upgrade-insecure-requests/i.test(m.text())) errores.push(m.text()) })
  })
  test.afterEach(() => { expect(errores, 'errores de JavaScript en la página').toEqual([]) })

  test('línea base y filtros que SÍ funcionan: zona con acento/mayúsculas da lo mismo; un filtro reduce o iguala', async ({ page }) => {
    const todo = await abrir(page, '', errores)
    expect(todo.n, 'el catálogo base debe tener tarjetas').toBeGreaterThan(0)
    expect(todo.limpiar, 'sin filtros no debe aparecer «Limpiar»').toBe(false)
    const leon1 = await abrir(page, '?zona=leon', errores)
    const leon2 = await abrir(page, '?zona=LE%C3%93N', errores)
    expect(leon2.n, '«LEÓN» y «leon» deben dar lo mismo').toBe(leon1.n)
    expect(leon1.n).toBeLessThanOrEqual(todo.n)
    expect(leon1.limpiar, 'con zona válida la página sabe que hay un filtro').toBe(true)
  })

  test('LIMITACIÓN DOCUMENTADA: el NOMBRE del parámetro distingue mayúsculas — `?Zona=`, `?ZONA=`, `?Op=` se ignoran y la página queda coherente (lista completa, sin «Limpiar»)', async ({ page }) => {
    const todo = await abrir(page, '', errores)
    for (const q of ['?Zona=zzzzzz', '?ZONA=zzzzzz', '?Op=renta', '?TIPO=nave', '?PMIN=999999999']) {
      const r = await abrir(page, q, errores)
      expect(r.n, `${q}: se esperaba la lista completa (parámetro ignorado)`).toBe(todo.n)
      expect(r.limpiar, `${q}: no debería ofrecer «Limpiar»`).toBe(false)
    }
  })

  test('DECISIÓN (28-oct): `?op=Venta` y `?op=venta` son lo mismo — filtra igual y la página y el filtrado coinciden en que hay filtro', async ({ page }) => {
    const venta = await abrir(page, '?op=venta', errores)
    const Venta = await abrir(page, '?op=Venta', errores)
    expect(Venta.n, '`op=Venta` debe dar lo mismo que `op=venta`').toBe(venta.n)
    expect(Venta.limpiar).toBe(true)
    expect(venta.limpiar).toBe(true)
  })

  test('el valor de `tipo` en mayúsculas SÍ se normaliza al filtrar (`?tipo=CASA` = `?tipo=casa`)', async ({ page }) => {
    const a = await abrir(page, '?tipo=casa', errores)
    const b = await abrir(page, '?tipo=CASA', errores)
    expect(b.n).toBe(a.n)
  })

  test('valores inesperados no rompen la página: precio no numérico, negativo, enorme, invertido, caracteres de control', async ({ page }) => {
    const todo = await abrir(page, '', errores)
    for (const q of ['?pmin=abc', '?pmin=-5', '?pmax=0', '?pmin=1e999', '?pmin=99999999999999999999', '?rec=999', '?smin=NaN', '?pmin=%00', '?zona=%00%01']) {
      const r = await abrir(page, q, errores)
      expect(r.n, `${q}: no puede mostrar MÁS que el catálogo completo`).toBeLessThanOrEqual(todo.n)
    }
    const invertido = await abrir(page, '?pmin=9000000&pmax=1000', errores)
    const normal = await abrir(page, '?pmin=1000&pmax=9000000', errores)
    expect(invertido.n, 'mínimo > máximo se intercambia (decisión de producto ya documentada)').toBe(normal.n)
  })

  test('entradas hostiles en `zona` (SQL, HTML, 5000 caracteres, regex): 0 resultados, sin error y sin reflejar HTML', async ({ page }) => {
    for (const z of ["'%20OR%201%3D1%3B--", '%3Cscript%3Ewindow.__xss%3D1%3C%2Fscript%3E', '%3Cimg%20src%3Dx%20onerror%3Dwindow.__xss%3D1%3E', '(.*', 'A'.repeat(5000)]) {
      const r = await abrir(page, `?zona=${z}`, errores)
      expect(r.n, `zona hostil «${decodeURIComponent(z).slice(0, 20)}»: 0 resultados`).toBe(0)
    }
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), 'no se ejecutó ningún script').toBeUndefined()
    expect(await page.locator('img[src="x"]').count(), 'el HTML hostil no se inserta como elemento').toBe(0)
  })

  test('HALLAZGO DE PRODUCTO (folio): escribir un folio en la zona da CERO resultados; el folio solo se resuelve como URL directa de la ficha', async ({ page }) => {
    const r = await abrir(page, '?zona=VB-2026-00004', errores)
    expect(r.n, 'documentado: el buscador no entiende folios').toBe(0)
  })

  test('LIMITACIÓN DOCUMENTADA (paginación): no hay paginación; el catálogo muestra todas las propiedades del tipo con «Mostrar todas»/carrusel, y `/api/catalogo` devuelve todo de una vez (consulta con `limit=500`)', async ({ page }) => {
    const r = await abrir(page, '', errores)
    expect(r.n).toBeGreaterThan(0)
    expect(await page.getByRole('navigation', { name: /paginaci/i }).count(), 'no existe navegación de páginas').toBe(0)
    const api = await page.request.get('/api/catalogo')
    const cuerpo = await api.json()
    const lista = Array.isArray(cuerpo) ? cuerpo : (cuerpo.propiedades ?? [])
    expect(lista.length, 'la API devuelve el conjunto completo (sin parámetros de página)').toBeGreaterThan(0)
    expect(lista.length).toBeLessThanOrEqual(500)
  })
})
