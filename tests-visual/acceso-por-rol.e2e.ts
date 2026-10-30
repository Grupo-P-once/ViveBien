import { expect, test, type Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'
import { abrirBarra, barraVisible } from './ayudas-marco'

/**
 * Etapa 7 · quién llega adónde. Matriz rol × pantalla, en los cuatro anchos, con el servidor simulado:
 * `/api/usuarios/me` hace de servidor y es la ÚNICA fuente del rol (el navegador no decide nada).
 *
 * Qué prueba la matriz (permitido Y denegado):
 *   /admin       → solo administración; cliente, publicador y asociado ven «Tu cuenta no tiene acceso al panel».
 *   /portal      → cliente, publicador y asociado; administración se manda a /admin; sin sesión se ofrece entrar.
 *   /publicador  → publicador, asociado y administración tienen el marco con sidebar; el cliente no.
 *   «Citas recibidas» solo con la capacidad `recibir_citas` (o administración); «Mi portal» no se ofrece a administración.
 *
 * Es un complemento de las pruebas de API por rol (`tests/portal-por-rol.test.ts`): aquí se ve lo que la persona VE.
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

const CON_PANEL: Rol[] = ['admin', 'super']
const PUBLICAN: Rol[] = ['publicador', 'asociado', 'admin', 'super']

for (const rol of Object.keys(PERFILES) as Rol[]) {
  test.describe(`rol ${rol}`, () => {
    test(`/admin: ${CON_PANEL.includes(rol) ? 'permitido' : 'denegado'}`, async ({ page }) => {
      await simular(page)
      await entrarComo(page, rol)
      await page.goto('/admin')
      await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0, { timeout: 15_000 })
      if (CON_PANEL.includes(rol)) {
        await expect(page.locator('body.panel-vb')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Tu cuenta no tiene acceso al panel' })).toHaveCount(0)
      } else {
        await expect(page.getByRole('heading', { name: 'Tu cuenta no tiene acceso al panel' })).toBeVisible()
        // y no se pintó nada del panel: ni barra lateral ni enlaces de administración
        await expect(page.getByRole('link', { name: /Usuarios/ })).toHaveCount(0)
      }
    })

    test(`/portal: ${CON_PANEL.includes(rol) ? 'administración se manda a /admin' : 'permitido'}`, async ({ page }) => {
      await simular(page)
      await entrarComo(page, rol)
      await page.goto('/portal')
      if (CON_PANEL.includes(rol)) {
        await expect(page).toHaveURL(/\/admin(\/|$|\?)/, { timeout: 30_000 })
        await expect(page.locator('body.portal-vb')).toHaveCount(0)
      } else {
        await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 })
        await expect(page.locator('body.portal-vb')).toBeVisible()
      }
    })

    test(`/publicador (R8.3): ${rol} se queda en SU panel; «Citas recibidas» según capacidad`, async ({ page }) => {
      await simular(page)
      await entrarComo(page, rol)
      await page.goto('/publicador')
      if (CON_PANEL.includes(rol)) {
        // Admin: su lista eficiente, dentro de su panel (nunca el panel del portal ni uno aparte).
        await expect(page).toHaveURL(/\/admin\/propiedades$/, { timeout: 30_000 })
        await expect(page.locator('body.portal-vb')).toHaveCount(0)
        await barraVisible(page, 'Panel de administración')
        return
      }
      // Cliente, publicador y asociado: el marco del PORTAL (una sola barra: la de su portal).
      // La interfaz antigua `/publicador` no existe como pantalla: Publicador/Asociado van a su espacio canónico; el cliente se queda en su portal.
      await expect(page).toHaveURL(PUBLICAN.includes(rol) ? /\/portal\/mis-propiedades$/ : /\/portal$/, { timeout: 30_000 })
      await barraVisible(page, 'Tu portal')
      await expect(page.getByRole('navigation', { name: 'Panel del publicador' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Mis anuncios' })).toHaveCount(0)
      if (!PUBLICAN.includes(rol)) return
      await expect(page.getByRole('heading', { name: 'Mis propiedades' })).toBeVisible({ timeout: 15_000 })
      // «Nueva propiedad» abre el formulario EN LÍNEA de esta misma pantalla (no otra ruta ni otro panel).
      await page.getByRole('button', { name: 'Nueva propiedad' }).first().click()
      await expect(page.getByRole('button', { name: 'Crear borrador' })).toBeVisible()
      await expect(page).toHaveURL(/\/portal\/mis-propiedades$/)
      await page.getByRole('button', { name: 'Cancelar' }).click()
      const citas = page.getByRole('link', { name: 'Citas recibidas' })
      if (PERFILES[rol].citas) await expect(citas.first()).toBeVisible()
      else await expect(citas).toHaveCount(0)
    })


  })
}

for (const rol of ['admin', 'super'] as Rol[]) {
  test(`R8.3 · ${rol}: «Nueva propiedad» y el editor se quedan en el panel de administración (sin pasar por otro panel)`, async ({ page }) => {
    await simular(page)
    let altas = 0
    await page.route('**/api/publicador/propiedades', async (r) => {
      if (r.request().method() !== 'POST') return r.fallback()
      altas++
      await new Promise((ok) => setTimeout(ok, 400)) // respuesta lenta: el caso en que se repetía la pulsación
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'p-nueva' }) })
    })
    await entrarComo(page, rol)
    await page.goto('/admin/propiedades')
    const menu = page.getByRole('navigation', { name: 'Panel de administración' })
    await abrirBarra(page, 'Panel de administración')
    if (!(await menu.getByRole('link', { name: 'Revisar' }).isVisible().catch(() => false))) await menu.getByRole('button', { name: 'Propiedades' }).click()
    await expect(menu.getByRole('link', { name: 'Revisar' })).toHaveCount(1)
    await expect(menu.getByText('Por revisar')).toHaveCount(0)
    await menu.getByRole('button', { name: 'Nueva propiedad' }).click()
    // La barra NO navega: la URL no cambia, la lista sigue debajo y el formulario es una ventana sobre ella.
    await expect(page.locator('[data-alta-en-linea]')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/admin\/propiedades$/)
    await page.getByLabel('Título de la nueva propiedad').fill('Casa de prueba R83')
    // Pulsaciones repetidas (clic, doble clic, Enter): exactamente UN borrador (en producción se crearon 3 en 3 s).
    const crear = page.getByRole('button', { name: 'Crear borrador' })
    await crear.dblclick()
    await page.getByLabel('Título de la nueva propiedad').press('Enter').catch(() => {})
    await expect(page).toHaveURL(/\/admin\/propiedades\/p-nueva\/editar$/, { timeout: 20_000 })
    expect(altas).toBe(1)
    // El editor se pinta DENTRO del panel de administración: misma barra, sin portal ni «panel del publicador».
    await barraVisible(page, 'Panel de administración')
    await expect(page.locator('body.portal-vb')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Panel del publicador' })).toHaveCount(0)
    // Un enlace viejo al editor del publicador lleva a Admin a SU editor, dentro de su panel.
    await page.goto('/publicador/propiedades/p-nueva/editar')
    await expect(page).toHaveURL(/\/admin\/propiedades\/p-nueva\/editar$/, { timeout: 20_000 })
    await barraVisible(page, 'Panel de administración')
  })
}

