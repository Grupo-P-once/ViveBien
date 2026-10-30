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
// RECORRIDOS POR TIPO (verificación del candidato, 16-oct-2026): casa con muchas características (crear → guardar → publicar → reabrir),
// consultorio y oficina compartida (guardar → reabrir), terreno industrial y nave en parque. Navegador REAL; API simulada CON ESTADO que
// ejecuta el saneo REAL del servidor; «Cloudinary» es simulado (no hay carga real). Sólo existe en copias aisladas.
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
const DIR_CAP = process.env.EVIDENCIA_DIR ?? join(process.cwd(), '..', 'verificacion-capturas')
mkdirSync(DIR_CAP, { recursive: true })
/** Foto de TODA la página (el formulario completo, no sólo lo que cabe en la pantalla); nombre = ancho + estado. */
const captura = (page: Page, nombre: string) => page.screenshot({ path: join(DIR_CAP, `${test.info().project.name}__${nombre}.png`), fullPage: true })
const DESCRIPCION = 'Anuncio de prueba (sintético): inmueble con todos los datos que pide el asistente, descripción suficientemente larga para pasar el mínimo de ciento cincuenta caracteres y poder enviarlo.'
const archivosPrueba = () => Array.from({ length: MINIMO_FOTOS }, (_, i) => ({ name: `foto-${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }))
/** Abre un grupo plegable del editor (nativo `details`) si está cerrado. */
async function abrirGrupo(page: Page, titulo: string) {
  const cerrado = page.locator('details:not([open]) > summary', { hasText: titulo })
  if (await cerrado.count()) await cerrado.first().click()
}
const opcion = (page: Page, grupo: string, texto: string) => page.getByRole('group', { name: grupo, exact: true }).getByRole('button', { name: texto, exact: true })
const siguiente = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click()
/** El nombre de «Baños» incluye su ayuda («Un medio baño cuenta como 0.5…»): se busca por el comienzo. */
const BANOS = /^Baños/
const num = (page: Page, etiqueta: string | RegExp, v: string) => page.getByLabel(etiqueta, typeof etiqueta === 'string' ? { exact: true } : undefined).fill(v)
const marca = (page: Page, grupo: string, etiqueta: string) => page.getByRole('group', { name: grupo, exact: true }).getByLabel(etiqueta, { exact: true }).check()
const extrasDe = (fila: Record<string, unknown>) => (fila.extras as { caracteristicas?: Record<string, unknown> }).caracteristicas ?? {}

async function nuevoAnuncio(page: Page, titulo: string, capacidades: Record<string, boolean> = { publicar_sin_revision: true }) {
  await simular(page, { propiedades: [] })
  const b = await backend(page, { capacidades })
  await entrar(page)
  await page.goto('/publicador?nueva=1')
  await page.getByPlaceholder('Título de la nueva propiedad').fill(titulo)
  await page.getByRole('button', { name: 'Crear borrador' }).click()
  await expect(page).toHaveURL(/\/portal\/mis-propiedades\/e48-1\/editar/, { timeout: 30_000 })
  await expect(page.getByRole('navigation', { name: 'Etapas' })).toBeVisible({ timeout: 30_000 })
  return b
}
const reabrir = async (page: Page, paso: number) => {
  await page.goto(`/publicador/propiedades/e48-1/editar?paso=${paso}`)
  await expect(page.getByRole('navigation', { name: 'Etapas' })).toBeVisible({ timeout: 30_000 })
}
const sinErrores = (llamadas: Llamada[]) => expect(llamadas.filter((c) => c.status >= 400), JSON.stringify(llamadas.filter((c) => c.status >= 400))).toEqual([])

test.describe('recorridos por tipo', () => {
  test('CASA en venta con muchas características: crear, guardar, publicar y reabrir', async ({ page }) => {
    test.setTimeout(180_000)
    const { filas, llamadas } = await nuevoAnuncio(page, 'Casa en privada con alberca')
    await opcion(page, 'Tipo de inmueble', 'Casa').click()
    await opcion(page, 'Subtipo', 'Casa sola').click()
    await opcion(page, 'Operación', 'Venta').click()
    await expect.poll(() => filas[0]?.subtipo, { timeout: 15_000 }).toBe('sola')
    await siguiente(page)
    await page.getByLabel('Ubicación').first().fill('Privada Los Olivos 12, León, Gto.')
    await expect.poll(() => String(filas[0]?.ubicacion ?? ''), { timeout: 15_000 }).toContain('Olivos')
    await siguiente(page)
    await num(page, 'Superficie construida (m²)', '320')
    await num(page, 'Recámaras', '4')
    await num(page, BANOS, '3.5')
    await num(page, 'Terreno (m²)', '400')
    await num(page, 'Niveles o plantas', '2')
    await num(page, 'Estacionamientos', '3')
    await num(page, 'Estacionamientos techados', '2')
    await marca(page, 'Exteriores', 'Jardín'); await marca(page, 'Exteriores', 'Alberca'); await marca(page, 'Exteriores', 'Asador o área de BBQ')
    await marca(page, 'Interiores', 'Cocina integral'); await marca(page, 'Interiores', 'Vestidor'); await marca(page, 'Interiores', 'Cuarto de servicio con baño')
    await marca(page, 'Amenidades comunes del conjunto o edificio', 'Gimnasio')
    await abrirGrupo(page, 'Condiciones del inmueble')
    await num(page, 'Antigüedad (años)', '3')
    await page.getByLabel('Tipo de desarrollo').selectOption('privada')
    await page.getByLabel('Estado general').selectOption('excelente')
    await abrirGrupo(page, 'Servicios')
    await marca(page, 'Servicios disponibles', 'Gas natural')
    await expect.poll(() => JSON.stringify(extrasDe(filas[0])), { timeout: 20_000 }).toContain('"desarrollo":"privada"')
    await captura(page, 'formulario-casa-paso-caracteristicas')
    await siguiente(page)
    await num(page, 'Precio en pesos', '6200000')
    await siguiente(page)
    await page.locator('input[type="file"]').first().setInputFiles(archivosPrueba())
    await expect.poll(() => ((filas[0]?.fotos as string[]) ?? []).length, { timeout: 60_000 }).toBe(MINIMO_FOTOS)
    await siguiente(page)
    await page.locator('textarea').first().fill(DESCRIPCION)
    await expect.poll(() => String(filas[0]?.descripcion ?? '').length, { timeout: 15_000 }).toBeGreaterThan(149)
    await siguiente(page)
    await page.getByRole('button', { name: 'Publicar ahora' }).click()
    await expect.poll(() => filas[0]?.estado_pub, { timeout: 30_000 }).toBe('publicada')
    // reabrir: todo sigue
    await reabrir(page, 2)
    await expect(page.getByLabel('Recámaras', { exact: true })).toHaveValue('4', { timeout: 30_000 })
    await expect(page.getByLabel(BANOS)).toHaveValue('3.5')
    await expect(page.getByLabel('Estacionamientos techados', { exact: true })).toHaveValue('2')
    await expect(page.getByRole('group', { name: 'Exteriores', exact: true }).getByLabel('Alberca', { exact: true })).toBeChecked()
    expect(filas[0]).toMatchObject({ tipo: 'casa', subtipo: 'sola', operacion: 'venta', metros: 320, recamaras: 4, banos: 3.5, precio: 6200000, estado_pub: 'publicada' })
    expect(extrasDe(filas[0])).toMatchObject({ v: 1, m_terreno: 400, niveles: 2, estacionamientos: 3, estacionamientos_cubiertos: 2, antiguedad_anos: 3, desarrollo: 'privada', estado_general: 'excelente',
      exteriores: expect.arrayContaining(['jardin', 'alberca', 'asador']), interiores: expect.arrayContaining(['cocina_integral', 'vestidor', 'cuarto_servicio_bano']), amenidades_comunes: ['gimnasio'], servicios: ['gas_natural'] })
    sinErrores(llamadas)
  })

  for (const [subtipo, valor, operacion] of [['Consultorio', 'consultorio', 'Venta'], ['Oficina compartida o coworking', 'compartida', 'Renta']] as const) {
    test(`OFICINA · ${subtipo}: guardar características y reabrir`, async ({ page }) => {
      test.setTimeout(120_000)
      const { filas, llamadas } = await nuevoAnuncio(page, `${subtipo} de prueba`)
      await opcion(page, 'Tipo de inmueble', 'Oficina').click()
      await opcion(page, 'Subtipo', subtipo).click()
      await opcion(page, 'Operación', operacion).click()
      await expect.poll(() => filas[0]?.subtipo, { timeout: 15_000 }).toBe(valor)
      await siguiente(page); await siguiente(page)
      await expect(page.getByLabel('Recámaras', { exact: true })).toHaveCount(0)
      await num(page, 'Superficie construida (m²)', '45')
      await num(page, BANOS, '1')
      await num(page, 'Piso en que se ubica', '2')
      await page.getByLabel('Hay elevador', { exact: true }).check()
      await num(page, 'Estacionamientos', '1')
      await page.getByLabel('Tiene recepción', { exact: true }).check()
      await page.getByLabel('Tiene sala de espera', { exact: true }).check()
      if (valor === 'compartida') await num(page, 'Puestos de trabajo', '12')
      await marca(page, 'Equipamiento e instalaciones', 'Aire acondicionado'); await marca(page, 'Equipamiento e instalaciones', 'Cocineta')
      await abrirGrupo(page, 'Accesibilidad')
      await marca(page, 'Accesibilidad', 'Baño adaptado')
      await expect.poll(() => JSON.stringify(extrasDe(filas[0])), { timeout: 20_000 }).toContain('bano_adaptado')
      await captura(page, `formulario-oficina-${valor}-paso-caracteristicas`)
      await reabrir(page, 2)
      await expect(page.getByLabel('Piso en que se ubica', { exact: true })).toHaveValue('2', { timeout: 30_000 })
      await expect(page.getByLabel('Tiene sala de espera', { exact: true })).toBeChecked()
      if (valor === 'compartida') await expect(page.getByLabel('Puestos de trabajo', { exact: true })).toHaveValue('12')
      await expect(page.getByRole('group', { name: 'Equipamiento e instalaciones', exact: true }).getByLabel('Cocineta', { exact: true })).toBeChecked()
      expect(filas[0]).toMatchObject({ tipo: 'oficina', subtipo: valor, metros: 45, banos: 1 })
      expect(extrasDe(filas[0])).toMatchObject({ v: 1, piso: 2, elevador: true, estacionamientos: 1, recepcion: true, sala_espera: true, equipamiento: expect.arrayContaining(['aire_acondicionado', 'cocineta']), accesibilidad: ['bano_adaptado'], ...(valor === 'compartida' ? { puestos: 12 } : {}) })
      if (valor !== 'compartida') expect(extrasDe(filas[0])).not.toHaveProperty('puestos')
      sinErrores(llamadas)
    })
  }

  test('TERRENO industrial: superficie del terreno, frente y fondo, parque industrial y kVA; sin campos de vivienda', async ({ page }) => {
    test.setTimeout(120_000)
    const { filas, llamadas } = await nuevoAnuncio(page, 'Terreno industrial de prueba')
    await opcion(page, 'Tipo de inmueble', 'Terreno').click()
    await opcion(page, 'Subtipo', 'Terreno industrial').click()
    await opcion(page, 'Operación', 'Venta').click()
    await expect.poll(() => filas[0]?.subtipo, { timeout: 15_000 }).toBe('industrial')
    await siguiente(page); await siguiente(page)
    await expect(page.getByLabel('Recámaras', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel(BANOS)).toHaveCount(0)
    await num(page, 'Superficie del terreno (m²)', '5000')
    await num(page, 'Frente (m)', '50'); await num(page, 'Fondo (m)', '100')
    await page.getByLabel('Forma del terreno').selectOption('regular')
    await page.getByLabel('Topografía').selectOption('plano')
    await page.getByLabel('Acceso', { exact: true }).selectOption('carretera')
    await page.getByLabel('Está en esquina', { exact: true }).check()
    await abrirGrupo(page, 'Condiciones del inmueble')
    await page.getByLabel('Está bardeado o cercado', { exact: true }).check()
    await page.getByLabel('Está dentro de un parque industrial', { exact: true }).check()
    await abrirGrupo(page, 'Servicios')
    await num(page, 'Capacidad eléctrica disponible (kVA)', '1500')
    await marca(page, 'Servicios disponibles', 'Agua'); await marca(page, 'Servicios disponibles', 'Drenaje')
    await expect.poll(() => JSON.stringify(extrasDe(filas[0])), { timeout: 20_000 }).toContain('drenaje')   // lo ÚLTIMO marcado: si no, la recarga corta el autoguardado pendiente
    await captura(page, 'formulario-terreno-industrial-paso-caracteristicas')
    await reabrir(page, 2)
    await expect(page.getByLabel('Frente (m)', { exact: true })).toHaveValue('50', { timeout: 30_000 })
    await expect(page.getByLabel('Está dentro de un parque industrial', { exact: true })).toBeChecked()
    expect(filas[0]).toMatchObject({ tipo: 'terreno', subtipo: 'industrial', metros: 5000 })
    expect(extrasDe(filas[0])).toMatchObject({ v: 1, frente: 50, fondo: 100, forma: 'regular', topografia: 'plano', acceso: 'carretera', esquina: true, bardeado: true, parque_industrial: true, kva: 1500, servicios: expect.arrayContaining(['agua', 'drenaje']) })
    sinErrores(llamadas)
  })

  test('LOCAL COMERCIAL en esquina: aparador, mezanine, giro, frente y equipamiento', async ({ page }) => {
    test.setTimeout(120_000)
    const { filas, llamadas } = await nuevoAnuncio(page, 'Local en esquina de prueba')
    await opcion(page, 'Tipo de inmueble', 'Local comercial').click()
    await opcion(page, 'Subtipo', 'Local en esquina').click()
    await opcion(page, 'Operación', 'Venta').click()
    await expect.poll(() => filas[0]?.tipo, { timeout: 15_000 }).toBe('comercial')
    await expect.poll(() => filas[0]?.subtipo, { timeout: 15_000 }).toBe('esquina')
    await siguiente(page); await siguiente(page)
    await num(page, 'Superficie construida (m²)', '60')
    await num(page, BANOS, '1')
    await num(page, 'Área útil (m²)', '54'); await num(page, 'Frente (m)', '6')
    await page.getByLabel('Giro del local', { exact: true }).fill('Cafetería')
    await page.getByLabel('Está en esquina', { exact: true }).check()
    await page.getByLabel('Tiene aparador o vitrina al frente', { exact: true }).check()
    await page.getByLabel('Tiene mezanine o planta alta', { exact: true }).check()
    await marca(page, 'Equipamiento e instalaciones', 'Aire acondicionado')
    await expect(page.getByLabel('Recámaras', { exact: true })).toHaveCount(0)
    await expect.poll(() => JSON.stringify(extrasDe(filas[0])), { timeout: 20_000 }).toContain('aire_acondicionado')   // lo ÚLTIMO marcado: si no, la recarga corta el autoguardado pendiente
    await captura(page, 'formulario-local-esquina-paso-caracteristicas')
    await reabrir(page, 2)
    await expect(page.getByLabel('Giro del local', { exact: true })).toHaveValue('Cafetería', { timeout: 30_000 })
    expect(filas[0]).toMatchObject({ tipo: 'comercial', subtipo: 'esquina', metros: 60, banos: 1 })
    expect(extrasDe(filas[0])).toMatchObject({ v: 1, m_utiles: 54, frente: 6, giro: 'Cafetería', esquina: true, vitrina: true, mezanine: true, equipamiento: ['aire_acondicionado'] })
    sinErrores(llamadas)
  })

  test('NAVE en parque, en renta: altura libre, andenes, kVA, patio de maniobras y plazo', async ({ page }) => {
    test.setTimeout(120_000)
    const { filas, llamadas } = await nuevoAnuncio(page, 'Nave de prueba')
    await opcion(page, 'Tipo de inmueble', 'Nave o bodega').click()
    await opcion(page, 'Subtipo', 'Nave en parque industrial').click()
    await opcion(page, 'Operación', 'Renta').click()
    await expect.poll(() => filas[0]?.subtipo, { timeout: 15_000 }).toBe('en_parque')
    await siguiente(page); await siguiente(page)
    await num(page, 'Superficie de la nave (m²)', '4243')
    await num(page, 'Altura libre en metros', '10')
    await num(page, 'Andenes de carga', '4')
    await num(page, 'Patio de maniobras (m²)', '12540'); await num(page, 'Oficinas administrativas (m²)', '331'); await num(page, 'Rampas de acceso', '1')
    await abrirGrupo(page, 'Condiciones del inmueble')
    await num(page, 'Resistencia del piso (ton/m²)', '6')
    await abrirGrupo(page, 'Servicios')
    await num(page, 'Capacidad eléctrica disponible (kVA)', '3000')
    await marca(page, 'Equipamiento e instalaciones', 'Sistema contra incendio')
    await expect.poll(() => JSON.stringify(extrasDe(filas[0])), { timeout: 20_000 }).toContain('"kva":3000')
    await siguiente(page)
    await num(page, 'Plazo mínimo (meses)', '60')
    await expect.poll(() => JSON.stringify(extrasDe(filas[0])), { timeout: 20_000 }).toContain('"plazo_minimo_meses":60')
    await reabrir(page, 2)
    await expect(page.getByLabel('Altura libre en metros', { exact: true })).toHaveValue('10', { timeout: 30_000 })
    expect(filas[0]).toMatchObject({ tipo: 'nave', subtipo: 'en_parque', operacion: 'renta', metros: 4243, altura_libre: 10, andenes: 4 })
    expect(extrasDe(filas[0])).toMatchObject({ v: 1, patio_maniobras_m2: 12540, m_oficinas: 331, rampas: 1, resistencia_piso: 6, kva: 3000, equipamiento: ['contra_incendio'], plazo_minimo_meses: 60 })
    sinErrores(llamadas)
  })
})
