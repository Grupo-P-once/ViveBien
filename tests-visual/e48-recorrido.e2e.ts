import { expect, test, type Page, type Request } from '@playwright/test'

/**
 * PUBLICADOR (normal y asociado) en 390/768/1024/1440, con Google y TODA la API simulados en el navegador (no se toca la base ni se usa
 * ninguna cuenta real). Comprueba lo que VE y HACE el publicador sobre el Property Core:
 *
 *  · panel: estado de cada anuncio, observaciones del revisor, y sólo las acciones que le tocan (nunca «publicar» si es normal);
 *  · editor: «Enviar a revisión» (normal) vs «Publicar ahora» (asociado con `publicar_sin_revision`), y bloqueado en revisión;
 *  · lo que manda al servidor es EXACTAMENTE el estado pedido, nada más;
 *  · los errores del servidor (conflicto, rechazo de contenido) se dicen, no se tragan.
 *
 *     npx playwright test -c playwright.sesion.config.ts publicador
 */

const YO = { uid: 'uid-pub', nombre: 'Pablo Publicador', email: 'pablo@prueba.test' }
const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

type Opciones = {
  asociado?: boolean
  propiedades: Array<Record<string, unknown>>
  /** Respuesta de POST /api/propiedades/:id/estado. */
  respuestaEstado?: () => { status: number; cuerpo: unknown }
  respuestaPatch?: () => { status: number; cuerpo: unknown }
}

