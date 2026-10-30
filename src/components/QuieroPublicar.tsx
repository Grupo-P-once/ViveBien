'use client'
import { useState } from 'react'
import { auth } from '@/lib/firebase'

/**
 * El camino de cliente a publicador.
 *
 * El rol se podía cambiar desde el primer día —`PATCH /api/usuarios/me` acepta
 * `rol`— pero no había ningún botón que lo ofreciera. Alguien entra a buscar
 * casa, resulta que también tiene una que vender, y el producto no se lo
 * preguntaba nunca. Eso es inventario que se pierde en silencio.
 *
 * **Se solicita, no se concede solo.** Antes este botón se ascendía a
 * publicador directamente: cualquiera se daba permiso para meter contenido en
 * el catálogo público de la casa, con su teléfono al lado del anuncio.
 *
 * Ahora manda una solicitud, que cae en el panel de Registros como cualquier
 * otro interesado, y un administrador da el rol desde el panel de Usuarios.
 * El candado real está en el servidor: `ROLES_ELEGIBLES` ya no incluye
 * `publicador`, así que aunque alguien llame a la API a mano, no lo consigue.
 */
export default function QuieroPublicar() {
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')

  async function convertirme() {
    setEnviando(true)
    setError('')
    try {
      const t = await auth.currentUser?.getIdToken()
      // Se SOLICITA, no se concede. Publicar es permiso para meter contenido
      // en el catalogo publico de la casa; lo autoriza un administrador.
      const res = await fetch('/api/registro-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          interes: 'Quiere publicar una propiedad',
          mensaje: 'Solicita acceso de publicador desde su panel.',
          origen: 'registro',
          consentimiento: true,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'No se pudo enviar tu solicitud.')
        setEnviando(false)
        return
      }
      setEnviado(true)
      setEnviando(false)
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
          Déjanos tus datos y te damos acceso para publicarla. Te guiamos paso a
          paso —tipo, ubicación, fotos y precio— y un asesor la revisa antes de
          que salga al público. Sin costo por publicar.
        </p>
        {error && (
          <p style={{ color: 'var(--error-fuerte)', fontSize: '.85rem', marginTop: '.6rem' }}>{error}</p>
        )}
      </div>

      {enviado ? (
        <p style={{
          background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)',
          padding: '.85rem 1.2rem', borderRadius: 10, fontSize: '.88rem',
          lineHeight: 1.55, margin: 0, flex: '1 1 240px',
        }}>
          <strong>Solicitud enviada.</strong> Te contactamos para darte acceso.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', flex: '1 1 300px' }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Tu nombre"
            style={{ flex: '1 1 130px', padding: '.7rem .9rem', border: '1px solid var(--borde-frio)', borderRadius: 9, fontSize: '.9rem' }} />
          <input value={telefono} onChange={e => setTelefono(e.target.value)}
            placeholder="WhatsApp" inputMode="tel"
            style={{ flex: '1 1 130px', padding: '.7rem .9rem', border: '1px solid var(--borde-frio)', borderRadius: 9, fontSize: '.9rem' }} />
          <button onClick={convertirme}
            disabled={enviando || nombre.trim().length < 2 || telefono.replace(/\D/g, '').length < 10}
            style={{
              background: 'var(--rojo-marca)', color: '#fff', border: 'none',
              padding: '.75rem 1.5rem', borderRadius: 9, fontWeight: 700,
              fontSize: '.9rem', cursor: enviando ? 'wait' : 'pointer',
              whiteSpace: 'nowrap', opacity: enviando ? .7 : 1,
            }}>
            {enviando ? 'Enviando…' : 'Solicitar acceso'}
          </button>
        </div>
      )}
    </section>
  )
}
