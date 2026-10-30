import { expect, test, type Page } from '@playwright/test'

/**
 * CREACIÓN DE UNA CONSULTA desde la ficha, por rol (Etapa 6), en 390/768/1024/1440.
 *
 * Reporte del propietario: «Me interesan» y «Mis consultas» no guardaban nada. Causa: la ficha siempre mandaba a `/api/registro-lead`
 * (prospecto, tabla `leads`, sin cuenta) aunque hubiera sesión; las pantallas del portal leen `solicitudes_contacto` (ligada a la cuenta).
 * Regla de esta prueba: CON sesión → `/api/contacto` (consulta de la cuenta); SIN sesión → `/api/registro-lead` (prospecto).
 *
 * QUÉ ES DE MENTIRA: Google, Firebase y TODA la API se simulan en el navegador (nada sale de la máquina); la ficha se alimenta de la
 * fixtura del catálogo (réplica local). El contrato de `/api/contacto` y las pantallas del portal por rol se prueban contra las rutas REALES
 * en `tests/portal-por-rol.test.ts`. No prueba la base real ni producción.
 */

const YO = { uid: 'uid-yo', nombre: 'Persona de Prueba', email: 'persona@prueba.test' }
const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
const SLUG_FICHA = 'sintetica-e48-2-casa-renta'
const FICHA = `/propiedades/${SLUG_FICHA}`

type Rol = 'cliente' | 'publicador' | 'asociado' | 'admin' | 'super_admin'
type Llamada = { ruta: string; cuerpo: Record<string, unknown>; autorizada: boolean }
type Opciones = { rol?: Rol; contacto?: () => { status: number; cuerpo: unknown } }

