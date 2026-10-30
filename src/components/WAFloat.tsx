'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { NEGOCIO } from '@/lib/config/negocio'

const WA_NUMBER = NEGOCIO.whatsapp

/**
 * Rutas donde el botón flotante NO aparece:
 *  · `/admin` — es para el cliente, no para quien administra, y tapaba la
 *    paginación de las tablas.
 *  · `/entrar` — quien está escribiendo su contraseña no quiere que le
 *    ofrezcan un chat encima del formulario.
 */
export const SIN_BOTON = ['/admin', '/entrar'] as const

/**
 * ¿Se esconde en esta ruta? Cubre la ruta exacta y lo que cuelgue de ella
 * (`/admin/usuarios`), pero no una ruta que sólo empiece igual: `/entrarada`
 * sí llevaría botón.
 */
export function ocultarBoton(ruta: string | null | undefined): boolean {
  if (!ruta) return false
  return SIN_BOTON.some((r) => ruta === r || ruta.startsWith(`${r}/`))
}

export default function WAFloat() {
  const [visible, setVisible] = useState(false)
  const [hover, setHover] = useState(false)
  const ruta = usePathname()

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1500)
    return () => clearTimeout(t)
  }, [])

  if (ocultarBoton(ruta)) return null

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
        data-wa-flotante
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar por WhatsApp"
        // La clase permite encogerlo en pantallas de 280 px, donde 60 px es el
        // 22 % del ancho y tapa la esquina de las tarjetas (ver globals.css).
        className="wa-flotante"
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
