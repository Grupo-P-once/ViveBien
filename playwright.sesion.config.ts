import { defineConfig, devices } from '@playwright/test'

/**
 * Regresión del cambio de cuenta (CLIENTE ↔ ADMIN) en los cuatro anchos.
 *
 *     npx playwright test -c playwright.sesion.config.ts
 *
 * Necesita `npx next build` antes (el servidor es `next start`). TODA la API y Google
 * se simulan en el navegador (ver `tests-visual/sesion.e2e.ts`): no se toca la base ni
 * se usa ninguna cuenta real.
 */
export default defineConfig({
  testDir: './tests-visual',
  testMatch: /.*\.e2e\.ts$/,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Desde la alineación legal (2-nov-2026) un banner pide elegir la analítica y se pinta ENCIMA de la página; tapa controles y ensucia las capturas de las pruebas
  // anteriores. El arnés parte de un visitante que YA eligió (rechazó): no hay banner ni GA. El banner y su elección tienen su propia prueba (analitica-aviso.e2e.ts),
  // que abre un contexto limpio; las pruebas de eventos de GA guardan 'si' en su beforeEach.
  use: {
    baseURL: 'http://localhost:3131', locale: 'es-MX', timezoneId: 'America/Mexico_City',
    // Solo cuando una prueba FALLA queda la traza (red, consola, DOM paso a paso): permite diagnosticar fallos intermitentes del gate sin repetir 2 horas de corrida.
    trace: 'retain-on-failure',
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3131', localStorage: [{ name: 'vb_analitica', value: 'no' }] }] },
  },
  webServer: { command: 'npx next start -p 3131', url: 'http://localhost:3131', reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: 'v390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'v768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'v1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'v1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
})
