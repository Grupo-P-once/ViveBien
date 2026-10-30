import { expect, test, type Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * R8.6 · el portal CERRADO (`portalCliente` apagado y sin etapa interna) con el servidor simulado.
 *
 * Esta prueba SOLO tiene sentido con la réplica local arrancada con el flag apagado:
 *   MOCK_FLAGS_E2E='{"portalCliente":false,"portalClienteInterno":false,"citasEnLinea":false,"publisherPortal":false}'
 * (variable del arnés hermético; no toca ningún flag real). Con el flag encendido, la prueba se omite sola.
 *
 * Lo que debe verse (y no verse):
 *   · Publicador y Asociado en `/publicador`: un aviso cerrado y claro dentro del marco del portal; NINGUNA lista, ningún botón de
 *     «Nueva propiedad», ningún enlace que termine en 404, y ninguna escritura (ni un POST/PATCH a las APIs de propiedades).
 *   · `/portal/mis-propiedades` (y su editor) dan 404, pero la persona nunca es llevada ahí desde ninguna pantalla.
 *   · Administración no depende del portal: `/admin/propiedades` sigue siendo la tabla, y `/publicador` la lleva ahí.
 */

type Rol = 'publicador' | 'asociado' | 'admin'
const PERFILES: Record<Rol, { correo: string; uid: string; nombre: string; rol: 'publicador' | 'admin'; tipo?: 'asociado' }> = {
  publicador: { correo: 'publicador@prueba.test', uid: 'uid-publicador', nombre: 'Publicador Prueba', rol: 'publicador' },
  asociado: { correo: 'asociado@prueba.test', uid: 'uid-asociado', nombre: 'Asociado Prueba', rol: 'publicador', tipo: 'asociado' },
  admin: { correo: 'admin@prueba.test', uid: 'uid-admin', nombre: 'Admin Prueba', rol: 'admin' },
}
const porToken = (t: string) => Object.values(PERFILES).find((p) => `tok-${p.correo}` === t)
const porCorreo = (c: string) => Object.values(PERFILES).find((p) => p.correo === c)

/** Escrituras que llegaron a las APIs de propiedades (debe quedar vacío con el portal cerrado). */
type Escritura = { metodo: string; ruta: string }

async function simular(page: Page, escrituras: Escritura[]) {
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
      const p = porToken(cuerpo.idToken) ?? PERFILES.publicador
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ localId: p.uid, email: p.correo, emailVerified: true, displayName: p.nombre, providerUserInfo: [{ providerId: 'password', federatedId: p.correo, email: p.correo }], validSince: '1700000000', lastLoginAt: '1700000000000', createdAt: '1700000000000' }] }) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    if (q.method() !== 'GET') {
      if (/\/api\/(publicador\/propiedades|admin\/propiedades|propiedades\/)/.test(ruta)) escrituras.push({ metodo: q.method(), ruta })
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
    if (ruta === '/api/usuarios/me') {
      const p = porToken((q.headers()['authorization'] || '').replace('Bearer ', ''))
      if (!p) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"x"}' })
      // Como el servidor real con el portal cerrado: `portal: false` para quien no es de la casa; la administración no depende de él.
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uid: p.uid, email: p.correo, nombre: p.nombre, rol: p.rol, ...(p.tipo ? { tipoPublicador: p.tipo } : {}), superAdmin: false, estado: 'activo', portal: false, capacidades: { propiedad_gestionar_propias: true } }) })
    }
    if (ruta === '/api/portal/acceso') return r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"No encontrado."}' })
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

/** El portal está cerrado de verdad en el servidor (no solo en la simulación del navegador): `/portal` da 404. */
async function portalCerradoEnServidor(page: Page): Promise<boolean> {
  const r = await page.request.get('/portal')
  return r.status() === 404
}

for (const rol of ['publicador', 'asociado'] as Rol[]) {
  test.describe(`R8.6 · portal cerrado · ${rol}`, () => {
    test('/publicador: aviso cerrado dentro del marco, sin lista, sin acciones y sin enlaces a 404', async ({ page }) => {
      test.skip(!(await portalCerradoEnServidor(page)), 'la réplica se arrancó con el portal abierto (ver MOCK_FLAGS_E2E)')
      const escrituras: Escritura[] = []
      await simular(page, escrituras)
      await entrarComo(page, rol)
      await page.goto('/publicador')
      await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0, { timeout: 15_000 })

      // se queda donde está: nada lo manda a otro panel ni a otra ruta
      await expect(page).toHaveURL(/\/publicador$/)
      await expect(page.getByRole('heading', { name: 'Tus propiedades no están disponibles todavía' })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('no se pueden crear ni editar propiedades')).toBeVisible()

      // ni lista ni acciones de escritura
      await expect(page.locator('table')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Nueva propiedad/ })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /Editar|Completar ficha/ })).toHaveCount(0)
      await expect(page.locator('[data-alta-en-linea]')).toHaveCount(0)

      // todo enlace de la pantalla lleva a algo que existe (no a /portal/*, que da 404 con el portal cerrado)
      const destinos = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') || ''))
      expect(destinos.filter((d) => d.startsWith('/portal') || d.startsWith('/publicador'))).toEqual([])
      for (const d of [...new Set(destinos.filter((x) => x.startsWith('/')))]) {
        const r = await page.request.get(d)
        expect(r.status(), `el enlace ${d} no debe terminar en 404`).toBeLessThan(400)
      }

      // y no escribió nada
      expect(escrituras).toEqual([])
    })

    test('/portal/mis-propiedades y su editor dan 404 (nadie es llevado ahí), sin escribir nada', async ({ page }) => {
      test.skip(!(await portalCerradoEnServidor(page)), 'la réplica se arrancó con el portal abierto (ver MOCK_FLAGS_E2E)')
      const escrituras: Escritura[] = []
      await simular(page, escrituras)
      await entrarComo(page, rol)
      for (const ruta of ['/portal/mis-propiedades', '/portal/mis-propiedades/id-cualquiera/editar']) {
        const r = await page.goto(ruta)
        expect(r?.status(), ruta).toBe(404)
        await expect(page.locator('table')).toHaveCount(0)
      }
      expect(escrituras).toEqual([])
    })
  })
}

test.describe('R8.6 · portal cerrado · administración no depende del portal', () => {
  test('Admin: /admin/propiedades sigue siendo la tabla y /publicador lo lleva ahí', async ({ page }) => {
    test.skip(!(await portalCerradoEnServidor(page)), 'la réplica se arrancó con el portal abierto (ver MOCK_FLAGS_E2E)')
    await simular(page, [])
    await entrarComo(page, 'admin')
    await page.goto('/admin/propiedades')
    await expect(page.locator('body.panel-vb')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mis propiedades' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Tus propiedades no están disponibles todavía' })).toHaveCount(0)

    await page.goto('/publicador')
    await expect(page).toHaveURL(/\/admin\/propiedades$/, { timeout: 15_000 })
  })
})
