import { accion, fila } from './ayudas-lista'
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { sanearContenido } from '../src/lib/sanear-propiedad'
import { faltantes, fotosSuficientes, puedeTransicionar, type EstadoPub } from '../src/lib/publicacion'
import { rutaDe } from '../src/lib/propiedad-publica'

/**
 * CONFIRMACIÓN DE PUBLICACIÓN SEGÚN ROL Y ESTADO REAL (Etapa 5) — navegador REAL contra el build local, en 390/768/1024/1440.
 *
 * QUÉ ES DE MENTIRA: Google, Cloudinary, Supabase y TODA la API se simulan en el navegador (nada sale de la máquina; las rutas externas
 * se cortan). La API simulada es con ESTADO y reutiliza las reglas REALES del servidor: `sanearContenido`, `faltantes`,
 * `fotosSuficientes` y `puedeTransicionar` (la misma máquina de estados y el mismo permiso `publicar_sin_revision`). El contrato que
 * devuelve `/estado` (estado releído, vía, ruta, esTuya) está probado contra la ruta REAL en `tests/confirmacion-publicacion.test.ts`.
 * NO prueba: la base real, Vercel, Cloudinary, un Super Admin real ni producción. Una «publicación» de aquí es una fila en un arreglo.
 *
 * Es un único servidor de pruebas y trabajadores = 1: no hay cadenas paralelas.
 */

const YO = { uid: 'uid-yo', nombre: 'Persona de Prueba', email: 'persona@prueba.test' }
const OTRA = 'uid-otra-cuenta'
const NUBE = 'nube-prueba'
const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
const DIR_E = process.env.EVIDENCIA_DIR ?? join(process.cwd(), '..', 'lanzamiento', 'etapa3', 'evidencia')
mkdirSync(DIR_E, { recursive: true })
const captura = async (page: Page, nombre: string) => page.screenshot({ path: join(DIR_E, `${test.info().project.name}__${nombre}.png`), fullPage: false })

type Rol = 'super_admin' | 'admin' | 'publicador' | 'asociado' | 'asociado_sin_permiso'
type Fila = Record<string, unknown>
type Llamada = { metodo: string; ruta: string; status: number; cuerpo?: Record<string, unknown> }

const completa = (id: string, extra: Fila = {}): Fila => ({
  id, owner_id: YO.uid, estado_pub: 'borrador', estatus: 'disponible', folio: `VB-2026-${id}`, completitud: 100, extras: {},
  titulo: 'Casa de prueba en León', descripcion: 'Una casa muy bonita con jardín amplio y cochera para dos autos, cerca de todo.',
  ubicacion: 'León, Gto.', precio: 2_500_000, tipo: 'casa', operacion: 'venta', metros: 180, recamaras: 3, banos: 2,
  fotos: ['1', '2', '3', '4', '5'].map((n) => `https://res.cloudinary.com/${NUBE}/image/upload/v1/prop/${n}.jpg`),
  ...extra,
})

/** Lo que el servidor real decide con el perfil efectivo (rol + `publicar_sin_revision`). */
const perfilDe = (rol: Rol) => {
  const esAdmin = rol === 'super_admin' || rol === 'admin'
  return {
    rolEfectivo: esAdmin ? 'admin' : 'publicador',
    superAdmin: rol === 'super_admin',
    publicaSinRevision: rol === 'asociado',
    capacidades: esAdmin ? undefined : { publicar_sin_revision: rol === 'asociado', editar_publicadas: rol === 'asociado' },
    tipoPublicador: rol === 'asociado' || rol === 'asociado_sin_permiso' ? 'asociado' : 'publicador',
  }
}

type Opciones = {
  rol: Rol
  filas: Fila[]
  /** Cuántas veces responde 503 el cambio de estado antes de aceptar (simula una transición que falla tras guardar). */
  fallosDeEstado?: number
  /** El PATCH (guardado) responde 500 mientras sea verdadero. */
  patchFalla?: () => boolean
}

