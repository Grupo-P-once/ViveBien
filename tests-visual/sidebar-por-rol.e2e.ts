import { expect, test, type Page } from '@playwright/test'
import { abrirBarra, barraVisible } from './ayudas-marco'
import { acotarTerceros } from './ayudas-red'

/**
 * Etapa 7 · el sidebar de cada rol, botón por botón, como lo usaría una persona.
 *
 * Por rol: entra, abre su menú, recoge los enlaces que de verdad pinta la barra y los recorre uno a uno.
 * En cada destino comprueba que (a) no es un 404 ni una pantalla de error de la aplicación y (b) la barra
 * lateral SIGUE ahí (en pantallas estrechas, su botón). Las únicas salidas permitidas son las del sitio
 * público que no llevan barra por diseño (buscador de propiedades, «Ver el sitio»).
 *
 * También fija dos decisiones del usuario: «Mis búsquedas» y «Mi búsqueda» son UNA sola entrada, y el
 * Valuador conserva la barra del portal.
 *
 * Servidor simulado (mismo patrón que `acceso-por-rol.e2e.ts`): `/api/usuarios/me` es la única fuente del rol.
 */

type Rol = 'cliente' | 'publicador' | 'asociado' | 'admin' | 'super'
const PERFILES: Record<Rol, { correo: string; uid: string; nombre: string; rol: 'cliente' | 'publicador' | 'admin'; superAdmin: boolean; citas: boolean }> = {
  cliente: { correo: 'cliente@prueba.test', uid: 'uid-cliente', nombre: 'Cliente Prueba', rol: 'cliente', superAdmin: false, citas: false },
  publicador: { correo: 'publicador@prueba.test', uid: 'uid-publicador', nombre: 'Publicador Prueba', rol: 'publicador', superAdmin: false, citas: false },
  asociado: { correo: 'asociado@prueba.test', uid: 'uid-asociado', nombre: 'Asociado Prueba', rol: 'publicador', superAdmin: false, citas: true },
  admin: { correo: 'admin@prueba.test', uid: 'uid-admin', nombre: 'Admin Prueba', rol: 'admin', superAdmin: false, citas: true },
  super: { correo: 'super@prueba.test', uid: 'uid-super', nombre: 'Super Prueba', rol: 'admin', superAdmin: true, citas: true },
}
const porToken = (t: string) => Object.values(PERFILES).find((p) => `tok-${p.correo}` === t)
const porCorreo = (c: string) => Object.values(PERFILES).find((p) => p.correo === c)

async function simular(page: Page) {
  await acotarTerceros(page)
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', user_id: 'x' }) }))
  await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
    const url = r.request().url()
    const cuerpo = JSON.parse(r.request().postData() || '{}')
    if (url.includes('accounts:signInWithPassword')) {
      const p = porCorreo(cuerpo.email)
      if (!p) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }) })
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ localId: p.uid, email: p.correo, displayName: p.nombre, idToken: `tok-${p.correo}`, registered: true, refreshToken: 'r', expiresIn: '3600' }) })
    }
    if (url.includes('accounts:lookup')) {
      const p = porToken(cuerpo.idToken) ?? PERFILES.cliente
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ localId: p.uid, email: p.correo, emailVerified: true, displayName: p.nombre, providerUserInfo: [{ providerId: 'password', federatedId: p.correo, email: p.correo }], validSince: '1700000000', lastLoginAt: '1700000000000', createdAt: '1700000000000' }] }) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    if (q.method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    if (ruta === '/api/usuarios/me') {
      const p = porToken((q.headers()['authorization'] || '').replace('Bearer ', ''))
      if (!p) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"x"}' })
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uid: p.uid, email: p.correo, nombre: p.nombre, rol: p.rol, ...(p.rol === 'publicador' ? { tipoPublicador: p.correo.startsWith('asociado') ? 'asociado' : 'publicador' } : {}), superAdmin: p.superAdmin, estado: 'activo', portal: true, capacidades: { recibir_citas: p.citas, propiedad_gestionar_propias: true } }) })
    }
    if (ruta === '/api/portal/acceso') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    if (ruta === '/api/publicador/propiedades') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    if (ruta === '/api/portal/busquedas') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"busquedas":[]}' })
    return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulado"}' })
  })
}

