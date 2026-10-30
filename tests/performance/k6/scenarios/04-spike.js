import { sesion, elegirRol, umbrales } from '../helpers/trafico.js'

// SPIKE: baja carga → pico abrupto → mantener → caída → vuelve a baja carga.
const BAJA = Number(__ENV.BAJA || 5)
const PICO = Number(__ENV.PICO || 200)
export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus', startVUs: BAJA,
      stages: [{ duration: '30s', target: BAJA }, { duration: '5s', target: PICO }, { duration: '45s', target: PICO }, { duration: '5s', target: BAJA }, { duration: '45s', target: BAJA }],
    },
  },
  thresholds: umbrales(false),
}
export default function () { sesion(elegirRol(), 0.3) }
