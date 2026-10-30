import { expect, test, type Page } from '@playwright/test'

/**
 * Regresión del cambio de cuenta (P1): CLIENTE → cerrar sesión → ADMIN, y ADMIN → cerrar sesión → CLIENTE.
 *
 * El fallo: al cerrar sesión en `/portal` queda `?siguiente=/portal` en el enlace «Entrar», y `/entrar`
 * obedecía ese destino sin mirar QUIÉN acababa de entrar: un administrador aterrizaba en el portal del cliente
 * (con su nombre arriba y el menú y el contenido del cliente).
 *
 * Sin cuentas reales: Google Identity y toda la API se simulan en el navegador. La respuesta de
 * `/api/usuarios/me` hace de «servidor» y es la ÚNICA fuente del rol, como en producción.
 */

const PERFILES: Record<string, { uid: string; nombre: string; rol: 'cliente' | 'admin'; superAdmin: boolean }> = {
  'cliente@prueba.test': { uid: 'uid-cliente', nombre: 'Cliente Prueba', rol: 'cliente', superAdmin: false },
  'admin@prueba.test': { uid: 'uid-admin', nombre: 'Admin Prueba', rol: 'admin', superAdmin: false },
  'super@prueba.test': { uid: 'uid-super', nombre: 'Super Prueba', rol: 'admin', superAdmin: true },
}
const porToken = (t: string) => Object.entries(PERFILES).find(([c]) => `tok-${c}` === t)

async function simular(page: Page) {
  const me: Array<{ uid: string; email: string; rol: string; superAdmin: boolean; portal: boolean }> = []
  const noGet: string[] = []
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', user_id: 'x' }) }))
  await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
    const url = r.request().url()
    const cuerpo = JSON.parse(r.request().postData() || '{}')
    if (url.includes('accounts:signInWithPassword')) {
      const p = PERFILES[cuerpo.email]
      if (!p) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }) })
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ localId: p.uid, email: cuerpo.email, displayName: p.nombre, idToken: `tok-${cuerpo.email}`, registered: true, refreshToken: 'r', expiresIn: '3600' }) })
    }
    if (url.includes('accounts:lookup')) {
      const hallado = porToken(cuerpo.idToken)
      const [email, p] = hallado ?? ['', PERFILES['cliente@prueba.test']]
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ localId: p.uid, email, emailVerified: true, displayName: p.nombre, providerUserInfo: [{ providerId: 'password', federatedId: email, email }], validSince: '1700000000', lastLoginAt: '1700000000000', createdAt: '1700000000000' }] }) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  // TODA la API: nada llega al servidor real. /me hace de servidor (rol, superAdmin, portal).
  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    if (q.method() !== 'GET') { noGet.push(`${q.method()} ${ruta}`); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) }
    if (ruta === '/api/usuarios/me') {
      const token = (q.headers()['authorization'] || '').replace('Bearer ', '')
      const hallado = porToken(token)
      if (!hallado) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"x"}' })
      const [email, p] = hallado
      me.push({ uid: p.uid, email, rol: p.rol, superAdmin: p.superAdmin, portal: true })
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uid: p.uid, email, nombre: p.nombre, rol: p.rol, superAdmin: p.superAdmin, estado: 'activo', portal: true }) })
    }
    if (ruta === '/api/portal/acceso') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulado"}' })
  })
  return { me, noGet }
}

