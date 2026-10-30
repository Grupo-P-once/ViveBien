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
  use: { baseURL: 'http://localhost:3131', locale: 'es-MX', timezoneId: 'America/Mexico_City' },
  webServer: { command: 'npx next start -p 3131', url: 'http://localhost:3131', reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: 'v390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'v768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'v1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'v1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
})