async function backend(page: Page, o: Opciones) {
  const llamadas: Llamada[] = []
  const filas = o.filas
  const p = perfilDe(o.rol)
  let fallosRestantes = o.fallosDeEstado ?? 0
  const UN_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

  // Aislamiento: ningún servicio real. Se registran primero; las rutas de la API (abajo) y las de Firebase Auth simuladas ganan después.
  await page.route((u) => /(^|\.)cloudinary\.com$/.test(u.hostname), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL }))
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
    if (url.includes('accounts:signInWithPassword')) return r.fulfill(json({ localId: YO.uid, email: YO.email, displayName: YO.nombre, idToken: 'tok', registered: true, refreshToken: 'r', expiresIn: '3600' }))
    if (url.includes('accounts:lookup')) return r.fulfill(json({ users: [{ localId: YO.uid, email: YO.email, emailVerified: true, displayName: YO.nombre, providerUserInfo: [{ providerId: 'password', federatedId: YO.email, email: YO.email }], validSince: '1700000000', lastLoginAt: '1700000000000', createdAt: '1700000000000' }] }))
    return r.fulfill(json({}))
  })

  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    const metodo = q.method()
    const cuerpo = q.postData() ? (JSON.parse(q.postData()!) as Record<string, unknown>) : undefined
    const salir = (status: number, body: unknown) => { llamadas.push({ metodo, ruta, status, cuerpo }); return r.fulfill(json(body, status)) }

    if (ruta === '/api/portal/acceso') return r.fulfill(json({ ok: true }))
    if (ruta === '/api/usuarios/me') {
      return r.fulfill(json({
        uid: YO.uid, email: YO.email, nombre: YO.nombre, rol: p.rolEfectivo, superAdmin: p.superAdmin, estado: 'activo', portal: true,
        ...(p.rolEfectivo === 'publicador' ? { tipoPublicador: p.tipoPublicador, capacidades: p.capacidades } : {}),
      }))
    }
    if (ruta === '/api/citas') return r.fulfill(json({ citas: [] }))
    if (ruta === '/api/publicador/propiedades' && metodo === 'GET') {
      // Mismo criterio del servidor: un admin ve el inventario entero; un publicador solo lo suyo. `es_mia` lo pone el servidor.
      const visibles = p.rolEfectivo === 'admin' ? filas : filas.filter((f) => f.owner_id === YO.uid)
      return r.fulfill(json(visibles.map((f) => ({ ...f, es_mia: f.owner_id === YO.uid }))))
    }
    const m = ruta.match(/^\/api\/admin\/propiedades\/([^/]+)$/)
    if (m) {
      const fila = filas.find((f) => f.id === m[1])
      if (!fila) return salir(404, { error: 'No existe' })
      if (metodo === 'GET') return r.fulfill(json({ propiedad: fila, pies: {} }))
      if (metodo === 'PATCH') {
        if (o.patchFalla?.()) return salir(500, { error: 'No se pudo guardar (simulado).' })
        const s = sanearContenido(cuerpo ?? {}, { moderador: p.rolEfectivo === 'admin', actuales: fila, nube: NUBE })
        if (s.errores.length) return salir(400, { error: `Hay datos que no son válidos: ${s.errores.join('; ')}.` })
        Object.assign(fila, s.datos)
        return salir(200, { ok: true })
      }
    }
    const e = ruta.match(/^\/api\/propiedades\/([^/]+)\/estado$/)
    if (e && metodo === 'POST') {
      const fila = filas.find((f) => f.id === e[1])
      if (!fila) return salir(404, { error: 'No existe' })
      if (fallosRestantes > 0) { fallosRestantes -= 1; return salir(503, { error: 'No se pudo guardar el cambio ni registrarlo en la bitácora, así que no se hizo nada. Inténtalo otra vez.' }) }
      const destino = String(cuerpo?.estado) as EstadoPub
      const permiso = puedeTransicionar(fila.estado_pub as EstadoPub, destino, p.rolEfectivo as never, p.publicaSinRevision)
      if (!permiso.ok) return salir(403, { error: permiso.motivo })
      const falta = faltantes(fila as never)
      if (falta.length || !fotosSuficientes(fila)) return salir(400, { error: `Falta: ${falta.join(', ') || 'fotos'}.` })
      fila.estado_pub = destino
      const via = destino === 'publicada' ? (p.rolEfectivo === 'admin' ? 'moderacion' : 'autopublicacion') : destino === 'en_revision' ? 'revision' : undefined
      return salir(200, {
        ok: true, estado: destino, confirmado: true, esTuya: fila.owner_id === YO.uid,
        ...(via ? { via } : {}), ...(destino === 'publicada' ? { ruta: rutaDe({ id: String(fila.id), slug: fila.slug as string | null }) } : {}),
      })
    }
    return r.fulfill(json({ error: 'simulado: ruta no prevista' }, 500))
  })
  return { llamadas, filas }
}

