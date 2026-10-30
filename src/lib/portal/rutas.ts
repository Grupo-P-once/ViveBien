import { RUTAS_DE_VISITAS } from '../citas/enlaces'

/**
 * Qué pantallas del portal existen de verdad (V-1.1.85).
 *
 * El menú se escribió entero desde el principio (D-06), pero las pantallas
 * llegan por entregas. Esta lista es la única verdad sobre lo que ya está: el
 * menú sólo enseña lo que aparece aquí, así que **ningún enlace lleva a un
 * 404** y nadie tiene que acordarse de esconder o enseñar nada a mano.
 *
 * Al construir una pantalla nueva, se añade su ruta aquí y aparece sola. Una
 * prueba comprueba que cada ruta de esta lista tiene su `page.tsx`, y que el
 * menú no enlaza nada que no esté.
 *
 * Pendiente: `/portal/mi-propiedad` (3b-3, la solicitud para ser publicador).
 */
export const PANTALLAS_DEL_PORTAL = [
  '/portal',
  '/portal/propiedades',
  '/portal/busquedas',
  '/portal/alertas',
  '/portal/consultas',
  // 3b-2. La de visitas sale de `lib/citas/enlaces.ts`: esa ruta la escriben
  // también los correos, y no puede vivir en dos sitios.
  RUTAS_DE_VISITAS.cliente,
  '/portal/perfil',
  '/portal/mi-busqueda', // sólo redirige a «Mis búsquedas»; ya no está en el menú
  '/portal/valuador',
  '/portal/configuracion',
  '/portal/mis-propiedades', // espacio de trabajo de Publicador y Asociado (R8.4); el menú lo ofrece solo con la capacidad
  '/portal/mis-metricas', // métricas de SUS propiedades (vistas, interés, contactos y días publicadas); solo con la misma capacidad
] as const

/** ¿Existe ya la pantalla de este enlace? (la consulta `?vista=…` no cuenta). */
export function pantallaExiste(enlace: string): boolean {
  const ruta = enlace.split('?')[0]
  if (!ruta.startsWith('/portal')) return true // fuera del portal: /propiedades, /valuador, /admin…
  return (PANTALLAS_DEL_PORTAL as readonly string[]).includes(ruta)
}