async function entrarComo(page: Page, rol: Rol) {
  await page.goto('/entrar')
  await page.getByLabel(/Correo/i).fill(PERFILES[rol].correo)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).not.toHaveURL(/\/entrar/, { timeout: 30_000 })
  await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0, { timeout: 15_000 })
}

const BOTON_MENU = 'Mostrar u ocultar el menú'
const SIDEBAR = '[data-sidebar="sidebar"]'

/** Abre el cajón en pantallas estrechas; devuelve los enlaces (texto + destino) que pinta la barra. */
async function enlacesDeLaBarra(page: Page): Promise<Array<{ texto: string; href: string }>> {
  await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0, { timeout: 15_000 })
  const boton = page.getByRole('button', { name: BOTON_MENU }).first()
  const primero = page.locator(`${SIDEBAR} a[href]`).first()
  // Se espera a que haya O los enlaces (escritorio) O el botón del cajón (pantallas estrechas) antes de decidir.
  await expect.poll(async () => (await primero.isVisible().catch(() => false)) || (await boton.isVisible().catch(() => false)), { timeout: 15_000 }).toBe(true)
  if (!(await primero.isVisible().catch(() => false))) await boton.click()
  await expect(page.locator(`${SIDEBAR} a[href]`).first()).toBeVisible({ timeout: 15_000 })
  return page.locator(`${SIDEBAR} a[href]`).evaluateAll((as) =>
    as.map((a) => ({ texto: (a.textContent ?? '').replace(/\s+/g, ' ').trim(), href: (a as HTMLAnchorElement).getAttribute('href') ?? '' })))
}

/** Barra presente: en escritorio sus enlaces; en pantallas estrechas, el botón que la abre. */
async function barraPresente(page: Page) {
  const boton = page.getByRole('button', { name: BOTON_MENU }).first()
  const enlaces = page.locator(`${SIDEBAR} a[href]`).first()
  await expect.poll(async () => (await enlaces.isVisible().catch(() => false)) || (await boton.isVisible().catch(() => false)), { timeout: 15_000, message: 'la barra lateral (o su botón) debe estar' }).toBe(true)
}

/** Salidas legítimas al sitio público, que no llevan barra por diseño. */
const PUBLICAS = /^(\/propiedades|\/$|\/dashboard|\/mi-cuenta)(\?|$|\/)/
const esExterna = (h: string) => /^(https?:|mailto:|tel:|#)/.test(h)

for (const rol of Object.keys(PERFILES) as Rol[]) {
  test(`sidebar · ${rol}: cada botón lleva a una pantalla viva y la barra no desaparece`, async ({ page }) => {
    test.setTimeout(240_000)
    await simular(page)
    await entrarComo(page, rol)
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(e.message))

    // Se visita cada área con barra que ese rol tiene: portal, y publicador / admin cuando aplica.
    const areas = ['/portal', ...((rol === 'admin' || rol === 'super') ? ['/admin'] : [])]
    const vistos = new Set<string>()
    for (const area of areas) {
      await page.goto(area)
      await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0, { timeout: 15_000 })
      // admin entrando a /portal rebota a /admin: ahí se recoge la barra de admin.
      const enlaces = await enlacesDeLaBarra(page)
      expect(enlaces.length, `${area}: la barra no tiene enlaces`).toBeGreaterThan(3)
      for (const { texto, href } of enlaces) {
        if (!href || esExterna(href) || PUBLICAS.test(href)) continue
        const clave = href.split('#')[0]
        if (vistos.has(clave)) continue
        vistos.add(clave)
        await page.goto(href)
        await expect(page.locator('[data-pantalla-de-espera]'), `${texto} → ${href}`).toHaveCount(0, { timeout: 15_000 })
        await expect(page.getByText(/This page could not be found|Application error|404/i), `${texto} → ${href}`).toHaveCount(0)
        await barraPresente(page)
      }
    }
    expect(vistos.size, `${rol}: no se recorrió ningún enlace`).toBeGreaterThan(2)
    expect(errores, `errores de página: ${errores.join(' | ')}`).toEqual([])
  })
}

