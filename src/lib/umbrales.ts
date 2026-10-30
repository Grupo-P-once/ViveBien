/**
 * Umbrales iniciales de alerta (E-38). Se evalúan A PETICIÓN en `GET /api/admin/salud` (campo `umbrales`) sobre las métricas de la instancia;
 * un monitor externo puede consultar esa ruta (con `SALUD_SECRETO`) y avisar cuando `estado !== 'ok'`. No hay alertas automáticas ni
 * infraestructura nueva: el plan Hobby no retiene registros más de 1 hora y activar monitorización de pago es decisión del usuario.
 *
 * Números (a partir de lo MEDIDO, no inventados):
 *  · 5xx > 1 % de las respuestas de un grupo, con al menos 20 muestras (evita alarmas por 1 fallo en 3 peticiones);
 *  · p95 de API > 500 ms y de página/SSR > 1000 ms (umbrales propuestos en D-62; en carga segura E-34 medía p95 ≈ 40 ms);
 *  · memoria RSS > 900 MB o heap > 400 MB (E-34: ~570 MB de RSS tras 450 req/s; el soak sano deja el heap en ~50 MB. E-33 llegaba a 2 GB).
 * Son un punto de partida: se ajustan con tráfico real.
 */
export const UMBRALES = {
  minimoMuestras: 20,
  porcentaje5xx: 1,
  p95ApiMs: 500,
  p95PaginaMs: 1000,
  rssMB: 900,
  heapMB: 400,
} as const

type Instantanea = {
  memoria: { heapUsadoMB: number; rssMB: number }
  contadores: Record<string, number>
  latencias: Record<string, { n: number; p50: number | null; p95: number | null; p99?: number | null }>
}

/** Grupos que cuentan como «página» (SSR) para el umbral de p95; el resto de `http.*` son API. */
const PAGINAS = new Set(['ficha'])

export function evaluarUmbrales(m: Instantanea): { estado: 'ok' | 'atencion'; alertas: string[]; umbrales: typeof UMBRALES } {
  const alertas: string[] = []
  if (m.memoria.rssMB > UMBRALES.rssMB) alertas.push(`memoria RSS ${m.memoria.rssMB} MB > ${UMBRALES.rssMB} MB`)
  if (m.memoria.heapUsadoMB > UMBRALES.heapMB) alertas.push(`heap ${m.memoria.heapUsadoMB} MB > ${UMBRALES.heapMB} MB`)

  const grupos = new Set(Object.keys(m.contadores).filter((k) => k.startsWith('http.')).map((k) => k.split('.')[1]))
  for (const g of grupos) {
    const c = (x: string) => m.contadores[`http.${g}.${x}`] ?? 0
    const total = c('2xx') + c('3xx') + c('4xx') + c('5xx')
    if (total >= UMBRALES.minimoMuestras && (c('5xx') / total) * 100 > UMBRALES.porcentaje5xx) {
      alertas.push(`${g}: ${c('5xx')} de ${total} respuestas fueron 5xx (> ${UMBRALES.porcentaje5xx} %)`)
    }
    const lat = m.latencias[`http.${g}`]
    const limite = PAGINAS.has(g) ? UMBRALES.p95PaginaMs : UMBRALES.p95ApiMs
    if (lat && lat.n >= UMBRALES.minimoMuestras && lat.p95 != null && lat.p95 > limite) alertas.push(`${g}: p95 ${lat.p95} ms > ${limite} ms`)
  }
  return { estado: alertas.length ? 'atencion' : 'ok', alertas, umbrales: UMBRALES }
}
