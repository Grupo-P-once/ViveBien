import http from 'k6/http'
import { BASE, SLUG } from '../config/entorno.js'
import { sesion, umbrales } from '../helpers/trafico.js'

// RECOVERY: carga alta (PICO) ~45 s y luego SOLO una sonda ligera cada 2 s durante 90 s: la curva de la sonda (tag fase=sonda) dice cuánto tarda en volver al baseline.
const PICO = Number(__ENV.PICO || 200)
export const options = {
  scenarios: {
    presion: { executor: 'ramping-vus', exec: 'presion', startTime: '20s', startVUs: 1, stages: [{ duration: '10s', target: PICO }, { duration: '35s', target: PICO }, { duration: '5s', target: 0 }] },
    sonda: { executor: 'constant-arrival-rate', exec: 'sonda', rate: 1, timeUnit: '2s', duration: '2m20s', preAllocatedVUs: 3 },
  },
  thresholds: Object.assign(umbrales(false), { 'http_req_duration{fase:sonda}': ['max>=0'] }),
}
export function presion() { sesion('CLIENTE', 0.1) }
const T0 = Date.now()
// Cada muestra se imprime («SONDA|segundo|ms») para reconstruir la curva de recuperación: 0-20 s línea base, 20-70 s presión, 70-140 s recuperación.
export function sonda() { const r = http.get(BASE + '/propiedades/' + SLUG, { tags: { name: 'ficha', fase: 'sonda' }, timeout: '30s' }); console.log('SONDA|' + Math.round((Date.now() - T0) / 1000) + '|' + Math.round(r.timings.duration)) }
