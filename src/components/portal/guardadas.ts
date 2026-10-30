'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { useFavoritos } from '@/hooks/use-favoritos'
import { useResumen } from './resumen'

/**
 * El corazón de las tarjetas del portal. Es el MISMO almacén que el del
 * catálogo (`useFavoritos`, D-75): guardar en un sitio se ve en el otro y no
 * hay dos copias que puedan discrepar. Cambia al instante y se confirma con
 * el servidor; si falla, vuelve como estaba y se avisa. El resumen del portal
 * sólo se usa para pintar antes de que llegue la lista, y se vuelve a pedir
 * tras cada cambio para que los contadores del menú salgan del servidor.
 */
export function useGuardadas() {
  const { resumen, recargar } = useResumen()
  const favoritos = useFavoritos()

  const esGuardada = useCallback(
    (id: string) => favoritos.estadoDe(id) ?? !!resumen?.guardadas.includes(id),
    [favoritos, resumen],
  )

  const alternar = useCallback((id: string) => {
    favoritos.establecer(id, !esGuardada(id))
      .then(() => recargar())
      .catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar.'))
  }, [favoritos, esGuardada, recargar])

  return { esGuardada, alternar }
}