for (const rol of ['cliente', 'publicador', 'asociado'] as Rol[]) {
  test(`sidebar · ${rol}: ${rol === 'cliente' ? 'sin opciones de propiedades propias' : 'Mis propiedades, Nueva propiedad' + (rol === 'publicador' ? ' y En revisión' : ' (sin En revisión)')}`, async ({ page }) => {
    await simular(page)
    await entrarComo(page, rol)
    await page.goto('/portal')
    await enlacesDeLaBarra(page)
    const nav = page.getByRole('navigation', { name: 'Tu portal' })
    await expect(nav.getByRole('link', { name: 'Mis anuncios' })).toHaveCount(0)
    await expect(nav.getByText('Próximamente')).toHaveCount(0)
    if (rol === 'cliente') {
      await expect(nav.getByRole('link', { name: 'Mis propiedades' })).toHaveCount(0)
      await expect(nav.getByRole('button', { name: 'Nueva propiedad' })).toHaveCount(0)
      await expect(nav.getByRole('link', { name: 'En revisión' })).toHaveCount(0)
      return
    }
    await expect(nav.getByRole('link', { name: 'Mis propiedades' })).toHaveCount(1)
    await expect(nav.getByRole('button', { name: 'Nueva propiedad' })).toHaveCount(1)
    await expect(nav.getByRole('link', { name: 'En revisión' })).toHaveCount(rol === 'publicador' ? 1 : 0)
    // «Mis propiedades» se queda en el portal: misma barra, sin otro panel.
    await nav.getByRole('link', { name: 'Mis propiedades' }).click()
    await expect(page).toHaveURL(/\/portal\/mis-propiedades$/, { timeout: 20_000 })
    await barraVisible(page, 'Tu portal')
    await abrirBarra(page, 'Tu portal')
    // «Nueva propiedad» abre el formulario EN LÍNEA de esta misma lista: mismo panel, misma barra, sin otra pantalla.
    await page.getByRole('navigation', { name: 'Tu portal' }).getByRole('button', { name: 'Nueva propiedad' }).click()
    await expect(page.locator('[data-alta-en-linea]')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/portal\/mis-propiedades$/) // la barra no navegó
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.locator('[data-alta-en-linea]')).toHaveCount(0)
    await barraVisible(page, 'Tu portal')
    await expect(page.getByRole('heading', { name: 'Mis propiedades' })).toBeVisible()
    if (rol === 'publicador') {
      await abrirBarra(page, 'Tu portal')
      await page.getByRole('navigation', { name: 'Tu portal' }).getByRole('link', { name: 'En revisión' }).click()
      await expect(page).toHaveURL(/\/portal\/mis-propiedades\?estado=en_revision$/, { timeout: 20_000 })
      await barraVisible(page, 'Tu portal')
      await expect(page.getByRole('heading', { name: 'En revisión' })).toBeVisible({ timeout: 15_000 })
    }
  })

  test(`sidebar · ${rol}: una sola entrada de búsquedas y el Valuador conserva la barra`, async ({ page }) => {
    await simular(page)
    await entrarComo(page, rol)
    await page.goto('/portal')
    const enlaces = await enlacesDeLaBarra(page)
    const textos = enlaces.map((e) => e.texto)
    expect(textos.filter((t) => /^Mis búsquedas$/.test(t))).toHaveLength(1)
    expect(textos.filter((t) => /^Mi búsqueda$/.test(t))).toHaveLength(0)
    expect(enlaces.some((e) => e.texto === 'Valuador' && e.href === '/portal/valuador')).toBe(true)

    // La ruta vieja redirige a la sección «Lo que busco» dentro de «Mis búsquedas».
    await page.goto('/portal/mi-busqueda')
    await expect(page).toHaveURL(/\/portal\/busquedas(#lo-que-busco)?$/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Mis búsquedas' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Lo que busco' })).toBeVisible()
    await barraPresente(page)

    // El Valuador: mismo contenido, con la barra, sin cabecera ni pie del sitio público.
    await page.goto('/portal/valuador')
    await expect(page.getByRole('heading', { name: /valor|valúa|valuador/i }).first()).toBeVisible({ timeout: 20_000 })
    await barraPresente(page)
    await expect(page.locator('body.portal-vb')).toBeVisible()
    // Y la página pública sigue existiendo para quien no tiene cuenta.
    await page.goto('/valuador')
    await expect(page.getByRole('heading', { name: /valor|valúa|valuador/i }).first()).toBeVisible({ timeout: 20_000 })
  })
}

// R8.3: /publicador se pinta DENTRO del panel del rol (portal para publicador/asociado/cliente, administración para Admin).
for (const rol of ['cliente', 'publicador', 'asociado', 'super'] as Rol[]) {
  test(`/publicador · ${rol}: se queda en su panel (${rol === 'super' ? 'administración' : 'portal'}), sin panel aparte ni «Ver todas»`, async ({ page }) => {
    await simular(page)
    await entrarComo(page, rol)
    await page.goto('/publicador')
    await expect(page.getByRole('navigation', { name: 'Panel del publicador' })).toHaveCount(0)
    // «Ver todas» era el enlace del menú antiguo del publicador: se busca en el MENÚ. (La página de inicio del portal tiene sus propios «Ver todas», legítimos.)
    for (const nombre of ['Tu portal', 'Panel de administración']) await expect(page.getByRole('navigation', { name: nombre }).getByRole('link', { name: 'Ver todas' })).toHaveCount(0)
    await barraVisible(page, rol === 'super' ? 'Panel de administración' : 'Tu portal')
  })
}

// Menú por secciones (24-oct-2026): títulos, plegar, recordar y no esconder dónde estás.
for (const rol of ['cliente', 'publicador'] as Rol[]) {
  test(`sidebar · ${rol}: secciones con título, se pliegan, se recuerda al recargar y la pantalla actual nunca queda escondida`, async ({ page }) => {
    await simular(page)
    await entrarComo(page, rol)
    await page.goto('/portal')
    await enlacesDeLaBarra(page)
    const nav = page.getByRole('navigation', { name: 'Tu portal' })
    const titulos = rol === 'cliente' ? ['Explorar', 'Mi actividad', 'Mi cuenta'] : ['Mi cartera', 'Explorar', 'Mi actividad', 'Mi cuenta']
    for (const t of titulos) await expect(nav.getByRole('button', { name: t, exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Mi cartera', exact: true })).toHaveCount(rol === 'cliente' ? 0 : 1)

    // Cliente: su actividad empieza abierta. Quien publica: empieza plegada (lo suyo va primero) pero sus enlaces siguen en la página.
    const alertas = nav.getByRole('link', { name: 'Mis alertas' })
    if (rol === 'cliente') await expect(alertas).toBeVisible(); else await expect(alertas).toBeHidden()
    await expect(nav.getByRole('button', { name: 'Mi actividad', exact: true })).toHaveAttribute('aria-expanded', rol === 'cliente' ? 'true' : 'false')

    // Se pliega / abre con un clic…
    await nav.getByRole('button', { name: 'Mi actividad', exact: true }).click()
    if (rol === 'cliente') await expect(alertas).toBeHidden(); else await expect(alertas).toBeVisible()

    // …y se RECUERDA al recargar.
    await page.reload()
    await enlacesDeLaBarra(page)
    if (rol === 'cliente') await expect(nav.getByRole('link', { name: 'Mis alertas' })).toBeHidden(); else await expect(nav.getByRole('link', { name: 'Mis alertas' })).toBeVisible()

    // La sección de la pantalla donde estás nunca se queda plegada.
    await page.goto('/portal/alertas')
    await enlacesDeLaBarra(page)
    await expect(nav.getByRole('link', { name: 'Mis alertas' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Mi actividad', exact: true })).toHaveAttribute('aria-expanded', 'true')

    // «Cerrar sesión» está en «Mi cuenta» y la cabecera dice quién eres.
    await expect(nav.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
    await expect(page.locator('[data-persona-menu]')).toContainText(rol === 'cliente' ? 'Cliente' : /Publicador|Asociado/)
  })
}
