import { umbrales, SUPERFICIES, pedir } from '../helpers/trafico.js'

// BREAKPOINT: tasa de llegada creciente (modelo abierto). Se aborta al primer síntoma de las cotas de PARO. RATE_MAX/DURACION por entorno.
const MAX = Number(__ENV.RATE_MAX || 400)
const DUR = __ENV.DURACION || '4m'
export const options = {
  scenarios: {
    breakpoint: { executor: 'ramping-arrival-rate', startRate: 10, timeUnit: '1s', preAllocatedVUs: 100, maxVUs: Number(__ENV.MAX_VUS || 1000), stages: [{ duration: DUR, target: MAX }] },
  },
  thresholds: umbrales(true),
}
const cola = SUPERFICIES.CLIENTE
export default function escenarioBreakpoint() { pedir(cola[Math.floor(Math.random() * cola.length)]) }
