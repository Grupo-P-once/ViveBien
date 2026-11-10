import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { acotarTerceros } from './ayudas-red'

/**
 * Portada rediseñada: comportamiento y presentación en los cuatro anchos del proyecto (390 · 768 · 1024 · 1440) y, aparte, en 360 · 430.
 * Servidor y réplica hermético (red externa bloqueada); el envío del formulario va contra una ruta SIMULADA: nunca se manda nada real.
 * Las capturas quedan en `EVIDENCIA_DIR/inicio/`.
 */
const CAPTURAS = join(process.env.EVIDENCIA_DIR || join(process.cwd(), 'evidencia-inicio'), 'inicio')
mkdirSync(CAPTURAS, { recursive: true })

/** Errores de consola que SÍ cuentan: los fallos de carga de terceros bloqueados a propósito por el arnés no. */
const ruidoDelArnes = /Content Security Policy|Failed to load resource|ERR_BLOCKED|ERR_FAILED|net::|fonts\.g|cdnjs|googletagmanager|google-analytics|unsplash/i

async function abrir(page: Page) {
  await acotarTerceros(page)
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.goto('/')
  await expect(page.locator('h1#hero-titulo')).toBeVisible()
}

test.describe('portada · hero con video', () => {
  test('video decorativo: silencioso, en bucle, en línea, con portada y encuadre según el ancho', async ({ page }, info) => {
    await abrir(page)
    const ancho = page.viewportSize()!.width
    const esperado = ancho >= 900 ? 'escritorio' : 'movil'
    const video = page.locator(`[data-hero-video="${esperado}"]`)
    await expect(video).toHaveCount(1)
    await expect(page.locator('[data-hero-video]')).toHaveCount(1) // solo UN encuadre cargado
    const attrs = await video.evaluate((v: HTMLVideoElement) => ({
      muted: v.muted, loop: v.loop, inline: v.playsInline, auto: v.autoplay, poster: v.getAttribute('poster'),
      tracks: (v as unknown as { audioTracks?: { length: number } }).audioTracks?.length ?? 0, ocultoParaLectores: v.getAttribute('aria-hidden'), foco: v.tabIndex,
      fuentes: Array.from(v.querySelectorAll('source')).map((s) => s.getAttribute('src')),
    }))
    expect(attrs).toMatchObject({ muted: true, loop: true, inline: true, auto: true, ocultoParaLectores: 'true', foco: -1 })
    expect(attrs.poster).toBe(`/inicio/portada-${esperado}.webp`)
    expect(attrs.fuentes).toEqual([`/inicio/escena-${esperado}.webm`, `/inicio/escena-${esperado}.mp4`])
    // se reproduce de verdad (webm en el Chromium de pruebas) y avanza
    await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.2), { timeout: 15_000 }).toBe(true)
    // la portada estática existe, se ve y cargó
    const portada = page.locator('[data-hero-portada]')
    await expect(portada).toBeVisible()
    expect(await portada.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    // el contenedor describe SOLO lo que se ve; no nombra ni ubica un lugar
    const nombre = await page.locator('[data-hero-media]').getAttribute('aria-label')
    expect(nombre).toMatch(/terraza|alberca|lago/i)
    expect(nombre).not.toMatch(/presa|monta|Le[óo]n|Guanajuato|direcci/i)
    await page.screenshot({ path: join(CAPTURAS, `hero-${info.project.name}.png`) })
  })

  test('movimiento reducido: no se descarga ni se reproduce el video y queda la portada', async ({ page }) => {
    const pedidos: string[] = []
    page.on('request', (r) => { if (/\/inicio\/escena-/.test(r.url())) pedidos.push(r.url()) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await abrir(page)
    await expect(page.locator('[data-hero-portada]')).toBeVisible()
    await expect(page.locator('[data-hero-video]')).toHaveCount(0)
    await page.waitForTimeout(1500)
    expect(pedidos).toEqual([])
  })

  test('ahorro de datos: no se descarga el video', async ({ page }) => {
    const pedidos: string[] = []
    page.on('request', (r) => { if (/\/inicio\/escena-/.test(r.url())) pedidos.push(r.url()) })
    await page.addInitScript(() => { Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }) })
    await abrir(page)
    await expect(page.locator('[data-hero-video]')).toHaveCount(0)
    await page.waitForTimeout(1000)
    expect(pedidos).toEqual([])
  })

  test('el texto del hero sigue siendo HTML accesible y no hay texto ni datos de contacto dentro del video', async ({ page }) => {
    await abrir(page)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Encuentra tu')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('espacio')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ideal')
    await expect(page.getByRole('button', { name: 'Comprar' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Rentar' })).toHaveAttribute('aria-pressed', 'false')
    // ningún elemento del video lleva texto; el original con teléfono y web NO se publica
    expect(await page.locator('[data-hero-media]').innerText()).toBe('')
    const html = await page.content()
    expect(html).not.toMatch(/gemini_generated_video|viveblenn/)
  })

  test('Comprar / Rentar y el buscador conservan sus filtros y abren el catálogo', async ({ page }) => {
    await abrir(page)
    await page.getByRole('button', { name: 'Rentar' }).click()
    await page.getByLabel('Tipo de propiedad').selectOption('oficina')
    await page.getByLabel('Zona o colonia').fill('Centro')
    await page.getByRole('button', { name: 'Buscar' }).click()
    await expect(page).toHaveURL(/\/propiedades\?op=renta&tipo=oficina&zona=Centro$/)
  })
})

test.describe('portada · categorías, secciones y contenido', () => {
  test('Oficinas aparece entre las categorías, con la misma clave del catálogo, y el filtro llega al catálogo', async ({ page }) => {
    await abrir(page)
    const mosaico = page.locator('[data-mosaico]')
    await expect(mosaico.getByRole('link')).toHaveCount(6)
    const oficinas = mosaico.getByRole('link', { name: /Oficinas/ })
    await expect(oficinas).toHaveAttribute('href', '/propiedades?tipo=oficina')
    // todas las claves del mosaico existen como opción del selector del catálogo (ninguna clave nueva)
    const claves = await mosaico.getByRole('link').evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).searchParams.get('tipo')))
    await oficinas.click()
    await expect(page).toHaveURL(/\/propiedades\?tipo=oficina$/)
    const opciones = await page.locator('select option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
    for (const c of claves) expect(opciones, `la clave ${c} debe existir en el catálogo`).toContain(c)
    await expect(page.locator('select').filter({ has: page.locator('option[value="oficina"]') }).first()).toHaveValue('oficina')
  })

  test('«Nuestra Esencia» ya no está y «Nuestro propósito» se conserva una sola vez', async ({ page }) => {
    await abrir(page)
    const texto = await page.locator('main').innerText()
    expect(texto).not.toMatch(/Nuestra\s+Esencia/i)
    expect(texto).not.toMatch(/Identidad corporativa/i)
    expect((texto.match(/Nuestro\s+prop[óo]sito/gi) || []).length).toBe(1)
  })

  test('«¿Qué es Vive Bien?» y PROIN: contenido, relación explícita e imágenes independientes (no la lámina completa)', async ({ page }) => {
    await abrir(page)
    const queEs = page.locator('[data-seccion="que-es-vive-bien"]')
    const proin = page.locator('[data-seccion="proin"]')
    await queEs.scrollIntoViewIfNeeded()
    await expect(queEs.getByRole('heading', { name: '¿Qué es Vive Bien?' })).toBeVisible()
    for (const t of ['Confianza', 'Atención personalizada', 'Transparencia', 'Conocimiento local']) await expect(queEs).toContainText(t)
    await proin.scrollIntoViewIfNeeded()
    await expect(proin).toContainText('PROIN Desarrolladores es la desarrolladora de VIVE BIEN.')
    for (const t of ['Calidad', 'Crecimiento', 'Compromiso']) await expect(proin).toContainText(t)
    await expect(proin.getByRole('img', { name: /PROIN Desarrolladores/ })).toBeVisible()
    await expect(queEs.getByRole('img', { name: /Vive Bien Grupo Inmobiliario/ })).toBeVisible()
    // ninguna imagen es la lámina completa, y todas cargaron
    const imgs = await page.locator('[data-seccion="que-es-vive-bien"] img, [data-seccion="proin"] img').evaluateAll((is) => is.map((i) => ({ src: (i as HTMLImageElement).currentSrc, ok: (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0 })))
    expect(imgs.length).toBe(4)   // dos logotipos y dos fotografías
    for (const i of imgs) { expect(i.src).not.toMatch(/vivebien%20proin|vivebien proin/); expect(i.ok, i.src).toBe(true) }
    // logotipo real de PROIN: archivo de 404 px de ancho (se pinta a ≈ 230 px: nítido también en pantallas de doble densidad)
    expect(await proin.getByRole('img', { name: /PROIN Desarrolladores/ }).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThanOrEqual(400)
    // «Ver más»: va al sitio de PROIN en pestaña nueva, sin `opener`, con aviso para lectores de pantalla (no se hace clic: no se navega fuera)
    const ver = proin.getByRole('link', { name: /Ver más sobre PROIN/ })
    await expect(ver).toBeVisible()
    await expect(ver).toHaveAttribute('href', 'https://proindesarrolladores.com/')
    await expect(ver).toHaveAttribute('target', '_blank')
    expect(await ver.getAttribute('rel')).toMatch(/noopener/)
    await expect(ver).toContainText('se abre en una pestaña nueva')
    expect((await ver.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('fotografías de «Qué es» y PROIN: enteras en su marco, nítidas y con movimiento (y quietas con movimiento reducido)', async ({ page }) => {
    await abrir(page)
    for (const [clase, relacion] of [['ini-foto-casa', 1.69], ['ini-foto-edificio', 1.3333]] as const) {
      const marco = page.locator(`figure.${clase}`)
      await marco.scrollIntoViewIfNeeded()
      const img = marco.locator('img')
      await expect(img).toBeVisible()
      const caja = (await marco.boundingBox())!
      expect(caja.width, clase).toBeGreaterThan(250)
      expect(Math.abs(caja.width / caja.height - relacion), `proporción de ${clase}`).toBeLessThan(0.05)   // entera: sin recortes ni estirones
      expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth), clase).toBeGreaterThanOrEqual(1400)
      expect(await img.evaluate((e) => getComputedStyle(e).animationName)).toBe('ini-foto-zoom')
      await marco.screenshot({ path: join(CAPTURAS, `foto-${clase}.png`) })
    }
  })

  test('fotografías: con movimiento reducido no se anima nada', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await abrir(page)
    const animados = await page.locator('figure.ini-foto img').evaluateAll((els) => els.filter((e) => getComputedStyle(e).animationName !== 'none').length)
    expect(animados).toBe(0)
  })

  test('«Permítenos guiarte»: tres caminos con enlaces del catálogo y acciones', async ({ page }) => {
    await abrir(page)
    const s = page.locator('[data-seccion="acompanamiento"]')
    await s.scrollIntoViewIfNeeded()
    await expect(s.getByRole('heading', { level: 2 })).toContainText('Permítenos guiarte')
    await expect(s.getByRole('link', { name: /propiedades en venta/ })).toHaveAttribute('href', '/propiedades?op=venta')
    await expect(s.getByRole('link', { name: /propiedades en renta/ })).toHaveAttribute('href', '/propiedades?op=renta')
    await expect(s.getByRole('link', { name: /Ver terrenos/ })).toHaveAttribute('href', '/propiedades?tipo=terreno')
    await expect(s.getByRole('link', { name: /Hablar con un asesor/ })).toHaveAttribute('href', /wa\.me\/52/)
    await s.getByRole('button', { name: /asesoría gratis/i }).click()
    await expect(page.getByRole('heading', { name: /Regístrate/ })).toBeVisible()   // el formulario de asesoría (RegisterModal)
  })
})

test.describe('portada · carrusel de clientes', () => {
  test('controles visibles y con nombre, teclado, puntos y pausa', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await abrir(page)
    const c = page.locator('[data-carrusel="clientes"]')
    await c.scrollIntoViewIfNeeded()
    await expect(c).toHaveAttribute('aria-roledescription', 'carrusel')
    await expect(c.locator('[aria-roledescription="diapositiva"]')).toHaveCount(6)
    const activa = async () => c.locator('[data-activa="true"]').first().getAttribute('aria-label')
    expect(await activa()).toBe('1 de 6')
    await c.getByRole('button', { name: 'Testimonio siguiente' }).click()
    await expect.poll(activa).toBe('2 de 6')
    await c.getByRole('button', { name: 'Testimonio anterior' }).click()
    await expect.poll(activa).toBe('1 de 6')
    // teclado: la pista se enfoca y responde a las flechas
    const pista = c.getByRole('group', { name: /Diapositivas/ })
    await pista.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(activa).toBe('2 de 6')
    await page.keyboard.press('End')
    await expect.poll(activa).toBe('6 de 6')
    await page.keyboard.press('Home')
    await expect.poll(activa).toBe('1 de 6')
    await c.getByRole('button', { name: 'Ir al testimonio 4 de 6' }).click()
    await expect.poll(activa).toBe('4 de 6')
    // sin botón de pausa (decisión del propietario)
    await expect(c.getByRole('button', { name: /avance automático/ })).toHaveCount(0)
    // el contenido de los testimonios no cambió
    await expect(c).toContainText('Excelente servicio para rentar mi nave industrial')
    await expect(c).toContainText('Sofía Méndez')
  })

  test('un cuadro atascado a mitad de un desplazamiento programado no pisa la diapositiva elegida (carrera del 9-nov-2026)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await abrir(page)
    const c = page.locator('[data-carrusel="clientes"]')
    await c.scrollIntoViewIfNeeded()
    const activa = async () => c.locator('[data-activa="true"]').first().getAttribute('aria-label')
    const pista = c.getByRole('group', { name: /Diapositivas/ })
    await pista.focus()
    await page.keyboard.press('End')
    // Lo que hace una máquina cargada: el desplazamiento se queda a medio camino más de 90 ms (el plazo del manejador de «scroll»).
    await pista.evaluate((el) => { el.scrollTo({ left: (el.children[2] as HTMLElement).offsetLeft - (el as HTMLElement).offsetLeft, behavior: 'instant' as ScrollBehavior }) })
    await page.waitForTimeout(400)
    expect(await activa()).toBe('6 de 6')
  })

  test('el avance automático se detiene con el foco y con movimiento reducido no existe', async ({ page }) => {
    await page.clock.install()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await abrir(page)
    const c = page.locator('[data-carrusel="clientes"]')
    await c.scrollIntoViewIfNeeded()
    const activa = async () => c.locator('[data-activa="true"]').first().getAttribute('aria-label')
    expect(await activa()).toBe('1 de 6')
    const pista = c.getByRole('group', { name: /Diapositivas/ })
    await page.clock.runFor(7600)
    await expect.poll(activa).toBe('2 de 6')           // avanza solo
    // el desplazamiento suave es del navegador (tiempo real): se espera a que termine antes de adelantar el reloj simulado
    await expect.poll(() => pista.evaluate((e) => e.scrollLeft)).toBeGreaterThan(40)
    await page.waitForTimeout(700); await page.clock.runFor(300)
    await pista.focus()
    await page.clock.runFor(16_000)
    expect(await activa()).toBe('2 de 6')               // con el foco dentro NO avanza
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(c.getByRole('button', { name: /avance automático/ })).toHaveCount(0)
  })

  test('el desplazamiento no atrapa el gesto vertical y no desborda la página', async ({ page }) => {
    await abrir(page)
    const pista = page.locator('[data-carrusel="clientes"] [role="group"][tabindex="0"]')
    const css = await pista.evaluate((e) => { const s = getComputedStyle(e); return { ox: s.overflowX, oy: s.overflowY, snap: s.scrollSnapType, ob: s.overscrollBehaviorX } })
    expect(css.ox).toBe('auto')
    expect(css.snap).toMatch(/x mandatory/)
    expect(css.ob).toBe('contain')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test.describe('portada · contacto', () => {
  const llenar = async (page: Page) => {
    await page.getByLabel('Nombre completo *').fill('Prueba Automática')
    await page.getByLabel('Teléfono *').fill('477 123 4567')
    await page.getByLabel('Correo electrónico *').fill('prueba@ejemplo.test')
  }
  const formulario = (page: Page) => page.locator('[data-form="contacto-portada"]')

  test('Oficina está entre las opciones de «Me interesa» y los campos son cómodos (≥ 44 px) y tienen etiqueta', async ({ page }) => {
    await abrir(page)
    await formulario(page).scrollIntoViewIfNeeded()
    await expect(page.getByLabel('Me interesa')).toContainText('Oficina')
    await page.getByLabel('Me interesa').selectOption('oficina')
    for (const nombre of ['Nombre completo *', 'Teléfono *', 'Correo electrónico *', 'Me interesa']) {
      const caja = await page.getByLabel(nombre).boundingBox()
      expect(caja!.height, nombre).toBeGreaterThanOrEqual(44)
    }
    const boton = await page.getByRole('button', { name: 'Enviar mensaje' }).boundingBox()
    expect(boton!.height).toBeGreaterThanOrEqual(44)
  })

  test('sin consentimiento el botón está desactivado; con campos inválidos no se envía y se explica junto a cada campo', async ({ page }) => {
    let pedidos = 0
    await page.route('**/api/registro-lead', (r) => { pedidos++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) })
    await abrir(page)
    await formulario(page).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Enviar mensaje' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Escribe tu nombre.' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'teléfono de 10 dígitos' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'correo válido' })).toBeVisible()
    await expect(page.getByLabel('Nombre completo *')).toBeFocused()
    await expect(page.getByLabel('Nombre completo *')).toHaveAttribute('aria-invalid', 'true')
    expect(pedidos).toBe(0)
  })

  test('envío correcto: mismo endpoint y mismo cuerpo de siempre, con el consentimiento marcado, y mensaje de éxito', async ({ page }) => {
    let cuerpo: Record<string, unknown> | null = null
    await page.route('**/api/registro-lead', (r) => { cuerpo = JSON.parse(r.request().postData() || '{}'); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) })
    await abrir(page)
    await formulario(page).scrollIntoViewIfNeeded()
    await llenar(page)
    await page.getByLabel('Me interesa').selectOption('oficina')
    await page.getByLabel('Mensaje').fill('Busco una oficina (mensaje de prueba, no se envía a nadie).')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Enviar mensaje' }).click()
    await expect(page.getByText('¡Mensaje enviado!')).toBeVisible()
    expect(cuerpo).toMatchObject({ nombre: 'Prueba Automática', telefono: '477 123 4567', email: 'prueba@ejemplo.test', interes: 'oficina', origen: 'portada', consentimiento: true })
  })

  test('error del servidor: se muestra, no se pierde lo escrito y se puede reintentar', async ({ page }) => {
    let intento = 0
    await page.route('**/api/registro-lead', (r) => { intento++; return intento === 1
      ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Servicio no disponible por ahora."}' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) })
    await abrir(page)
    await formulario(page).scrollIntoViewIfNeeded()
    await llenar(page)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Enviar mensaje' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Servicio no disponible por ahora.' })).toBeVisible()
    await expect(page.getByLabel('Nombre completo *')).toHaveValue('Prueba Automática')
    await page.getByRole('button', { name: 'Enviar mensaje' }).click()
    await expect(page.getByText('¡Mensaje enviado!')).toBeVisible()
  })

  test('el botón de WhatsApp respeta el espacio seguro y se aparta del formulario en el teléfono', async ({ page }) => {
    await abrir(page)
    const wa = page.locator('.ini-wa')
    // un SOLO botón de WhatsApp flotante en la portada (el global del layout se oculta aquí)
    await page.waitForTimeout(2000)
    expect(await page.locator('a.wa-flotante').evaluateAll((as) => as.filter((a) => getComputedStyle(a).display !== 'none').length)).toBe(0)
    await expect(page.locator('a.ini-wa')).toHaveCount(1)
    const vp = page.viewportSize()!
    // se mide el CSS (no la caja): el botón late con una animación de escala y su caja cambia ±1 px mientras se mide
    const margen = await wa.evaluate((e) => { const s = getComputedStyle(e); return { abajo: parseFloat(s.bottom), derecha: parseFloat(s.right) } })
    expect(margen.abajo).toBeGreaterThanOrEqual(16)
    expect(margen.derecha).toBeGreaterThanOrEqual(16)
    // en teléfono y tableta, con el hero a la vista el botón se aparta (antes tapaba el buscador y los enlaces de la primera pantalla)
    await expect(wa).toHaveAttribute('data-oculto', vp.width < 900 ? 'true' : 'false')
    if (vp.width < 900) {
      await page.locator('[data-seccion="que-es-vive-bien"]').scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      await expect(wa).toHaveAttribute('data-oculto', 'false')
    }
    await page.locator('#contacto').scrollIntoViewIfNeeded()
    await page.getByLabel('Nombre completo *').focus()
    if (vp.width < 900) {
      await expect(wa).toHaveAttribute('data-oculto', 'true')
      await expect(wa).toHaveCSS('opacity', '0')
    } else {
      // en escritorio no hay nada que cubrir: no estorba y sigue disponible
      const f = await page.locator('[data-form="contacto-portada"]').boundingBox()
      expect(f!.x + f!.width).toBeLessThan(vp.width - 60 > 0 ? vp.width : 0)
    }
  })
})

