import { accion, fila, itemDeMenu } from './ayudas-lista'
import { expect, test, type Page, type Request } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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
const foto = (n: number) => `https://res.cloudinary.com/nube-prueba/image/upload/v1/prop/${n}.jpg`
const COMPLETA = {
  titulo: 'Casa en León', descripcion: 'Una casa muy bonita con jardín amplio y cochera para dos autos, cerca de todo.', ubicacion: 'León, Gto.',
  precio: 2_500_000, tipo: 'casa', operacion: 'venta', metros: 180, fotos: [1, 2, 3, 4, 5, 6].map(foto), completitud: 100, folio: 'VB-2026-00001',
}
const prop = (id: string, estado: string, extra: Record<string, unknown> = {}) => ({ id, estado_pub: estado, estatus: 'disponible', ...COMPLETA, ...extra })

type Opciones = {
  asociado?: boolean
  /** Respuesta de GET /api/publicador/metricas (métricas de SUS propiedades). */
  metricas?: unknown
  propiedades: Array<Record<string, unknown>>
  /** Respuesta de POST /api/propiedades/:id/estado. */
  respuestaEstado?: () => { status: number; cuerpo: unknown }
  respuestaPatch?: () => { status: number; cuerpo: unknown }
  /** Respuesta de GET /api/propiedades/:id/interno (origen, comisión pactada y notas internas). */
  interno?: { status?: number; cuerpo: unknown }
  /** Respuesta de GET /api/comision/aceptacion (propuesta de comisión, Etapa B). Sin esto responde 500 y el editor no muestra nada. */
  comision?: { cuerpo: unknown }
  /** Respuesta de GET /api/propiedades/:id/origen (origen declarado antes de enviar, migración 43). Sin esto responde 500 y el editor no muestra nada. */
  origen?: { cuerpo: unknown }
  /** Respuesta de GET /api/legal/aceptacion (Términos y Aviso de Privacidad, migración 44). Sin esto responde 500 y el editor no muestra nada. */
  legal?: { cuerpo: unknown }
}

async function simular(page: Page, o: Opciones) {
  const estados: Array<{ ruta: string; cuerpo: Record<string, unknown> }> = []
  const parches: Array<Record<string, unknown>> = []
  const internos: Array<{ metodo: string; cuerpo: Record<string, unknown> }> = []
  const aceptaciones: Array<Record<string, unknown>> = []
  const origenes: Array<Record<string, unknown>> = []
  const legales: Array<Record<string, unknown>> = []
  let legalAceptado = false
  let aceptada = false
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
    if (ruta === '/api/comision/aceptacion') {
      if (q.method() === 'POST') { aceptaciones.push(JSON.parse(q.postData() || '{}')); aceptada = true; return r.fulfill(json({ ok: true }, 201)) }
      if (q.method() === 'GET') return r.fulfill(json(o.comision ? { ...(o.comision.cuerpo as object), aceptada } : { error: 'simulado' }, o.comision ? 200 : 500))
    }
    if (ruta === '/api/legal/aceptacion') {
      if (q.method() === 'POST') { legales.push(JSON.parse(q.postData() || '{}')); legalAceptado = true; return r.fulfill(json({ ok: true }, 201)) }
      if (q.method() === 'GET') {
        const c = o.legal?.cuerpo as { documentos?: Array<Record<string, unknown>>; pendientes?: string[]; requerida?: boolean } | undefined
        if (!c) return r.fulfill(json({ error: 'simulado' }, 500))
        if (legalAceptado && c.documentos) return r.fulfill(json({ ...c, pendientes: [], documentos: c.documentos.map((d) => ({ ...d, aceptado: true })) }))
        return r.fulfill(json(c))
      }
    }
    if (/^\/api\/propiedades\/[^/]+\/origen$/.test(ruta)) {
      if (q.method() === 'PUT') { origenes.push(JSON.parse(q.postData() || '{}')); return r.fulfill(json({ ok: true, listo: true })) }
      if (q.method() === 'GET') return r.fulfill(json(o.origen ? o.origen.cuerpo : { error: 'simulado' }, o.origen ? 200 : 500))
    }
    if (/^\/api\/propiedades\/[^/]+\/interno$/.test(ruta)) {
      if (q.method() !== 'GET') {
        internos.push({ metodo: q.method(), cuerpo: JSON.parse(q.postData() || '{}') })
        return r.fulfill(json(q.method() === 'POST' ? { ok: true, nota: {} } : { ok: true }, q.method() === 'POST' ? 201 : 200))
      }
      return r.fulfill(json(o.interno?.cuerpo ?? { error: 'simulado' }, o.interno?.status ?? (o.interno ? 200 : 500)))
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
    if (ruta === '/api/publicador/metricas') return r.fulfill(json(o.metricas ?? { error: 'simulado' }, o.metricas ? 200 : 500))
    if (/^\/api\/admin\/propiedades\/[^/]+$/.test(ruta)) return r.fulfill(json({ propiedad: o.propiedades[0], pies: {} }))
    return r.fulfill(json({ error: 'simulado' }, 500))
  })
  return { estados, parches, internos, aceptaciones, origenes, legales }
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

