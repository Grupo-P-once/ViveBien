/**
 * Dónde ve cada quien sus citas. UN solo lugar — P3-01 (V-1.1.82), actualizado en el modelo v2 (5-nov-2026).
 *
 * Antes cada pieza tenía su propia ruta escrita a mano: los correos y la página de acción mandaban al cliente a
 * `/portal/visitas` y al equipo a `/admin/calendario`, y ninguna de las dos existía. Por eso hay UN solo lugar, y una
 * prueba (`tests/citas-enlaces.test.ts`) comprueba que cada ruta que sale de aquí corresponde a una pantalla que existe.
 *
 *  · Cliente      → `/portal/citas` (D-6: el menú se llama «Citas»; `/portal/visitas` redirige).
 *  · Equipo       → `/admin/citas`: el calendario de todo el equipo.
 *  · Publicador   → `/publicador/citas`: las citas que él agendó para ir a ver, y las de sus propiedades (solo lectura),
 *                   más —si es asociado/atiende citas— las que administra.
 *  · Propietario  → la pestaña «Mis propiedades» de la misma pantalla del publicador.
 *
 * Los enlaces de los correos y de los avisos de la app llevan aquí. Nunca cambian nada: la acción se completa dentro,
 * con la sesión de la persona (D-3).
 */

/** ¿Existe ya «Citas» en el portal? Sí desde el modelo v2. */
export const VISITAS_TIENEN_PANTALLA = true

export const RUTAS_DE_VISITAS = {
  cliente: '/portal/citas',
  equipo: '/admin/citas',
  /** Un publicador (con o sin `recibir_citas`) ve sus citas en su panel. */
  publicador: '/publicador/citas',
  /** El dueño de la propiedad que no la atiende: la misma pantalla, pestaña de solo lectura. */
  propietario: '/publicador/citas',
} as const

export type QuienVe = keyof typeof RUTAS_DE_VISITAS

/** Ruta relativa. Marca la cita para que la pantalla la abra; el propietario cae en su pestaña. */
export function rutaDeVisitas(quien: QuienVe, citaId?: string | null): string {
  const base = RUTAS_DE_VISITAS[quien]
  if (!citaId) return quien === 'propietario' ? `${base}?vista=propiedades` : base
  const marca = `cita=${encodeURIComponent(citaId)}`
  return quien === 'equipo' || quien === 'cliente' || quien === 'publicador'
    ? `${base}?${marca}`
    : `${base}?vista=propiedades&${marca}`
}