async function simular(page: Page, o: Opciones) {
  const estados: Array<{ ruta: string; cuerpo: Record<string, unknown> }> = []
  const parches: Array<Record<string, unknown>> = []
  // Medición (15-oct-2026), sin tocar ningún tiempo de espera: en tres corridas distintas hubo pruebas que agotaron 30 s en un
  // `goto` (esperando «load»), en el clic de login o dentro de axe, siempre en pruebas DIFERENTES. Esto deja en el log, por proyecto,
  // toda petición que tardó más de 5 s (PETICION-LENTA) y las que seguían sin terminar al cerrar la página (PETICION-SIN-TERMINAR),
  // con su host. Si el motivo es un tercero lento, aparecerá aquí; si no aparece nada, NO es una petición y habrá que buscar en otro lado.
  const inicioDe = new Map<Request, number>()
  const proyecto = test.info().project.name
  const dondeEs = (r: Request) => { const u = new URL(r.url()); return `${u.host}${u.pathname.slice(0, 60)}` }
  page.on('request', (r) => { inicioDe.set(r, Date.now()) })
  page.on('requestfinished', (r) => {
    const t = Date.now() - (inicioDe.get(r) ?? Date.now())
    inicioDe.delete(r)
    if (t > 5000) console.log(`PETICION-LENTA ${proyecto} ${Math.round(t / 1000)}s ${r.method()} ${dondeEs(r)}`)
  })
  page.on('requestfailed', (r) => { inicioDe.delete(r) })
  page.on('close', () => {
    for (const [r, t] of inicioDe) if (Date.now() - t >= 3000) console.log(`PETICION-SIN-TERMINAR ${proyecto} ${Math.round((Date.now() - t) / 1000)}s ${r.method()} ${dondeEs(r)}`)
  })
  // Guarda de aislamiento (15-oct-2026): ningún servicio real. Se registra PRIMERO, así que las rutas simuladas de abajo (Google/Firebase
  // Auth y la API) tienen prioridad. Las fotos de prueba apuntan a Cloudinary: se responden con un PNG de 1 px y no salen de la máquina.
  const UN_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  await page.route((u) => /(^|\.)cloudinary\.com$/.test(u.hostname), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL }))
  // Terceros que el sitio pide al cargar (medido el 15-oct-2026): Google Fonts, Font Awesome (cdnjs), imágenes de Unsplash y el clima
  // (open-meteo). El evento «load» de `goto` los espera: una fuente de Google quedó colgada 29 s y `goto('/entrar')` agotó los 30 s
  // (diagnóstico de entrar()). Aquí se contestan EN LOCAL: hojas de estilo vacías, imágenes de 1 px y el resto se corta al instante
  // (las fuentes caen a la tipografía del sistema; el clima falla rápido, como ya debe tolerar el sitio).
  // `apis.google.com` (api.js) lo carga Firebase Auth al arrancar; en una corrida quedó 29 s sin terminar y el inicio de sesión se
  // quedó en /entrar (diagnóstico de entrar()). Se corta al instante: el inicio de sesión de la suite es con contraseña y simulado.
  await page.route((u) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|images\.unsplash\.com|api\.open-meteo\.com|apis\.google\.com)$/.test(u.hostname), (r) => {
    const u = new URL(r.request().url())
    if (u.hostname === 'images.unsplash.com') return r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL })
    if (u.hostname === 'fonts.googleapis.com' || (u.hostname === 'cdnjs.cloudflare.com' && u.pathname.endsWith('.css'))) return r.fulfill({ status: 200, contentType: 'text/css', body: '' })
    return r.abort()
  })
  await page.route((u) => /(^|\.)(supabase\.co|supabase\.in|firebaseio\.com|firebaseapp\.com|vercel\.app|vercel\.com|vercel-insights\.com|vercel-scripts\.com|resend\.com|telegram\.org)$/.test(u.hostname), (r) => r.abort())
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill(json({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', user_id: 'x' })))
  await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
    const url = r.request().url()
    if (url.includes('accounts:signInWithPassword')) return r.fulfill(json({ localId: YO.uid, email: YO.email, displayName: YO.nombre, idToken: 'tok-pub', registered: true, refreshToken: 'r', expiresIn: '3600' }))
    if (url.includes('accounts:lookup')) return r.fulfill(json({ users: [{ localId: YO.uid, email: YO.email, emailVerified: true, displayName: YO.nombre, providerUserInfo: [{ providerId: 'password', federatedId: YO.email, email: YO.email }], validSince: '1700000000', lastLoginAt: '1700000000000', createdAt: '1700000000000' }] }))
    return r.fulfill(json({}))
  })
  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    if (q.method() === 'POST' && /^\/api\/propiedades\/[^/]+\/estado$/.test(ruta)) {
      estados.push({ ruta, cuerpo: JSON.parse(q.postData() || '{}') })
      const { status, cuerpo } = (o.respuestaEstado ?? (() => ({ status: 200, cuerpo: { ok: true } })))()
      return r.fulfill(json(cuerpo, status))
    }
    if (q.method() === 'PATCH' && /^\/api\/admin\/propiedades\/[^/]+$/.test(ruta)) {
      parches.push(JSON.parse(q.postData() || '{}'))
      const { status, cuerpo } = (o.respuestaPatch ?? (() => ({ status: 200, cuerpo: { ok: true } })))()
      return r.fulfill(json(cuerpo, status))
    }
    if (q.method() !== 'GET') return r.fulfill(json({ error: 'simulado: no debería llamarse' }, 500))
    if (ruta === '/api/portal/acceso') return r.fulfill(json({ ok: true }))
    if (ruta === '/api/usuarios/me') {
      return r.fulfill(json({
        uid: YO.uid, email: YO.email, nombre: YO.nombre, rol: 'publicador', superAdmin: false, estado: 'activo', portal: true,
        tipoPublicador: o.asociado ? 'asociado' : 'publicador',
        capacidades: o.asociado ? { publicar_sin_revision: true, editar_publicadas: true } : {},
      }))
    }
    if (ruta === '/api/publicador/propiedades') return r.fulfill(json(o.propiedades))
    if (/^\/api\/admin\/propiedades\/[^/]+$/.test(ruta)) return r.fulfill(json({ propiedad: o.propiedades[0], pies: {} }))
    return r.fulfill(json({ error: 'simulado' }, 500))
  })
  return { estados, parches }
}

