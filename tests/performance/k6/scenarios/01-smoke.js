import { sesion, umbrales } from '../helpers/trafico.js'

// SMOKE: valida que los scripts funcionan. 1–5 VUs, corto, solo GET públicos, no muta nada.
export const options = {
  scenarios: { smoke: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '10s', target: 3 }, { duration: '20s', target: 5 }, { duration: '5s', target: 0 }] } },
  thresholds: umbrales(false),
}
export default function () { sesion('CLIENTE', 0.3) }
