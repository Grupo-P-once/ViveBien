// ESCENARIO B — «100 USUARIOS CONCURRENTES» en STAGING (PREPARADO, NO EJECUTADO; exige autorización específica del dueño).
//
// Qué es: hasta 100 usuarios virtuales ACTIVOS A LA VEZ, con pausas CORTAS (1–3 s). No es lo mismo que el escenario A: aquí la presión por segundo es mucho mayor.
// Subida GRADUAL por escalones con meseta (para ver DÓNDE empieza a degradarse y si se recupera): 5 → 10 → 25 → 50 → 75 → 100, y bajada. Se detiene SOLA ante
// errores > 5 %, p95 > 5 s o más de 20 respuestas 429 (ver `comun.js`). No es una prueba de denegación de servicio: tope fijo de 100 VUs, una sola fuente, solo lecturas.
//
//   BASE_URL=https://<host-de-staging> SLUG_FICHA=<slug-publicado> VERCEL_BYPASS=<en tu terminal> \
//   k6 run --summary-trend-stats="avg,med,p(90),p(95),p(99),max" --summary-export=reports/staging-B.json tests/performance/k6/staging/B-100-usuarios-concurrentes.js
import { sleep } from 'k6'
import { SLUG_FICHA, cerrarVisita, iniciarVisita, leer, umbralesDeParo } from './comun.js'

const META = Number(__ENV.VUS_MAX || 100)          // tope de seguridad: no se puede pasar de 100 sin editar el archivo
if (META > 100) throw new Error('VUS_MAX no puede pasar de 100 en este escenario.')
const escalon = (v) => Math.min(v, META)

export const options = {
  scenarios: {
    concurrentes: {
      executor: 'ramping-vus', startVUs: 1, gracefulRampDown: '30s',
      stages: [
        { duration: '1m', target: escalon(5) },   { duration: '2m', target: escalon(5) },
        { duration: '1m', target: escalon(10) },  { duration: '2m', target: escalon(10) },
        { duration: '1m', target: escalon(25) },  { duration: '2m', target: escalon(25) },
        { duration: '1m', target: escalon(50) },  { duration: '2m', target: escalon(50) },
        { duration: '1m', target: escalon(75) },  { duration: '2m', target: escalon(75) },
        { duration: '1m', target: escalon(100) }, { duration: '3m', target: escalon(100) },
        { duration: '3m', target: 0 },            // bajada: mide la RECUPERACIÓN
      ],
    },
  },
  thresholds: umbralesDeParo(),
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

const pausa = () => sleep(1 + Math.random() * 2)

export default function escenarioB100UsuariosConcurrentes() {
  iniciarVisita()
  leer('home', '/'); pausa()
  leer('listado', '/propiedades'); leer('catalogo', '/api/catalogo'); pausa()
  leer('listado_zona', '/propiedades?zona=leon'); pausa()
  if (SLUG_FICHA) { leer('ficha', '/propiedades/' + SLUG_FICHA); pausa() }
  leer('blog', '/blog'); pausa()
  cerrarVisita()
}