async function entrar(page: Page) {
  await page.goto('/entrar')
  await page.getByLabel(/Correo/i).fill(YO.email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).not.toHaveURL(/\/entrar/, { timeout: 30_000 })
}

const esCajon = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024
async function marcoPresente(page: Page) {
  // R8.3: el trabajo con propiedades se pinta dentro del panel del rol (portal o administración); nunca un panel aparte.
  if (esCajon(page)) await expect(page.getByRole('button', { name: 'Mostrar u ocultar el menú' }).first()).toBeVisible({ timeout: 30_000 })
  else await expect(page.locator('nav[aria-label="Tu portal"], nav[aria-label="Panel de administración"]').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('navigation', { name: 'Panel del publicador' })).toHaveCount(0)
}
const region = (page: Page) => page.locator('[data-confirmacion]')
const abrirPaso6 = async (page: Page, id = 'p1') => {
  await page.goto(`/publicador/propiedades/${id}/editar?paso=6`)
  await expect(page.getByRole('heading', { name: 'Antes de enviar' })).toBeVisible({ timeout: 30_000 })
}
const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Matriz por rol. «texto previo» = lo que se lee ANTES de pulsar; «mensaje» = lo que se lee DESPUÉS, según lo que confirmó el servidor.
const CASOS: Array<{ rol: Rol; etiqueta: string; boton: string; previoSi: RegExp; previoNo: RegExp; estado: string; titulo: string; detalle: RegExp; enlace: boolean }> = [
  { rol: 'super_admin', etiqueta: 'Super Admin', boton: 'Publicar ahora', previoSi: /se publica en el sitio de inmediato/, previoNo: /administrador lo revisa/, estado: 'publicada', titulo: 'Propiedad publicada', detalle: /Ya se ve en el sitio\./, enlace: true },
  { rol: 'admin', etiqueta: 'Admin', boton: 'Publicar ahora', previoSi: /se publica en el sitio de inmediato/, previoNo: /administrador lo revisa/, estado: 'publicada', titulo: 'Propiedad publicada', detalle: /Ya se ve en el sitio\./, enlace: true },
  { rol: 'asociado', etiqueta: 'Asociado con publicar_sin_revision', boton: 'Publicar ahora', previoSi: /permiso para publicar sin revisión/, previoNo: /administrador lo revisa/, estado: 'publicada', titulo: 'Propiedad publicada', detalle: /sin pasar por revisión porque tu cuenta tiene ese permiso/, enlace: true },
  { rol: 'publicador', etiqueta: 'Publicador sin permiso', boton: 'Enviar a revisión', previoSi: /un administrador lo revisa/, previoNo: /se publica en el sitio de inmediato/, estado: 'en_revision', titulo: 'Enviado a revisión', detalle: /Aún no está publicado/, enlace: false },
  { rol: 'asociado_sin_permiso', etiqueta: 'Asociado sin permiso', boton: 'Enviar a revisión', previoSi: /un administrador lo revisa/, previoNo: /se publica en el sitio de inmediato/, estado: 'en_revision', titulo: 'Enviado a revisión', detalle: /Aún no está publicado/, enlace: false },
]

