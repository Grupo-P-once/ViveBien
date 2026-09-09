'use client'
import { useState, useEffect } from 'react'

const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'

export default function WAFloat() {
  const [visible, setVisible] = useState(false)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1500)
    return () => clearTimeout(t)
  }, [])

  const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola Vive Bien, me gustaría información sobre sus propiedades en León.')}`

  return (
    <div style={{
      position: 'fixed', bottom: '28px', right: '28px', zIndex: 9000,
      display: 'flex', alignItems: 'center', gap: '.8rem',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
      transition: 'opacity .5s, transform .5s',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      {hover && (
        <span style={{
          background: '#fff', color: '#222', fontSize: '.82rem', fontWeight: 600,
          padding: '.45rem .9rem', borderRadius: '8px', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', border: '1px solid #eee',
          fontFamily: 'Open Sans, sans-serif',
        }}>
          ¿Necesitas ayuda? ¡Escríbenos!
        </span>
      )}
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar por WhatsApp"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '60px', height: '60px', borderRadius: '50%',
          background: 'var(--whatsapp)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          textDecoration: 'none',
          transition: 'transform .2s, box-shadow .2s',
          fontSize: '1.75rem',
          color: '#fff',
          transform: hover ? 'scale(1.1)' : 'scale(1)',
          boxShadow: hover ? '0 6px 32px rgba(37,211,102,.65)' : '0 4px 24px rgba(37,211,102,.5)',
        } as React.CSSProperties}
      >
        <i className="fab fa-whatsapp" />
      </a>
    </div>
  )
}