async function entrarCon(page: Page, email: string) {
  await page.getByLabel(/Correo/i).fill(email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

/** El botón de la cuenta (arriba a la derecha). `nombre` es el nombre corto: «Cliente», «Admin»… */
const cuenta = (page: Page, nombre: string) => page.getByRole('button', { name: new RegExp(`^Cuenta de ${nombre}`) })

/** El rol que se LEE en pantalla junto al nombre (en móvil la barra sólo enseña el avatar). */
async function rolVisible(page: Page, nombre: string, rol: 'Cliente' | 'Administrador') {
  const ancho = page.viewportSize()!.width
  if (ancho >= 768) await expect(cuenta(page, nombre)).toContainText(rol)
}

async function cerrarSesion(page: Page, nombre: string) {
  await cuenta(page, nombre).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
}

// `body.portal-vb` lo pone PortalShell mientras está montado (y lo quita al salir): es el marcador del portal del cliente en producción.
const enPortal = (page: Page) => page.locator('body.portal-vb')

test('CLIENTE → cerrar sesión → ADMIN: termina en el panel de administración, no en el portal', async ({ page }) => {
  const { me, noGet } = await simular(page)
  await page.goto('/entrar')
  await entrarCon(page, 'cliente@prueba.test')
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 })
  await expect(enPortal(page)).toBeVisible()
  await expect(cuenta(page, 'Cliente')).toBeVisible()
  await rolVisible(page, 'Cliente', 'Cliente')

  await cerrarSesion(page, 'Cliente')
  await expect(page.getByRole('heading', { name: 'Tu portal de Vive Bien' })).toBeVisible()
  await page.getByRole('link', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/entrar/)

  await entrarCon(page, 'admin@prueba.test')
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/, { timeout: 30_000 })
  expect(new URL(page.url()).pathname).not.toMatch(/^\/portal/)
  await expect(cuenta(page, 'Admin')).toBeVisible()
  await rolVisible(page, 'Admin', 'Administrador')
  await expect(enPortal(page)).toHaveCount(0)
  await expect(page.getByText('Tu portal de Vive Bien')).toHaveCount(0)
  await expect(page.locator('body.portal-vb')).toHaveCount(0)
  // El servidor (simulado) dijo «admin» y eso es lo que se ve.
  expect(me.at(-1)).toMatchObject({ email: 'admin@prueba.test', rol: 'admin' })
  expect(noGet).toEqual([])
})

test('ADMIN → cerrar sesión → CLIENTE: termina en el portal, no en el panel', async ({ page }) => {
  const { me, noGet } = await simular(page)
  await page.goto('/entrar')
  await entrarCon(page, 'admin@prueba.test')
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/, { timeout: 30_000 })
  await expect(cuenta(page, 'Admin')).toBeVisible()
  await rolVisible(page, 'Admin', 'Administrador')

  await cerrarSesion(page, 'Admin')
  await page.getByRole('link', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/entrar/)

  await entrarCon(page, 'cliente@prueba.test')
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 })
  await expect(enPortal(page)).toBeVisible()
  await expect(cuenta(page, 'Cliente')).toBeVisible()
  await rolVisible(page, 'Cliente', 'Cliente')
  expect(new URL(page.url()).pathname).not.toMatch(/^\/admin/)
  expect(me.at(-1)).toMatchObject({ email: 'cliente@prueba.test', rol: 'cliente' })
  expect(noGet).toEqual([])
})

test('SUPER ADMIN que llega a /portal con sesión abierta también va al panel (el servidor es la fuente del rol)', async ({ page }) => {
  await simular(page)
  await page.goto('/entrar')
  await entrarCon(page, 'super@prueba.test')
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/, { timeout: 30_000 })
  await page.goto('/portal')
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/, { timeout: 30_000 })
  await expect(enPortal(page)).toHaveCount(0)
})

test('diagnóstico · tras cerrar sesión no queda nada del usuario anterior en el almacenamiento', async ({ page }) => {
  await simular(page)
  await page.goto('/entrar')
  await entrarCon(page, 'cliente@prueba.test')
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 })
  await cerrarSesion(page, 'Cliente')
  await expect(page.getByRole('heading', { name: 'Tu portal de Vive Bien' })).toBeVisible()
  const sobras = await page.evaluate(() => {
    const volcar = (s: Storage) => Object.keys(s).map((k) => `${k}=${(s.getItem(k) || '').slice(0, 80)}`)
    return { local: volcar(localStorage), sesion: volcar(sessionStorage), cookies: document.cookie }
  })
  console.log('ALMACENAMIENTO TRAS CERRAR SESIÓN:', JSON.stringify(sobras))
  const todo = JSON.stringify(sobras)
  expect(todo).not.toMatch(/uid-cliente|cliente@prueba\.test|Cliente Prueba|tok-cliente/)
})
