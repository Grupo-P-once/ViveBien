import { sesion, elegirRol, umbrales } from '../helpers/trafico.js'

// LOAD: tráfico esperado con mezcla configurable (MIX). VUS y DURACION por entorno.
const VUS = Number(__ENV.VUS || 20)
const DUR = __ENV.DURACION || '2m'
export const options = {
  scenarios: { carga: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '20s', target: VUS }, { duration: DUR, target: VUS }, { duration: '10s', target: 0 }] } },
  thresholds: umbrales(true),
}
export default function escenarioLoad() { sesion(elegirRol(), 1) }