async function simular(page: Page, o: Opciones = {}) {
  const llamadas: Llamada[] = []
  const UN_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  const rol = o.rol ?? 'cliente'
  const esAdmin = rol === 'admin' || rol === 'super_admin'

  await page.route((u) => /(^|\.)(cloudinary\.com|images\.unsplash\.com)$/.test(u.hostname), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL }))
  await page.route((u) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|api\.open-meteo\.com|apis\.google\.com|googletagmanager\.com|google-analytics\.com)$/.test(u.hostname), (r) => {
    if (new URL(r.request().url()).pathname.endsWith('.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: '' })
    return r.abort()
  })
  await page.route((u) => /(^|\.)(supabase\.co|supabase\.in|firebaseio\.com|firebaseapp\.com|vercel\.app|vercel\.com|vercel-insights\.com|vercel-scripts\.com|resend\.com|telegram\.org)$/.test(u.hostname), (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill(json({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', user_id: 'x' })))
  await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
    const url = r.request().url()
    if (url.includes('accounts:signInWithPassword')) return r.fulfill(json({ localId: YO.uid, email: YO.email, displayName: YO.nombre, idToken: 'tok', registered: true, refreshToken: 'r', expiresIn: '3600' }))
    if (url.includes('accounts:lookup')) return r.fulfill(json({ users: [{ localId: YO.uid, email: YO.email, emailVerified: true, displayName: YO.nombre, providerUserInfo: [{ providerId: 'password', federatedId: YO.email, email: YO.email }], validSince: '1700000000', lastLoginAt: '1700000000000', createdAt: '1700000000000' }] }))
    return r.fulfill(json({}))
  })

  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    const cuerpo = q.postData() ? (JSON.parse(q.postData()!) as Record<string, unknown>) : {}
    if (ruta === '/api/portal/acceso') return r.fulfill(json({ ok: true }))
    if (ruta === '/api/usuarios/me') {
      return r.fulfill(json({
        uid: YO.uid, email: YO.email, nombre: YO.nombre, rol: esAdmin ? 'admin' : rol === 'cliente' ? 'cliente' : 'publicador', superAdmin: rol === 'super_admin', estado: 'activo', portal: true,
        ...(rol === 'publicador' || rol === 'asociado' ? { tipoPublicador: rol, capacidades: {} } : {}),
      }))
    }
    if (q.method() === 'POST' && (ruta === '/api/contacto' || ruta === '/api/registro-lead')) {
      llamadas.push({ ruta, cuerpo, autorizada: Boolean(q.headers()['authorization']) })
      if (ruta === '/api/contacto') {
        const x = (o.contacto ?? (() => ({ status: 200, cuerpo: { ok: true } })))()
        return r.fulfill(json(x.cuerpo, x.status))
      }
      return r.fulfill(json({ ok: true }))
    }
    if (q.method() === 'POST') return r.fulfill(json({ ok: true })) // eventos, etc.
    return r.fulfill(json({}))
  })
  return { llamadas }
}

async function entrar(page: Page) {
  await page.goto('/entrar')
  await page.getByLabel(/Correo/i).fill(YO.email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).not.toHaveURL(/\/entrar/, { timeout: 30_000 })
}

const campos = (page: Page) => ({
  nombre: page.locator('form input[type="text"]').first(),
  telefono: page.locator('form input[type="tel"]'),
  email: page.locator('form input[type="email"]'),
  acepto: page.locator('form').getByRole('checkbox'),
  enviar: page.getByRole('button', { name: /ENVIAR SOLICITUD/ }),
})
async function abrirFicha(page: Page) {
  await page.goto(FICHA)
  await expect(page.locator('form input[type="tel"]')).toBeVisible({ timeout: 45_000 })
}

const ROLES: Rol[] = ['cliente', 'publicador', 'asociado', 'admin', 'super_admin']

test.describe('con sesión, la consulta se crea EN LA CUENTA (la que leen «Mis consultas» y «Me interesan»)', () => {
  for (const rol of ROLES) {
    test(`${rol}: nombre y correo vienen de la cuenta; se envía a /api/contacto con su sesión; confirma y manda a «Mis consultas»`, async ({ page }) => {
      const { llamadas } = await simular(page, { rol })
      await entrar(page)
      await abrirFicha(page)
      const c = campos(page)
      // nombre y correo ya vienen de la cuenta (no se vuelven a pedir)
      await expect(c.nombre).toHaveValue(YO.nombre)
      await expect(c.email).toHaveValue(YO.email)
      await expect(c.email).toHaveAttribute('required', '')
      await c.telefono.fill('477 111 2233')
      await c.acepto.check()
      await c.enviar.click()

      await expect(page.getByText('¡Solicitud enviada!')).toBeVisible({ timeout: 30_000 })
      const nota = page.locator('[data-solicitud-con-cuenta]')
      await expect(nota).toContainText('Quedó en tu cuenta')
      await expect(nota.getByRole('link', { name: 'Mis consultas' })).toHaveAttribute('href', '/portal/consultas')

      // por el camino de la CUENTA, una sola vez, con su sesión, y NO como prospecto
      expect(llamadas.map((l) => l.ruta)).toEqual(['/api/contacto'])
      expect(llamadas[0].autorizada).toBe(true)
      expect(llamadas[0].cuerpo).toMatchObject({ propiedadId: expect.stringMatching(/^[0-9a-f-]{36}$/), nombre: YO.nombre, email: YO.email, telefono: '477 111 2233', consentimiento: true, tipo: 'informacion' })
    })
  }

  test('si el servidor ya tenía la misma solicitud: lo dice y no promete otra', async ({ page }) => {
    await simular(page, { contacto: () => ({ status: 200, cuerpo: { ok: true, duplicada: true } }) })
    await entrar(page)
    await abrirFicha(page)
    const c = campos(page)
    await c.telefono.fill('4771112233'); await c.acepto.check(); await c.enviar.click()
    await expect(page.getByText('Ya recibimos tu solicitud sobre esta propiedad')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-solicitud-con-cuenta]')).toBeVisible()
  })

  test('un rechazo del servidor se muestra con SU motivo (antes siempre decía «No se pudo enviar…») y NO se guarda como prospecto', async ({ page }) => {
    const { llamadas } = await simular(page, { contacto: () => ({ status: 400, cuerpo: { error: 'Revisa tu teléfono: necesitamos 10 dígitos.' } }) })
    await entrar(page)
    await abrirFicha(page)
    const c = campos(page)
    await c.telefono.fill('12345'); await c.acepto.check(); await c.enviar.click()
    await expect(page.getByText('Revisa tu teléfono: necesitamos 10 dígitos.')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('¡Solicitud enviada!')).toHaveCount(0)
    expect(llamadas.map((l) => l.ruta)).toEqual(['/api/contacto'])
  })

  test('si la sesión venció (401) los datos NO se pierden: se guardan como prospecto y se dice «enviada» sin prometer «en tu cuenta»', async ({ page }) => {
    const { llamadas } = await simular(page, { contacto: () => ({ status: 401, cuerpo: { error: 'Inicia sesión para enviar tu solicitud.', requiereSesion: true } }) })
    await entrar(page)
    await abrirFicha(page)
    const c = campos(page)
    await c.telefono.fill('4771112233'); await c.acepto.check(); await c.enviar.click()
    await expect(page.getByText('¡Solicitud enviada!')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-solicitud-con-cuenta]')).toHaveCount(0)
    expect(llamadas.map((l) => l.ruta)).toEqual(['/api/contacto', '/api/registro-lead'])
  })

  test('con sesión el correo es obligatorio (la solicitud de una cuenta lo exige): sin correo no se envía nada', async ({ page }) => {
    const { llamadas } = await simular(page)
    await entrar(page)
    await abrirFicha(page)
    const c = campos(page)
    await c.email.fill('')
    await c.telefono.fill('4771112233'); await c.acepto.check(); await c.enviar.click()
    expect(await c.email.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false)
    await page.waitForTimeout(800)
    expect(llamadas).toHaveLength(0)
  })
})

test.describe('sin sesión, es un PROSPECTO (se conserva como hasta ahora)', () => {
  test('va a /api/registro-lead, sin sesión, y no dice «en tu cuenta»; el correo sigue siendo opcional', async ({ page }) => {
    const { llamadas } = await simular(page)
    await abrirFicha(page)
    const c = campos(page)
    await expect(c.email).not.toHaveAttribute('required', '')
    await c.nombre.fill('Persona Anónima'); await c.telefono.fill('4771112233'); await c.acepto.check(); await c.enviar.click()
    await expect(page.getByText('¡Solicitud enviada!')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-solicitud-con-cuenta]')).toHaveCount(0)
    expect(llamadas.map((l) => l.ruta)).toEqual(['/api/registro-lead'])
    expect(llamadas[0].autorizada).toBe(false)
    expect(llamadas[0].cuerpo).toMatchObject({ origen: 'ficha', propiedadId: expect.stringMatching(/^[0-9a-f-]{36}$/), consentimiento: true })
  })
})