// Observado en el Preview: el primer clic en «Revisar» justo después de cerrar la ventana de «Nueva propiedad» con Escape no navegó.
for (const rol of ['admin', 'super'] as Rol[]) {
  test(`R8.4 · ${rol}: el PRIMER clic en «Revisar» tras cerrar la ventana de «Nueva propiedad» navega`, async ({ page }) => {
    await simular(page)
    await entrarComo(page, rol)
    await page.goto('/admin/propiedades')
    await abrirBarra(page, 'Panel de administración')
    const menu = page.getByRole('navigation', { name: 'Panel de administración' })
    if (!(await menu.getByRole('link', { name: 'Revisar' }).isVisible().catch(() => false))) await menu.getByRole('button', { name: 'Propiedades' }).click()
    await menu.getByRole('button', { name: 'Nueva propiedad' }).click()
    await expect(page.locator('[data-alta-en-linea]')).toBeVisible()
    await page.keyboard.press('Escape')
    // SIN esperar a que la ventana termine de cerrarse: así lo hace una persona.
    if ((page.viewportSize()?.width ?? 1440) < 1024) await abrirBarra(page, 'Panel de administración')
    await menu.getByRole('link', { name: 'Revisar' }).click()
    await expect(page).toHaveURL(/\/admin\/propiedades\/pendientes$/, { timeout: 10_000 })
    await expect(page.locator('[data-alta-en-linea]')).toHaveCount(0)
  })
}

test('sin sesión: /admin y /portal ofrecen entrar; /publicador no pinta marco', async ({ page }) => {
  await simular(page)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Panel de administración' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible()
  await page.goto('/portal')
  await expect(page.getByRole('heading', { name: 'Tu portal de Vive Bien' })).toBeVisible({ timeout: 20_000 })
  await page.goto('/publicador')
  await expect(page.getByRole('button', { name: 'Mostrar u ocultar el menú' })).toHaveCount(0)
})
