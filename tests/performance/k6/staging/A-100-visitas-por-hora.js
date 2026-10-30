// ESCENARIO A — «100 VISITAS POR HORA» en STAGING (PREPARADO, NO EJECUTADO; exige autorización específica del dueño).
//
// Qué es: una VISITA = una persona que navega con pausas de lectura (inicio → catálogo → búsqueda → ficha → blog/ayuda). 100 visitas/hora = una llegada cada 36 s.
// NO equivale a 100 solicitudes/hora: cada visita genera varias (se mide en la métrica `solicitudes_por_visita`). Es carga BAJA, de realismo; no busca romper nada.
// Duración: 60 min (una hora completa) o `-e DURACION=10m` para un ensayo corto.
//
//   BASE_URL=https://<host-de-staging> SLUG_FICHA=<slug-publicado> VERCEL_BYPASS=<en tu terminal> \
//   k6 run --summary-trend-stats="avg,med,p(90),p(95),p(99),max" --summary-export=reports/staging-A.json tests/performance/k6/staging/A-100-visitas-por-hora.js
import { sleep } from 'k6'
import { BASE, SLUG_FICHA, cerrarVisita, iniciarVisita, leer, umbralesDeParo } from './comun.js'

export const options = {
  scenarios: {
    visitas: { executor: 'constant-arrival-rate', rate: 100, timeUnit: '1h', duration: __ENV.DURACION || '60m', preAllocatedVUs: 5, maxVUs: 20 },
  },
  thresholds: umbralesDeParo(),
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

const pausa = (min, max) => sleep(min + Math.random() * (max - min))

export default function () {
  iniciarVisita()
  leer('home', '/')
  pausa(5, 20)                                          // lee la portada
  leer('listado', '/propiedades')
  leer('catalogo', '/api/catalogo')                     // lo que la propia página pide al cargar
  pausa(8, 30)                                          // mira tarjetas
  if (Math.random() < 0.5) { leer('listado_zona', '/propiedades?zona=leon'); pausa(5, 15) }
  if (SLUG_FICHA && Math.random() < 0.7) { leer('ficha', '/propiedades/' + SLUG_FICHA); pausa(15, 60) }
  const extra = Math.random()
  if (extra < 0.25) leer('blog', '/blog')
  else if (extra < 0.45) leer('ayuda', '/ayuda')
  else if (extra < 0.55) leer('nosotros', '/nosotros')
  cerrarVisita()
}

export function teardown() { console.log(`Escenario A terminado contra ${BASE}. Reportar: p50/p95/p99 por endpoint, errores, solicitudes_por_visita.`) }
