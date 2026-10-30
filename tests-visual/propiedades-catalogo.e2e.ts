import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { acotarTerceros } from './ayudas-red'

/**
 * Catálogo de propiedades rediseñado (22-oct-2026): secciones por tipo en carrusel de 2 filas con «Mostrar todas», tarjetas compactas, galería fluida,
 * mapa (todas / una / completo) y ficha con tarjeta de datos y recomendadas en carrusel. Navegador REAL contra el build local; el catálogo pasa por el
 * camino real (`/api/catalogo`) y aquí se AMPLÍA en el navegador (14 casas con 5 fotos locales y coordenadas) para ejercitar el carrusel y el mapa:
 * es lo único de mentira, junto con los terceros (fuentes, teselas del mapa). Capturas en `EVIDENCIA_DIR/propiedades/`.
 */
const CAPTURAS = join(process.env.EVIDENCIA_DIR || join(process.cwd(), 'evidencia-propiedades'), 'propiedades')
mkdirSync(CAPTURAS, { recursive: true })
const FOTOS = ['/blog/portada-comprar-casa-leon.webp', '/blog/portada-vender-casa-leon.webp', '/blog/portada-rentar-o-comprar.webp', '/blog/portada-casa-usada-checklist.webp', '/blog/portada-leer-el-cat.webp']
const TOTAL_CASAS = 14

type Fila = Record<string, unknown> & { id: string; tipo: string; slug?: string }

/** Amplía el catálogo: 14 casas (clones de una) con 5 fotos locales y punto en el mapa; el resto, con una foto y punto. */
async function ampliarCatalogo(page: Page) {
  await page.route('**/api/catalogo', async (ruta) => {
    const r = await ruta.fetch()
    const j = await r.json() as { propiedades: Fila[] }
    const base = j.propiedades.find((p) => p.tipo === 'casa') ?? j.propiedades[0]
    const casas = Array.from({ length: TOTAL_CASAS }, (_, i) => ({ ...base, id: `c-${i}`, slug: `casa-prueba-${i}`, folio: `VB-2026-${String(i + 1).padStart(5, '0')}`, tipo: 'casa', operacion: 'venta', titulo: `Casa de prueba ${i + 1}`, precio: 4_000_000 + i * 250_000 }))
    const otras = j.propiedades.filter((p) => p.tipo !== 'casa')
    const todas = [...casas, ...otras].map((p, i) => ({
      ...p, fotos: p.tipo === 'casa' ? FOTOS : ['/blog/portada-leer-el-cat.webp'],
      lat: 21.09 + (i % 7) * 0.012, lng: -101.72 + Math.floor(i / 7) * 0.02 + (i % 5) * 0.006, precision_ubicacion: 'exacta',
    }))
    await ruta.fulfill({ response: r, json: { ...j, propiedades: todas } })
  })
}
const abrirCatalogo = async (page: Page) => {
  await acotarTerceros(page)
  await page.route('**/api.open-meteo.com/**', (r) => r.abort())
  await ampliarCatalogo(page)
  await page.goto('/propiedades')
  await expect(page.locator('[data-tipo-seccion="casa"]')).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}
const seccion = (page: Page, tipo = 'casa') => page.locator(`[data-tipo-seccion="${tipo}"]`)
const filasDe = (page: Page, tipo = 'casa') => seccion(page, tipo).locator('.tc').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size)

