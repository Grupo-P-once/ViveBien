import { sesion, elegirRol, umbrales } from '../helpers/trafico.js'

// SOAK: carga moderada sostenida (DURACION) para ver degradación progresiva (comparar p95 del primer vs último tercio y la memoria del servidor).
const VUS = Number(__ENV.VUS || 20)
export const options = { scenarios: { soak: { executor: 'constant-vus', vus: VUS, duration: __ENV.DURACION || '10m' } }, thresholds: umbrales(true) }
export default function escenarioSoak() { sesion(elegirRol(), 0.5) }
