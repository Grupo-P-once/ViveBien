import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas visuales con Playwright.
 *
 *     npx playwright test                     → compara contra las capturas guardadas
 *     npx playwright test --update-snapshots  → guarda capturas nuevas como referencia
 *
 * Necesita una compilación real antes (`npx next build`): el servidor de pruebas
 * es `next start`, no el de desarrollo, para ver lo mismo que producción.
 *
 * Los archivos se llaman `*.visual.ts` y no `*.spec.ts` a propósito: Vitest, sin
 * configuración propia, recogería cualquier `.spec.ts` y fallaría al intentar
 * ejecutar pruebas de Playwright.
 *
 * OJO: el servidor local usa la base de datos de PRODUCCIÓN. Cada prueba que
 * abra páginas públicas debe bloquear `/api/eventos` (ver `ayudas.ts`), o cada
 * ejecución registraría visitas y búsquedas falsas en la analítica real.
 */
export default defineConfig({
  testDir: './tests-visual',
  testMatch: /.*\.visual\.ts$/,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Capturas junto a cada prueba, con nombre legible.
  snapshotPathTemplate: '{testDir}/capturas/{projectName}/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:3130',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      // Margen para el antialiasing de fuentes; un cambio de diseño real supera
      // esto con creces.
      maxDiffPixelRatio: 0.01,
    },
  },
  webServer: {
    command: 'npx next start -p 3130',
    url: 'http://localhost:3130',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'escritorio-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tableta-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'movil-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
})
