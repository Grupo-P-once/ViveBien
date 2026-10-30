/**
 * Imagen de reserva SIN bucle (Etapa 7).
 *
 * El patrón de antes era `onError={e => { e.target.src = PLACEHOLDER }}`. Si la reserva TAMBIÉN falla (red sin acceso a Unsplash,
 * un bloqueador de anuncios, una oficina con filtro, sin conexión), cada fallo vuelve a asignar la misma dirección, el navegador
 * reintenta y falla otra vez: un bucle sin fin. Medido en el navegador de pruebas: ~6 000 intentos en 30 s por página del catálogo,
 * la red nunca queda quieta (`networkidle`) y la pestaña gasta CPU y datos. Pasa en producción para cualquiera sin acceso al host.
 *
 * Ahora la reserva se prueba UNA vez por imagen; si también falla, se deja quieta (el contenedor ya tiene un fondo neutro).
 */
export function alFallarImagen(el: HTMLImageElement, respaldo: string): 'respaldo' | 'sin-respaldo' {
  // Si sigue puesto, el navegador vuelve a elegir de `srcset` y el `src` de reserva nunca se usa.
  el.removeAttribute('srcset')
  el.removeAttribute('sizes')
  if (el.dataset.respaldo === '1') return 'sin-respaldo'
  el.dataset.respaldo = '1'
  el.src = respaldo
  return 'respaldo'
}
