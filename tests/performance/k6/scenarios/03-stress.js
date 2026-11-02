import { sesion, elegirRol, umbrales } from '../helpers/trafico.js'

// STRESS: escalones progresivos (STAGES="10,25,50,100"). Se detiene solo por las cotas de PARO. Último escalón estable = el último que cierra sin paro.
const NIVELES = (__ENV.STAGES || '10,25,50,100,250').split(',').map(Number)
const PASO = __ENV.PASO || '60s'
const stages = []
for (const n of NIVELES) { stages.push({ duration: '10s', target: n }); stages.push({ duration: PASO, target: n }) }
stages.push({ duration: '10s', target: 0 })
export const options = { scenarios: { stress: { executor: 'ramping-vus', startVUs: 1, stages } }, thresholds: umbrales(true) }
export default function escenarioStress() { sesion(elegirRol(), 0.2) }
