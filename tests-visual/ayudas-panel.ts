import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { ACTIVIDAD, AHORA, BUSQUEDA, INVITACIONES, NOTIFICACIONES, PERFIL, PROPIEDADES, REGISTROS, RESUMEN, USUARIOS } from './datos-panel'

/**
 * Capturar el panel de administración sin sesión real y sin tocar producción.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ ASÍ
 *
 * El panel exige sesión de administrador, y el servidor local usa la base de
 * PRODUCCIÓN. Dos reglas, entonces:
 *
 *  1. **Sesión simulada.** Se escribe en `localStorage` la sesión que Firebase
 *     guarda al iniciar sesión, con un token inventado. Firebase la lee al
 *     arrancar y el panel cree que hay sesión. No se usa ninguna contraseña
 *     real ni se inicia sesión de verdad.
 *
 *  2. **Ninguna petición sale.** Las rutas del panel se contestan con los datos
 *     de `datos-panel.ts`, y CUALQUIER otra llamada a `/api/**` se corta. Así
 *     una captura no puede leer ni escribir nada de la base real.
 *
 * Al no depender de datos reales, las capturas sólo cambian cuando cambia el
 * diseño — que es justo lo que deben vigilar.
 * ─────────────────────────────────────────────────────────────
 */

function claveApiFirebase(): string {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  const linea = env.split(/\r?\n/).find((l) => l.startsWith('NEXT_PUBLIC_FIREBASE_API_KEY='))
  if (!linea) throw new Error('Falta NEXT_PUBLIC_FIREBASE_API_KEY en .env.local')
  return linea.slice('NEXT_PUBLIC_FIREBASE_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
}

const json = (cuerpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) })

/** Una tesela gris de 256×256: el mapa se pinta igual siempre y sin salir a la red. */
const TESELA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAPoAAAD6AG1e1JrAAACAElEQVR42u3TQQkAAAgEwesf04/YwrcZHJgEC5vpgrciAQYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABMIAKGAAMAAYAA4ABwABgADAAGAAMAAYAAwABgADAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAGUAEDgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwAFwLx5oob/EGrssAAAAASUVORK5CYII=',
  'base64',
)

export async function prepararPanel(page: Page) {
  const apiKey = claveApiFirebase()

  // 0 · Hora congelada. El panel saluda segun la hora y escribe «hace 2 h»:
  // sin congelarla, la misma pantalla daria una captura distinta cada rato.
  await page.clock.setFixedTime(AHORA)

  // 1 · La sesión que Firebase espera encontrar guardada.
  await page.addInitScript(([clave, caduca]: [string, number]) => {
    const usuario = {
      uid: 'panel-visual',
      email: 'jemilianoponceperez@gmail.com',
      emailVerified: true,
      displayName: 'Jose Emiliano Ponce',
      isAnonymous: false,
      photoURL: null,
      phoneNumber: null,
      tenantId: null,
      providerData: [{
        providerId: 'google.com', uid: 'panel-visual', displayName: 'Jose Emiliano Ponce',
        email: 'jemilianoponceperez@gmail.com', phoneNumber: null, photoURL: null,
      }],
      stsTokenManager: { refreshToken: 'refresh-de-prueba', accessToken: 'token-de-prueba', expirationTime: caduca },
      createdAt: '1700000000000',
      lastLoginAt: '1700000000000',
      apiKey: clave,
      appName: '[DEFAULT]',
    }
    try {
      window.localStorage.setItem(`firebase:authUser:${clave}:[DEFAULT]`, JSON.stringify(usuario))
    } catch { /* sin almacenamiento */ }
  }, [apiKey, Date.now() + 86_400_000] as [string, number])

  // 2 · Google no tiene que confirmar nada: la sesión es de mentira.
  await page.route('**/identitytoolkit.googleapis.com/**', (r) =>
    r.fulfill(json({
      users: [{
        localId: 'panel-visual',
        email: 'jemilianoponceperez@gmail.com',
        emailVerified: true,
        displayName: 'Jose Emiliano Ponce',
        providerUserInfo: [{ providerId: 'google.com', federatedId: 'panel-visual', email: 'jemilianoponceperez@gmail.com', displayName: 'Jose Emiliano Ponce' }],
        validSince: '1700000000',
        lastLoginAt: '1700000000000',
        createdAt: '1700000000000',
      }],
    })),
  )
  await page.route('**/securetoken.googleapis.com/**', (r) =>
    r.fulfill(json({ access_token: 'token-de-prueba', expires_in: '3600', token_type: 'Bearer', refresh_token: 'refresh-de-prueba', id_token: 'token-de-prueba', user_id: 'panel-visual', project_id: 'vivebien' })),
  )

  // 3 · Cortafuegos PRIMERO: en Playwright gana la ruta registrada más tarde,
  // así que este comodín tiene que ir antes que las rutas concretas de abajo.
  // Lo que no esté contemplado no sale del navegador (incluye `/api/eventos`).
  await page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"cortado por la prueba visual"}' }))

  // 4 · Las rutas del panel, con datos fijos.
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json(PERFIL)))
  await page.route('**/api/portal/acceso', (r) => r.fulfill(json({ ok: true })))
  await page.route('**/api/admin/resumen*', (r) => r.fulfill(json(RESUMEN)))
  await page.route('**/api/admin/actividad*', (r) => r.fulfill(json(ACTIVIDAD)))
  await page.route('**/api/admin/notificaciones*', (r) => r.fulfill(json(NOTIFICACIONES)))
  await page.route('**/api/admin/buscar*', (r) => r.fulfill(json(BUSQUEDA)))
  await page.route('**/api/admin/registros*', (r) => r.fulfill(json(REGISTROS)))
  await page.route('**/api/admin/propiedades*', (r) => r.fulfill(json(PROPIEDADES)))
  await page.route('**/api/admin/usuarios*', (r) => r.fulfill(json(USUARIOS)))
  await page.route('**/api/admin/invitaciones*', (r) => r.fulfill(json(INVITACIONES)))

  // 5 · Teselas del mapa: iguales siempre y sin red.
  await page.route('**/*.tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TESELA }))
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
}

/** Espera a que el panel esté pintado y quieto. */
export async function esperarPanel(page: Page) {
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 15_000 })
  // `load` y no `networkidle`: la campana consulta cada minuto y, con la suite
  // entera corriendo, «red en calma» a veces no llegaba a tiempo (prueba que
  // fallaba una vez de cada tantas). Las rutas se contestan al instante desde
  // aquí mismo, así que basta con la carga y un respiro para las imágenes.
  await page.waitForLoadState('load')
  await page.waitForTimeout(1200)
}
