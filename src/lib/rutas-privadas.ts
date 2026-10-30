/**
 * Rutas privadas: `robots.txt` las marca `Disallow` y cada una lleva además
 * `noindex, nofollow` en su layout o página.
 *
 * Los dos candados hacen cosas distintas: `Disallow` pide no RASTREAR (no
 * gastar visitas del buscador en páginas que no son para él); `noindex` pide
 * no INDEXAR si aun así llega por un enlace. Uno sin el otro deja un hueco.
 *
 * V-1.1.82 (P3-06): se suman el portal del cliente, las acciones de citas por
 * enlace y la vista previa de desarrollo. Ninguna página pública empieza por
 * estos prefijos (una prueba lo vigila).
 */
export const RUTAS_PRIVADAS = [
  '/dashboard',
  '/admin',
  '/publicador',
  '/mi-cuenta',
  '/portal',
  '/citas',
  '/vista-previa',
  '/api',
] as const