async function entrar(page: Page) {
  // Diagnóstico (15-oct-2026): en la corrida completa del 15-oct dos pruebas YA existentes agotaron 30 s en este inicio de sesión
  // (`goto('/entrar')` sin llegar a «load»; y el clic de login quedando en /dashboard) y NO se reprodujeron. Sin tocar ningún tiempo
  // de espera: si vuelve a ocurrir, el error dice QUÉ petición seguía sin terminar (¿un tercero lento? ¿nuestro servidor?), que es
  // lo que hasta ahora no se pudo demostrar.
  const enVuelo = new Map<Request, number>()
  const alIniciar = (r: Request) => { enVuelo.set(r, Date.now()) }
  const alTerminar = (r: Request) => { enVuelo.delete(r) }
  page.on('request', alIniciar)
  page.on('requestfinished', alTerminar)
  page.on('requestfailed', alTerminar)
  try {
    await page.goto('/entrar')
    await page.getByLabel(/Correo/i).fill(YO.email)
    await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 })   // un publicador cae en SU portal, no en /admin
  } catch (e) {
    const ahora = Date.now()
    const pendientes = [...enVuelo].map(([r, t]) => `${Math.round((ahora - t) / 1000)} s · ${r.method()} ${r.url().slice(0, 140)}`)
    const lugar = `URL al fallar: ${page.url()}`
    const detalle = pendientes.length ? pendientes.join('\n  ') : '(ninguna: la espera NO fue por una petición sin terminar)'
    throw new Error(`${e instanceof Error ? e.message : String(e)}\n[diagnóstico de entrar()] ${lugar}\n  Peticiones sin terminar:\n  ${detalle}`)
  } finally {
    page.off('request', alIniciar)
    page.off('requestfinished', alTerminar)
    page.off('requestfailed', alTerminar)
  }
}

const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// RECORRIDO COMPLETO DEL PUBLICADOR (E-48 + características, 16-oct-2026). Solo existe en la COPIA aislada. Navegador REAL contra el
// build local; Google, Cloudinary y la API se simulan en el navegador, PERO la API simulada es con ESTADO y ejecuta el saneo REAL del
// servidor (`sanearContenido`, `faltantes`, `fotosSuficientes`): lo que se guarda es lo que el servidor real aceptaría; un valor que el
// servidor real rechazaría aquí también devuelve 400. NO prueba: la base real (PostgREST/RLS), la cuenta real de Cloudinary ni Vercel.
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { sanearContenido } from '../src/lib/sanear-propiedad'
import { faltantes, fotosSuficientes } from '../src/lib/publicacion'
import { MINIMO_FOTOS } from '../src/lib/esquemas/propiedad'

const DIR_E = process.env.EVIDENCIA_DIR ?? join(process.cwd(), '..', 'lanzamiento', 'etapa3', 'evidencia')
mkdirSync(DIR_E, { recursive: true })
const captura = async (page: Page, nombre: string) => page.screenshot({ path: join(DIR_E, `${test.info().project.name}__${nombre}.png`), fullPage: false })
const esCajon = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024
/** El marco (sidebar) sigue puesto: en pantalla ancha el menú está a la vista; en cajón, su botón. */
async function marcoPresente(page: Page) {
  // R8.3: el trabajo con propiedades se pinta dentro del panel del rol (portal o administración); nunca un panel aparte.
  if (esCajon(page)) await expect(page.getByRole('button', { name: 'Mostrar u ocultar el menú' }).first()).toBeVisible({ timeout: 30_000 })
  else await expect(page.locator('nav[aria-label="Tu portal"], nav[aria-label="Panel de administración"]').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('navigation', { name: 'Panel del publicador' })).toHaveCount(0)
}

type Fila = Record<string, unknown>
type Llamada = { metodo: string; ruta: string; status: number; cuerpo?: Record<string, unknown> }

/**
 * API del publicador CON ESTADO. Se registra DESPUÉS de `simular` (la última ruta registrada gana).
 * Qué es de mentira: la persistencia (un arreglo) y la sesión. Qué es REAL: el saneo, la completitud y el mínimo de fotos.
 */
