import { expect, test, type Page } from '@playwright/test'
import { aTarjeta, type FilaPropiedadPortal } from '../src/lib/portal/tarjeta'
import { acotarTerceros } from './ayudas-red'

/**
 * D-75 — el corazón del CATÁLOGO guarda en la cuenta (no en el navegador).
 *
 * Sin cuentas reales: Google Identity y `/api/favoritos` se simulan en el navegador;
 * el catálogo sale de la réplica con fixtura (como en `qa:gate`). El «servidor»
 * simulado de favoritos es idempotente y guarda por uid, igual que la ruta real
 * (que se prueba aparte en `tests/favoritos-guardados.test.ts`).
 *
 * Lo que se demuestra con el navegador de verdad:
 *   · estado inicial: ningún corazón lleno; sin sesión, el corazón manda a entrar;
 *   · guardar → queda lleno y llega al «servidor» con el estado deseado;
 *   · refresh → sigue guardada; quitar → refresh → sigue quitada;
 *   · usuario A / usuario B / logout / login: B no ve lo de A, A recupera lo suyo;
 *   · NADA se escribe en localStorage (ni `vb_favorites`), y lo antiguo se limpia.
 */

const PERFILES: Record<string, { uid: string; nombre: string }> = {
  'a@prueba.test': { uid: 'uid-a', nombre: 'Alfa Prueba' },
  'b@prueba.test': { uid: 'uid-b', nombre: 'Beta Prueba' },
}
const porToken = (t: string) => Object.entries(PERFILES).find(([c]) => `tok-${c}` === t)

type Servidor = { guardadas: Map<string, Set<string>>; escrituras: Array<{ uid: string; propiedadId: string; guardado: unknown }>; lecturas: number }

async function simular(page: Page): Promise<Servidor> {
  const srv: Servidor = { guardadas: new Map(), escrituras: [], lecturas: 0 }
  const de = (uid: string) => srv.guardadas.get(uid) ?? srv.guardadas.set(uid, new Set()).get(uid)!
  // Un tercero (Firebase Auth carga apis.google.com al arrancar; fuentes y CDN) que no contesta no puede dejar la página sin sesión (bloqueo A).
  await acotarTerceros(page)
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', token_type: 'Bearer', user_id: 'x', project_id: 'x' }) }))
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
      const [email, p] = hallado ?? ['a@prueba.test', PERFILES['a@prueba.test']]
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ localId: p.uid, email, emailVerified: true, displayName: p.nombre, providerUserInfo: [{ providerId: 'password', federatedId: email, email }], validSince: '0', lastLoginAt: '0', createdAt: '0' }] }) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  // Sólo se simula lo de la cuenta; el catálogo (`/api/catalogo`) sale de la réplica con fixtura.
  await page.route('**/api/favoritos', async (r) => {
    const q = r.request()
    const token = (q.headers()['authorization'] || '').replace('Bearer ', '')
    const hallado = porToken(token)
    if (!hallado) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Inicia sesión para continuar."}' })
    const uid = hallado[1].uid
    if (q.method() === 'GET') {
      srv.lecturas++
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...de(uid)]) })
    }
    const cuerpo = JSON.parse(q.postData() || '{}')
    srv.escrituras.push({ uid, propiedadId: cuerpo.propiedadId, guardado: cuerpo.guardado })
    if (cuerpo.guardado === true) de(uid).add(cuerpo.propiedadId)
    else de(uid).delete(cuerpo.propiedadId)
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, guardado: cuerpo.guardado === true }) })
  })
  await page.route('**/api/usuarios/me', async (r) => {
    const token = (r.request().headers()['authorization'] || '').replace('Bearer ', '')
    const hallado = porToken(token)
    if (!hallado) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"x"}' })
    const [email, p] = hallado
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uid: p.uid, email, nombre: p.nombre, rol: 'cliente', superAdmin: false, estado: 'activo', portal: true }) })
  })
  // El portal (sólo «Mis guardadas» y su resumen): se arma desde el MISMO estado simulado y desde el catálogo real (fixtura).
  const uidDe = (r: { request(): { headers(): Record<string, string> } }) => porToken((r.request().headers()['authorization'] || '').replace('Bearer ', ''))?.[1].uid
  await page.route('**/api/portal/acceso', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  await page.route('**/api/portal/resumen', async (r) => {
    const uid = uidDe(r)
    if (!uid) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"x"}' })
    const ids = [...de(uid)]
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      citasEnLinea: false, tarjetas: { guardadas: ids.length, busquedas: 0, nuevas: 0, visitas: 0 }, guardadas: ids,
      paraTi: { criterio: 'recientes', propiedades: [] }, tuBusqueda: null, consultas: [], proximasVisitas: [], busquedas: [], avisos: [],
    }) })
  })
  await page.route('**/api/portal/guardadas', async (r) => {
    const uid = uidDe(r)
    if (!uid) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"x"}' })
    const filas = await filasCatalogo(page)
    const guardadas = [...de(uid)].map((id) => filas.find((f) => f.id === id)).filter((f): f is FilaPropiedadPortal => !!f)
      .map((f) => ({ ...aTarjeta(f), guardadaEn: '2026-10-08T12:00:00.000Z', disponible: true }))
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ guardadas }) })
  })
  return srv
}