test.describe('catálogo · secciones por tipo', () => {
  test('máximo 2 filas y 3–4 columnas en carrusel; «Mostrar todas» quita el carrusel y enseña todas; «Mostrar menos» lo vuelve a poner', async ({ page }) => {
    await abrirCatalogo(page)
    const s = seccion(page), zona = s.locator('.cat-zona')
    const ancho = await zona.evaluate((e) => e.clientWidth)   // el catálogo mide su CONTENEDOR, no la ventana
    const colsEsperadas = ancho >= 1100 ? 4 : ancho >= 760 ? 3 : ancho >= 520 ? 2 : 1
    await expect(zona).toHaveAttribute('data-modo', 'carrusel')
    await expect(zona).toHaveAttribute('data-columnas', String(colsEsperadas))
    // dos filas (las tarjetas de la 3.ª fila no existen: son columnas del carrusel)
    const tops = await s.locator('.cat-pista > .tc').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))])
    expect(tops.length).toBe(2)
    // columnas visibles dentro de la pista
    const visibles = await s.locator('.cat-pista').evaluate((p) => {
      const r = p.getBoundingClientRect()
      return [...p.children].filter((c) => { const b = c.getBoundingClientRect(); return b.left >= r.left - 2 && b.right <= r.right + 2 && Math.round(b.top) === Math.round(p.children[0].getBoundingClientRect().top) }).length
    })
    expect(visibles).toBe(colsEsperadas)
    await expect(s.getByRole('button', { name: `Mostrar todas (${TOTAL_CASAS})` })).toBeVisible()
    await s.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-casas-carrusel.png`) })

    await s.getByRole('button', { name: `Mostrar todas (${TOTAL_CASAS})` }).click()
    await expect(zona).toHaveAttribute('data-modo', 'todas')
    await expect(s.locator('.cat-flecha')).toHaveCount(0); await expect(s.locator('.cat-puntos')).toHaveCount(0)
    await expect(s.locator('.tc')).toHaveCount(TOTAL_CASAS)
    expect(await filasDe(page)).toBeGreaterThanOrEqual(Math.ceil(TOTAL_CASAS / colsEsperadas) - 0)
    await s.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-casas-todas.png`) })

    await s.getByRole('button', { name: 'Mostrar menos' }).click()
    await expect(zona).toHaveAttribute('data-modo', 'carrusel')
    expect(await filasDe(page)).toBe(2)
  })

  test('el carrusel se desplaza por pantallas (puntos) y las flechas respetan los extremos', async ({ page }) => {
    await abrirCatalogo(page)
    const s = seccion(page), pista = s.locator('.cat-pista'), puntos = s.locator('.cat-punto')
    expect(await puntos.count()).toBeGreaterThanOrEqual(2)
    await expect(puntos.first()).toHaveAttribute('aria-current', 'true')
    await puntos.nth(1).click()
    await expect.poll(() => pista.evaluate((p) => p.scrollLeft), { timeout: 4000 }).toBeGreaterThan(50)
    await expect(puntos.nth(1)).toHaveAttribute('aria-current', 'true')
    const prev = s.locator('.cat-prev'), sig = s.locator('.cat-sig')
    if (await prev.isVisible()) {
      await puntos.first().click(); await expect(prev).toBeDisabled(); await expect(sig).toBeEnabled()
      await puntos.last().click(); await expect(sig).toBeDisabled()
    }
  })

  test('tarjeta compacta: precio con su tipografía, datos clave, acciones y alto contenido', async ({ page }) => {
    await abrirCatalogo(page)
    const t = seccion(page).locator('.tc').first()
    await expect(t.locator('.tc-precio strong')).toHaveCSS('font-weight', '900')
    await expect(t.locator('.tc-titulo')).toBeVisible()
    await expect(t.getByRole('link', { name: /Ver más/ })).toHaveCount(0)   // ya no hay botón: toda la tarjeta lleva a la ficha
    for (const n of [/Llamar sobre/, /WhatsApp sobre/, /Escribir correo sobre/, /en el mapa/, /Guardar /]) await expect(t.getByRole('button', { name: n })).toBeVisible()
    const alto = (await t.boundingBox())!.height
    expect(alto).toBeLessThan(ancho390(page) ? 560 : 470)       // compacta: la anterior medía ~620 px con la franja de «Inicia sesión»
  })

  test('la portada: «Catálogo completo» en letras blancas con el rojo alrededor', async ({ page }) => {
    await abrirCatalogo(page)
    const chip = page.getByText('Catálogo completo', { exact: true })
    await expect(chip).toHaveCSS('color', 'rgb(255, 255, 255)')
    expect(await chip.evaluate((e) => getComputedStyle(e).borderTopColor)).toMatch(/200, 16, 46/)
  })
})
const ancho390 = (page: Page) => page.viewportSize()!.width < 520

