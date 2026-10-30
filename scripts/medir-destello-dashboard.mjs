// ¿Aparece el panel antiguo en pantalla antes de navegar? (V-1.1.92)
//
//   npx next dev -p 3132
//   node scripts/medir-destello-dashboard.mjs
//
// El destello NO estaba en el HTML del servidor —eso se midió: 0 coincidencias—
// sino en el DOM, justo después de hidratar. Así que esto **muestrea el DOM
// cada 100 ms durante toda la transición** y anota qué se veía en cada instante.
//
// ─────────────────────────────────────────────────────────────
// POR QUÉ SE MUESTREA, Y NO SE OBSERVA
//
// La primera versión usaba un `MutationObserver` y leía su resultado al final.
// Daba verde **incluso con el fallo puesto**, porque al navegar a /portal la
// página nueva reiniciaba la variable donde se anotaba: medía el estado final,
// que siempre está limpio. Un instrumento que no detecta el fallo no es
// evidencia de nada, así que se tiró.
//
// El muestreo sí lo detecta: con el fallo reintroducido, «Portal de Cliente»
// aparece en las muestras de 100 a 600 ms. Esa es la prueba de que esta
// medición sirve para algo.
// ─────────────────────────────────────────────────────────────
//
// Los extremos se simulan sin tocar código de producción:
//
//   · la sesión de Firebase se siembra en IndexedDB, que es donde el SDK la
//     guarda, así que `onAuthStateChanged` resuelve al instante y sin red;
//   · `/api/usuarios/me` se RETRASA 600 ms, el peor caso real. Ahí vivía el
//     destello.

import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://localhost:3132'
const SALIDA = 'docs/fase-3/capturas/destello-dashboard'
const RETRASO_MS = 600
const MUESTRAS = 16
const CADA_MS = 100

// La clave pública de Firebase: la misma que viaja en el bundle del navegador.
const API_KEY = (await readFile('.env.local', 'utf8'))
  .split(/\r?\n/).find((l) => l.startsWith('NEXT_PUBLIC_FIREBASE_API_KEY='))
  ?.split('=')[1].trim().replace(/^"|"$/g, '') ?? ''
if (!API_KEY) { console.error('Falta NEXT_PUBLIC_FIREBASE_API_KEY en .env.local'); process.exit(1) }

/** Lo que NO puede aparecer mientras se resuelve el destino. */
const DEL_PANEL_ANTIGUO = [
  'Portal de Cliente', 'Este es tu portal personal', 'Primeros pasos', 'Dinos qué buscas',
  '¿Tienes una propiedad que vender o rentar?', 'Solicitar acceso', 'Ver Propiedades', 'Cerrar Sesión',
]

const PERFILES = [
  ['cliente', { rol: 'cliente', superAdmin: false, portal: true }, '/portal'],
  ['publicador', { rol: 'publicador', superAdmin: false, portal: true }, '/portal'],
  ['admin', { rol: 'admin', superAdmin: false, portal: true }, '/admin'],
  ['super_admin', { rol: 'admin', superAdmin: true, portal: true }, '/admin'],
]
const TAMANOS = [['escritorio', 1440, 900], ['tableta', 834, 1112], ['movil', 390, 844]]

/** Deja la sesión escrita en IndexedDB, esperando a que la escritura termine. */
const sembrar = (apiKey) => new Promise((listo) => {
  const usuario = {
    uid: 'uid-de-prueba-medicion', email: 'qa@ejemplo.invalid', emailVerified: true,
    displayName: 'QA', isAnonymous: false, photoURL: null, phoneNumber: null,
    providerData: [{ providerId: 'password', uid: 'qa@ejemplo.invalid', email: 'qa@ejemplo.invalid', displayName: 'QA', photoURL: null, phoneNumber: null }],
    stsTokenManager: { refreshToken: 'refresco-de-mentira', accessToken: 'token-de-mentira', expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now() - 86400000), lastLoginAt: String(Date.now()),
    apiKey, appName: '[DEFAULT]',
  }
  const abrir = indexedDB.open('firebaseLocalStorageDb', 1)
  abrir.onupgradeneeded = () => abrir.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' })
  abrir.onerror = () => listo(false)
  abrir.onsuccess = () => {
    const tx = abrir.result.transaction('firebaseLocalStorage', 'readwrite')
    tx.objectStore('firebaseLocalStorage').put({ fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: usuario })
    tx.oncomplete = () => listo(true)
    tx.onerror = () => listo(false)
  }
})

