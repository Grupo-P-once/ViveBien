import { expect, test, type Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * Revisión de propiedades (cola de moderación) en 390/768/1024/1440, con Google y TODA la API simulados en el navegador
 * (no se toca la base ni se usa ninguna cuenta real). Comprueba lo que ve y hace el revisor:
 *
 *  · rechazar / pedir cambios sin el motivo (≥ 10) no envía nada y lo dice;
 *  · con motivo, manda estado + nota exactos y confirma;
 *  · si otra persona movió la propiedad (409), enseña el mensaje del servidor y refresca la cola.
 *
 *     npx playwright test -c playwright.sesion.config.ts revision
 */

const ADMIN = { uid: 'uid-admin', nombre: 'Admin Prueba', email: 'admin@prueba.test' }
const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

async function simular(page: Page, opts: { respuestaEstado: () => { status: number; cuerpo: unknown } }) {
  const posts: Array<{ ruta: string; cuerpo: Record<string, unknown> }> = []
  let lecturasDeCola = 0
  const noGet: string[] = []
  await acotarTerceros(page) // un tercero (cdnjs, fuentes, apis.google.com) que no contesta se corta a los 4 s y no cuelga la carga
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill(json({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', user_id: 'x' })))
  await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
    const url = r.request().url()
    if (url.includes('accounts:signInWithPassword')) {
      return r.fulfill(json({ localId: ADMIN.uid, email: ADMIN.email, displayName: ADMIN.nombre, idToken: 'tok-admin', registered: true, refreshToken: 'r', expiresIn: '3600' }))
    }
    if (url.includes('accounts:lookup')) {
      return r.fulfill(json({ users: [{ localId: ADMIN.uid, email: ADMIN.email, emailVerified: true, displayName: ADMIN.nombre, providerUserInfo: [{ providerId: 'password', federatedId: ADMIN.email, email: ADMIN.email }], validSince: '1700000000', lastLoginAt: '1700000000000', createdAt: '1700000000000' }] }))
    }
    return r.fulfill(json({}))
  })
  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    if (q.method() === 'POST' && /^\/api\/propiedades\/[^/]+\/estado$/.test(ruta)) {
      posts.push({ ruta, cuerpo: JSON.parse(q.postData() || '{}') })
      const { status, cuerpo } = opts.respuestaEstado()
      return r.fulfill(json(cuerpo, status))
    }
    if (q.method() !== 'GET') { noGet.push(`${q.method()} ${ruta}`); return r.fulfill(json({})) }
    if (ruta === '/api/usuarios/me') return r.fulfill(json({ uid: ADMIN.uid, email: ADMIN.email, nombre: ADMIN.nombre, rol: 'admin', superAdmin: false, estado: 'activo', portal: true }))
    if (ruta === '/api/publicador/propiedades') {
      lecturasDeCola += 1
      return r.fulfill(json([{ id: 'p-rev-1', titulo: 'Casa de prueba en León', ubicacion: 'León, Gto.', tipo: 'casa', operacion: 'venta', precio: 2500000, fotos: ['a', 'b', 'c'], completitud: 90, estado_pub: 'en_revision', folio: 'VB-2026-00001' }]))
    }
    return r.fulfill(json({ error: 'simulado' }, 500))
  })
  return { posts, noGet, lecturas: () => lecturasDeCola }
}

async function entrarYAbrirCola(page: Page) {
  await page.goto('/entrar')
  await page.getByLabel(/Correo/i).fill(ADMIN.email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/, { timeout: 30_000 })
  await page.goto('/admin/propiedades/pendientes')
  await expect(page.getByRole('heading', { name: 'Propiedades por revisar' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Casa de prueba en León')).toBeVisible()
}

const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

test('rechazar o pedir cambios sin motivo suficiente: no se envía nada y se explica', async ({ page }) => {
  const { posts } = await simular(page, { respuestaEstado: () => ({ status: 200, cuerpo: { ok: true } }) })
  await entrarYAbrirCola(page)

  await page.getByRole('button', { name: 'Rechazar' }).click()
  await expect(page.getByText(/mínimo 10 caracteres/)).toBeVisible()
  await page.getByLabel(/Motivo/).fill('corto')
  await page.getByRole('button', { name: 'Pedir cambios' }).click()
  await expect(page.getByText(/mínimo 10 caracteres/)).toBeVisible()
  expect(posts).toEqual([])
  await sinDesborde(page)
})

test('con motivo válido: manda estado + nota exactos y confirma', async ({ page }) => {
  const { posts, noGet } = await simular(page, { respuestaEstado: () => ({ status: 200, cuerpo: { ok: true, estado: 'cambios_solicitados' } }) })
  await entrarYAbrirCola(page)

  await page.getByLabel(/Motivo/).fill('Faltan fotos de la cocina y del baño.')
  await page.getByRole('button', { name: 'Pedir cambios' }).click()
  await expect(page.getByText('Cambios solicitados al publicador.')).toBeVisible()
  expect(posts).toHaveLength(1)
  expect(posts[0].ruta).toBe('/api/propiedades/p-rev-1/estado')
  expect(posts[0].cuerpo).toEqual({ estado: 'cambios_solicitados', nota: 'Faltan fotos de la cocina y del baño.' })
  expect(noGet).toEqual([])
  await page.screenshot({ path: `test-results/revision-ok-${test.info().project.name}.png` })
})

test('aprobar no pide motivo', async ({ page }) => {
  const { posts } = await simular(page, { respuestaEstado: () => ({ status: 200, cuerpo: { ok: true, estado: 'publicada' } }) })
  await entrarYAbrirCola(page)
  await page.getByRole('button', { name: 'Aprobar y publicar' }).click()
  await expect(page.getByText('Propiedad publicada.')).toBeVisible()
  expect(posts[0].cuerpo.estado).toBe('publicada')
})

test('conflicto (409): enseña el mensaje del servidor y refresca la cola', async ({ page }) => {
  const { posts, lecturas } = await simular(page, {
    respuestaEstado: () => ({ status: 409, cuerpo: { error: 'Esta propiedad cambió de estado mientras la mirabas. Recarga la página para ver cómo quedó.', codigo: 'conflicto' } }),
  })
  await entrarYAbrirCola(page)
  const antes = lecturas()
  await page.getByRole('button', { name: 'Aprobar y publicar' }).click()
  await expect(page.getByText(/cambió de estado mientras la mirabas/)).toBeVisible()
  expect(posts).toHaveLength(1)
  await expect.poll(() => lecturas()).toBeGreaterThan(antes)   // la cola se volvió a pedir
  await sinDesborde(page)
})