/** Las propiedades reales del catálogo (fixtura de la réplica): de ahí salen los ids y los títulos. */
async function filasCatalogo(page: Page): Promise<FilaPropiedadPortal[]> {
  const res = await page.request.get('/api/catalogo')
  const cuerpo = await res.json()
  return (Array.isArray(cuerpo) ? cuerpo : cuerpo?.propiedades ?? []) as FilaPropiedadPortal[]
}
const tituloDe = async (page: Page, id: string) => aTarjeta((await filasCatalogo(page)).find((f) => f.id === id)!).titulo

async function entrarCon(page: Page, email: string) {
  await page.goto('/entrar')
  await page.getByLabel(/Correo/i).fill(email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/(portal|dashboard)/, { timeout: 30_000 })
}

const corazones = (page: Page) => page.locator('button:has(i.fa-heart)')

/** Los corazones ya existen en el HTML del servidor antes de hidratar: pulsar entonces no hace nada. Se espera a que React los tenga. */
async function corazonesListos(page: Page, conSesion = true) {
  await expect(corazones(page).first()).toBeVisible({ timeout: 45_000 })
  await page.waitForFunction(() => {
    const b = document.querySelector('button i.fa-heart')?.closest('button')
    return !!b && Object.keys(b).some((k) => k.startsWith('__reactProps'))
  }, undefined, { timeout: 45_000 })
  // Con sesión: mientras Firebase decide quién es, el corazón ignora el clic a propósito; el título cambia cuando ya lo sabe.
  if (conSesion) await expect(corazones(page).first()).toHaveAttribute('title', /^(Guardar|Quitar de guardadas)$/, { timeout: 45_000 })
}
const llenos = (page: Page) => page.locator('button:has(i.fas.fa-heart)')

// `domcontentloaded` y no `load`: el catálogo carga fotos y fuentes de terceros y su latencia hace que `load` tarde más de 60 s en un
// equipo cargado (D-72); lo que se prueba son los corazones, que se esperan explícitamente.
async function abrirCatalogo(page: Page, conSesion = true) {
  await page.goto('/propiedades', { waitUntil: 'domcontentloaded' })
  await corazonesListos(page, conSesion)
}

/** Cierra la sesión desde la barra pública (escritorio o menú móvil). */
async function cerrarSesion(page: Page, nombre: string) {
  const movil = page.locator('.vb-nav-mobile-btn')
  if (await movil.isVisible()) {
    await movil.click()
    await page.getByRole('button', { name: /Cerrar sesión/ }).click()
  } else {
    await page.getByRole('button', { name: new RegExp(nombre.split(' ')[0]) }).first().click()
    await page.getByRole('button', { name: /Cerrar sesión/ }).click()
  }
  // Sin sesión la barra ofrece «Ingresar» (en móvil queda dentro del menú cerrado): basta con que exista.
  await expect(page.locator('a[href="/entrar"]').first()).toBeAttached({ timeout: 30_000 })
}

const claveGuardados = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => /favor|guard/i.test(k)))

