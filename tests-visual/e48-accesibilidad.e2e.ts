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



// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// RECORRIDO COMPLETO DEL PUBLICADOR (E-48 + características, 16-oct-2026). Solo existe en la COPIA aislada. Navegador REAL contra el
// build local; Google, Cloudinary y la API se simulan en el navegador, PERO la API simulada es con ESTADO y ejecuta el saneo REAL del
// servidor (`sanearContenido`, `faltantes`, `fotosSuficientes`): lo que se guarda es lo que el servidor real aceptaría; un valor que el
// servidor real rechazaría aquí también devuelve 400. NO prueba: la base real (PostgREST/RLS), la cuenta real de Cloudinary ni Vercel.
import { sanearContenido } from '../src/lib/sanear-propiedad'
import { faltantes, fotosSuficientes } from '../src/lib/publicacion'
import { MINIMO_FOTOS } from '../src/lib/esquemas/propiedad'


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

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ACCESIBILIDAD DE LOS CONTROLES DEL EDITOR (verificación del candidato, 16-oct-2026). Solo existe en copias aisladas.
// Defecto que se comprueba: `Campo` envolvía las botoneras (Tipo, Subtipo, Operación, mapa) en un <label>. En HTML, la etiqueta
// «etiqueta» al PRIMER descendiente etiquetable: el primer botón heredaba un nombre accesible que mezclaba el campo y todas las opciones
// («Tipo de inmueble Casa Departamento …») y pulsar el texto del campo activaba esa primera opción.
import AxeBuilder from '@axe-core/playwright'
import { appendFileSync } from 'node:fs'

const AXE_SALIDA = process.env.AXE_A11Y_SALIDA
const AXE_ETIQUETA = process.env.AXE_A11Y_ETIQUETA ?? 'sin-etiqueta'

const OFICINA = {
  id: 'e48-1', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-90', titulo: 'Oficina corporativa en Torre Altus', tipo: 'oficina', subtipo: 'corporativa', operacion: 'renta',
  precio: 18000, metros: 95, banos: 1.5, ubicacion: 'Blvd. Campestre 100, León, Gto.',
  descripcion: 'Oficina corporativa en planta alta, con recepción, dos privados y sala de juntas. Cuenta con fibra óptica, vigilancia las 24 horas, elevador y dos lugares de estacionamiento. Ideal para despachos.',
  fotos: [1, 2, 3, 4, 5].map((n) => `https://res.cloudinary.com/nube-prueba/image/upload/v1/prop/${n}.jpg`),
  extras: { caracteristicas: { v: 1, privados: 2, estacionamientos: 2, servicios: ['agua'], amueblado: 'semi' } },
}
const irAlEditor = async (page: Page, paso: number, capacidades: Record<string, boolean> = { publicar_sin_revision: true }) => {
  await simular(page, { propiedades: [] })
  const b = await backend(page, { capacidades, filas: [{ ...OFICINA, extras: { ...OFICINA.extras } }] })
  await entrar(page)
  await page.goto(`/publicador/propiedades/e48-1/editar?paso=${paso}`)
  await expect(page.getByRole('navigation', { name: 'Etapas' })).toBeVisible({ timeout: 30_000 })
  return b
}

