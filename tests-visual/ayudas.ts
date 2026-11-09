import type { Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * Preparar una página pública para capturarla sin ensuciar producción y sin
 * que cambie de una ejecución a otra.
 */
export async function prepararPaginaPublica(page: Page, o: { capturaBase?: boolean } = {}) {
  // Un tercero (fuentes, CDN, Firebase Auth…) que no contesta no puede bloquear la página: se acota a 4 s (ayudas-red.ts, bloqueo A).
  // Se registra PRIMERO: las rutas de abajo tienen prioridad. Una CAPTURA DE LÍNEA BASE (`capturaBase`) solo acota los terceros conocidos: sus fotos reales deben cargar completas.
  await acotarTerceros(page, { soloConocidos: o.capturaBase })
  // El servidor local escribe en la base de PRODUCCIÓN. Sin esto, cada captura
  // registraría una visita o una búsqueda falsa en la analítica real (y sumaría
  // vistas al contador de la propiedad). Se corta en la red: la petición nunca
  // sale del navegador.
  await page.route('**/api/eventos', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"prueba":true}' }),
  )
  await page.route('**/api/registro-lead', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"prueba":true}' }),
  )
  // El clima de la cabecera cambia cada hora: se fija para que la captura no.
  await page.route('**/api.open-meteo.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"current_weather":{"temperature":24,"weathercode":1}}' }),
  )
  // Analítica de Google: ruido de red que no aporta nada a una captura.
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
}

/** Esperar a que la página esté quieta: red en calma e imágenes pintadas. */
export async function esperarQuieta(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    // Sólo las imágenes visibles: las de carga diferida fuera de pantalla no se
    // descargan nunca, y esperarlas colgaba la prueba hasta el tiempo límite.
    const alto = window.innerHeight
    const visibles = Array.from(document.images).filter((i) => {
      const r = i.getBoundingClientRect()
      return !i.complete && r.bottom > 0 && r.top < alto
    })
    const cargadas = Promise.all(visibles.map((i) => new Promise((ok) => { i.onload = i.onerror = ok })))
    await Promise.race([cargadas, new Promise((ok) => setTimeout(ok, 8000))])
  })
  // Animaciones de entrada hechas con JavaScript (framer-motion, gsap):
  // `animations: 'disabled'` sólo detiene las de CSS.
  await page.waitForTimeout(1500)
}