await mkdir(SALIDA, { recursive: true })
const navegador = await chromium.launch()

// `next dev` compila cada ruta la primera vez que se pide. Se calientan antes
// para no confundir «tarda en compilar» con «no navegó».
for (const ruta of ['/dashboard', '/portal', '/admin']) await fetch(`${BASE}${ruta}`).catch(() => {})

const filas = []
const problemas = []

for (const [nombre, perfil, destinoEsperado] of PERFILES) {
  for (const [tamano, ancho, alto] of TAMANOS) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } })
    const pagina = await ctx.newPage()

    // Firebase valida la sesión restaurada contra `accounts:lookup`; si esa
    // llamada falla, cierra la sesión y nunca se llega a la transición.
    await pagina.route(/identitytoolkit\.googleapis\.com/, (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ users: [{ localId: 'uid-de-prueba-medicion', email: 'qa@ejemplo.invalid', emailVerified: true, validSince: '0', disabled: false }] }),
    }))
    await pagina.route(/securetoken\.googleapis\.com/, (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ access_token: 't', id_token: 't', refresh_token: 'r', expires_in: '3600' }),
    }))
    await pagina.route('**/api/usuarios/me', async (ruta) => {
      await new Promise((r) => setTimeout(r, RETRASO_MS))
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(perfil) })
    })
    await pagina.route(/\/api\/(?!usuarios\/me)/, (r) => r.fulfill({ status: 200, body: '{}' }))

    // Visita previa sólo para dejar la sesión escrita. Después se entra a
    // /dashboard como lo haría cualquiera.
    await pagina.goto(`${BASE}/dashboard?clasico=1`, { waitUntil: 'domcontentloaded' })
    if (!(await pagina.evaluate(sembrar, API_KEY))) {
      problemas.push(`${nombre}/${tamano}: no se pudo sembrar la sesión de prueba`)
    }
    await pagina.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })

    // ── El muestreo: qué se ve en cada instante ──
    const muestras = []
    for (let i = 0; i < MUESTRAS; i++) {
      await pagina.waitForTimeout(CADA_MS)
      const texto = await pagina.evaluate(() => document.body?.innerText ?? '').catch(() => '')
      const ruta = new URL(pagina.url()).pathname
      muestras.push({ ms: (i + 1) * CADA_MS, ruta, trozos: DEL_PANEL_ANTIGUO.filter((f) => texto.includes(f)) })
      if (i === 2) await pagina.screenshot({ path: `${SALIDA}/${nombre}-${tamano}-mientras-resuelve.png` })
    }

    const conPanelAntiguo = muestras.filter((m) => m.trozos.length > 0)
    const destino = muestras.at(-1).ruta

    if (conPanelAntiguo.length) {
      problemas.push(`${nombre}/${tamano}: el panel antiguo se vio en ${conPanelAntiguo.map((m) => m.ms + 'ms').join(', ')}`)
    }
    if (destino !== destinoEsperado) {
      problemas.push(`${nombre}/${tamano}: acabó en ${destino}, se esperaba ${destinoEsperado}`)
    }

    filas.push({
      perfil: nombre, tamano, destino, esperado: destinoEsperado,
      muestras: muestras.length,
      conPanelAntiguo: conPanelAntiguo.length,
      primeraEnPanelCorrecto: muestras.find((m) => m.ruta === destinoEsperado)?.ms ?? null,
    })

    await ctx.close()
  }
}

await navegador.close()
await writeFile(`${SALIDA}/resultados.json`, JSON.stringify({ filas, problemas, retrasoMs: RETRASO_MS, cadaMs: CADA_MS }, null, 2))

console.table(filas)
if (problemas.length) {
  console.error('\nPROBLEMAS:')
  for (const p of problemas) console.error('  ·', p)
  process.exit(1)
}
console.log(`\nSin destello: ${MUESTRAS} muestras cada ${CADA_MS} ms, con ${RETRASO_MS} ms de retraso en`)
console.log('/api/usuarios/me, y el panel antiguo no se vio ni una sola vez — en los cuatro roles')
console.log('y en los tres tamaños.')