test.describe('panel del publicador NORMAL', () => {
  const LISTA = [
    prop('p-borrador', 'borrador', { titulo: 'Borrador completo', completitud: 90 }),
    prop('p-pocos', 'borrador', { titulo: 'Borrador a medias', completitud: 40, fotos: [] }),
    prop('p-cambios', 'cambios_solicitados', { titulo: 'Con cambios pedidos', nota_moderacion: 'Faltan fotos del jardín.' }),
    prop('p-revision', 'en_revision', { titulo: 'En revisión ahora' }),
    prop('p-rechazada', 'rechazada', { titulo: 'Rechazada por fotos', nota_moderacion: 'Las fotos no corresponden al inmueble.' }),
    prop('p-publicada', 'publicada', { titulo: 'Ya publicada', slug: 'casa-ya-publicada-leon-ab12' }),
  ]

  test('cada estado muestra su insignia, la nota del revisor y SÓLO las acciones que le tocan', async ({ page }) => {
    await simular(page, { propiedades: LISTA })
    await entrar(page)
    await page.goto('/publicador')
    await expect(fila(page, 'Borrador completo')).toBeVisible({ timeout: 30_000 })

    // observaciones del revisor
    await expect(fila(page, 'Con cambios pedidos')).toContainText('Nota del revisor: Faltan fotos del jardín.')
    await expect(fila(page, 'Rechazada por fotos')).toContainText('Nota del revisor: Las fotos no corresponden al inmueble.')
    // la insignia de cada estado
    for (const [t, e] of [['Borrador completo', 'Borrador'], ['Con cambios pedidos', 'Con cambios pedidos'], ['En revisión ahora', 'En revisión'], ['Rechazada por fotos', 'Rechazada'], ['Ya publicada', 'Publicada']] as const) await expect(fila(page, t)).toContainText(e)

    // acciones por estado
    await expect(await itemDeMenu(page, 'Borrador completo', /^Enviar a revisión/)).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(await itemDeMenu(page, 'Borrador a medias', /^Enviar a revisión/)).toBeDisabled()   // menos del 80 %
    await page.keyboard.press('Escape')
    await expect(await itemDeMenu(page, 'Con cambios pedidos', /^Enviar a revisión/)).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(await itemDeMenu(page, 'En revisión ahora', 'Retirar el envío')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(fila(page, 'En revisión ahora').getByRole('link', { name: /Editar ficha|Completar ficha/ })).toHaveCount(0)   // en revisión no se edita
    await expect(await itemDeMenu(page, 'Rechazada por fotos', 'Volver a borrador')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(await itemDeMenu(page, 'Ya publicada', 'Ver publicada')).toBeVisible()
    await page.keyboard.press('Escape')
    // R8.6: «Eliminar borrador» NO forma parte de este candidato (decisión pendiente del propietario): ninguna fila lo ofrece.
    for (const t of ['Borrador completo', 'Con cambios pedidos', 'En revisión ahora', 'Rechazada por fotos']) {
      await fila(page, t).getByRole('button', { name: /Más acciones para/ }).click()
      await expect(page.getByRole('menuitem', { name: 'Eliminar borrador' })).toHaveCount(0)
      await page.keyboard.press('Escape')
    }

    // un publicador NORMAL no tiene ningún camino a «publicar»
    await expect(page.getByRole('button', { name: /^Publicar/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Aprobar|Rechazar|Pedir cambios/ })).toHaveCount(0)
    await sinDesborde(page)
  })

  test('«Enviar a revisión» manda EXACTAMENTE {estado: en_revision} y lo confirma con lo que respondió el servidor', async ({ page }) => {
    // Etapa 5: el aviso sale del estado que CONFIRMA el servidor y de la lista recargada, no de lo que se pidió. El simulador se comporta
    // como el servidor real: cambia la fila y responde el contrato (estado releído, vía).
    const lista = LISTA.map((p) => ({ ...p }))
    const fila = lista.find((p) => p.id === 'p-borrador')!
    const { estados } = await simular(page, {
      propiedades: lista,
      respuestaEstado: () => { fila.estado_pub = 'en_revision'; return { status: 200, cuerpo: { ok: true, estado: 'en_revision', confirmado: true, via: 'revision', esTuya: true } } },
    })
    await entrar(page)
    await page.goto('/publicador')
    await accion(page, 'Borrador completo', /^Enviar a revisión/)
    await expect(page.locator('[data-aviso]')).toContainText('Enviado a revisión')
    await expect(page.locator('[data-aviso]')).toContainText('Aún no está publicado')
    expect(estados).toEqual([{ ruta: '/api/propiedades/p-borrador/estado', cuerpo: { estado: 'en_revision' } }])
  })

  test('si el servidor NO confirma el estado (solo {ok:true}) el panel no afirma «Enviada a revisión»', async ({ page }) => {
    const { estados } = await simular(page, { propiedades: LISTA })
    await entrar(page)
    await page.goto('/publicador')
    await accion(page, 'Borrador completo', /^Enviar a revisión/)
    await expect(page.locator('[data-aviso]')).toHaveAttribute('data-aviso', 'advertencia')
    await expect(page.locator('[data-aviso]')).toContainText('No pudimos confirmar el estado')
    await expect(page.locator('[data-aviso]')).not.toContainText(/Enviado a revisión|Propiedad publicada/)
    expect(estados).toHaveLength(1)
  })

  test('si otra persona la movió (409) o falta el perfil, el servidor lo dice y el panel lo enseña', async ({ page }) => {
    await simular(page, {
      propiedades: LISTA,
      respuestaEstado: () => ({ status: 409, cuerpo: { error: 'Esta propiedad cambió de estado mientras la mirabas. Recarga la página para ver cómo quedó.', codigo: 'conflicto' } }),
    })
    await entrar(page)
    await page.goto('/publicador')
    await accion(page, 'Borrador completo', /^Enviar a revisión/)
    await expect(page.getByText(/cambió de estado mientras la mirabas/)).toBeVisible()
  })
})

test.describe('editor: el botón final depende de la CAPACIDAD que dice el servidor', () => {
  test('publicador normal: «Enviar a revisión» (nunca «Publicar ahora») y manda en_revision', async ({ page }) => {
    const { estados } = await simular(page, { propiedades: [prop('p1', 'borrador')] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    const boton = page.getByRole('button', { name: 'Enviar a revisión' })
    await expect(boton).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Publicar ahora' })).toHaveCount(0)
    await boton.click()
    await expect.poll(() => estados.length).toBe(1)
    expect(estados[0]).toEqual({ ruta: '/api/propiedades/p1/estado', cuerpo: { estado: 'en_revision' } })
    await sinDesborde(page)
  })

  test('asociado con publicar_sin_revision: «Publicar ahora» y manda publicada (el servidor igual lo comprueba)', async ({ page }) => {
    const { estados } = await simular(page, { asociado: true, propiedades: [prop('p1', 'borrador')] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    const boton = page.getByRole('button', { name: 'Publicar ahora' })
    await expect(boton).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toHaveCount(0)
    await boton.click()
    await expect.poll(() => estados.length).toBe(1)
    expect(estados[0].cuerpo).toEqual({ estado: 'publicada' })
  })

  test('si el servidor niega publicar (403), el asociado ve el motivo y nada cambia en pantalla', async ({ page }) => {
    await simular(page, {
      asociado: true, propiedades: [prop('p1', 'borrador')],
      respuestaEstado: () => ({ status: 403, cuerpo: { error: 'Sólo un administrador puede publicar una propiedad.' } }),
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await page.getByRole('button', { name: 'Publicar ahora' }).click()
    await expect(page.getByText('Sólo un administrador puede publicar una propiedad.')).toBeVisible()
  })

  test('en revisión el editor está bloqueado: no hay forma de enviar ni de editar', async ({ page }) => {
    const { estados, parches } = await simular(page, { propiedades: [prop('p1', 'en_revision')] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeDisabled({ timeout: 30_000 })
    expect(estados).toEqual([])
    expect(parches).toEqual([])
  })

  test('cambios solicitados: la nota del revisor está arriba del editor y se puede reenviar', async ({ page }) => {
    const { estados } = await simular(page, { propiedades: [prop('p1', 'cambios_solicitados', { nota_moderacion: 'Faltan fotos del jardín.' })] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByText('Nota del revisor:')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Faltan fotos del jardín.')).toBeVisible()
    await page.getByRole('button', { name: 'Enviar a revisión' }).click()
    await expect.poll(() => estados.length).toBe(1)
    expect(estados[0].cuerpo).toEqual({ estado: 'en_revision' })
  })
})


test.describe('propiedad ajena, errores del servidor, recarga y accesibilidad', () => {
  test('propiedad AJENA por URL: el editor lo dice y no ofrece nada que editar ni enviar', async ({ page }) => {
    const { estados, parches } = await simular(page, { propiedades: [prop('mia', 'borrador')] })   // el servidor sólo devuelve lo suyo
    await entrar(page)
    await page.goto('/publicador/propiedades/de-otra-persona/editar?paso=6')
    await expect(page.getByText('Esa propiedad no existe o no es tuya.')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /Enviar a revisión|Publicar ahora/ })).toHaveCount(0)
    expect(estados).toEqual([])
    expect(parches).toEqual([])
  })

  test('el servidor rechaza un valor (400): el publicador lee QUÉ campo y por qué, en español', async ({ page }) => {
    const { parches } = await simular(page, {
      propiedades: [prop('p1', 'borrador')],
      respuestaPatch: () => ({ status: 400, cuerpo: { error: 'Hay datos que no son válidos: Precio: número fuera de rango.' } }),
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=3')
    const precio = page.locator('input[type="number"]').first()
    await expect(precio).toBeVisible({ timeout: 30_000 })
    await precio.fill('999')
    await expect(page.getByText('Precio: número fuera de rango.')).toBeVisible({ timeout: 15_000 })
    expect(parches).toEqual([{ precio: 999 }])
  })

  test('tope de escrituras (429): se dice que espere, sin mensajes técnicos', async ({ page }) => {
    await simular(page, {
      propiedades: [prop('p1', 'borrador')],
      respuestaPatch: () => ({ status: 429, cuerpo: { error: 'Demasiadas peticiones seguidas. Espera un momento e inténtalo otra vez.', esperaSegundos: 30 } }),
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=3')
    await page.locator('input[type="number"]').first().fill('1234')
    await expect(page.getByText(/Demasiadas peticiones seguidas/)).toBeVisible({ timeout: 15_000 })
  })

  test('recargar y volver atrás conservan el paso (deep link) y el estado que dice el servidor', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'cambios_solicitados', { nota_moderacion: 'Faltan fotos del jardín.' })] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Faltan fotos del jardín.')).toBeVisible()
    await page.goto('/publicador')
    await expect(page.getByText('Con cambios pedidos').or(page.getByText('Casa en León')).first()).toBeVisible({ timeout: 30_000 })
    await page.goBack()
    await expect(page).toHaveURL(/\/portal\/mis-propiedades\/p1\/editar\?paso=6/)
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
  })

  test('accesibilidad (axe): panel y editor sin violaciones serias o críticas', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador'), prop('p2', 'cambios_solicitados', { nota_moderacion: 'Faltan fotos.' }), prop('p3', 'en_revision'), prop('p4', 'borrador', { titulo: null, completitud: 10, fotos: [] })] })
    await entrar(page)
    for (const ruta of ['/publicador', '/publicador/propiedades/p1/editar?paso=6']) {
      await page.goto(ruta)
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 })
      await page.waitForTimeout(800)
      // La vista previa es la TARJETA PÚBLICA del sitio (PropertyCard): su contraste es del diseño del sitio, no del módulo; queda como pendiente aparte.
      const r = await new AxeBuilder({ page }).exclude('[data-vista-previa]').analyze()
      const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      console.log(`AXE ${test.info().project.name} ${ruta}: ${r.violations.map((v) => v.id + '/' + v.impact).join(', ') || '-'}`)
      expect(graves.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '') + ' ' + n.html.slice(0, 140)).join(' | ')}`), ruta).toEqual([])
    }
  })
})

// E-48 (15-oct-2026): lo que ve y hace el publicador en el asistente tras las correcciones C1–C6. Mismos simuladores: nada real.
test.describe('asistente de anuncio: sidebar, guardado que no se pierde y mínimo de fotos', () => {
  test('el editor se pinta dentro del portal del publicador (sin panel aparte) y no ofrece la administración', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    if ((page.viewportSize()?.width ?? 1440) < 1024) await expect(page.getByRole('button', { name: 'Mostrar u ocultar el menú' }).first()).toBeVisible({ timeout: 20_000 })
    else await expect(page.getByRole('navigation', { name: 'Tu portal' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('navigation', { name: 'Panel del publicador' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Ver todas' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Panel de administración|Propiedades (administración)/ })).toHaveCount(0)
  })

  test('un PATCH rechazado (400): se ofrece «Reintentar guardado» y el envío se detiene con «No se envió», sin pedir el cambio de estado', async ({ page }) => {
    const { estados, parches } = await simular(page, {
      propiedades: [prop('p1', 'borrador')],
      respuestaPatch: () => ({ status: 400, cuerpo: { error: 'Hay datos que no son válidos: Precio: número fuera de rango.' } }),
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=3')
    const precio = page.locator('input[type="number"]').first()
    await expect(precio).toBeVisible({ timeout: 30_000 })
    await precio.fill('999')
    await expect(page.getByText('Precio: número fuera de rango.')).toBeVisible({ timeout: 15_000 })
    const reintentar = page.getByRole('button', { name: 'Reintentar guardado' })
    await expect(reintentar).toBeVisible()

    // Reintentar vuelve a mandar LO MISMO (no se perdió) y, como el servidor sigue rechazando, sigue ofreciéndose.
    await reintentar.click()
    await expect.poll(() => parches.length).toBe(2)
    expect(parches).toEqual([{ precio: 999 }, { precio: 999 }])
    await expect(reintentar).toBeVisible()

    // Sin recargar (recargar sería otra cosa): al último paso y a enviar. NO debe pedir el cambio de estado.
    await page.getByRole('navigation', { name: 'Etapas' }).getByRole('button', { name: /Publicar/ }).click()
    await page.getByRole('button', { name: 'Enviar a revisión' }).click()
    await expect(page.getByText(/No se envió: tu anuncio no se pudo guardar/)).toBeVisible({ timeout: 15_000 })
    expect(parches).toHaveLength(3)
    expect(estados).toEqual([])
  })

  test('con 3 fotos el paso de fotos sigue incompleto: el mínimo vigente es 5', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador', { fotos: [1, 2, 3].map(foto) })] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    const multimedia = page.getByRole('navigation', { name: 'Etapas' }).getByRole('button', { name: /Multimedia/ })
    await expect(multimedia).toBeVisible({ timeout: 30_000 })
    await expect(multimedia).not.toContainText('✓')
    await page.getByRole('navigation', { name: 'Etapas' }).getByRole('button', { name: /Multimedia/ }).click()
    await expect(page.getByText('3 de 5 fotos · faltan 2')).toBeVisible()
  })

  test('con 5 fotos el paso de fotos se marca completo', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador', { fotos: [1, 2, 3, 4, 5].map(foto) })] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    const multimedia = page.getByRole('navigation', { name: 'Etapas' }).getByRole('button', { name: /Multimedia/ })
    await expect(multimedia).toContainText('✓', { timeout: 30_000 })
  })

  // Comprobación del FIXTURE (no del producto): demuestra que el recorrido ya no espera a servidores de terceros. Antes, una fuente de
  // Google quedó 29 s sin terminar y `goto` agotó el tiempo; ahora todo recurso externo se contesta o se corta al instante.
  test('el recorrido no depende de servidores de terceros: ningún recurso externo tarda más de 2 s', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    const externos = await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((e) => !e.name.startsWith(location.origin) && !e.name.startsWith('data:') && !e.name.startsWith('blob:'))
      .map((e) => ({ host: new URL(e.name).host, ms: Math.round(e.responseEnd - e.startTime) })))
    console.log(`EXTERNOS ${test.info().project.name}: ${externos.length} recursos; más lento ${Math.max(0, ...externos.map((e) => e.ms))} ms; hosts ${[...new Set(externos.map((e) => e.host))].join(', ') || '-'}`)
    expect(externos.filter((e) => e.ms > 2000), 'recursos externos lentos').toEqual([])
  })

  // R8.2: las páginas de /publicador son la pantalla de siempre: un solo <main> y sin marco.
  test('una sola región principal por página (sin marco), y axe sin las reglas de landmarks', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')] })
    await entrar(page)
    for (const ruta of ['/publicador', '/publicador/propiedades/p1/editar?paso=6']) {
      await page.goto(ruta)
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('button', { name: 'Mostrar u ocultar el menú' }).first(), ruta).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('navigation', { name: 'Panel del publicador' }), ruta).toHaveCount(0)
      await expect(page.locator('main'), ruta).toHaveCount(1)
      await expect(page.locator('main main'), ruta).toHaveCount(0)
      const r = await new AxeBuilder({ page }).exclude('[data-vista-previa]')
        .withRules(['landmark-main-is-top-level', 'landmark-no-duplicate-main', 'landmark-unique', 'region']).analyze()
      for (const v of r.violations) console.log(`AXE-LANDMARKS ${test.info().project.name} ${ruta}: ${v.id}/${v.impact} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + n.html.slice(0, 90)).join(' | ')}`)
      // `region` (moderada) NO se exige aquí: lo que queda son (a) el botón flotante de WhatsApp del sitio, fuera del marco y anterior a
      // E-48, y (b) desde 1024 px, el encabezado y la frase de marca de la barra lateral, que el componente compartido deja fuera de un
      // landmark. Se registran en el log (AXE-LANDMARKS) y siguen como pendiente; este caso fija lo que E-48 sí rompió: <main> anidado.
      const landmarks = r.violations.filter((v) => v.id !== 'region')
      expect(landmarks.map((v) => v.id), ruta).toEqual([])
    }
  })
})

test.describe('un publicador no entra a la administración por URL', () => {
  for (const asociado of [false, true]) {
    test(`${asociado ? 'asociado' : 'publicador normal'}: /admin/usuarios muestra «Tu cuenta no tiene acceso al panel» y ninguna tabla ni acción`, async ({ page }) => {
      await simular(page, { asociado, propiedades: [prop('p1', 'borrador')] })
      await entrar(page)
      await page.goto('/admin/usuarios')
      await expect(page.getByRole('heading', { name: 'Tu cuenta no tiene acceso al panel' })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('El panel de administración es sólo para administradores.')).toBeVisible()
      await expect(page.getByRole('table')).toHaveCount(0)
      await expect(page.getByRole('combobox')).toHaveCount(0)   // ni un selector de rol
      await sinDesborde(page)
    })
  }
})

test.describe('«Mis métricas» del publicador y del asociado', () => {
  const fila = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
    id, folio: 'VB-' + id, nombre, tipo: 'casa', operacion: 'venta', estado: 'publicada', precio: 2500000, diasPublicada: 40, vistas: 12, vistasAnteriores: 8, cambioVistas: 50,
    tarjeta: 9, whatsapp: 2, telefono: 1, correo: 0, contactos: 3, solicitudes: 1, guardadas: 4, contactosPor100: 33.3, vistasHistorico: 120, senal: 'bien', ...extra,
  })
  const MET = {
    dias: 30, faltan: [],
    totales: { propiedades: 2, vistas: 12, tarjeta: 9, contactos: 3, solicitudes: 1, sinVistas: 1, contactosPor100: 33.3 },
    propiedades: [fila('1', 'Casa en Cañada del Refugio'), fila('2', 'Borrador sin publicar', { estado: 'borrador', vistas: 0, vistasAnteriores: 0, cambioVistas: null, tarjeta: 0, whatsapp: 0, telefono: 0, contactos: 0, solicitudes: 0, guardadas: 0, contactosPor100: null, diasPublicada: null, senal: 'sin_publicar' })],
    resumen: { porEstado: { publicada: 1, borrador: 1 }, vistasHistorico: 120, diasPromedioPublicadas: 40 },
    generales: { propiedadesPublicadasSitio: 16, vistasPromedioSitio: 7.5 },
  }

  for (const asociado of [false, true]) {
    test(`${asociado ? 'asociado' : 'publicador'}: ve su cartera, sus propiedades con vistas y días, y el promedio del sitio`, async ({ page }) => {
      await simular(page, { propiedades: [prop('p1', 'publicada')], asociado, metricas: MET })
      await entrar(page)
      await page.goto('/portal/mis-metricas')
      await expect(page.getByRole('heading', { name: 'Mis métricas' })).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('[data-kpi="Días promedio publicadas"]')).toContainText('40')
      // Gráficas: el embudo (con su porcentaje contra las vistas), el ranking y los anillos; cada cifra también está en texto.
      const graficas = page.locator('[data-graficas-propias]')
      await expect(graficas).toBeVisible()
      await expect(graficas.locator('[data-etapa="vistas"]')).toContainText('12')
      await expect(graficas.locator('[data-etapa="contactos"]')).toContainText('25 % de las vistas')
      await expect(graficas.getByText('Estado de tus propiedades')).toBeVisible()
      if (process.env.CAPTURAS_METRICAS) await page.screenshot({ path: `${process.env.CAPTURAS_METRICAS}/mis-metricas-${asociado ? 'asociado' : 'publicador'}-${test.info().project.name}.png`, fullPage: true })
      await expect(page.locator('[data-kpi="Promedio del sitio"]')).toContainText('7.5')
      const tabla = page.getByRole('table', { name: 'Rendimiento por propiedad' })
      await expect(tabla).toContainText('Casa en Cañada del Refugio')
      await expect(tabla).toContainText('▲ 50 %')
      await expect(tabla.getByRole('row', { name: /Borrador sin publicar/ })).toContainText('Aún no está publicada')
      // Nada de datos de personas en esta pantalla.
      await expect(page.locator('main, body').first()).not.toContainText(/@|\b\d{10}\b/)
      await sinDesborde(page)
      const graves = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id + ': ' + v.nodes[0]?.target?.join(' '))
      expect(graves).toEqual([])
    })
  }

  test('el menú del portal ofrece «Mis métricas» a quien publica', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'publicada')], metricas: MET })
    await entrar(page)
    const ancho = page.viewportSize()!.width
    if (ancho < 1024) await page.getByRole('button', { name: /Abrir|menú|Toggle Sidebar/i }).first().click().catch(() => {})
    await expect(page.getByRole('navigation', { name: 'Tu portal' }).getByRole('link', { name: 'Mis métricas' })).toBeAttached()
  })

  test('si el servidor falla se ve el error con «Reintentar», no una pantalla vacía', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'publicada')] })      // sin `metricas`: el simulador responde 500
    await entrar(page)
    await page.goto('/portal/mis-metricas')
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('lista de propiedades: «Notas/Comisión» (origen, comisión pactada y notas internas)', () => {
  /** Desde la lista, sin entrar al editor: el botón de la fila abre el panel en una hoja lateral. */
  async function abrirNotas(page: Page) {
    await page.goto('/portal/mis-propiedades')
    await page.locator('[data-notas-comision="p1"]:visible').first().click({ timeout: 30_000 })
  }

  const INTERNO = {
    origen: null,
    notas: [{ id: 'n1', propiedad_id: 'p1', autor_uid: 'uid-pub', autor_rol: 'publicador', texto: 'El dueño pide 3 % y prefiere WhatsApp.', creado_en: '2026-10-20T10:00:00Z' }],
    subidaPor: { nombre: 'Pablo Publicador', correo: 'pablo@prueba.test', rol: 'publicador', modalidad: 'asociado' },
    veTodas: false,
  }

  test('muestra de quién la subió, avisa que falta el origen y deja guardar origen/comisión y agregar una nota', async ({ page }) => {
    const { internos } = await simular(page, { propiedades: [prop('p1', 'borrador')], interno: { cuerpo: INTERNO } })
    await entrar(page)
    await abrirNotas(page)
    const panel = page.locator('[data-panel-interno]')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(panel.locator('[data-subida-por]')).toContainText('Pablo Publicador')
    await expect(panel.locator('[data-subida-por]')).toContainText('pablo@prueba.test')
    await expect(panel.locator('[data-sin-origen]')).toBeVisible()
    await expect(panel.locator('[data-notas]')).toContainText('El dueño pide 3 %')
    // La comisión NO viene rellenada: no hay valor por defecto.
    await expect(panel.getByLabel('Comisión pactada', { exact: true })).toHaveValue('')
    await expect(panel.getByLabel('Valor')).toHaveValue('')

    await panel.getByLabel('¿De quién es? *').selectOption('inmobiliaria')
    await panel.getByLabel('Nombre del dueño o contacto').fill('Luis Gómez')
    await panel.getByLabel('Comisión pactada', { exact: true }).selectOption('porcentaje')
    await panel.getByLabel('Valor').fill('3.5')
    await panel.getByRole('button', { name: 'Guardar origen y comisión' }).click()
    await expect.poll(() => internos.filter((x) => x.metodo === 'PUT').length).toBe(1)
    expect(internos.find((x) => x.metodo === 'PUT')!.cuerpo).toMatchObject({ origen_tipo: 'inmobiliaria', titular_nombre: 'Luis Gómez', comision_tipo: 'porcentaje', comision_valor: '3.5' })

    await panel.getByLabel('Nueva nota').fill('Quedamos en 50/50 si cierra con otra inmobiliaria.')
    await panel.getByRole('button', { name: 'Agregar nota' }).click()
    await expect.poll(() => internos.filter((x) => x.metodo === 'POST').length).toBe(1)
    expect(internos.find((x) => x.metodo === 'POST')!.cuerpo).toEqual({ texto: 'Quedamos en 50/50 si cierra con otra inmobiliaria.' })
    await sinDesborde(page)
  })

  test('sin axe graves en el panel', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], interno: { cuerpo: INTERNO } })
    await entrar(page)
    await abrirNotas(page)
    await expect(page.locator('[data-panel-interno] [data-notas]')).toBeVisible({ timeout: 30_000 })
    const graves = (await new AxeBuilder({ page }).include('[data-panel-interno]').analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id + ': ' + v.nodes[0]?.target?.join(' '))
    expect(graves).toEqual([])
  })

  test('si las tablas aún no existen lo dice (no enseña «sin notas» como si todo estuviera bien)', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], interno: { status: 503, cuerpo: { error: 'no', codigo: 'no_disponible' } } })
    await entrar(page)
    await abrirNotas(page)
    await expect(page.locator('[data-panel-interno]')).toContainText('todavía no están disponibles', { timeout: 30_000 })
    await expect(page.locator('[data-panel-interno] form')).toHaveCount(0)
  })

  test('el equipo ve el aviso de que ve las notas de todos', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], interno: { cuerpo: { ...INTERNO, veTodas: true } } })
    await entrar(page)
    await abrirNotas(page)
    await expect(page.locator('[data-panel-interno]')).toContainText('ves las notas de todos', { timeout: 30_000 })
  })
})

test.describe('editor: propuesta de comisión (Etapa B, solo con el módulo encendido)', () => {
  const COMISION = { requerida: true, texto: { id: 't1', version: 'v1', titulo: 'Propuesta de comisión', cuerpo: 'Texto de prueba de la propuesta de comisión.\n\nSegundo párrafo.', hash: 'a'.repeat(64) } }

  test('si la cuenta tiene que aceptar, ve el texto, marca que lo leyó y acepta; se manda el id y el hash que vio', async ({ page }) => {
    const { aceptaciones } = await simular(page, { propiedades: [prop('p1', 'borrador')], comision: { cuerpo: COMISION } })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    const panel = page.locator('[data-aceptacion-comision]')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(panel.locator('[data-texto-comision]')).toContainText('Segundo párrafo.')
    const boton = panel.getByRole('button', { name: 'Aceptar la propuesta' })
    await expect(boton).toBeDisabled()
    await panel.getByRole('checkbox').check()
    await expect(boton).toBeEnabled()
    await boton.click()
    await expect(panel.locator('[data-comision-aceptada]')).toContainText('Ya aceptaste')
    expect(aceptaciones).toEqual([{ texto_id: 't1', hash: 'a'.repeat(64) }])
    await sinDesborde(page)
  })

  test('sin axe graves en el panel de comisión', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], comision: { cuerpo: COMISION } })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.locator('[data-aceptacion-comision]')).toBeVisible({ timeout: 30_000 })
    const graves = (await new AxeBuilder({ page }).include('[data-aceptacion-comision]').analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id + ': ' + v.nodes[0]?.target?.join(' '))
    expect(graves).toEqual([])
  })

  test('módulo apagado o cuenta exenta (el servidor dice requerida: false): no aparece nada', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], comision: { cuerpo: { requerida: false, texto: null } } })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-aceptacion-comision]')).toHaveCount(0)
  })

  test('si la consulta falla, el editor sigue igual (el servidor decide al enviar)', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-aceptacion-comision]')).toHaveCount(0)
  })

  test('si el servidor niega el envío por falta de aceptación, el publicador ve el motivo', async ({ page }) => {
    await simular(page, {
      propiedades: [prop('p1', 'borrador')], comision: { cuerpo: COMISION },
      respuestaEstado: () => ({ status: 403, cuerpo: { error: 'Antes de enviar tu propiedad tienes que leer y aceptar la propuesta de comisión.', codigo: 'requiere_aceptacion_comision' } }),
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await page.getByRole('button', { name: 'Enviar a revisión' }).click()
    await expect(page.getByText(/leer y aceptar la propuesta de comisión/).first()).toBeVisible({ timeout: 30_000 })
  })
})

test('Notas/Comisión: el editor ya no trae el panel (vive en la lista)', async ({ page }) => {
  await simular(page, { propiedades: [prop('p1', 'borrador')], interno: { cuerpo: { origen: null, notas: [], subidaPor: null, veTodas: false } } })
  await entrar(page)
  await page.goto('/publicador/propiedades/p1/editar?paso=6')
  await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-panel-interno]')).toHaveCount(0)
})

test.describe('editor: origen declarado antes de enviar (migración 43, solo con el módulo encendido)', () => {
  const ORIGEN = {
    aplica: true, listo: false, opcion: null,
    valores: { declara_autorizacion: false, agente_nombre: '', inmobiliaria: '', folio: '', municipio: '', nombre_completo: '', telefono: '', correo: '' }, acreditacion: null,
    prefill: { nombre: 'Luis Gómez Ramírez', telefono: '477 811 6501', correo: 'luis@correo.mx' },
    comoFunciona: ['VIVE BIEN recibe las consultas que genera tu anuncio y las canaliza.', 'Hoy las visitas se coordinan manualmente, no hay agenda automática en línea.'],
    resumen: { borrador: true, lineas: ['Venta: comisión total del 3.5 % del precio final establecido en el contrato de compraventa firmado. Se genera al cierre de la operación y cuando se recibe el pago correspondiente.', 'Renta: comisión total equivalente a un mes de renta base. Se genera cuando se firma el contrato de arrendamiento y se recibe la primera renta.', 'Sin exclusividad: puedes anunciar tu propiedad con otras inmobiliarias y también venderla o rentarla por tu cuenta.'] },
  }
  const abrir = async (page: Page) => {
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    const panel = page.locator('[data-origen-declarado]')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    return panel
  }

  test('nada viene preseleccionado; al elegir se explica el servicio y la comisión', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], origen: { cuerpo: ORIGEN } })
    const panel = await abrir(page)
    await expect(panel.getByRole('radio', { name: /Trato directo/ })).not.toBeChecked()
    await expect(panel.getByRole('radio', { name: /Agente inmobiliario/ })).not.toBeChecked()
    await expect(panel.locator('[data-como-funciona]')).toHaveCount(0)
    await panel.getByRole('radio', { name: /Agente inmobiliario/ }).check()
    await expect(panel.locator('[data-como-funciona]')).toContainText('no hay agenda automática en línea')
    await expect(panel.locator('[data-resumen-economico]')).toContainText('3.5 %')
    await expect(panel.locator('[data-resumen-economico]')).toContainText('Sin exclusividad')
    await expect(panel.locator('[data-resumen-economico]')).not.toContainText('sujetas al acuerdo')
    await sinDesborde(page)
  })

  test('trato directo: pide nombre completo, teléfono y correo (ya llenos con el perfil), y no se guarda sin la declaración', async ({ page }) => {
    const { origenes } = await simular(page, { propiedades: [prop('p1', 'borrador')], origen: { cuerpo: ORIGEN } })
    const panel = await abrir(page)
    await panel.getByRole('radio', { name: /Trato directo/ }).check()
    const guardar = panel.getByRole('button', { name: /Guardar cómo manejo/ })
    await expect(guardar).toBeDisabled()
    await expect(panel.getByLabel('Nombre completo')).toHaveValue('Luis Gómez Ramírez')
    await expect(panel.getByLabel('Teléfono')).toHaveValue('477 811 6501')
    await expect(panel.getByLabel('Correo electrónico')).toHaveValue('luis@correo.mx')
    await expect(panel.getByRole('checkbox')).not.toBeChecked()
    await panel.getByLabel('Nombre completo').fill('Luis')
    await panel.getByRole('checkbox').check()
    await expect(guardar).toBeDisabled() // falta el apellido
    await panel.getByLabel('Nombre completo').fill('Luis Gómez Ramírez')
    await panel.getByLabel('Correo electrónico').fill('sin-arroba')
    await expect(guardar).toBeDisabled() // correo inválido
    await panel.getByLabel('Correo electrónico').fill('luis@correo.mx')
    await expect(guardar).toBeEnabled()
    await guardar.click()
    await expect.poll(() => origenes.length).toBe(1)
    expect(origenes[0]).toEqual({ opcion: 'trato_directo', declara_autorizacion: true, nombre_completo: 'Luis Gómez Ramírez', telefono: '477 811 6501', correo: 'luis@correo.mx' })
  })

  test('agente: pide nombre e inmobiliaria; el folio es opcional y se explica que no verifica nada', async ({ page }) => {
    const { origenes } = await simular(page, { propiedades: [prop('p1', 'borrador')], origen: { cuerpo: ORIGEN } })
    const panel = await abrir(page)
    await panel.getByRole('radio', { name: /Agente inmobiliario/ }).check()
    await expect(panel).toContainText('pendiente de verificación')
    await expect(panel.getByLabel(/Folio de acreditación estatal \(opcional\)/)).toBeVisible()
    await panel.getByLabel('Nombre del agente').fill('Ana Ruiz')
    await panel.getByLabel(/Nombre comercial o razón social/).fill('Casas del Bajío')
    await panel.getByRole('button', { name: /Guardar cómo manejo/ }).click()
    await expect.poll(() => origenes.length).toBe(1)
    expect(origenes[0]).toEqual({ opcion: 'agente', agente_nombre: 'Ana Ruiz', inmobiliaria: 'Casas del Bajío', folio: '', municipio: '' })
  })

  test('sin axe graves ni desborde', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], origen: { cuerpo: { ...ORIGEN, opcion: 'agente', valores: { ...ORIGEN.valores, agente_nombre: 'Ana', inmobiliaria: 'Casas' }, acreditacion: { estado: 'sin_folio', etiqueta: 'Sin folio aportado · pendiente de verificación' } } } })
    const panel = await abrir(page)
    await expect(panel.locator('[data-acreditacion-estado]')).toContainText('Sin folio aportado')
    const graves = (await new AxeBuilder({ page }).include('[data-origen-declarado]').analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id + ': ' + v.nodes[0]?.target?.join(' '))
    expect(graves).toEqual([])
    await sinDesborde(page)
  })

  test('módulo apagado, equipo o cuenta exenta (aplica: false): no aparece nada', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], origen: { cuerpo: { aplica: false } } })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-origen-declarado]')).toHaveCount(0)
  })

  test('si la consulta falla, el editor sigue igual (el servidor decide al enviar)', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-origen-declarado]')).toHaveCount(0)
  })

  test('si el servidor niega el envío por falta de origen, el publicador ve el motivo', async ({ page }) => {
    await simular(page, {
      propiedades: [prop('p1', 'borrador')], origen: { cuerpo: ORIGEN },
      respuestaEstado: () => ({ status: 403, cuerpo: { error: 'Antes de enviar tu propiedad dinos cómo la manejas (trato directo o agente/inmobiliaria).', codigo: 'requiere_origen' } }),
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await page.getByRole('button', { name: 'Enviar a revisión' }).click()
    await expect(page.getByText(/dinos cómo la manejas/).first()).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('editor: Términos y Condiciones y Aviso de Privacidad (migración 44, solo con legalAcceptance encendido)', () => {
  const LEGAL = {
    requerida: true, pendientes: ['terminos', 'privacidad'],
    documentos: [
      { documento: 'terminos', nombre: 'Términos y Condiciones', ruta: '/terminos', version: '2026-04-06', fecha: '6 de abril de 2026', aceptado: false },
      { documento: 'privacidad', nombre: 'Aviso de Privacidad', ruta: '/privacidad', version: '2026-09-11', fecha: '11 de septiembre de 2026', aceptado: false },
    ],
  }
  const abrir = async (page: Page) => {
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    const panel = page.locator('[data-aceptacion-legal]')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    return panel
  }

  test('nada viene marcado; con enlaces a las páginas vigentes y su versión; solo acepta con los dos marcados', async ({ page }) => {
    const { legales } = await simular(page, { propiedades: [prop('p1', 'borrador')], legal: { cuerpo: LEGAL } })
    const panel = await abrir(page)
    await expect(panel.getByRole('checkbox')).toHaveCount(2)
    await expect(panel.getByRole('checkbox', { name: /Términos y Condiciones/ })).not.toBeChecked()
    await expect(panel.getByRole('checkbox', { name: /Aviso de Privacidad/ })).not.toBeChecked()
    await expect(panel.getByRole('link', { name: /Términos y Condiciones/ })).toHaveAttribute('href', '/terminos')
    await expect(panel.getByRole('link', { name: /Aviso de Privacidad/ })).toHaveAttribute('href', '/privacidad')
    await expect(panel).toContainText('versión del 6 de abril de 2026')
    await expect(panel).toContainText('versión del 11 de septiembre de 2026')
    const boton = panel.getByRole('button', { name: 'Aceptar' })
    await expect(boton).toBeDisabled()
    await panel.getByRole('checkbox', { name: /Términos y Condiciones/ }).check()
    await expect(boton).toBeDisabled() // falta el Aviso
    await panel.getByRole('checkbox', { name: /Aviso de Privacidad/ }).check()
    await expect(boton).toBeEnabled()
    await boton.click()
    await expect.poll(() => legales.length).toBe(1)
    expect(legales[0]).toEqual({ documentos: ['terminos', 'privacidad'], versiones: { terminos: '2026-04-06', privacidad: '2026-09-11' } })
    await expect(panel.locator('[data-legal-aceptado="terminos"]')).toContainText('Ya aceptaste el Términos y Condiciones')
    await expect(panel.locator('[data-legal-aceptado="privacidad"]')).toContainText('Ya aceptaste')
    await sinDesborde(page)
  })

  test('si ya aceptó uno, solo pide el otro', async ({ page }) => {
    const { legales } = await simular(page, { propiedades: [prop('p1', 'borrador')], legal: { cuerpo: { ...LEGAL, pendientes: ['privacidad'], documentos: [{ ...LEGAL.documentos[0], aceptado: true }, LEGAL.documentos[1]] } } })
    const panel = await abrir(page)
    await expect(panel.getByRole('checkbox')).toHaveCount(1)
    await expect(panel.locator('[data-legal-aceptado="terminos"]')).toBeVisible()
    await panel.getByRole('checkbox', { name: /Aviso de Privacidad/ }).check()
    await panel.getByRole('button', { name: 'Aceptar' }).click()
    await expect.poll(() => legales.length).toBe(1)
    expect(legales[0].documentos).toEqual(['privacidad'])
  })

  test('sin axe graves', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], legal: { cuerpo: LEGAL } })
    await abrir(page)
    const graves = (await new AxeBuilder({ page }).include('[data-aceptacion-legal]').analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id + ': ' + v.nodes[0]?.target?.join(' '))
    expect(graves).toEqual([])
  })

  test('módulo apagado o equipo (requerida: false): no aparece nada', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')], legal: { cuerpo: { requerida: false, pendientes: [], documentos: [] } } })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-aceptacion-legal]')).toHaveCount(0)
  })

  test('si la consulta falla, el editor sigue igual (el servidor decide al enviar)', async ({ page }) => {
    await simular(page, { propiedades: [prop('p1', 'borrador')] })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-aceptacion-legal]')).toHaveCount(0)
  })

  test('si el servidor niega el envío por falta de aceptación legal, el publicador ve el motivo', async ({ page }) => {
    await simular(page, {
      propiedades: [prop('p1', 'borrador')], legal: { cuerpo: LEGAL },
      respuestaEstado: () => ({ status: 403, cuerpo: { error: 'Antes de enviar tu propiedad tienes que aceptar los Términos y Condiciones y el Aviso de Privacidad.', codigo: 'requiere_aceptacion_legal' } }),
    })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=6')
    await page.getByRole('button', { name: 'Enviar a revisión' }).click()
    await expect(page.getByText(/aceptar los Términos y Condiciones y el Aviso de Privacidad/).first()).toBeVisible({ timeout: 30_000 })
  })
})
