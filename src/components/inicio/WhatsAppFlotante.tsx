'use client'
import { useEffect, useState } from 'react'
import { enlaceWhatsApp } from '@/lib/config/negocio'

/**
 * El botón flotante de WhatsApp de la portada. Igual que antes (mismo número y mismo texto), con cuidados para teléfono y tableta (< 900 px):
 *  · respeta el espacio seguro inferior (`env(safe-area-inset-bottom)`) y el lateral;
 *  · se aparta mientras el hero está a la vista (el buscador y los enlaces «Catálogo» y «Asesoría gratis» ya están ahí, y el botón los tapaba en la
 *    primera pantalla), mientras el formulario de contacto está en pantalla y mientras hay un campo enfocado, para no cubrir campos, el
 *    consentimiento ni el botón de enviar. En escritorio no se mueve (no hay nada que cubrir).
 */
export default function WhatsAppFlotante() {
  const [oculto, setOculto] = useState(false)
  useEffect(() => {
    const contacto = document.getElementById('contacto')
    const hero = document.querySelector('[data-inicio-hero]')
    let enContacto = false, enCampo = false, enHero = false
    // Solo en teléfono y tableta (< 900 px): en escritorio el botón nunca se oculta (ni se saca del tabulador ni de los lectores de pantalla).
    const chica = window.matchMedia('(max-width: 899px)')
    const aplicar = () => setOculto(chica.matches && (enContacto || enCampo || enHero))
    chica.addEventListener('change', aplicar)
    const ioHero = hero ? new IntersectionObserver(([e]) => { enHero = e.intersectionRatio > 0.3; aplicar() }, { threshold: [0, 0.3, 0.6, 1] }) : null
    if (hero && ioHero) ioHero.observe(hero)
    const io = contacto ? new IntersectionObserver(([e]) => { enContacto = e.isIntersecting; aplicar() }, { threshold: 0.12 }) : null
    if (contacto && io) io.observe(contacto)
    const adentro = (e: FocusEvent) => { const t = e.target as HTMLElement | null; enCampo = !!t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName); aplicar() }
    const afuera = () => { enCampo = false; aplicar() }
    document.addEventListener('focusin', adentro)
    document.addEventListener('focusout', afuera)
    return () => { chica.removeEventListener('change', aplicar); io?.disconnect(); ioHero?.disconnect(); document.removeEventListener('focusin', adentro); document.removeEventListener('focusout', afuera) }
  }, [])
  return (
    <a className="ini-wa" data-oculto={oculto} aria-label="WhatsApp" tabIndex={oculto ? -1 : 0} aria-hidden={oculto || undefined}
      href={enlaceWhatsApp('Hola, me interesa una propiedad')} target="_blank" rel="noopener noreferrer">
      <i className="fab fa-whatsapp" aria-hidden />
    </a>
  )
}
