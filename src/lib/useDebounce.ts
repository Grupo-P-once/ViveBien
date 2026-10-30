'use client'
import { useEffect, useState } from 'react'

/**
 * El valor, pero sólo cuando deja de cambiar durante `retraso` milisegundos.
 *
 * Misma idea que `useDebounce` de usehooks-ts, sin añadir la dependencia por un
 * hook de diez líneas.
 *
 * Existe por las «Zonas más buscadas» del panel: la búsqueda se registraba en
 * cada tecla, así que escribir «San Juan Bosco» guardaba «S», «Sa», «San»,
 * «San j», «San ju»… — en la base había literalmente «San juan bosc» como zona
 * buscada. Con esto se registra una vez, cuando la persona termina de escribir.
 */
export function useDebounce<T>(valor: T, retraso = 500): T {
  const [estable, setEstable] = useState(valor)

  useEffect(() => {
    const t = setTimeout(() => setEstable(valor), retraso)
    // Cada tecla cancela el temporizador anterior: sólo sobrevive el último.
    return () => clearTimeout(t)
  }, [valor, retraso])

  return estable
}