test.describe('catálogo · galería fluida', () => {
  test('todas las fotos en una pista con snap; las vecinas ya están cargadas y deslizar es inmediato', async ({ page }) => {
    await abrirCatalogo(page)
    const g = seccion(page).locator('.tc').first().locator('.gf')
    const pista = g.locator('.gf-pista')
    await expect(g.locator('img')).toHaveCount(FOTOS.length)
    expect(await pista.evaluate((p) => getComputedStyle(p).scrollSnapType)).toContain('x')
    // no baja las 5 de golpe: solo las primeras tienen src al principio
    const conSrc = () => g.locator('img').evaluateAll((is) => is.filter((i) => (i as HTMLImageElement).getAttribute('src')).length)
    const antes = await conSrc(); expect(antes).toBeGreaterThanOrEqual(1); expect(antes).toBeLessThanOrEqual(3)
    // tocar/pasar el ratón las calienta
    await g.hover({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
    // deslizar a la foto 3 (con el dedo o el ratón es lo mismo para el navegador: scroll-snap) y comprobar que ya está lista
    const medida = await pista.evaluate(async (p) => {
      p.scrollTo({ left: p.clientWidth * 2, behavior: 'instant' as ScrollBehavior })
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const im = p.querySelectorAll('img')[2] as HTMLImageElement
      return { listo: im.complete && im.naturalWidth > 0, indice: Math.round(p.scrollLeft / p.clientWidth) }
    })
    expect(medida).toEqual({ listo: true, indice: 2 })
    await expect(g.locator('.gf-puntos span').nth(2)).toHaveAttribute('data-activo', 'true')
    // y las 2 de adelante se cargan al avanzar
    await expect.poll(conSrc).toBe(FOTOS.length)
  })

  test('el ratón arrastra la foto (escritorio) y encaja en la siguiente', async ({ page, browserName }, info) => {
    test.skip(info.project.name !== 'v1440', 'el arrastre con ratón es de escritorio')
    await abrirCatalogo(page)
    const pista = seccion(page).locator('.tc').first().locator('.gf-pista')
    await pista.scrollIntoViewIfNeeded()           // el ratón actúa en coordenadas de la ventana: la foto tiene que estar a la vista
    const caja = (await pista.boundingBox())!
    await page.mouse.move(caja.x + caja.width * 0.8, caja.y + caja.height / 2)
    await page.mouse.down(); await page.mouse.move(caja.x + caja.width * 0.2, caja.y + caja.height / 2, { steps: 8 }); await page.mouse.up()
    await expect.poll(() => pista.evaluate((p) => Math.round(p.scrollLeft / p.clientWidth)), { timeout: 3000 }).toBe(1)
    void browserName
  })

  test('el teclado cambia de foto con las flechas', async ({ page }) => {
    await abrirCatalogo(page)
    const pista = seccion(page).locator('.tc').first().locator('.gf-pista')
    await pista.focus(); await page.keyboard.press('ArrowRight')
    await expect.poll(() => pista.evaluate((p) => Math.round(p.scrollLeft / p.clientWidth)), { timeout: 3000 }).toBe(1)
  })
})

test.describe('catálogo · mapa', () => {
  const abrirMapa = async (page: Page) => {
    const boton = page.getByRole('button', { name: 'Ver mapa' })
    if (await boton.isVisible().catch(() => false)) await boton.click()
    await expect(page.locator('.mk-pastilla').first()).toBeVisible({ timeout: 20_000 })
  }
  test('enseña todas las propiedades con su precio; elegir una la marca en rojo; «Ver todas» las devuelve', async ({ page }) => {
    await abrirCatalogo(page); await abrirMapa(page)
    const total = await page.locator('article.tc').count()
    await expect(page.locator('.mk-pastilla')).toHaveCount(total)
    await expect(page.locator('.mc-estado')).toContainText('Todas las propiedades')
    await expect(page.locator('.mk-pastilla').first()).toContainText('$')
    await seccion(page).locator('.tc').first().getByRole('button', { name: /en el mapa/ }).click()
    await expect(page.locator('.mk-pastilla.mk-sel')).toHaveCount(1)
    await expect(page.locator('.mc-estado')).toContainText('En el mapa:')
    await expect(seccion(page).locator('.tc').first()).toHaveAttribute('data-seleccionada', 'si')
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-mapa-seleccion.png`) })
    await page.getByRole('button', { name: /^Ver todas \(/ }).click()
    await expect(page.locator('.mk-pastilla.mk-sel')).toHaveCount(0)
  })

  test('«Mapa completo»: pantalla completa con la lista, Esc cierra y el fondo vuelve a desplazarse', async ({ page }, info) => {
    await abrirCatalogo(page); await abrirMapa(page)
    await page.getByRole('button', { name: 'Mapa completo' }).click()
    const d = page.getByRole('dialog', { name: 'Mapa completo de propiedades' })
    await expect(d).toBeVisible()
    const caja = (await d.boundingBox())!, vp = page.viewportSize()!
    expect(Math.round(caja.width)).toBe(vp.width); expect(Math.round(caja.height)).toBe(vp.height)
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')
    if (info.project.name === 'v1440') {
      const items = d.locator('.mc-item')
      expect(await items.count()).toBeGreaterThan(5)
      await items.nth(2).click()
      await expect(d.locator('.mk-pastilla.mk-sel')).toHaveCount(1)
    }
    await page.screenshot({ path: join(CAPTURAS, `${info.project.name}-mapa-completo.png`) })
    await page.keyboard.press('Escape')
    await expect(d).toHaveCount(0)
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
  })

  test('sin desborde horizontal y sin errores graves de accesibilidad en lo nuevo', async ({ page }) => {
    await abrirCatalogo(page); await abrirMapa(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
    const r = await new AxeBuilder({ page }).include('[data-tipo-seccion="casa"]').include('.mc').analyze()
    const graves = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(graves.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
})

test.describe('ficha de la propiedad', () => {
  test('tarjeta de datos, galería fluida y recomendadas en carrusel', async ({ page }) => {
    test.setTimeout(120_000)      // axe sobre una ficha larga en 390 px tarda más de 30 s
    await acotarTerceros(page); await page.route('**/api.open-meteo.com/**', (r) => r.abort())
    const cat = await page.request.get('/api/catalogo'); const j = await cat.json() as { propiedades: Fila[] }
    // Las recomendadas se piden a Supabase desde el navegador: la réplica de pruebas solo contesta consultas grabadas, así que esa consulta (la que trae «id=neq.») se responde con el catálogo real.
    await page.route('**/rest/v1/propiedades*', (r) => (r.request().url().includes('id=neq.') ? r.fulfill({ json: j.propiedades }) : r.fallback()))
    const p = j.propiedades.find((x) => x.slug) ?? j.propiedades[0]
    // Evidencia si la tarjeta de datos no aparece (esta prueba falló de forma intermitente en frío): qué respondió cada petición y qué había en la página.
    const huellas: string[] = []
    page.on('response', (r) => { if (r.status() >= 400 || /rest\/v1\/(propiedades|fotos)/.test(r.url())) huellas.push(`${r.status()} ${r.url().slice(0, 110)}`) })
    page.on('requestfailed', (r) => huellas.push(`FALLÓ ${r.url().slice(0, 110)} ${r.failure()?.errorText}`))
    const resp = await page.goto(`/propiedades/${encodeURIComponent(String(p.slug ?? p.id))}`)
    const aparece = await page.locator('[data-ficha-datos]').waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false)
    if (!aparece) console.log('DIAG-FICHA', JSON.stringify({ http: resp?.status(), url: page.url(), titulo: await page.title(), h1: await page.locator('h1').first().textContent().catch(() => null), texto: (await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300), peticiones: huellas.slice(0, 12) }))
    await expect(page.locator('[data-ficha-datos]')).toBeVisible({ timeout: 5_000 })
    const fd = page.locator('[data-ficha-datos]')
    await expect(fd.getByRole('heading', { name: 'Datos de la propiedad' })).toBeVisible()
    expect(await fd.locator('.fd-lista > div').count()).toBeGreaterThanOrEqual(5)
    // tipografía sobria: Montserrat (la de marca) en el título y en las cifras; el serif decorativo ya no se usa aquí
    for (const sel of ['h2', '.fd-clave strong', '.fd-lista dd']) expect(await fd.locator(sel).first().evaluate((e) => getComputedStyle(e).fontFamily), sel).toMatch(/Montserrat/)
    expect(await fd.locator('.fd-clave strong').first().evaluate((e) => getComputedStyle(e).fontVariantNumeric)).toContain('tabular-nums')
    await expect(page.locator('.gf-ficha')).toBeVisible()
    expect(await page.locator('.gf-ficha .gf-pista').evaluate((e) => getComputedStyle(e).scrollSnapType)).toContain('x')
    const rel = page.locator('[data-relacionadas]')
    await rel.scrollIntoViewIfNeeded()
    await expect(rel.getByRole('heading', { name: 'Propiedades recomendadas' })).toBeVisible()
    expect(await rel.locator('.tc').count()).toBeGreaterThanOrEqual(1)
    expect(await rel.locator('.tc').count()).toBeLessThanOrEqual(10)
    await expect(rel.locator('.tc').first().getByRole('button', { name: /en el mapa/ })).toHaveCount(0)   // sin mapa en la ficha: no hay botón de mapa
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-ficha.png`), fullPage: true })
    const r = await new AxeBuilder({ page }).include('[data-ficha-datos]').include('[data-relacionadas]').analyze()
    expect(r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
})

/** Reporte del propietario (22-oct-2026): en móvil la tarjeta se cortaba (no se veía «guardar»), el mapa se veía a la mitad y faltaba «compartir». */
test.describe('tarjeta · acciones sin cortes, compartir con enlace corto y mapa completo', () => {
  test('ningún botón de la tarjeta se corta y «guardar» y «compartir» se ven, en cada ancho', async ({ page }) => {
    test.setTimeout(90_000)
    await abrirCatalogo(page)
    const tarjeta = seccion(page).locator('.tc').first()
    await tarjeta.scrollIntoViewIfNeeded()
    const cajas = await tarjeta.evaluate((t) => {
      const c = t.getBoundingClientRect()
      return {
        tarjeta: { izq: Math.round(c.left), der: Math.round(c.right), ancho: Math.round(c.width) },
        botones: [...t.querySelectorAll('.tc-acciones a, .tc-acciones button')].map((b) => {
          const r = b.getBoundingClientRect()
          return { n: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 28), ok: r.width > 0 && r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.bottom <= c.bottom + 0.5 }
        }),
      }
    })
    expect(cajas.botones.filter((b) => !b.ok), 'botones fuera de la tarjeta').toEqual([])
    await expect(tarjeta.locator('.tc-ic-fav')).toBeVisible()
    await expect(tarjeta.locator('[data-compartir]')).toBeVisible()
    // en teléfono la tarjeta es ancha (la siguiente apenas asoma) y entra completa en la pantalla
    const ancho = page.viewportSize()!.width
    if (ancho < 520) {
      const zona = await seccion(page).locator('.cat-zona').evaluate((e) => e.clientWidth)
      expect(cajas.tarjeta.ancho / zona, 'la tarjeta ocupa casi todo el carrusel').toBeGreaterThanOrEqual(0.92)
      expect(cajas.tarjeta.der).toBeLessThanOrEqual(ancho + 1)
    }
    // el título va en Montserrat (la tipografía de marca), no en el serif de antes
    expect(await tarjeta.locator('.tc-titulo').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Montserrat/)
    await tarjeta.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-tarjeta-acciones.png`) })
  })

  test('«compartir» usa la hoja del teléfono si existe y, si no, copia el enlace corto', async ({ page }) => {
    test.setTimeout(90_000)
    await abrirCatalogo(page)
    const tarjeta = seccion(page).locator('.tc').first()
    await tarjeta.scrollIntoViewIfNeeded()
    // sin hoja nativa: se copia
    await page.evaluate(() => { (navigator as unknown as { share?: unknown }).share = undefined; (window as unknown as { __copiado?: string }).__copiado = ''; navigator.clipboard.writeText = async (t: string) => { (window as unknown as { __copiado: string }).__copiado = t } })
    await tarjeta.locator('[data-compartir]').click()
    await expect(tarjeta.locator('.tc-aviso-link')).toContainText('Enlace copiado')
    const copiado = await page.evaluate(() => (window as unknown as { __copiado: string }).__copiado)
    expect(copiado).toMatch(/\/(p\/VB-[A-Za-z0-9-]+|propiedades\/[a-z0-9-]+)$/i)
    expect(copiado.length).toBeLessThan(80)
    // con hoja nativa: se le entrega el título y el mismo enlace
    await page.evaluate(() => { (navigator as unknown as { share: (d: unknown) => Promise<void> }).share = async (d) => { (window as unknown as { __compartido?: unknown }).__compartido = d } })
    await tarjeta.locator('[data-compartir]').click()
    const dato = await page.evaluate(() => (window as unknown as { __compartido?: { url: string; title: string } }).__compartido)
    expect(dato?.url).toBe(copiado); expect(dato?.title).toBeTruthy()
  })

  test('el mapa llena su panel y «Ver en el mapa» enfoca la propiedad en el centro (no a medias)', async ({ page }) => {
    test.setTimeout(90_000)
    await abrirCatalogo(page)
    const boton = page.getByRole('button', { name: 'Ver mapa' })
    if (await boton.isVisible()) await boton.click()
    const contenedor = page.locator('.mc .leaflet-container').first()
    await expect(contenedor).toBeVisible({ timeout: 30_000 })
    const medidas = await page.evaluate(() => {
      const l = document.querySelector('.mc-lienzo') as HTMLElement, c = document.querySelector('.mc .leaflet-container') as HTMLElement
      return { lienzo: l.getBoundingClientRect().width, mapa: c.getBoundingClientRect().width, alto: c.getBoundingClientRect().height }
    })
    expect(medidas.mapa).toBeGreaterThanOrEqual(medidas.lienzo - 2)
    expect(medidas.alto).toBeGreaterThanOrEqual(280)
    const tarjeta = seccion(page).locator('.tc').first()
    await tarjeta.scrollIntoViewIfNeeded()
    await tarjeta.locator('.tc-ic-mapa').click()
    const sel = page.locator('.mc .mk-sel').first()
    await expect(sel).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1200)   // termina el vuelo del mapa
    const centrado = await page.evaluate(() => {
      const c = document.querySelector('.mc .leaflet-container')!.getBoundingClientRect(), m = document.querySelector('.mc .mk-sel')!.getBoundingClientRect()
      return { dx: Math.abs((m.left + m.width / 2) - (c.left + c.width / 2)) / c.width, dentro: m.left >= c.left && m.right <= c.right }
    })
    expect(centrado.dentro).toBe(true)
    expect(centrado.dx).toBeLessThan(0.12)
    await page.locator('.mc').first().screenshot({ path: join(CAPTURAS, `${test.info().project.name}-mapa-enfocado.png`) })
  })
})

/** Pedido del propietario (22-oct-2026): sin botón «Ver más»; hacer clic en cualquier parte de la tarjeta lleva a la propiedad; los botones siguen con lo suyo. */
test.describe('tarjeta · toda la tarjeta lleva a la ficha y los botones conservan su acción', () => {
  test('clic en el título, el precio o un hueco del cuerpo abre la ficha de ESA propiedad', async ({ page }) => {
    test.setTimeout(150_000)
    await abrirCatalogo(page)   // una sola carga: las rutas simuladas siguen vigentes al volver atrás
    for (const parte of ['.tc-titulo', '.tc-precio', '.tc-zona', '.tc-dir']) {
      await expect(seccion(page)).toBeVisible({ timeout: 30_000 })
      const t = seccion(page).locator('.tc').first()
      await expect(t).toBeVisible({ timeout: 30_000 })
      await page.waitForLoadState('networkidle').catch(() => {})   // al volver atrás el catálogo se vuelve a pintar: se espera a que quede quieto
      const slug = await t.locator('.tc-enlace').getAttribute('href')   // con espera automática: no se lee un nodo a punto de reemplazarse
      expect(slug).toMatch(/^\/propiedades\//)
      await expect(async () => {
        await t.scrollIntoViewIfNeeded()
        const caja = (await t.locator(parte).boundingBox())!
        await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2)   // clic real: lo recibe el enlace estirado de la tarjeta
        await page.waitForURL(`**${slug}`, { timeout: 8_000 })
      }).toPass({ timeout: 40_000 })
      await page.goBack()
    }
  })

  test('tocar la foto abre la ficha; arrastrarla pasa de foto y NO abre nada', async ({ page }) => {
    test.setTimeout(90_000)
    await abrirCatalogo(page)
    const t = seccion(page).locator('.tc').first()
    await t.scrollIntoViewIfNeeded()
    const url0 = page.url()
    const pista = t.locator('.gf-pista')
    const c = (await pista.boundingBox())!
    if (page.viewportSize()!.width >= 900) {   // con ratón: arrastre real
      await page.mouse.move(c.x + c.width * 0.8, c.y + c.height / 2); await page.mouse.down()
      await page.mouse.move(c.x + c.width * 0.2, c.y + c.height / 2, { steps: 8 }); await page.mouse.up()
      await page.waitForTimeout(500)
      expect(page.url()).toBe(url0)
    }
    await pista.click({ position: { x: c.width / 2, y: c.height / 2 } })
    await page.waitForURL(/\/propiedades\/casa-prueba-/, { timeout: 15_000 })
  })

  test('comparar, compartir, mapa y guardar NO abren la ficha (guardar sin sesión lleva a entrar, por diseño)', async ({ page }) => {
    test.setTimeout(90_000)
    // E-53: esta prueba no mide animación. Con el scroll suave activo, «Ver en el mapa» deja la página moviéndose y Playwright ve «Guardar» «no estable»
    // (4 de 5 fallas en 390). Con movimiento reducido el scroll es directo. Solo aquí: aplicado a todo el bloque rompía «clic en el título…» (5/5).
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await abrirCatalogo(page)
    const t = seccion(page).locator('.tc').first()
    await t.scrollIntoViewIfNeeded()
    const ruta0 = new URL(page.url()).pathname
    await t.getByRole('button', { name: /Comparar/ }).click()
    await t.locator('[data-compartir]').click()
    await page.waitForTimeout(500)
    expect(new URL(page.url()).pathname).toBe(ruta0)
    await t.locator('.tc-ic-mapa').click()
    await page.waitForTimeout(400)
    expect(new URL(page.url()).pathname).toBe(ruta0)
    // un solo enlace a la ficha por tarjeta (el título): se recorre con el teclado sin repetirlo
    expect(await t.locator('a[href^="/propiedades/"]').count()).toBe(1)
    // guardar, sin sesión, lleva a entrar; jamás a la ficha de la propiedad
    await t.getByRole('button', { name: /Guardar /i }).click()
    await page.waitForURL('**/entrar**', { timeout: 15_000 })
    expect(page.url()).not.toMatch(/casa-prueba/)
  })
})

/** Pedido del propietario (22-oct-2026): la dirección salía dos veces en la tarjeta (arriba y abajo con el pin). Arriba va el código de la propiedad; la dirección, una vez. */
test.describe('tarjeta · código arriba y dirección una sola vez', () => {
  test('la línea de arriba lleva el folio, no la dirección, y la dirección aparece una sola vez', async ({ page }) => {
    test.setTimeout(90_000)
    await abrirCatalogo(page)
    const t = seccion(page).locator('.tc').first()
    await t.scrollIntoViewIfNeeded()
    const arriba = (await t.locator('.tc-zona').innerText()).trim()
    expect(arriba, 'código de la propiedad arriba').toMatch(/VB-\d{4}-\d{3,6}/)
    const dir = (await t.locator('.tc-dir span').innerText()).trim()
    expect(dir.length).toBeGreaterThan(5)
    const primera = dir.split(',')[0].trim().toLowerCase()
    const cuantas = (await t.innerText()).toLowerCase().split(primera).length - 1
    expect(cuantas, `«${primera}» debe verse una sola vez en la tarjeta`).toBe(1)
  })
})

/** Pedido del propietario (22-oct-2026): la portada de Propiedades se veía borrosa en el teléfono. Se mide que NO se amplíe por encima de su resolución nativa. */
test.describe('portada de Propiedades · nítida en cada ancho', () => {
  test('usa la imagen correcta para el ancho y no se amplía (escala ≤ 1 px de imagen por px de pantalla)', async ({ page }) => {
    test.setTimeout(90_000)
    await abrirCatalogo(page)
    const hero = page.locator('.prop-hero img').first()
    await expect.poll(() => hero.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 20_000 }).toBe(true)
    const m = await hero.evaluate((i: HTMLImageElement) => {
      const r = i.getBoundingClientRect()
      return { fuente: i.currentSrc, nw: i.naturalWidth, nh: i.naturalHeight, w: r.width, h: r.height }
    })
    const ancho = page.viewportSize()!.width
    expect(m.fuente).toMatch(ancho <= 700 ? /propiedades-movil\.webp/ : /\/portadas\/propiedades\.webp/)
    // escala con `object-fit: cover`: el mayor de los dos cocientes. Por encima de 1 la imagen se amplía (y se ve borrosa).
    const escala = Math.max(m.w / m.nw, m.h / m.nh)
    expect(escala, `escala ${escala.toFixed(2)} en ${m.w}×${m.h} con imagen ${m.nw}×${m.nh}`).toBeLessThanOrEqual(1)
    await page.locator('.prop-hero').screenshot({ path: join(CAPTURAS, `${test.info().project.name}-portada.png`) })
  })
})

/** SEO (23-oct-2026): sin JavaScript el servidor entrega solo el respaldo del Suspense; debe traer UN `<h1>` y no quedar vacío para Google. */
test.describe('propiedades · HTML inicial sin JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('trae un h1 con el tema de la página', async ({ page }) => {
    await page.goto('/propiedades')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('h1')).toContainText('Propiedades en venta y renta en León')
  })
})
