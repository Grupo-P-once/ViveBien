'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'

/**
 * El camino de cliente a publicador.
 *
 * El rol se podía cambiar desde el primer día —`PATCH /api/usuarios/me` acepta
 * `rol`— pero no había ningún botón que lo ofreciera. Alguien entra a buscar
 * casa, resulta que también tiene una que vender, y el producto no se lo
 * preguntaba nunca. Eso es inventario que se pierde en silencio.
 *
 * No es un cambio irreversible ni una solicitud que alguien apruebe: convertirse
 * en publicador sólo da acceso a crear borradores. Publicar de verdad sigue
 * exigiendo que un administrador apruebe, que es donde está el control.
 */
export default function QuieroPublicar() {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  async function convertirme() {
    setEnviando(true)
    setError('')
    try {
      const t = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/usuarios/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ rol: 'publicador' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'No se pudo activar tu cuenta de publicador.')
        setEnviando(false)
        return
      }
      // Al perfil, no al panel: lo primero que hace falta es su contacto, y
      // sin él no podrá enviar nada a revisión.
      router.push('/mi-cuenta?motivo=publicar')
    } catch {
      setError('Error de red. Inténtalo otra vez.')
      setEnviando(false)
    }
  }

  return (
    <section style={{
      background: '#fff', borderRadius: 16, padding: '1.75rem 2rem',
      boxShadow: '0 4px 15px rgba(0,0,0,.06)', marginBottom: '2rem',
      display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap',
      borderLeft: '4px solid var(--rojo)',
    }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <h3 style={{
          fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
          color: 'var(--azul)', fontSize: '1.1rem', margin: '0 0 .4rem',
        }}>
          ¿Tienes una propiedad que vender o rentar?
        </h3>
        <p style={{ color: '#5A6472', fontSize: '.9rem', lineHeight: 1.6, margin: 0 }}>
          Publícala tú mismo. Te guiamos paso a paso —tipo, ubicación, fotos y
          precio— y un asesor la revisa antes de que salga al público. Sin costo
          por publicar.
        </p>
        {error && (
          <p style={{ color: 'var(--error-fuerte)', fontSize: '.85rem', marginTop: '.6rem' }}>{error}</p>
        )}
      </div>

      <button onClick={convertirme} disabled={enviando} style={{
        background: 'var(--rojo)', color: '#fff', border: 'none',
        padding: '.85rem 1.75rem', borderRadius: 10, fontWeight: 700,
        fontSize: '.92rem', cursor: enviando ? 'wait' : 'pointer',
        whiteSpace: 'nowrap', opacity: enviando ? .7 : 1,
      }}>
        {enviando ? 'Activando…' : 'Publicar mi propiedad'}
      </button>
    </section>
  )
}