test.describe('botoneras del editor: nombre accesible, agrupación, teclado y foco', () => {
  test('cada botonera es un grupo con nombre, y sus botones se llaman sólo por su opción', async ({ page }) => {
    await irAlEditor(page, 0)
    const grupos: [string, string[]][] = [
      ['Tipo de inmueble', ['Nave o bodega', 'Casa', 'Departamento', 'Terreno', 'Local comercial', 'Oficina']],
      ['Subtipo', ['Sin indicar', 'Consultorio', 'Oficina corporativa', 'Oficina compartida o coworking', 'Oficina comercial']],
      ['Operación', ['Venta', 'Renta']],
    ]
    for (const [nombre, opciones] of grupos) {
      const g = page.getByRole('group', { name: nombre, exact: true })
      await expect(g, `grupo «${nombre}»`).toHaveCount(1)
      const nombres = await g.getByRole('button').evaluateAll((bs) => bs.map((b) => (b.textContent ?? '').trim()))
      expect(nombres).toEqual(opciones)
      // el NOMBRE ACCESIBLE de cada botón es su opción, sin mezclar el campo ni las demás opciones
      for (const o of opciones) await expect(g.getByRole('button', { name: o, exact: true }), `botón «${o}» de «${nombre}»`).toHaveCount(1)
    }
  })

  test('pulsar el texto del campo NO activa ninguna opción', async ({ page }) => {
    const { llamadas } = await irAlEditor(page, 0)
    const antes = llamadas.filter((c) => c.metodo === 'PATCH').length
    await page.getByText('Tipo de inmueble', { exact: true }).click()
    await page.getByText('Operación', { exact: true }).click()
    await page.waitForTimeout(1800)   // el autoguardado espera ~1,2 s: si algo se hubiera activado, ya habría un PATCH
    expect(llamadas.filter((c) => c.metodo === 'PATCH').length).toBe(antes)
    await expect(page.getByRole('group', { name: 'Tipo de inmueble', exact: true }).getByRole('button', { name: 'Oficina', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: 'Operación', exact: true }).getByRole('button', { name: 'Renta', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('teclado: Tab recorre las opciones en orden, Espacio/Enter eligen y el foco se ve', async ({ page }) => {
    const { filas } = await irAlEditor(page, 0)
    const venta = page.getByRole('group', { name: 'Operación', exact: true }).getByRole('button', { name: 'Venta', exact: true })
    const renta = page.getByRole('group', { name: 'Operación', exact: true }).getByRole('button', { name: 'Renta', exact: true })
    await venta.focus()
    await expect(venta).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(renta).toBeFocused()
    const anillo = await renta.evaluate((e) => { const c = getComputedStyle(e); return { estilo: c.outlineStyle, ancho: c.outlineWidth, sombra: c.boxShadow } })
    expect(anillo.estilo !== 'none' || anillo.sombra !== 'none', `el foco debe verse: ${JSON.stringify(anillo)}`).toBe(true)
    await page.keyboard.press('Shift+Tab')
    await expect(venta).toBeFocused()
    await page.keyboard.press('Space')
    await expect(venta).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => filas[0].operacion, { timeout: 15_000 }).toBe('venta')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(renta).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => filas[0].operacion, { timeout: 15_000 }).toBe('renta')
    await expect(renta).toBeFocused()
  })

  test('el mapa y las amenidades tienen nombre propio; ningún botón hereda el texto de un campo', async ({ page }) => {
    await irAlEditor(page, 1)
    await expect(page.getByRole('group', { name: 'Marca el punto en el mapa', exact: true })).toHaveCount(1)
    await page.goto('/publicador/propiedades/e48-1/editar?paso=2')
    await expect(page.getByRole('textbox', { name: 'Añadir amenidad', exact: true })).toBeVisible({ timeout: 30_000 })
    const largos = await page.locator('button, input, select, textarea').evaluateAll((els) =>
      els.map((e) => ({ n: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText ?? '').trim(), l: (e as HTMLInputElement).labels ? Array.from((e as HTMLInputElement).labels!).map((x) => (x.textContent ?? '').trim().length) : [] }))
        .filter((x) => x.l.some((n) => n > 120)))
    expect(largos, 'ningún control debe estar etiquetado por una etiqueta enorme que envuelve a otros controles').toEqual([])
  })

  test('las listas de características son grupos con nombre y sus casillas se llaman por su opción', async ({ page }) => {
    await irAlEditor(page, 2)
    const g = page.getByRole('group', { name: 'Servicios disponibles', exact: true })
    await expect(g).toHaveCount(1)
    await expect(g.getByRole('checkbox', { name: 'Agua', exact: true })).toBeChecked()
    await g.getByRole('checkbox', { name: 'Luz', exact: true }).focus()
    await page.keyboard.press('Space')
    await expect(g.getByRole('checkbox', { name: 'Luz', exact: true })).toBeChecked()
  })
})

test.describe('axe sobre los pasos del editor (se guarda el resultado para comparar antes/después)', () => {
  for (const paso of [0, 1, 2, 3, 4, 5, 6]) {
    test(`paso ${paso}`, async ({ page }) => {
      await irAlEditor(page, paso)
      if (paso === 2) { await page.locator('details > summary').evaluateAll((s) => s.forEach((x) => { (x.parentElement as HTMLDetailsElement).open = true })) }
      const r = await new AxeBuilder({ page }).analyze()
      const reglas: Record<string, { impacto: string; nodos: number; ejemplos: string[] }> = {}
      for (const v of r.violations) reglas[v.id] = { impacto: String(v.impact), nodos: v.nodes.length, ejemplos: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} :: ${n.html.slice(0, 110)} :: ${(n.any[0]?.message ?? '').slice(0, 140)}`) }
      if (AXE_SALIDA) appendFileSync(AXE_SALIDA, JSON.stringify({ etiqueta: AXE_ETIQUETA, proyecto: test.info().project.name, paso, reglas }) + '\n')
      // Hallazgos HEREDADOS (existen en el árbol promovido; están en MapaSelector y CampoAmenidades, archivos que este candidato no toca):
      // el pin del mapa sin nombre accesible (paso 1) y dos textos de ayuda #8B95A3 sobre blanco, 3.03:1 (pasos 1 y 2). Se permiten SÓLO esos,
      // con a lo sumo 1 nodo; cualquier otra infracción seria o crítica, o más nodos, hace fallar la prueba.
      const HEREDADOS: Record<number, string[]> = { 1: ['aria-command-name', 'color-contrast'], 2: ['color-contrast'] }
      const graves = Object.entries(reglas).filter(([k, v]) => (v.impacto === 'critical' || v.impacto === 'serious') && !(HEREDADOS[paso]?.includes(k) && v.nodos <= 1))
      expect(graves, JSON.stringify(graves)).toEqual([])
    })
  }
})