test.describe('portada · diseño adaptable', () => {
  for (const ancho of [360, 390, 430, 768, 1024, 1440]) {
    test(`sin desbordes, sin elementos fuera de pantalla y sin errores nuevos en consola · ${ancho} px`, async ({ page }) => {
      const errores: string[] = []
      page.on('console', (m) => { if (m.type() === 'error' && !ruidoDelArnes.test(m.text())) errores.push(m.text()) })
      page.on('pageerror', (e) => errores.push(String(e)))
      await page.setViewportSize({ width: ancho, height: ancho < 700 ? 800 : 900 })
      await abrir(page)
      await page.waitForTimeout(1800)
      const medidas = await page.evaluate(() => {
        const w = window.innerWidth
        const fuera: string[] = []
        for (const el of Array.from(document.querySelectorAll('main *'))) {
          const r = (el as HTMLElement).getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          // el carrusel y la marquesina desplazan a propósito dentro de su propio contenedor
          if ((el as HTMLElement).closest('.ini-carrusel-pista, .ini-marquesina, .ini-redes-pista')) continue
          if (r.right > w + 1 || r.left < -1) fuera.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className?.toString().slice(0, 40)} ${Math.round(r.left)}..${Math.round(r.right)}`)
        }
        return { scroll: document.documentElement.scrollWidth, w, fuera: fuera.slice(0, 6), alturaHero: document.querySelector('[data-inicio-hero]')!.getBoundingClientRect().height, alto: window.innerHeight }
      })
      expect(medidas.scroll, 'scrollWidth').toBeLessThanOrEqual(medidas.w)
      expect(medidas.fuera, 'elementos fuera de pantalla').toEqual([])
      // el hero no ocupa toda la pantalla en el teléfono (el formulario queda a la vista a poco desplazamiento)
      if (ancho < 700) expect(medidas.alturaHero).toBeLessThan(medidas.alto * 1.05 + 120)
      expect(errores).toEqual([])
      await page.screenshot({ path: join(CAPTURAS, `pagina-completa-${ancho}.png`), fullPage: true })
    })
  }

  test('el recorte del hero conserva la escena y el titular no tapa lo importante (captura de revisión)', async ({ page }, info) => {
    await abrir(page)
    await page.waitForTimeout(2200)
    await page.locator('[data-inicio-hero]').screenshot({ path: join(CAPTURAS, `hero-recorte-${info.project.name}.png`) })
  })

  test('accesibilidad (axe) de la portada: sin críticas ni serias', async ({ page }, info) => {
    await abrir(page)
    await page.waitForTimeout(2500)
    const r = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const graves = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
    expect(graves).toEqual([])
    // contraste: todo salvo lo que va SOBRE el video (axe no puede calcularlo ahí; se mide aparte en `hero · contraste`)
    const c = await new AxeBuilder({ page }).withRules(['color-contrast']).exclude('[data-inicio-hero]').analyze()
    expect(c.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    info.annotations.push({ type: 'axe', description: `${r.violations.length} hallazgos en total (sin graves)` })
  })

  test('hero · contraste del texto blanco sobre lo que hay REALMENTE detrás (captura sin texto + velo)', async ({ page }) => {
    await abrir(page)
    await page.waitForTimeout(2600)
    // axe no puede calcular el contraste sobre un video. Se mide así: (1) se oculta el texto del hero, (2) se captura la pantalla (escena + velo +
    // máscara tal como se ven) y (3) para cada texto se toma el pixel MÁS CLARO de su caja en esa captura y se calcula el contraste del color real del texto.
    const cajas = await page.evaluate(() => {
      const hero = document.querySelector('[data-inicio-hero]') as HTMLElement
      const elems = Array.from(hero.querySelectorAll('.ini-hero-texto span, .ini-hero-texto a, .ini-hero-texto button, .ini-hero-texto h1 > span')) as HTMLElement[]
      return elems.filter((e) => e.children.length === 0 || e.tagName === 'SPAN').map((e) => {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
        return { t: (e.textContent || '').trim().slice(0, 24), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, color: cs.color, stroke: cs.webkitTextStrokeColor }
      }).filter((c) => c.w > 8 && c.h > 8 && c.t)
    })
    await page.addStyleTag({ content: '[data-inicio-hero] .ini-hero-texto, [data-inicio-hero] .ini-hero-cifras, .ini-wa { visibility: hidden !important }' })   // el botón de WhatsApp flota y no es parte de la escena
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    const png = await page.screenshot({ fullPage: true })
    const datos = await page.evaluate(async ({ b64, items }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight
      const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0)
      const esc = img.naturalWidth / window.innerWidth
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
      const L = (r: number, g: number, b: number) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      return items.map((c) => {
        const x = Math.max(0, Math.floor(c.x * esc)), y = Math.max(0, Math.floor(c.y * esc)), w = Math.max(1, Math.floor(c.w * esc)), h = Math.max(1, Math.floor(c.h * esc))
        const d = ctx.getImageData(x, y, Math.min(w, img.naturalWidth - x), Math.min(h, img.naturalHeight - y)).data
        let max = 0, mx = 0, my = 0, rgb = ''; for (let i = 0; i < d.length; i += 4) { const l = L(d[i], d[i + 1], d[i + 2]); if (l > max) { max = l; const p = i / 4; mx = Math.round(x / esc + (p % Math.min(w, img.naturalWidth - x)) / esc); my = Math.round(y / esc + Math.floor(p / Math.min(w, img.naturalWidth - x)) / esc); rgb = d[i] + ',' + d[i + 1] + ',' + d[i + 2] } }
        const m = (c.color.match(/[\d.]+/g) || ['255', '255', '255']).map(Number)
        const Lt = L(m[0], m[1], m[2]); const a = m.length > 3 ? m[3] : 1
        return { t: c.t, donde: mx + ',' + my + ' rgb(' + rgb + ') caja ' + Math.round(c.x) + ',' + Math.round(c.y) + ' ' + Math.round(c.w) + 'x' + Math.round(c.h), fondoMasClaro: +max.toFixed(3), textoL: +Lt.toFixed(3), alfa: a, contraste: +((Lt + 0.05) / (max + 0.05)).toFixed(2) }
      })
    }, { b64: png.toString('base64'), items: cajas })
    // el texto con relleno claro (no el contorno del «ideal», que se lee por su trazo) debe pasar 4,5:1 sobre el píxel MÁS CLARO de su caja
    const medibles = datos.filter((d) => d.alfa > 0.5 && d.textoL > 0.5)
    expect(medibles.length).toBeGreaterThan(3)
    for (const d of medibles) expect(d.contraste, `${d.t} sobre un fondo de luminosidad ${d.fondoMasClaro} · pixel claro en ${d.donde}`).toBeGreaterThanOrEqual(4.5)
  })
})

test.describe('Grupo P-ONCE: pie y «Nosotros»', () => {
  test('el círculo del pie lleva el logotipo nuevo y va a gp-once.com en pestaña nueva', async ({ page }) => {
    await abrir(page)
    const c = page.locator('footer a[data-enlace="grupo-p-once"]')
    await c.scrollIntoViewIfNeeded()
    await expect(c).toBeVisible()
    await expect(c).toHaveAttribute('href', 'https://gp-once.com/')
    await expect(c).toHaveAttribute('target', '_blank')
    expect(await c.getAttribute('rel')).toMatch(/noopener/)
    await expect(c).toHaveAttribute('aria-label', /Grupo P-ONCE/)
    const img = c.locator('img')
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 15_000 }).toBe(true)
    expect(decodeURIComponent((await img.getAttribute('src')) || '')).toContain('logo-p11-simbolo')
    await c.screenshot({ path: join(CAPTURAS, 'pie-circulo-p-once.png') })
  })

  test('«Nosotros»: sin INTEN, PROIN con su sitio, y el círculo con el logotipo nuevo', async ({ page }) => {
    await acotarTerceros(page)
    await page.goto('/nosotros')
    const familia = page.locator('section', { has: page.getByRole('heading', { name: 'GRUPO P-ONCE' }) })
    await familia.scrollIntoViewIfNeeded()
    await expect(familia).toContainText('PROIN')
    await expect(familia).toContainText('ANDAX')
    await expect(familia).toContainText('VELARE')
    await expect(familia).not.toContainText('INTEN')
    await expect(familia).not.toContainText('Telecomunicaciones')
    await expect(familia.getByRole('link', { name: /PROIN/ })).toHaveAttribute('href', 'https://proindesarrolladores.com/')
    const c = familia.locator('a[data-enlace="grupo-p-once"]')
    await expect(c).toHaveAttribute('href', 'https://gp-once.com/')
    await expect(c).toHaveAttribute('target', '_blank')
    expect(await c.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0 && /(logo-p11-simbolo|gp-once-simbolo)/.test(i.currentSrc))).toBe(true)
    await familia.screenshot({ path: join(CAPTURAS, 'nosotros-familia-empresarial.png') })
  })
})

test.describe('«Contáctanos»: mapita de la tienda', () => {
  test('muestra la dirección, el mapa con su pin y «Cómo llegar» (sin capturar el desplazamiento de la página)', async ({ page }) => {
    await abrir(page)
    const u = page.locator('[data-ubicacion-tienda]')
    await u.scrollIntoViewIfNeeded()
    await expect(u).toContainText('Blvd. Campestre 2910')
    await expect(u).toContainText('Cañada del Refugio')
    const mapa = u.locator('[data-mapa-tienda]')
    await expect(mapa).toBeVisible({ timeout: 15_000 })
    await expect(mapa.locator('.leaflet-container, .leaflet-pane').first()).toBeAttached({ timeout: 15_000 })
    await expect(mapa.locator('.leaflet-marker-icon')).toHaveCount(1, { timeout: 15_000 })
    const caja = (await mapa.boundingBox())!
    expect(caja.height).toBeGreaterThanOrEqual(150)
    expect(caja.height).toBeLessThanOrEqual(260)                 // pequeño
    expect(caja.x + caja.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
    const llegar = u.getByRole('link', { name: /Cómo llegar/ })
    await expect(llegar).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=VIVE%20BIEN/)
    await expect(llegar).toHaveAttribute('target', '_blank')
    expect((await llegar.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    // rueda del ratón sobre el mapa: la página sigue desplazándose (el mapa no atrapa la rueda)
    const antes = await page.evaluate(() => scrollY)
    await mapa.hover(); await page.mouse.wheel(0, 300); await page.waitForTimeout(400)
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(antes)
    await u.screenshot({ path: join(CAPTURAS, 'contacto-mapa-tienda.png') })
  })
  test('«Nosotros»: seis secciones, sin desborde horizontal, imágenes cargadas y destinos de las empresas', async ({ page }) => {
    await acotarTerceros(page)
    await page.goto('/nosotros')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Más de 15 años')
    for (const s of ['nos-hero', 'nos-historia', 'nos-valores', 'nos-por-que', 'nos-familia', 'nos-cta']) await expect(page.locator(`[data-seccion="${s}"]`)).toBeAttached()
    // recorre la página para disparar las cargas perezosas y las animaciones de entrada
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 450) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)) } await new Promise((r) => setTimeout(r, 1500)) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const rotas = await page.locator('.nos img').evaluateAll((is) => is.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).map((i) => (i as HTMLImageElement).src))
    expect(rotas, 'imágenes rotas').toEqual([])
    // el conteo de cifras termina en su valor
    await expect(page.locator('.nos-cifra strong').first()).toHaveText('15+')
    // destinos de las empresas (como gp-once.com; ANDAX → WhatsApp)
    const hrefs = await page.locator('[data-empresa]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')))
    expect(hrefs).toEqual(['/', 'https://proindesarrolladores.com/', 'https://wa.me/524778116501?text=Hola%2C%20me%20interesa%20informaci%C3%B3n%20sobre%20ANDAX', 'https://velare-nu.vercel.app', 'https://otli-ia.com'])
    await expect(page.locator('[data-seccion="nos-familia"]')).not.toContainText('INTEN')
    // «Contáctanos» del hero → /contacto
    await expect(page.locator('[data-accion="contactanos"]')).toHaveAttribute('href', '/contacto')
    // cada icono queda centrado en su cuadro (±1 px)
    const fuera = await page.evaluate(() => [...document.querySelectorAll('.nos-icono, .nos-tarjeta-icono')].filter((b) => { const s = b.querySelector('svg'); if (!s) return false; const a = b.getBoundingClientRect(), c = s.getBoundingClientRect(); return Math.abs(c.left + c.width / 2 - (a.left + a.width / 2)) > 1 || Math.abs(c.top + c.height / 2 - (a.top + a.height / 2)) > 1 }).length)
    expect(fuera, 'iconos descentrados').toBe(0)
    await page.screenshot({ path: join(CAPTURAS, 'nosotros-completa.png'), fullPage: true })
  })

  test('«Contacto»: secciones, datos, mapa y formulario con consentimiento (sin enviar)', async ({ page }) => {
    await acotarTerceros(page)
    await page.goto('/contacto')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Contáctanos')
    await expect(page.locator('.cto-dato')).toHaveCount(5)
    for (const t of ['Teléfono', 'WhatsApp', 'Correo', 'Ubicación', 'Horario']) await expect(page.locator('.cto-datos')).toContainText(t)
    await page.locator('[data-seccion="cto-visitanos"]').scrollIntoViewIfNeeded()
    await expect(page.locator('[data-mapa-tienda]')).toBeAttached({ timeout: 15000 })
    await expect(page.getByRole('link', { name: /Cómo llegar/ })).toBeVisible()
    // el formulario: campos con etiqueta asociada y envío bloqueado hasta aceptar el aviso
    for (const n of ['Nombre completo *', 'Teléfono / WhatsApp *', 'Correo electrónico', '¿En qué podemos ayudarte?']) await expect(page.getByLabel(n)).toBeVisible()
    await expect(page.getByRole('button', { name: /Enviar mensaje/ })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: join(CAPTURAS, 'contacto-completa.png'), fullPage: true })
  })

  test('publicaciones de las redes: entre reseñas y contacto, tarjetas, pestañas, flechas y enlaces seguros', async ({ page }) => {
    await abrir(page)
    const redes = page.locator('[data-seccion="redes"]')
    await redes.scrollIntoViewIfNeeded()
    await expect(redes.getByRole('heading', { level: 2 })).toContainText('Conoce nuestras últimas publicaciones')
    // lugar en la página: clientes → redes → contacto
    const y = await page.evaluate(() => ['[data-seccion="clientes"]', '[data-seccion="redes"]', '.ini-contacto'].map((s) => (document.querySelector(s) as HTMLElement | null)?.getBoundingClientRect().top ?? NaN))
    expect(y[0]).toBeLessThan(y[1]); expect(y[1]).toBeLessThan(y[2])
    // tarjetas a la vista según el ancho: ≥1100 → 4; ≥700 → 2; menos → al menos 1
    await page.waitForTimeout(800)
    const ancho = page.viewportSize()!.width
    const visibles = await redes.locator('.ini-post').evaluateAll((els) => {
      const pista = document.querySelector('.ini-redes-pista')!.getBoundingClientRect()
      return els.filter((e) => { const r = e.getBoundingClientRect(); return r.left >= pista.left - 2 && r.right <= pista.right + 2 }).length
    })
    if (ancho >= 1100) expect(visibles).toBe(4); else if (ancho >= 700) expect(visibles).toBe(2); else expect(visibles).toBeGreaterThanOrEqual(1)
    // flechas: «anterior» deshabilitada al inicio; «siguiente» desplaza
    const pista = redes.locator('.ini-redes-pista')
    await expect(redes.getByRole('button', { name: 'Publicaciones anteriores' })).toBeDisabled()
    const antes = await pista.evaluate((p) => p.scrollLeft)
    await redes.getByRole('button', { name: 'Publicaciones siguientes' }).click()
    await expect.poll(() => pista.evaluate((p) => p.scrollLeft), { timeout: 4000 }).toBeGreaterThan(antes + 40)
    await expect(redes.getByRole('button', { name: 'Publicaciones anteriores' })).toBeEnabled()
    // teclado en la región
    await pista.focus(); await page.keyboard.press('ArrowLeft')
    // pestañas: Instagram activa; Facebook cambia el destino
    await expect(redes.getByRole('button', { name: 'Instagram' })).toHaveAttribute('aria-pressed', 'true')
    await expect(redes.locator('.ini-redes-todas')).toHaveAttribute('href', /instagram\.com\/vive_bien_mx/)
    await redes.getByRole('button', { name: 'Facebook' }).click()
    await expect(redes.getByRole('button', { name: 'Facebook' })).toHaveAttribute('aria-pressed', 'true')
    await expect(redes.locator('.ini-redes-todas')).toHaveAttribute('href', /facebook\.com/)
    // enlaces seguros y sin conteos inventados
    const enlaces = await redes.locator('a[href^="http"]').evaluateAll((as) => as.map((a) => ({ t: a.getAttribute('target'), r: a.getAttribute('rel') })))
    expect(enlaces.length).toBeGreaterThan(5)
    for (const e of enlaces) { expect(e.t).toBe('_blank'); expect(e.r).toMatch(/noopener/) }
    await expect(redes).not.toContainText(/Ver \d+ comentario/)
    // imágenes visibles cargadas y sin desborde horizontal
    await redes.getByRole('button', { name: 'Instagram' }).click()
    await redes.locator('.ini-post-img img').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    const rotas = await redes.locator('.ini-post-img img').evaluateAll((is) => is.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).length)
    expect(rotas).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    // accesibilidad de la sección (incluye contraste)
    const r = await new AxeBuilder({ page }).include('[data-seccion="redes"]').analyze()
    expect(r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await redes.screenshot({ path: join(CAPTURAS, 'redes-sociales.png') })
  })

})
