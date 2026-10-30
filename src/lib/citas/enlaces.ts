/**
 * Dónde ve cada quien sus visitas. UN solo lugar — P3-01 (V-1.1.82).
 *
 * Antes cada pieza tenía su propia ruta escrita a mano: los correos y la
 * página de acción mandaban al cliente a `/portal/visitas` y al equipo a
 * `/admin/calendario`, y ninguna de las dos existía. Hoy no se ha mandado
 * ningún correo (no hay citas y el flag `citasEnLinea` impide crearlas), pero
 * el enlace roto estaba listo para salir en el primero.
 *
 *  · Cliente → `/portal/visitas` (la pantalla llega en la fase 3b; hasta que
 *    exista y el portal esté abierto a clientes, `citasEnLinea` sigue apagado).
 *  · Equipo  → `/admin` mientras no exista el calendario de administración
 *    (fase 8). Cuando exista, se cambia AQUÍ y en ningún otro sitio.
 *  · Publicador con `recibir_citas` (ADR-0013) → `/publicador/citas`: sus citas
 *    RECIBIDAS, distintas de «Mis visitas» (las que él pide como cliente).
 */

/**
 * ¿Existe ya «Mis visitas» en el portal? Desde 3b-2, sí. Mientras fue `false`,
 * el Inicio no enlazaba a ella: un enlace que lleva a un 404 es peor que no
 * tener el enlace.
 */
export const VISITAS_TIENEN_PANTALLA = true

export const RUTAS_DE_VISITAS = {
  cliente: '/portal/visitas',
  equipo: '/admin',
  /** Un publicador con `recibir_citas` ve las que le llegan en su panel (ADR-0013). Distinta de «Mis visitas». */
  publicador: '/publicador/citas',
} as const

export type QuienVe = keyof typeof RUTAS_DE_VISITAS

/** Ruta relativa. Al cliente se le marca la cita; el panel aún no sabe abrir una. */
export function rutaDeVisitas(quien: QuienVe, citaId?: string | null): string {
  const base = RUTAS_DE_VISITAS[quien]
  return (quien === 'cliente' || quien === 'publicador') && citaId ? `${base}?cita=${encodeURIComponent(citaId)}` : base
}
