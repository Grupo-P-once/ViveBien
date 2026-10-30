import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { acotarTerceros } from './ayudas-red'

/**
 * «Más filtros» del catálogo (28-oct-2026) — navegador REAL contra el build local, a 360/390/768/1024/1440.
 *
 * El catálogo es SINTÉTICO y conocido (5 propiedades con positivos y negativos de cada filtro); se sirve en `/api/catalogo` con o sin consulta. La ruta falsa devuelve SIEMPRE todo (un
 * superconjunto): la exactitud del servidor está probada aparte (tests/catalogo-ruta-filtros.test.ts); aquí se prueba la pantalla —panel, URL, conteo, estados, teclado, desborde— y que el
 * navegador reaplica la regla sobre lo recibido. También se registra la consulta que la página envió al servidor.
 *
 * Fechas en America/Mexico_City (zona del config). Ejecutar: `npx playwright test -c playwright.sesion.config.ts catalogo-mas-filtros --project=v1440`
 * (el ancho lo fija cada bloque; el proyecto solo aporta el navegador).
 */
const ANCHOS = [360, 390, 768, 1024, 1440] as const
const DIA = 86_400_000

type Fila = Record<string, unknown>
let consultas: string[] = []
let fallar = false
let demoraMs = 0
let banderas: Record<string, boolean> = {}

function catalogo(plantilla: Fila): Fila[] {
  const ahora = Date.now()
  const base = (id: string, titulo: string, extra: Fila): Fila => ({
    ...plantilla, id, slug: `prueba-${id}`, folio: `VB-2026-9${id.padStart(4, '0')}`, titulo, tipo: 'casa', subtipo: null, operacion: 'venta', estatus: 'disponible', estado_pub: 'publicada',
    precio: 3_000_000, metros: 150, recamaras: 3, banos: 2, ubicacion: 'León, Gto.', colonia: 'Centro', amenidades: null, descripcion: 'Casa de prueba', videos: [], planos: [], ...extra,
  })
  return [
    base('1', 'Prop A', { banos: 3, metros: 200, ubicacion: 'Calle Álamo', colonia: 'Jardines del Moral', publicada_en: new Date(ahora).toISOString(),
      extras: { caracteristicas: { exteriores: ['alberca', 'terraza'], interiores: ['estudio'], m_terreno: 300, estacionamientos: 2, antiguedad_anos: 0 } }, videos: ['https://www.youtube.com/watch?v=abc'] }),
    base('2', 'Prop B', { banos: 1, metros: 90, publicada_en: new Date(ahora - 20 * DIA).toISOString(),
      extras: { caracteristicas: { exteriores: ['jardin'], estacionamientos: 1, antiguedad_anos: 8 } } }),
    base('3', 'Prop C', { banos: 2, metros: 120, publicada_en: new Date(ahora - 3 * DIA).toISOString(),
      extras: { caracteristicas: { servicios: ['internet'], amenidades_comunes: ['gimnasio'], antiguedad_anos: 30 } }, planos: ['https://res.cloudinary.com/x/plano.jpg'] }),
    base('4', 'Prop D', { banos: 4, metros: 400, publicada_en: new Date(ahora - 60 * DIA).toISOString(), extras: null }),
    base('5', 'Prop E', { banos: 5, metros: 60, ubicacion: 'Avenida Hidalgo', colonia: 'Obregón', publicada_en: new Date(ahora - 10 * DIA).toISOString(),
      extras: { caracteristicas: { estacionamientos: 0, antiguedad_anos: 60 } } }),
  ]
}

async function preparar(page: Page, errores: string[]) {
  consultas = []; fallar = false; demoraMs = 0; banderas = {}
  await acotarTerceros(page)
  await page.route('**/api.open-meteo.com/**', (r) => r.abort())
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|upgrade-insecure-requests|status of 500|catalogo 500/i.test(m.text())) errores.push(m.text()) })
  // plantilla = una fila real del catálogo de la réplica (forma exacta); luego todo es sintético
  const real = await page.request.get('/api/catalogo').then((r) => r.json()).catch(() => ({ propiedades: [{}] })) as { propiedades: Fila[] }
  const plantilla = real.propiedades.find((p) => p.tipo === 'casa') ?? real.propiedades[0] ?? {}
  await page.route('**/api/catalogo**', async (ruta) => {
    const url = new URL(ruta.request().url())
    if (url.search) {
      consultas.push(url.search)
      if (fallar) return ruta.fulfill({ status: 500, json: { error: 'x' } })
      if (demoraMs) await new Promise((r) => setTimeout(r, demoraMs))
    }
    await ruta.fulfill({ json: { propiedades: catalogo(plantilla), desactualizado: false, consultado: new Date().toISOString(), ...(url.search ? { filtrado: true, truncado: false, degradado: false, ...banderas } : {}) } })
  })
}

