import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// V-1.1.82: el mismo alias `@/` que usa Next (tsconfig `paths`), para poder
// probar código de rutas y páginas, no sólo de `src/lib`.
//
// Tiempos más holgados: las pruebas con Postgres en memoria (PGlite) arrancan
// la base en frío y, la primera vez, podían pasar de los 5 s por defecto
// (fallo intermitente conocido desde la fase 1). No cambia qué se prueba.
// V-1.1.83: 60 s — con la suite completa en paralelo el ensayo de la
// migración 22 llegó a 22 s (solo tarda 8 s).
// V-1.1.87 (D-42): `server-only` existe para que el BUILD falle si un
// componente de cliente importa un módulo del servidor. Fuera de Next, su
// entrada por defecto lanza siempre, así que en las pruebas se sustituye por un
// módulo vacío. No debilita nada: la barrera de verdad la aplica `next build`,
// y además `tests/frontera-cliente-servidor.test.ts` la comprueba leyendo los
// imports.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/dobles/server-only.ts', import.meta.url)),
    },
  },
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