async function backend(page: Page, o: { capacidades: Record<string, boolean>; filas?: Fila[] }) {
  const filas: Fila[] = o.filas ?? []
  const llamadas: Llamada[] = []
  let n = 0
  const nube = 'nube-prueba'
  const quien = { rol: 'publicador', superAdmin: false, estado: 'activo', portal: true, tipoPublicador: 'asociado', capacidades: o.capacidades }

  await page.route('https://api.cloudinary.com/**', async (r) => {
    n += 1
    return r.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ secure_url: `https://res.cloudinary.com/${nube}/image/upload/v1/usuarios/qa/anuncios/e48/foto-${n}.jpg`, public_id: `foto-${n}` }),
    })
  })
  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    const metodo = q.method()
    const cuerpo = q.postData() ? (JSON.parse(q.postData()!) as Record<string, unknown>) : undefined
    const salir = (status: number, body: unknown) => { llamadas.push({ metodo, ruta, status, cuerpo }); return r.fulfill(json(body, status)) }

    if (ruta === '/api/portal/acceso') return r.fulfill(json({ ok: true }))
    if (ruta === '/api/usuarios/me') return r.fulfill(json({ uid: YO.uid, email: YO.email, nombre: YO.nombre, ...quien }))
    if (ruta === '/api/medios/firma' && metodo === 'POST') return r.fulfill(json({ url: `https://api.cloudinary.com/v1_1/${nube}/image/upload`, campos: { api_key: 'falsa', timestamp: '1', signature: 'falsa', public_id: 'x', folder: 'x' } }))
    if (ruta === '/api/citas') return r.fulfill(json({ citas: [] }))
    if (ruta === '/api/publicador/propiedades' && metodo === 'GET') return r.fulfill(json(filas))
    if (ruta === '/api/publicador/propiedades' && metodo === 'POST') {
      const s = sanearContenido(cuerpo ?? {}, { moderador: false, actuales: null, nube })
      if (s.errores.length) return salir(400, { error: `Hay datos que no son válidos: ${s.errores.join('; ')}.` })
      const fila: Fila = { id: `e48-${filas.length + 1}`, estado_pub: 'borrador', estatus: 'disponible', folio: `VB-2026-9${filas.length}`, fotos: [], extras: {}, completitud: 10, ...s.datos }
      filas.push(fila)
      return salir(200, { id: fila.id })
    }
    const m = ruta.match(/^\/api\/admin\/propiedades\/([^/]+)$/)
    if (m) {
      const fila = filas.find((f) => f.id === m[1])
      if (!fila) return salir(404, { error: 'No existe' })
      if (metodo === 'GET') return r.fulfill(json({ propiedad: fila, pies: {} }))
      if (metodo === 'PATCH') {
        const s = sanearContenido(cuerpo ?? {}, { moderador: false, actuales: fila, nube })
        if (s.errores.length) return salir(400, { error: `Hay datos que no son válidos: ${s.errores.join('; ')}.` })
        Object.assign(fila, s.datos)
        return salir(200, { ok: true })
      }
    }
    const e = ruta.match(/^\/api\/propiedades\/([^/]+)\/estado$/)
    if (e && metodo === 'POST') {
      const fila = filas.find((f) => f.id === e[1])
      if (!fila) return salir(404, { error: 'No existe' })
      const destino = String(cuerpo?.estado)
      if (destino === 'publicada' && o.capacidades.publicar_sin_revision !== true) return salir(403, { error: 'Tu cuenta no puede publicar sin revisión.' })
      const falta = faltantes(fila as never)
      if (falta.length || !fotosSuficientes(fila)) return salir(400, { error: `Falta: ${falta.join(', ') || `mínimo ${MINIMO_FOTOS} fotos`}.` })
      fila.estado_pub = destino
      return salir(200, { ok: true, estado: destino })
    }
    return r.fulfill(json({ error: 'simulado: ruta no prevista' }, 500))
  })
  return { filas, llamadas }
}