/** Títulos «Prop X» visibles en tarjetas, ordenados. */
async function visibles(page: Page): Promise<string[]> {
  const txt = await page.locator('.tc').allInnerTexts()
  return txt.map((t) => (t.match(/Prop [A-E]/) ?? [''])[0]).filter(Boolean).sort()
}
async function esperar(page: Page, esperadas: string[]) {
  await expect.poll(async () => (await visibles(page)).filter((v, i, a) => a.indexOf(v) === i), { timeout: 15_000, message: `se esperaban ${esperadas.join(', ') || 'ninguna'}` }).toEqual(esperadas)
}
const abrirPanel = async (page: Page) => {
  const b = page.getByRole('button', { name: /Más filtros/ })
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click()
  await expect(page.locator('#mas-filtros-contenido')).toBeVisible()
}
async function irA(page: Page, query = '') {
  await page.goto(`/propiedades${query}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
}
const sinDesborde = async (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

for (const ancho of ANCHOS) {
  test.describe(`más filtros a ${ancho}px`, () => {
    test.use({ viewport: { width: ancho, height: ancho < 700 ? 800 : 900 }, reducedMotion: 'reduce' })
    test.setTimeout(120_000)
    let errores: string[] = []
    test.beforeEach(async ({ page }) => { errores = []; await preparar(page, errores) })
    test.afterEach(() => { expect(errores, 'errores de JavaScript').toEqual([]) })

    test('el panel muestra los grupos pedidos, NO muestra las opciones sin dato, y no desborda', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      for (const g of ['Superficie', 'Baños', 'Estacionamientos', 'Ambientes', 'Generales', 'Exteriores', 'Servicios', 'Amenidades', 'Multimedia', 'Antigüedad', 'Fecha de publicación']) {
        await expect(page.getByRole('group', { name: g, exact: true }), `grupo ${g}`).toBeVisible()
      }
      await expect(page.getByLabel('Características', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Dirección', { exact: true })).toBeVisible()
      // Opciones que NO tienen dato estructurado: no deben aparecer como funcionales
      const panel = (await page.locator('#mas-filtros-contenido').innerText())
      // control positivo del detector: lo que SÍ se muestra tiene que encontrarse con el mismo método
      expect(panel.toLowerCase().split(/[^\p{L}\p{N}]+/u), 'el detector debe ver «alberca»').toContain('alberca')
      for (const bloqueada of ['Sauna', 'Spa', 'Jacuzzi', 'Recorrido 360', 'Business center', 'Calefacción', 'Tipo de anunciante', 'Inmobiliaria', 'Trato directo', 'Centros comerciales', 'Escuelas cercanas', 'Estacionamiento de visitas', 'En construcción', 'Área de eventos']) {
        // palabra completa: «Spa» no está en «Espacio» ni en «separa»; se compara contra la lista de palabras del panel
        const buscada = bloqueada.toLowerCase().split(' ')
        const palabras = panel.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
        const aparece = palabras.some((_, i) => buscada.every((w, j) => palabras[i + j] === w))
        expect(aparece, `«${bloqueada}» no debe mostrarse`).toBe(false)
      }
      expect(await sinDesborde(page), 'sin desborde horizontal').toBe(true)
    })

    test('«Ver más / Ver menos» abre y cierra las opciones extra, con aria-expanded', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      const amb = page.getByRole('group', { name: 'Ambientes', exact: true })
      const boton = amb.getByRole('button', { name: /Ver (más|menos)/ })
      await expect(boton).toHaveText('Ver más')
      await expect(boton).toHaveAttribute('aria-expanded', 'false')
      await expect(amb.getByLabel('Cocina equipada')).toBeHidden()
      await boton.click()
      await expect(boton).toHaveText('Ver menos')
      await expect(boton).toHaveAttribute('aria-expanded', 'true')
      await expect(amb.getByLabel('Cocina equipada')).toBeVisible()
      expect(await sinDesborde(page)).toBe(true)
      await boton.click()
      await expect(amb.getByLabel('Cocina equipada')).toBeHidden()
    })

    test('aplicar: una opción filtra, va a la URL y se manda a la consulta; «Ver resultados» lleva el foco a los resultados', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      await page.getByRole('group', { name: 'Generales', exact: true }).getByLabel('Alberca').check()
      await esperar(page, ['Prop A'])
      await expect(page).toHaveURL(/gen=alberca/)
      await expect.poll(() => consultas.some((q) => q.includes('gen=alberca')), { message: 'la consulta con el filtro debe llegar al servidor' }).toBe(true)
      await expect(page.getByRole('button', { name: 'Quitar filtro: Alberca' })).toBeVisible()
      await page.getByRole('button', { name: /^Ver \d+ resultado/ }).click()
      await expect(page.locator('#mas-filtros-contenido')).toBeHidden()
      await expect(page.locator('#titulo-resultados')).toBeFocused()
    })

    test('OR dentro de un grupo, AND entre grupos y «N+» como mínimo', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      const ext = page.getByRole('group', { name: 'Exteriores', exact: true })
      await ext.getByLabel('Jardín privado').check()
      await esperar(page, ['Prop B'])
      await ext.getByLabel('Terraza').check()
      await esperar(page, ['Prop A', 'Prop B'])                                   // OR dentro del grupo
      await page.getByRole('button', { name: '3+ baños', exact: true }).click()
      await esperar(page, ['Prop A'])                                             // AND con baños ≥ 3
      await expect(page.getByRole('button', { name: '3+ baños', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: '3+ baños', exact: true }).click()          // quitar el mínimo
      await esperar(page, ['Prop A', 'Prop B'])
    })

    test('estacionamientos: «0» es «sin estacionamiento declarado»; 1+ no lo incluye', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      await page.getByRole('button', { name: '0 estacionamientos', exact: true }).click()
      await esperar(page, ['Prop E'])
      await page.getByRole('button', { name: '2+ estacionamientos', exact: true }).click()
      await esperar(page, ['Prop A'])
    })

    test('superficie, antigüedad, fecha de publicación y multimedia', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      await page.getByLabel('Superficie de terreno desde (m²)').fill('250')
      await esperar(page, ['Prop A'])
      await page.getByLabel('Superficie de terreno desde (m²)').fill('')
      await page.getByLabel('Superficie construida desde (m²)').fill('100')
      await page.getByLabel('Superficie construida hasta (m²)').fill('250')
      await esperar(page, ['Prop A', 'Prop C'])
      await page.getByLabel('Superficie construida desde (m²)').fill('')
      await page.getByLabel('Superficie construida hasta (m²)').fill('')
      await page.getByRole('radio', { name: 'A estrenar' }).check()
      await esperar(page, ['Prop A'])
      await page.getByRole('radio', { name: 'Hasta 10 años' }).check()
      await esperar(page, ['Prop A', 'Prop B'])
      await page.getByRole('radio', { name: 'Más de 50 años' }).check()
      await esperar(page, ['Prop E'])
      await page.getByRole('radio', { name: 'Cualquiera' }).first().check()
      await page.getByRole('radio', { name: 'Hoy' }).check()
      await esperar(page, ['Prop A'])
      await page.getByRole('radio', { name: 'Últimos 7 días' }).check()
      await esperar(page, ['Prop A', 'Prop C'])
      await page.getByRole('radio', { name: 'Cualquiera' }).nth(1).check()
      await page.getByRole('group', { name: 'Multimedia', exact: true }).getByLabel('Planos').check()
      await esperar(page, ['Prop C'])
    })

    test('dirección sin acentos ni mayúsculas, y características en texto', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      await page.getByLabel('Dirección', { exact: true }).fill('ALAMO')
      await esperar(page, ['Prop A'])
      await page.getByLabel('Dirección', { exact: true }).fill('')
      await page.getByLabel('Características', { exact: true }).fill('terraza')
      await esperar(page, ['Prop A'])
      await page.getByLabel('Características', { exact: true }).fill('terraza, sauna')               // «sauna» no existe como dato: no coincide ninguna
      await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible({ timeout: 15_000 })
    })

    test('rango invertido: se intercambia y se DICE; un valor inválido en la URL no cuenta como filtro', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      await page.getByLabel('Superficie construida desde (m²)').fill('250')
      await page.getByLabel('Superficie construida hasta (m²)').fill('100')
      await expect(page.getByText('los intercambiamos')).toBeVisible()
      await esperar(page, ['Prop A', 'Prop C'])
      await irA(page, '?ban=abc&cmin=-5&gen=inventada&ant=nunca')
      await expect(page.locator('#titulo-resultados')).toHaveCount(0)               // sin filtro activo no hay encabezado de resultados
      await expect(page.locator('.mf-activos')).toHaveCount(0)                       // ni etiquetas de filtros activos
      await expect.poll(async () => (await visibles(page)).length).toBeGreaterThan(0)
    })

    test('«Limpiar» del panel quita los filtros del panel y conserva operación/tipo/zona', async ({ page }) => {
      await irA(page, '?op=venta&tipo=casa')
      await abrirPanel(page)
      await page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Jardín privado').check()
      await esperar(page, ['Prop B'])
      await page.locator('.mf-acciones').getByRole('button', { name: 'Limpiar', exact: true }).click()
      await expect(page).toHaveURL(/op=venta/)
      await expect(page).not.toHaveURL(/ext=/)
      await esperar(page, ['Prop A', 'Prop B', 'Prop C', 'Prop D', 'Prop E'])
    })

    test('la URL restaura los filtros: recarga, atrás y adelante', async ({ page }) => {
      await irA(page, '?gen=alberca&ban=3')
      await esperar(page, ['Prop A'])
      await abrirPanel(page)
      await expect(page.getByRole('group', { name: 'Generales', exact: true }).getByLabel('Alberca')).toBeChecked()
      await expect(page.getByRole('button', { name: '3+ baños', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.reload()
      await esperar(page, ['Prop A'])
      await irA(page, '?ext=jardin')
      await esperar(page, ['Prop B'])
      await page.goBack()
      await esperar(page, ['Prop A'])
      await page.goForward()
      await esperar(page, ['Prop B'])
    })

    test('`?op=Venta` y `?op=venta` dan lo mismo', async ({ page }) => {
      await irA(page, '?op=Venta&gen=alberca')
      await esperar(page, ['Prop A'])
      await expect(page.getByRole('button', { name: 'Limpiar', exact: true }).first()).toBeVisible()
    })

    test('error de la consulta: lo dice, ofrece reintentar y se recupera', async ({ page }) => {
      await irA(page)
      fallar = true
      await abrirPanel(page)
      await page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Balcón').check()
      await expect(page.getByRole('alert').filter({ hasText: 'No pudimos consultar los filtros' })).toBeVisible({ timeout: 15_000 })
      fallar = false
      await page.getByRole('button', { name: 'Reintentar' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'No pudimos consultar los filtros' })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible({ timeout: 15_000 })   // nadie tiene balcón
    })

    test('carga: mientras responde el servidor se dice «Buscando…» y no se afirma un conteo', async ({ page }) => {
      await irA(page)
      demoraMs = 2500
      await abrirPanel(page)
      await page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Terraza').check()
      await expect(page.locator('.mf-conteo')).toHaveText('Buscando…')
      await esperar(page, ['Prop A'])
      await expect(page.locator('.mf-conteo')).toHaveText(/1 resultado/)
    })

    test('resultado PARCIAL: el tope de 500 y la base caída (copia vieja) se avisan; un resultado completo no lleva aviso', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      const aviso = page.locator('[data-resultado-parcial]')
      await page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Terraza').check()
      await esperar(page, ['Prop A'])
      await expect(aviso, 'completo: sin aviso').toHaveCount(0)
      banderas = { truncado: true }
      await page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Jardín privado').check()
      await expect(aviso).toContainText('más de 500')
      banderas = { truncado: true, degradado: true, desactualizado: true }
      await page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Patio').check()
      await expect(aviso).toContainText('INCOMPLETOS')
      banderas = { degradado: true, desactualizado: true }
      await page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Balcón').check()
      await expect(aviso).toContainText('copia reciente')
    })

    test('teclado: Tab llega al botón, Enter abre, Espacio marca, el foco siempre se ve', async ({ page }) => {
      await irA(page)
      const boton = page.getByRole('button', { name: /Más filtros/ })
      await boton.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('#mas-filtros-contenido')).toBeVisible()
      const casilla = page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Terraza')
      await casilla.focus()
      await page.keyboard.press('Space')
      await expect(casilla).toBeChecked()
      await esperar(page, ['Prop A'])
      // el foco tiene contorno visible
      const contorno = await casilla.evaluate((el) => getComputedStyle(el).outlineStyle !== 'none' && parseFloat(getComputedStyle(el).outlineWidth) >= 2)
      expect(contorno, 'contorno de foco visible').toBe(true)
      // Ver más con teclado
      const mas = page.getByRole('group', { name: 'Ambientes', exact: true }).getByRole('button', { name: 'Ver más' })
      await mas.focus(); await page.keyboard.press('Enter')
      await expect(page.getByRole('group', { name: 'Ambientes', exact: true }).getByLabel('Cocina equipada')).toBeVisible()
    })

    test('accesibilidad: axe sin infracciones con el panel abierto y todo desplegado; cada control tiene nombre', async ({ page }) => {
      await irA(page)
      await abrirPanel(page)
      for (const g of ['Ambientes', 'Generales']) await page.getByRole('group', { name: g, exact: true }).getByRole('button', { name: 'Ver más' }).click()
      await page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Terraza').check()
      const r = await new AxeBuilder({ page }).include('#mas-filtros-contenido').include('.mf-activos').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
      // el conteo es una región viva
      await expect(page.locator('.mf-conteo')).toHaveAttribute('aria-live', 'polite')
      expect(await sinDesborde(page)).toBe(true)
    })
  })
}
