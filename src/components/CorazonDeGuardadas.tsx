'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFavoritos } from '@/hooks/use-favoritos'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'

/**
 * El corazón de «Guardadas» en una esquina de la ficha completa (28-oct-2026). La MISMA verdad que el de las tarjetas: la tabla `favoritos` de la cuenta (hook `useFavoritos`).
 * Sin sesión no hay guardadas: el corazón lleva a entrar y regresa a esta ficha. Es un interruptor (`aria-pressed`), el fallo se dice con `role="alert"` y mide 44 px (táctil).
 * Se posiciona solo en su contenedor (esquina superior derecha de la foto principal): el contenedor debe ser `position: relative`.
 */
export default function CorazonDeGuardadas({ propiedadId, titulo }: { propiedadId: string; titulo: string }) {
  const router = useRouter()
  const favoritos = useFavoritos()
  const guardada = favoritos.esGuardada(propiedadId)
  const [error, setError] = useState('')

  function alternar() {
    if (favoritos.loading) return
    if (!favoritos.isLoggedIn) { router.push(rutaDeEntrada(`${window.location.pathname}${window.location.search}`)); return }
    setError('')
    favoritos.alternar(propiedadId).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'))
  }

  return (
    <>
      <button type="button" data-corazon-ficha aria-pressed={guardada} disabled={favoritos.loading} aria-busy={favoritos.loading} onClick={(e) => { e.stopPropagation(); alternar() }}
        aria-label={guardada ? `Quitar ${titulo} de guardadas` : `Guardar ${titulo}`} title={guardada ? 'Quitar de guardadas' : favoritos.isLoggedIn ? 'Guardar' : 'Entra para guardar'}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 4, width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,.95)', color: guardada ? 'var(--rojo-marca)' : '#374151', boxShadow: '0 2px 10px rgba(0,0,0,.28)', fontSize: '1.15rem', opacity: favoritos.loading ? 0.7 : 1,
        }}>
        <i className={guardada ? 'fas fa-heart' : 'far fa-heart'} aria-hidden="true" />
      </button>
      {error && <span role="alert" style={{ position: 'absolute', top: 62, right: 12, zIndex: 4, maxWidth: 220, background: '#fff', color: '#991b1b', padding: '6px 10px', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, boxShadow: '0 2px 10px rgba(0,0,0,.2)' }}>{error}</span>}
    </>
  )
}