const DESCRIPCION = 'Oficina corporativa en planta alta, con recepción, dos privados y sala de juntas. Cuenta con fibra óptica, vigilancia las 24 horas, elevador y dos lugares de estacionamiento. Ideal para despachos.'
const archivosPrueba = () => Array.from({ length: MINIMO_FOTOS }, (_, i) => ({ name: `foto-${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }))
/** Abre un grupo plegable del editor (nativo `details`) si está cerrado. */
async function abrirGrupo(page: Page, titulo: string) {
  const cerrado = page.locator('details:not([open]) > summary', { hasText: titulo })
  if (await cerrado.count()) await cerrado.first().click()
}
/** Botón de una botonera (Tipo, Subtipo, Operación). Se busca por su texto: el primer botón de cada grupo hereda en su nombre accesible el texto de la etiqueta que envuelve a todo el grupo (defecto EXISTENTE de `Campo`, registrado como hallazgo heredado). */
const opcion = (page: Page, texto: string) => page.locator('button', { hasText: new RegExp(`^${texto}$`) })
const siguiente = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click()

test.describe('«Citas recibidas» en el menú sólo con la capacidad', () => {
  test('con recibir_citas aparece y lleva a la página; sin ella no existe', async ({ page }) => {
    await simular(page, { propiedades: [] })
    await backend(page, { capacidades: { recibir_citas: true, publicar_sin_revision: true } })
    await entrar(page)
    await page.goto('/publicador')
    await marcoPresente(page)
    const enlace = page.getByRole('link', { name: 'Citas recibidas' })
    await expect(enlace).toBeVisible({ timeout: 15_000 })
    await expect(enlace).toHaveAttribute('href', '/publicador/citas')
    await captura(page, 'menu-con-citas')
    await enlace.click()
    await expect(page).toHaveURL(/\/publicador\/citas$/, { timeout: 30_000 })
    await expect(page.getByText(/Todavía no tienes citas/)).toBeVisible({ timeout: 30_000 })
    await marcoPresente(page)
    await sinDesborde(page)
  })

  test('sin recibir_citas la entrada no aparece (ni su ruta en el menú)', async ({ page }) => {
    await simular(page, { propiedades: [] })
    await backend(page, { capacidades: { publicar_sin_revision: true } })
    await entrar(page)
    await page.goto('/publicador')
    await marcoPresente(page)
    await expect(page.getByRole('heading', { name: 'Mis propiedades' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: 'Citas recibidas' })).toHaveCount(0)
    await captura(page, 'menu-sin-citas')
  })
})

test.describe('recorrido: crear → editar → fotos → publicar → reabrir (con el marco puesto)', () => {
  test('OFICINA corporativa en renta, con sus características', async ({ page }) => {
    test.setTimeout(150_000)
    await simular(page, { propiedades: [] })
    const { filas, llamadas } = await backend(page, { capacidades: { publicar_sin_revision: true, editar_publicadas: true } })
    await entrar(page)

    // 1 · el panel y un anuncio nuevo
    await page.goto('/publicador?nueva=1')
    // (la ventana de alta tapa la página: el marco se comprueba DESPUÉS de crear el borrador)
    await page.getByPlaceholder('Título de la nueva propiedad').fill('Oficina corporativa en Torre Altus')
    await page.getByRole('button', { name: 'Crear borrador' }).click()
    await expect(page).toHaveURL(/\/portal\/mis-propiedades\/e48-1\/editar/, { timeout: 30_000 })
    await expect(page.getByRole('navigation', { name: 'Etapas' })).toBeVisible({ timeout: 30_000 })
    await marcoPresente(page)

    // 2 · paso Tipo: «Oficina» está en el selector; sus subtipos aparecen; renta
    await opcion(page, 'Oficina').click()
    await opcion(page, 'Oficina corporativa').click()
    await opcion(page, 'Renta').click()
    await expect.poll(() => filas[0]?.subtipo, { timeout: 15_000 }).toBe('corporativa')
    expect(filas[0]).toMatchObject({ tipo: 'oficina', operacion: 'renta' })
    await captura(page, 'oficina-paso-tipo')
    await marcoPresente(page)
    await siguiente(page)

    // 3 · Ubicación
    await page.getByLabel('Ubicación').first().fill('Blvd. Campestre 100, León, Gto.')
    await expect.poll(() => String(filas[0]?.ubicacion ?? ''), { timeout: 15_000 }).toContain('Campestre')
    await siguiente(page)

    // 4 · Características: sin recámaras (no es vivienda); con baños, privados, salas, recepción…
    await expect(page.getByLabel('Superficie construida (m²)')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Recámaras')).toHaveCount(0)
    await page.getByLabel('Superficie construida (m²)').fill('95')
    await page.getByLabel('Baños').fill('1.5')
    await page.getByLabel('Área útil (m²)').fill('88')
    await page.getByLabel('Piso en que se ubica').fill('3')
    await page.getByLabel('Hay elevador').check()
    await page.getByLabel('Estacionamientos', { exact: true }).fill('2')
    await page.getByLabel('Privados u oficinas cerradas').fill('2')
    await page.getByLabel('Salas de juntas').fill('1')
    await page.getByLabel('Tiene recepción').check()
    // no aparecen las de otros tipos ni las de renta (esas van en Precio)
    await expect(page.getByLabel('Niveles o plantas')).toHaveCount(0)
    await expect(page.getByLabel('Mascotas')).toHaveCount(0)
    await abrirGrupo(page, 'Servicios')
    await page.getByLabel('Fibra óptica').check()
    await abrirGrupo(page, 'Seguridad')
    await page.getByLabel('Vigilancia 24 horas').check()
    await expect.poll(() => JSON.stringify(filas[0]?.extras ?? {}), { timeout: 20_000 }).toContain('"privados":2')
    await captura(page, 'oficina-paso-caracteristicas')
    await marcoPresente(page)
    await sinDesborde(page)
    await siguiente(page)

    // 5 · Precio + condiciones de renta
    await page.getByLabel('Precio mensual en pesos').fill('18000')
    await page.getByLabel('Amueblado').selectOption('semi')
    await page.getByLabel('Depósito (meses de renta)').fill('2')
    await page.getByLabel('Plazo mínimo (meses)').fill('12')
    await expect(page.getByLabel('Mascotas')).toHaveCount(0)          // no aplica a oficinas
    await expect.poll(() => JSON.stringify(filas[0]?.extras ?? {}), { timeout: 20_000 }).toContain('"deposito_meses":2')
    await captura(page, 'oficina-paso-precio-renta')
    await siguiente(page)

    // 6 · Fotos: se eligen 5, quedan en la cola y se guardan como URLs válidas
    await page.locator('input[type="file"]').first().setInputFiles(archivosPrueba())
    await expect.poll(() => ((filas[0]?.fotos as string[]) ?? []).length, { timeout: 60_000 }).toBe(MINIMO_FOTOS)
    for (const url of filas[0].fotos as string[]) expect(url).toMatch(/^https:\/\/res\.cloudinary\.com\/nube-prueba\/image\/upload\//)
    await marcoPresente(page)
    await captura(page, 'oficina-paso-fotos')
    await siguiente(page)

    // 7 · Descripción
    await page.locator('textarea').first().fill(DESCRIPCION)
    await expect.poll(() => String(filas[0]?.descripcion ?? '').length, { timeout: 15_000 }).toBeGreaterThan(149)
    await siguiente(page)

    // 8 · Revisar y publicar (asociado → publica directo)
    await expect(page.locator('[data-vista-previa]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-vista-previa]')).toContainText('18,000')
    await captura(page, 'oficina-paso-revisar')
    await page.getByRole('button', { name: 'Publicar ahora' }).click()
    await expect.poll(() => filas[0]?.estado_pub, { timeout: 30_000 }).toBe('publicada')
    await marcoPresente(page)

    // 9 · reabrir: nada se perdió (los valores salen de lo guardado por el servidor, no de la pantalla anterior)
    await page.goto('/publicador/propiedades/e48-1/editar?paso=2')
    await expect(page.getByLabel('Superficie construida (m²)')).toHaveValue('95', { timeout: 30_000 })
    await expect(page.getByLabel('Privados u oficinas cerradas')).toHaveValue('2')
    await expect(page.getByLabel('Tiene recepción')).toBeChecked()
    await expect(page.getByLabel('Baños')).toHaveValue('1.5')
    await marcoPresente(page)
    await captura(page, 'oficina-reabierta')
    await page.goto('/publicador/propiedades/e48-1/editar?paso=4')
    await expect(page.getByText(/Está publicada/)).toBeVisible({ timeout: 30_000 })

    // 10 · lo guardado: tipado, validado y con las 5 fotos
    expect(filas[0]).toMatchObject({ tipo: 'oficina', subtipo: 'corporativa', operacion: 'renta', metros: 95, banos: 1.5, precio: 18000, estado_pub: 'publicada' })
    expect(filas[0].extras).toEqual({ caracteristicas: expect.objectContaining({ v: 1, m_utiles: 88, piso: 3, elevador: true, estacionamientos: 2, privados: 2, salas_juntas: 1, recepcion: true, amueblado: 'semi', deposito_meses: 2, plazo_minimo_meses: 12, servicios: ['fibra_optica'] }) })
    expect((filas[0].fotos as string[]).length).toBe(MINIMO_FOTOS)
    // ningún guardado fue rechazado por el servidor real
    expect(llamadas.filter((c) => c.status >= 400), JSON.stringify(llamadas.filter((c) => c.status >= 400))).toEqual([])
  })

  test('CASA en renta con características; al pasar a venta se quita lo de renta y se conserva lo demás', async ({ page }) => {
    test.setTimeout(120_000)
    await simular(page, { propiedades: [] })
    const { filas, llamadas } = await backend(page, {
      capacidades: { publicar_sin_revision: true },
      filas: [{ id: 'e48-1', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-90', fotos: [], titulo: 'Casa de prueba', tipo: 'casa', subtipo: 'sola', operacion: 'renta', precio: 15000, metros: 140, recamaras: 3, banos: 2.5,
        extras: { importado: { origen: 'hoja' }, caracteristicas: { v: 1, estacionamientos: 2, mascotas: 'con_restricciones', amueblado: 'no', deposito_meses: 1, exteriores: ['jardin', 'alberca'] } } }],
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/e48-1/editar?paso=2')
    await expect(page.getByLabel('Recámaras')).toHaveValue('3', { timeout: 30_000 })
    await expect(page.getByLabel('Baños')).toHaveValue('2.5')
    await expect(page.getByLabel('Estacionamientos', { exact: true })).toHaveValue('2')
    await marcoPresente(page)
    await captura(page, 'casa-caracteristicas')
    // cambiar un dato no pierde lo histórico
    await page.getByLabel('Estacionamientos', { exact: true }).fill('3')
    await expect.poll(() => JSON.stringify(filas[0].extras), { timeout: 20_000 }).toContain('"estacionamientos":3')
    expect((filas[0].extras as Record<string, unknown>).importado).toEqual({ origen: 'hoja' })
    // pasar a venta: lo de renta ya no aplica y se quita; el resto queda
    await page.goto('/publicador/propiedades/e48-1/editar?paso=0')
    await opcion(page, 'Venta').click()
    await expect.poll(() => filas[0].operacion, { timeout: 20_000 }).toBe('venta')
    await expect.poll(() => JSON.stringify(filas[0].extras), { timeout: 20_000 }).not.toContain('mascotas')
    expect(filas[0].extras).toEqual({ importado: { origen: 'hoja' }, caracteristicas: { v: 1, estacionamientos: 3, exteriores: ['jardin', 'alberca'] } })
    expect(llamadas.filter((c) => c.status >= 400)).toEqual([])
  })

  test('LOCAL COMERCIAL: se crea y se edita (vocabulario del sitio «comercial»), sin 400', async ({ page }) => {
    await simular(page, { propiedades: [] })
    const { filas, llamadas } = await backend(page, { capacidades: { publicar_sin_revision: true } })
    await entrar(page)
    await page.goto('/publicador?nueva=1')
    await page.getByPlaceholder('Título de la nueva propiedad').fill('Local en plaza')
    await page.getByRole('button', { name: 'Crear borrador' }).click()
    await expect(page).toHaveURL(/\/editar/, { timeout: 30_000 })
    await opcion(page, 'Local comercial').click()
    await opcion(page, 'Venta').click()
    await expect.poll(() => filas[0]?.tipo, { timeout: 20_000 }).toBe('comercial')
    await siguiente(page); await siguiente(page)
    await page.getByLabel('Giro del local').fill('Cafetería')
    await expect.poll(() => JSON.stringify(filas[0]?.extras), { timeout: 20_000 }).toContain('Cafetería')
    expect(filas[0].tipo).toBe('comercial')
    expect(llamadas.filter((c) => c.status >= 400)).toEqual([])
  })

  test('errores del servidor: 400 en una característica se muestra y NO borra lo que el publicador aún necesita guardar', async ({ page }) => {
    await simular(page, { propiedades: [] })
    const { filas } = await backend(page, {
      capacidades: {},
      filas: [{ id: 'e48-1', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-90', fotos: [], titulo: 'Oficina', tipo: 'oficina', operacion: 'venta', extras: {} }],
    })
    // Se fuerza un 500 en el primer guardado, y luego se deja pasar: el cambio sigue pendiente y se reintenta.
    let fallos = 0
    await page.route('**/api/admin/propiedades/e48-1', async (r) => {
      if (r.request().method() === 'PATCH' && fallos < 1) { fallos += 1; return r.fulfill(json({ error: 'Falla simulada del servidor' }, 500)) }
      return r.fallback()
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/e48-1/editar?paso=2')
    await page.getByLabel('Privados u oficinas cerradas').fill('4')
    await expect(page.getByRole('button', { name: 'Reintentar guardado' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByLabel('Privados u oficinas cerradas')).toHaveValue('4')        // la pantalla conserva lo escrito
    await captura(page, 'error-500-conserva-lo-escrito')
    await page.getByRole('button', { name: 'Reintentar guardado' }).click()
    await expect.poll(() => JSON.stringify(filas[0].extras), { timeout: 20_000 }).toContain('"privados":4')
    await marcoPresente(page)
  })
})