test('sin sesión: ningún corazón lleno y pulsarlo manda a entrar (no guarda en el navegador)', async ({ page }) => {
  const srv = await simular(page)
  // Lo que dejó la versión anterior: se siembra UNA vez (un `addInitScript` lo volvería a escribir en cada navegación).
  await page.goto('/ayuda', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.setItem('vb_favorites', JSON.stringify(['cualquiera'])))
  await abrirCatalogo(page, false)
  await expect(llenos(page)).toHaveCount(0)
  // Antes de que Firebase conteste, el clic se ignora (no hay a quién mandar a entrar): se repite hasta que la página esté lista. No cambia ningún estado.
  await expect(async () => {
    await corazones(page).first().click()
    await expect(page).toHaveURL(/\/entrar\?siguiente=%2Fpropiedades/, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  expect(srv.escrituras).toEqual([])
  // lo antiguo se limpia y no se crea nada nuevo
  await page.goto('/propiedades', { waitUntil: 'domcontentloaded' })
  await corazonesListos(page, false)
  await expect.poll(() => claveGuardados(page), { timeout: 15_000 }).toEqual([]) // la clave antigua se borra al arrancar
})

test('con sesión: guardar → refresh → sigue guardada; quitar → refresh → sigue quitada', async ({ page }) => {
  const srv = await simular(page)
  await entrarCon(page, 'a@prueba.test')
  await abrirCatalogo(page)
  await expect(llenos(page)).toHaveCount(0) // estado inicial

  await corazones(page).first().click()
  await expect(llenos(page)).toHaveCount(1) // se ve al instante
  await expect.poll(() => srv.escrituras.length).toBe(1)
  expect(srv.escrituras[0]).toMatchObject({ uid: 'uid-a', guardado: true }) // estado deseado, no «alternar»
  expect(await claveGuardados(page)).toEqual([]) // NADA en el navegador

  await page.reload({ waitUntil: 'domcontentloaded' })
  await corazonesListos(page)
  await expect(llenos(page)).toHaveCount(1) // refresh: sigue guardada

  await llenos(page).first().click()
  await expect(llenos(page)).toHaveCount(0)
  await expect.poll(() => srv.escrituras.length).toBe(2)
  expect(srv.escrituras[1]).toMatchObject({ uid: 'uid-a', guardado: false })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await corazonesListos(page)
  await expect(llenos(page)).toHaveCount(0) // refresh: sigue quitada
})

test('doble clic rápido: queda el estado del último clic y el servidor lo confirma', async ({ page }) => {
  const srv = await simular(page)
  await entrarCon(page, 'a@prueba.test')
  await abrirCatalogo(page)
  const uno = corazones(page).first()
  await uno.dblclick() // guardar y quitar al instante
  await expect.poll(() => srv.escrituras.length).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  expect(srv.escrituras.at(-1)).toMatchObject({ guardado: false })
  await expect(llenos(page)).toHaveCount(0)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await corazonesListos(page)
  await expect(llenos(page)).toHaveCount(0)
})

test('A guarda, sale; B no ve nada de A, guarda otra, sale; A recupera sólo la suya', async ({ page }) => {
  const srv = await simular(page)
  await entrarCon(page, 'a@prueba.test')
  await abrirCatalogo(page)
  await corazones(page).nth(0).click()
  await expect(llenos(page)).toHaveCount(1)
  await expect.poll(() => srv.guardadas.get('uid-a')?.size ?? 0).toBe(1)
  const deA = [...srv.guardadas.get('uid-a')!][0]

  await cerrarSesion(page, 'Alfa Prueba')
  expect(await claveGuardados(page)).toEqual([])

  await entrarCon(page, 'b@prueba.test')
  await abrirCatalogo(page)
  await expect(llenos(page)).toHaveCount(0) // B no ve lo de A
  await corazones(page).nth(1).click()
  await expect(llenos(page)).toHaveCount(1)
  await expect.poll(() => srv.guardadas.get('uid-b')?.size ?? 0).toBe(1)
  const deB = [...srv.guardadas.get('uid-b')!][0]
  expect(deB).not.toBe(deA)

  await cerrarSesion(page, 'Beta Prueba')
  await entrarCon(page, 'a@prueba.test')
  await abrirCatalogo(page)
  await expect(llenos(page)).toHaveCount(1)
  expect([...srv.guardadas.get('uid-a')!]).toEqual([deA])
  expect([...srv.guardadas.get('uid-b')!]).toEqual([deB])
})

// ── Catálogo ↔ «Mis guardadas»: una sola verdad (D-75.2) ──────────────────────────

const cuentaPortal = (page: Page, nombre: string) => page.getByRole('button', { name: new RegExp(`^Cuenta de ${nombre}`) })
async function salirDelPortal(page: Page, nombre: string) {
  await cuentaPortal(page, nombre).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Tu portal de Vive Bien' })).toBeVisible({ timeout: 30_000 })
}
async function abrirMisGuardadas(page: Page) {
  await page.goto('/portal/propiedades', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Propiedades guardadas' })).toBeVisible({ timeout: 45_000 })
}
const vacio = (page: Page) => page.getByText('Todavía no guardas ninguna propiedad')

test('guardar en el catálogo → aparece en Mis guardadas → quitarla allí → el catálogo la muestra sin guardar (también tras recargar)', async ({ page }) => {
  const srv = await simular(page)
  await entrarCon(page, 'a@prueba.test')
  await abrirCatalogo(page)
  await corazones(page).first().click()
  await expect(llenos(page)).toHaveCount(1)
  await expect.poll(() => srv.escrituras.length).toBe(1)
  const id = srv.escrituras[0].propiedadId
  const titulo = await tituloDe(page, id)

  // Mis guardadas la muestra, con el corazón lleno (mismo almacén, misma tabla).
  await abrirMisGuardadas(page)
  await expect(page.getByRole('link', { name: titulo }).first()).toBeVisible({ timeout: 45_000 })
  const quitar = page.getByRole('button', { name: `Quitar ${titulo} de guardadas` })
  await expect(quitar).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 })

  // Quitarla desde allí…
  await quitar.click()
  await expect(page.getByRole('button', { name: `Guardar ${titulo}` })).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => srv.escrituras.length).toBe(2)
  expect(srv.escrituras[1]).toMatchObject({ uid: 'uid-a', propiedadId: id, guardado: false })

  // …y volver al catálogo SIN recargar (navegación del cliente): ya no está guardada.
  await page.getByRole('link', { name: /Buscar más/ }).click()
  await expect(page).toHaveURL(/\/propiedades/)
  await corazonesListos(page)
  await expect(llenos(page)).toHaveCount(0)

  // Recargar: sigue sin guardar. Y Mis guardadas queda vacía.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await corazonesListos(page)
  await expect(llenos(page)).toHaveCount(0)
  await abrirMisGuardadas(page)
  await expect(vacio(page)).toBeVisible({ timeout: 30_000 })
  expect(await claveGuardados(page)).toEqual([])
})

test('A guarda y lo ve en Mis guardadas; al salir y entrar B no hereda nada; B guarda otra; A vuelve y ve sólo la suya', async ({ page }) => {
  const srv = await simular(page)
  await entrarCon(page, 'a@prueba.test')
  await abrirCatalogo(page)
  await corazones(page).nth(0).click()
  await expect.poll(() => srv.guardadas.get('uid-a')?.size ?? 0).toBe(1)
  const deA = [...srv.guardadas.get('uid-a')!][0]
  const tituloA = await tituloDe(page, deA)
  await abrirMisGuardadas(page)
  await expect(page.getByRole('link', { name: tituloA }).first()).toBeVisible({ timeout: 45_000 })

  await salirDelPortal(page, 'Alfa')

  // B entra: ni en Mis guardadas ni en el catálogo hay nada de A.
  await entrarCon(page, 'b@prueba.test')
  await abrirMisGuardadas(page)
  await expect(vacio(page)).toBeVisible({ timeout: 30_000 })
  await abrirCatalogo(page)
  await expect(llenos(page)).toHaveCount(0)
  await corazones(page).nth(1).click()
  await expect.poll(() => srv.guardadas.get('uid-b')?.size ?? 0).toBe(1)
  const deB = [...srv.guardadas.get('uid-b')!][0]
  expect(deB).not.toBe(deA)
  const tituloB = await tituloDe(page, deB)
  await abrirMisGuardadas(page)
  await expect(page.getByRole('link', { name: tituloB }).first()).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('link', { name: tituloA })).toHaveCount(0)

  await salirDelPortal(page, 'Beta')

  // A vuelve: ve la suya y NO la de B.
  await entrarCon(page, 'a@prueba.test')
  await abrirMisGuardadas(page)
  await expect(page.getByRole('link', { name: tituloA }).first()).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('link', { name: tituloB })).toHaveCount(0)
  expect([...srv.guardadas.get('uid-a')!]).toEqual([deA])
  expect([...srv.guardadas.get('uid-b')!]).toEqual([deB])
})
