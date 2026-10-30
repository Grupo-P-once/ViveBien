'use client'
import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Consentimiento, { PistaConsentimiento } from '@/components/Consentimiento'
import { NEGOCIO } from '@/lib/config/negocio'

interface RegisterModalProps {
  isOpen: boolean
  onClose: () => void
  propertyTitle?: string
  /** La propiedad que se estaba viendo, para que el lead no llegue sin contexto. */
  propertyId?: string
}

const WA_NUMBER = NEGOCIO.whatsapp

export default function RegisterModal({ isOpen, onClose, propertyTitle, propertyId }: RegisterModalProps) {
  const [paso, setPaso] = useState<1 | 2>(1)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [acepta, setAcepta] = useState(false)

  if (!isOpen) return null

  async function enviar() {
    if (!nombre.trim() || !telefono.trim() || !email.trim()) {
      setError('Por favor completa todos los campos.')
      return
    }
    // El botón ya está desactivado sin la casilla; esto cubre un Enter en el
    // teclado o un botón forzado desde el inspector.
    if (!acepta) {
      setError('Marca «Acepto el aviso de privacidad» para continuar.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/registro-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(), telefono: telefono.trim(), email: email.trim(),
          // El título va en «interés» y la propiedad en su columna: antes iba
          // todo dentro del mensaje y el panel enseñaba «Interés: —».
          interes: propertyTitle || null,
          propiedadId: propertyId || null,
          mensaje: propertyTitle ? null : 'Registro general',
          // Antes era `true` fijo: el popup no tenía casilla y el consentimiento
          // se daba por hecho «al enviar». Bajo la LFPDPPP tiene que poder
          // demostrarse que la persona lo marcó.
          origen: 'registro', consentimiento: acepta,
        }),
      })
      if (!res.ok) throw new Error('fallo')
    } catch (e) {
      console.error('Error guardando lead:', e)
      // No bloqueamos el flujo — el usuario ya mostró intención
    }
    setLoading(false)
    setPaso(2)
  }

  function handleClose() {
    setPaso(1)
    setNombre('')
    setTelefono('')
    setEmail('')
    setError('')
    setAcepta(false)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '.7rem 1rem',
    border: '1.5px solid #DDE',
    borderRadius: '8px',
    fontFamily: 'inherit',
    fontSize: '.92rem',
    color: 'var(--texto)',
    transition: 'border-color .2s',
    boxSizing: 'border-box',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
        backdropFilter: 'blur(6px)', zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '20px',
          maxWidth: '440px', width: '100%', padding: '2.5rem 2rem',
          position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,.3)',
          animation: 'regEntrada .3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          style={{
            position: 'absolute', top: '12px', right: '16px',
            background: 'none', border: 'none', fontSize: '1.6rem',
            color: '#999', cursor: 'pointer', lineHeight: 1,
          }}
          aria-label="Cerrar"
        >
          ×
        </button>

        {paso === 1 ? (
          <>
            <h2 style={{
              fontFamily: 'var(--font-montserrat)', fontSize: '1.3rem',
              fontWeight: 800, color: 'var(--rojo)', textAlign: 'center', marginBottom: '.3rem',
            }}>
              <i className="fa fa-user-plus" style={{ marginRight: '.5rem' }} />Regístrate
            </h2>
            <p style={{ textAlign: 'center', fontSize: '.85rem', color: '#666', marginBottom: '1.5rem' }}>
              Déjanos tus datos para darte la mejor atención
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>
                  <i className="fa fa-user" style={{ marginRight: '.4rem' }} />Nombre completo *
                </label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Ej. Juan Pérez" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>
                  <i className="fa fa-phone" style={{ marginRight: '.4rem' }} />Teléfono *
                </label>
                <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)}
                  placeholder="Ej. 477 123 4567" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>
                  <i className="fa fa-envelope" style={{ marginRight: '.4rem' }} />Correo electrónico *
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Ej. correo@ejemplo.com" style={inputStyle} />
              </div>
            </div>

            {error && (
              <p style={{ color: 'var(--rojo)', fontSize: '.8rem', fontWeight: 600, textAlign: 'center', marginBottom: '.5rem' }}>
                {error}
              </p>
            )}

            <Consentimiento marcado={acepta} onChange={setAcepta} id="cons-registro" />

            <button onClick={enviar} disabled={loading || !acepta} style={{
              width: '100%', padding: '.85rem',
              background: 'linear-gradient(135deg,var(--rojo),var(--rojo-claro))',
              color: '#fff', fontFamily: 'var(--font-montserrat)',
              fontWeight: 700, fontSize: '1rem',
              border: 'none', borderRadius: '10px',
              cursor: loading || !acepta ? 'not-allowed' : 'pointer',
              opacity: loading || !acepta ? .6 : 1,
            }}>
              {loading ? 'Enviando...' : <>Continuar <i className="fa fa-arrow-right" style={{ marginLeft: '.4rem' }} /></>}
            </button>
            <PistaConsentimiento visible={!acepta && !loading} />

            <p style={{ fontSize: '11px', color: '#666', marginTop: '15px', lineHeight: 1.4, textAlign: 'center' }}>
              {/* Enlaces, no <strong>. Decir «aceptas los terminos» sin que se
                  puedan abrir es un consentimiento mal formado: bajo LFPDPPP
                  el aviso tiene que poder consultarse ANTES de consentir. */}
              Al enviar, aceptas nuestros{' '}
              <Link href="/terminos" target="_blank" style={{ color: 'var(--azul)', fontWeight: 700 }}>
                Términos y Condiciones
              </Link>. El aviso de privacidad se acepta con la casilla de arriba.
            </p>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <i className="fa fa-check-circle" style={{ color: 'var(--whatsapp)', fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }} />
            <p style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, color: 'var(--rojo)', fontSize: '1.2rem', marginBottom: '.3rem' }}>
              ¡Gracias!
            </p>
            <p style={{ fontSize: '.85rem', color: '#666', marginBottom: '1.5rem' }}>
              Elige cómo quieres contactarnos:
            </p>
            <div style={{ display: 'flex', gap: '.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href={`tel:+${WA_NUMBER}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '.75rem 1.4rem', borderRadius: '10px',
                  fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: '.9rem',
                  background: '#fff', color: '#333', border: '2px solid #ddd',
                  textDecoration: 'none',
                }}
                onClick={handleClose}
              >
                <i className="fa fa-phone" /> Teléfono
              </a>
              <a
                href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hola Vive Bien, soy ${nombre} y me interesa obtener más información${propertyTitle ? ' sobre: ' + propertyTitle : ''}.`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '.75rem 1.4rem', borderRadius: '10px',
                  fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: '.9rem',
                  background: 'var(--whatsapp)', color: '#fff',
                  textDecoration: 'none',
                }}
                onClick={handleClose}
              >
                <i className="fab fa-whatsapp" /> WhatsApp
              </a>
              <button
                onClick={handleClose}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '.75rem 1.4rem', borderRadius: '10px',
                  fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: '.9rem',
                  background: '#E8590C', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                <i className="fa fa-envelope" /> Contactar
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes regEntrada {
            from { opacity: 0; transform: scale(.9) translateY(20px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </div>
  )
}
