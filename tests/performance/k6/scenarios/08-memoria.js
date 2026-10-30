import { pedir, SUPERFICIES, umbrales } from '../helpers/trafico.js'

// SONDA DE MEMORIA: tasa constante sobre UN grupo de endpoints (GRUPO = nombre de la etiqueta, o CLIENTE = toda la superficie pública)
// para atribuir el crecimiento de memoria del servidor. Mide junto con tests/performance/muestrear-memoria.ps1.
const TASA = Number(__ENV.TASA || 150)
const GRUPO = __ENV.GRUPO || 'CLIENTE'
const lista = GRUPO === 'CLIENTE' ? SUPERFICIES.CLIENTE : SUPERFICIES.CLIENTE.filter((u) => u.name === GRUPO)
export const options = {
  scenarios: { memoria: { executor: 'constant-arrival-rate', rate: TASA, timeUnit: '1s', duration: __ENV.DURACION || '2m', preAllocatedVUs: 100, maxVUs: Number(__ENV.MAX_VUS || 2500) } },
  thresholds: umbrales(false),
}
export default function () { pedir(lista[Math.floor(Math.random() * lista.length)]) }