test.describe('al terminar el paso «Antes de enviar», el mensaje depende del rol Y de lo que confirmó el servidor', () => {
  for (const c of CASOS) {
    test(`${c.etiqueta}: texto previo correcto → «${c.boton}» → «${c.titulo}»`, async ({ page }) => {
      const { llamadas, filas } = await backend(page, { rol: c.rol, filas: [completa('p1')] })
      expect(faltantes(filas[0] as never)).toEqual([])
      await entrar(page)
      await abrirPaso6(page)
      await marcoPresente(page)

      // Antes de enviar: nunca promete revisión a quien publica directo, ni publicación a quien va a revisión.
      const previo = page.locator('[data-texto-previo]')
      await expect(previo).toHaveText(c.previoSi)
      await expect(previo).not.toHaveText(c.previoNo)
      const boton = page.getByRole('button', { name: c.boton, exact: true })
      await expect(boton).toBeEnabled()
      await captura(page, `confirmacion-${c.rol}-1-antes`)

      await boton.focus()
      await boton.click()

      // Después: lo confirmado por el servidor, en una región de estado (no un alert) y SIN mover el foco.
      await expect(region(page)).toHaveAttribute('data-confirmacion', c.estado === 'publicada' ? 'publicada' : 'en_revision', { timeout: 30_000 })
      await expect(region(page)).toHaveAttribute('role', 'status')
      await expect(region(page)).toHaveAttribute('aria-live', 'polite')
      await expect(region(page).getByText(c.titulo, { exact: true })).toBeVisible()
      await expect(region(page)).toContainText(c.detalle)
      if (c.estado === 'en_revision') await expect(region(page)).not.toContainText(/Propiedad publicada/)
      else await expect(region(page)).not.toContainText(/Enviado a revisión|administrador lo revisa/)
      const enlace = region(page).getByRole('link', { name: 'Ver publicación' })
      if (c.enlace) await expect(enlace).toHaveAttribute('href', '/propiedades/p1')
      else await expect(enlace).toHaveCount(0)
      // El foco NO se mueve a la confirmación. Si el anuncio sigue siendo editable, el botón conserva el foco (antes se deshabilitaba al
      // enviar y el foco caía al <body>); si el envío lo deja en revisión, el formulario se bloquea por diseño y no hay botón activo.
      const foco = await page.evaluate(() => ({
        enRegion: Boolean(document.querySelector('[data-confirmacion]')?.contains(document.activeElement)),
        texto: (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '',
      }))
      expect(foco.enRegion, 'el foco no debe irse a la confirmación').toBe(false)
      if (c.estado === 'publicada') expect(foco.texto, 'el botón conserva el foco').toBe(c.boton)
      expect(await page.locator('[role="alert"]').filter({ hasText: /publicada|revisión/i }).count()).toBe(0)

      // La recarga posterior no la borra antes de que se pueda leer: sigue ahí pasados 3 s.
      await page.waitForTimeout(3000)
      await expect(region(page).getByText(c.titulo, { exact: true })).toBeVisible()

      // El servidor recibió EXACTAMENTE una orden de estado, con el estado que tocaba, y no se creó ningún anuncio.
      const ordenes = llamadas.filter((l) => l.ruta.endsWith('/estado'))
      expect(ordenes).toHaveLength(1)
      expect(ordenes[0].cuerpo).toEqual({ estado: c.estado })
      expect(llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/api/publicador/propiedades')).toHaveLength(0)
      expect(filas).toHaveLength(1)
      expect(filas[0].estado_pub).toBe(c.estado)

      await marcoPresente(page)
      await sinDesborde(page)
      await captura(page, `confirmacion-${c.rol}-2-despues`)
    })
  }
})

test.describe('solo guardar, transición fallida y error de guardado', () => {
  for (const rol of ['super_admin', 'publicador'] as Rol[]) {
    test(`${rol}: «Guardar borrador» confirma «Borrador guardado» y no publica ni envía`, async ({ page }) => {
      const { llamadas, filas } = await backend(page, { rol, filas: [completa('p1')] })
      await entrar(page)
      await abrirPaso6(page)
      await page.getByRole('button', { name: 'Guardar borrador' }).click()
      await expect(region(page)).toHaveAttribute('data-confirmacion', 'borrador', { timeout: 30_000 })
      await expect(region(page).getByText('Borrador guardado', { exact: true })).toBeVisible()
      await expect(region(page)).toContainText('Aún no está publicado ni enviado a revisión')
      await expect(region(page)).not.toContainText(/Propiedad publicada|Enviado a revisión/)
      expect(llamadas.filter((l) => l.ruta.endsWith('/estado'))).toHaveLength(0)
      expect(filas[0].estado_pub).toBe('borrador')
      await captura(page, `confirmacion-${rol}-borrador-guardado`)
    })
  }

  test('guardado correcto + transición fallida: dice que solo se guardó el borrador y permite reintentar sin duplicar nada', async ({ page }) => {
    const { llamadas, filas } = await backend(page, { rol: 'super_admin', filas: [completa('p1')], fallosDeEstado: 1 })
    await entrar(page)
    await abrirPaso6(page)
    await page.getByRole('button', { name: 'Publicar ahora', exact: true }).click()

    await expect(region(page)).toHaveAttribute('data-confirmacion', 'transicion_fallida', { timeout: 30_000 })
    await expect(region(page)).toContainText('Tu borrador sí quedó guardado, pero no se completó la publicación')
    await expect(region(page)).toContainText('Solo se guardó el borrador')
    await expect(region(page)).not.toContainText(/Propiedad publicada/)
    expect(filas[0].estado_pub).toBe('borrador')
    await captura(page, 'confirmacion-transicion-fallida')

    await page.getByRole('button', { name: 'Reintentar publicación' }).click()
    await expect(region(page)).toHaveAttribute('data-confirmacion', 'publicada', { timeout: 30_000 })
    await expect(region(page).getByText('Propiedad publicada', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reintentar publicación' })).toHaveCount(0)

    // Un solo anuncio, dos órdenes de estado (503 y luego 200), ninguna alta nueva y ninguna foto nueva.
    expect(llamadas.filter((l) => l.ruta.endsWith('/estado')).map((l) => l.status)).toEqual([503, 200])
    expect(llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/api/publicador/propiedades')).toHaveLength(0)
    expect(filas).toHaveLength(1)
    expect((filas[0].fotos as string[]).length).toBe(5)
    expect(filas[0].estado_pub).toBe('publicada')
  })

  test('error de guardado: se conserva lo escrito, se muestra el error y NO aparece ninguna confirmación de éxito', async ({ page }) => {
    let rotos = true
    const { llamadas, filas } = await backend(page, { rol: 'super_admin', filas: [completa('p1')], patchFalla: () => rotos })
    await entrar(page)
    await page.goto('/publicador/propiedades/p1/editar?paso=5')
    const caja = page.getByLabel('Descripción')
    const nueva = 'Descripción nueva escrita durante la prueba mientras el servidor simulado rechaza las escrituras.'
    await caja.fill(nueva)
    await expect(page.getByRole('button', { name: 'Reintentar guardado' })).toBeVisible({ timeout: 30_000 })
    await expect(caja).toHaveValue(nueva)

    // Se pasa al último paso SIN recargar (lo pendiente sigue en la cola del guardado) y se intenta publicar con el guardado fallando.
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await expect(page.getByRole('heading', { name: 'Antes de enviar' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Publicar ahora', exact: true }).click()
    await expect(page.getByText(/No se envió: tu anuncio no se pudo guardar/)).toBeVisible({ timeout: 30_000 })
    await expect(region(page)).toHaveAttribute('data-confirmacion', 'ninguna')
    await expect(page.getByText('Propiedad publicada')).toHaveCount(0)
    expect(llamadas.filter((l) => l.ruta.endsWith('/estado'))).toHaveLength(0)
    expect(filas[0].estado_pub).toBe('borrador')
    await captura(page, 'confirmacion-error-de-guardado')

    // Con el servidor sano, el reintento claro funciona y ahora sí confirma.
    rotos = false
    await page.getByRole('button', { name: 'Reintentar guardado' }).click()
    await expect(page.getByRole('button', { name: 'Reintentar guardado' })).toHaveCount(0, { timeout: 30_000 })
    await expect.poll(() => filas[0].descripcion, { timeout: 30_000 }).toBe(nueva)
  })
})

test.describe('el panel «Mis propiedades» dice el estado de cada anuncio y de quién es', () => {
  test('Asociado: «Publicar ahora» desde su lista confirma la publicación; nadie dice «Enviada a revisión»', async ({ page }) => {
    const { llamadas, filas } = await backend(page, {
      rol: 'asociado',
      // La lista de una cuenta de publicación solo trae lo suyo: lo ajeno ni llega al navegador (lo filtra el servidor).
      filas: [completa('p1'), completa('ajena', { owner_id: OTRA, estado_pub: 'publicada', titulo: 'Anuncio de otra cuenta' })],
    })
    await entrar(page)
    await page.goto('/portal/mis-propiedades')
    await marcoPresente(page)
    const suya = fila(page, 'Casa de prueba en León')
    await expect(page.getByText('Anuncio de otra cuenta')).toHaveCount(0)
    await expect(page.locator('[data-dueno]')).toHaveCount(0)
    await expect(suya).toContainText('Borrador')
    await expect(page.getByText(/Enviada a revisión/)).toHaveCount(0)

    await accion(page, 'Casa de prueba en León', 'Publicar ahora')
    const aviso = page.locator('[data-aviso]')
    await expect(aviso).toHaveAttribute('data-aviso', 'ok', { timeout: 30_000 })
    await expect(aviso).toHaveAttribute('role', 'status')
    await expect(aviso).toContainText('Propiedad publicada')
    await expect(aviso.getByRole('link', { name: 'Ver publicación' })).toHaveAttribute('href', '/propiedades/p1')
    await expect(suya).toContainText('Publicada')
    await expect(page.getByText(/Enviada a revisión/)).toHaveCount(0)
    await page.waitForTimeout(3000)
    await expect(aviso).toContainText('Propiedad publicada') // no se borra sola
    expect(llamadas.filter((l) => l.ruta.endsWith('/estado')).map((l) => l.cuerpo)).toEqual([{ estado: 'publicada' }])
    expect(filas.find((f) => f.id === 'p1')!.owner_id).toBe(YO.uid)
    await sinDesborde(page)
    await captura(page, 'confirmacion-panel-super-admin')
  })

  test('Publicador sin permiso: la lista dice «Enviada a revisión» solo para el que de verdad está en revisión; el aviso aclara que aún no está publicado', async ({ page }) => {
    const { filas } = await backend(page, { rol: 'publicador', filas: [completa('p1'), completa('p2', { titulo: 'Otro borrador', estado_pub: 'borrador' }), completa('p3', { titulo: 'Ya en revisión', estado_pub: 'en_revision' })] })
    await entrar(page)
    await page.goto('/publicador')
    await marcoPresente(page)
    await expect(fila(page, 'Ya en revisión')).toContainText('En revisión')
    await expect(fila(page, 'Otro borrador')).toContainText('Borrador')
    await expect(page.locator('[data-dueno]')).toHaveCount(0) // un publicador solo ve lo suyo: no hace falta distinguir

    await accion(page, 'Casa de prueba en León', /^Enviar a revisión/)
    await expect(page.locator('[data-aviso]')).toContainText('Enviado a revisión', { timeout: 30_000 })
    await expect(page.locator('[data-aviso]')).toContainText('Aún no está publicado')
    await expect(page.locator('[data-aviso]').getByRole('link', { name: 'Ver publicación' })).toHaveCount(0)
    await expect(fila(page, 'Casa de prueba en León')).toContainText('En revisión')
    await expect(fila(page, 'Otro borrador')).toContainText('Borrador')
    expect(filas.map((f) => f.estado_pub)).toEqual(['en_revision', 'borrador', 'en_revision'])
    await captura(page, 'confirmacion-panel-publicador')
  })
})

test.describe('el campo del título deja escribir espacios (reporte del propietario)', () => {
  for (const texto of ['Casa en venta con jardín', 'Propiedad bonita cerca del centro', 'Nueva propiedad en León ', 'Borrador de oficina']) {
    test(`se puede escribir «${texto.trim()}» tal cual, con espacios`, async ({ page }) => {
      const { filas } = await backend(page, { rol: 'super_admin', filas: [completa('p1', { titulo: 'Propiedad sin título' })] })
      await entrar(page)
      await page.goto('/publicador/propiedades/p1/editar?paso=0')
      const campo = page.getByLabel(/^Título del anuncio/)
      await expect(campo).toHaveValue('') // el relleno heredado no se muestra como si fuera un título escrito
      await campo.click()
      await campo.pressSequentially(texto, { delay: 25 })
      await expect(campo).toHaveValue(texto)
      // Y es lo que se guarda, tal cual (el servidor no recorta el título al guardarlo; la ficha lo recorta al mostrarlo).
      await expect.poll(() => String(filas[0].titulo), { timeout: 30_000 }).toBe(texto)
    })
  }
})

test.describe('accesibilidad del paso con la confirmación visible (axe)', () => {
  test('paso 6 con «Propiedad publicada» a la vista: sin infracciones graves nuevas', async ({ page }) => {
    await backend(page, { rol: 'super_admin', filas: [completa('p1')] })
    await entrar(page)
    await abrirPaso6(page)
    await page.getByRole('button', { name: 'Publicar ahora', exact: true }).click()
    await expect(region(page)).toHaveAttribute('data-confirmacion', 'publicada', { timeout: 30_000 })
    const r = await new AxeBuilder({ page }).analyze()
    const graves = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}:${v.nodes.length}`)
    expect(graves, 'infracciones graves en el paso 6 con confirmación').toEqual([])
  })
})

test.describe('doble clic y reintentos rápidos no duplican operaciones', () => {
  test('dos clics seguidos en «Publicar ahora» mandan UNA sola orden de estado', async ({ page }) => {
    const { llamadas, filas } = await backend(page, { rol: 'super_admin', filas: [completa('p1')] })
    await entrar(page)
    await abrirPaso6(page)
    const boton = page.getByRole('button', { name: 'Publicar ahora', exact: true })
    // Dos clics en el mismo instante (antes de que React repinte): el segundo debe ignorarse.
    await boton.evaluate((el: HTMLElement) => { el.click(); el.click() })
    await expect(region(page)).toHaveAttribute('data-confirmacion', 'publicada', { timeout: 30_000 })
    expect(llamadas.filter((l) => l.ruta.endsWith('/estado'))).toHaveLength(1)
    expect(filas).toHaveLength(1)
  })

  test('«Guardar borrador» y «Publicar ahora» a la vez no se pisan: una sola operación', async ({ page }) => {
    const { llamadas } = await backend(page, { rol: 'publicador', filas: [completa('p1')] })
    await entrar(page)
    await abrirPaso6(page)
    await page.evaluate(() => {
      const botones = [...document.querySelectorAll('button')] as HTMLButtonElement[]
      botones.find((b) => b.textContent === 'Enviar a revisión')?.click()
      botones.find((b) => b.textContent === 'Guardar borrador')?.click()
    })
    await expect(region(page)).not.toHaveAttribute('data-confirmacion', 'ninguna', { timeout: 30_000 })
    await page.waitForTimeout(1500)
    expect(llamadas.filter((l) => l.ruta.endsWith('/estado')).length).toBeLessThanOrEqual(1)
  })
})
