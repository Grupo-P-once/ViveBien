'use client'
import Consentimiento from '@/components/Consentimiento'
import { CORREO_CONTACTO, mailtoDe } from '@/lib/contacto'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'

const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'

export default function ContactoPage() {
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', mensaje: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [acepta, setAcepta] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.telefono) { setError('Nombre y teléfono son requeridos.'); return }
    setSending(true); setError('')
    try {
      // Por la API y no directo a Supabase: asi se valida, se normaliza el
      // telefono y -sobre todo- queda registrada la version del aviso que
      // esta persona acepto. Sin esa prueba no se pueden compartir sus datos.
      const res = await fetch('/api/registro-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(), telefono: form.telefono.trim(),
          email: form.email.trim(), mensaje: form.mensaje.trim(),
          origen: 'contacto', consentimiento: acepta,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'fallo')
      }
      setSent(true)
    } catch {
      setError('No pudimos enviar tu mensaje. Por favor escríbenos por WhatsApp.')
    }
    setSending(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '.75rem 1rem', border: '1.5px solid #E0E4EA',
    borderRadius: '10px', fontSize: '.95rem', fontFamily: 'inherit',
    boxSizing: 'border-box', transition: 'border-color .2s',
  }

  return (
    <>
      <Header />

      {/* Hero */}
      <section style={{ position: 'relative', height: '40vh', minHeight: '320px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <img
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }}
          />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,8,8,.92) 0%, rgba(8,8,8,.65) 60%, rgba(8,8,8,.2) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 55%)' }} />
        <div className="hero-top-line" />
        <div style={{ position: 'relative', zIndex: 2, padding: '0 max(4vw, 2rem) 3.5rem', maxWidth: '720px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', marginBottom: '1rem' }}>
            <div style={{ width: '28px', height: '2px', background: 'var(--dorado)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '.68rem', letterSpacing: '3.5px', textTransform: 'uppercase', color: 'var(--dorado)' }}>
              Hablemos · León, Gto.
            </span>
          </div>
          <h1 style={{ margin: '0 0 .8rem', lineHeight: 1.08 }}>
            <span style={{ display: 'block', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,3rem)', color: '#fff', letterSpacing: '-.02em' }}>
              Contáctanos
            </span>
            <span style={{ display: 'block', fontFamily: '"Playfair Display", Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(1.4rem,3vw,2.2rem)', color: 'var(--dorado)' }}>
              tu asesor te espera
            </span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,.72)', fontSize: '.9rem', lineHeight: 1.7, maxWidth: '400px', margin: 0 }}>
            Estamos para ayudarte a encontrar la propiedad perfecta en León, Guanajuato.
          </p>
        </div>
      </section>

      <main style={{ background: 'var(--gris)', padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'start' }} className="contact-grid">

          {/* Info */}
          <div>
            <div className="editorial-label" style={{ marginBottom: '1.2rem' }}>Información de contacto</div>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, color: 'var(--azul)', fontSize: 'clamp(1.3rem,2.5vw,1.7rem)', marginBottom: '2rem', lineHeight: 1.15 }}>
              Hablemos de<br />
              <span style={{ fontFamily: '"Playfair Display", Georgia, serif', fontStyle: 'italic', color: 'var(--rojo)' }}>tu próxima inversión</span>
            </h2>
            {[
              { icon: 'fa-phone', color: 'var(--azul)', title: 'Teléfono', val: `+52 477 811 6501`, href: `tel:+${WA_NUMBER}` },
              { icon: 'fab fa-whatsapp', color: 'var(--whatsapp)', title: 'WhatsApp', val: `+52 477 811 6501`, href: `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola, quiero más información sobre una propiedad.')}` },
              { icon: 'fa-envelope', color: 'var(--rojo)', title: 'Correo', val: CORREO_CONTACTO, href: mailtoDe() },
              { icon: 'fa-map-marker-alt', color: 'var(--aviso)', title: 'Ubicación', val: 'León, Guanajuato, México', href: 'https://maps.google.com/?q=León,Guanajuato' },
              { icon: 'fa-clock', color: 'var(--morado)', title: 'Horario', val: 'Lun–Vie 9:00–18:00 | Sáb 9:00–14:00', href: null },
            ].map(c => (
              <div key={c.title} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`${c.icon}`} style={{ color: '#fff', fontSize: '1rem' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.82rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.2rem' }}>{c.title}</div>
                  {c.href ? (
                    <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                      style={{ color: c.color, fontWeight: 600, textDecoration: 'none', fontSize: '.95rem' }}>
                      {c.val}
                    </a>
                  ) : (
                    <span style={{ color: '#333', fontSize: '.95rem', fontWeight: 600 }}>{c.val}</span>
                  )}
                </div>
              </div>
            ))}

            {/* WhatsApp CTA */}
            <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola, quiero información sobre una propiedad en León.')}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem', background: 'var(--whatsapp)', color: '#fff', padding: '1rem 1.5rem', borderRadius: '12px', fontWeight: 800, fontFamily: 'Montserrat, sans-serif', textDecoration: 'none', fontSize: '1rem', marginTop: '1rem' }}>
              <i className="fab fa-whatsapp" style={{ fontSize: '1.3rem' }} /> Chatear por WhatsApp ahora
            </a>
          </div>

          {/* Form */}
          <div style={{ background: '#fff', borderRadius: '0', padding: '2.5rem', boxShadow: '0 8px 30px rgba(0,0,0,.08)', borderTop: '3px solid var(--rojo)' }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <i className="fa fa-check-circle" style={{ fontSize: '3.5rem', color: 'var(--exito)', display: 'block', marginBottom: '1rem' }} />
                <h3 style={{ fontFamily: 'Montserrat, sans-serif', color: 'var(--azul)', fontSize: '1.3rem', marginBottom: '.5rem' }}>¡Mensaje enviado!</h3>
                <p style={{ color: '#666' }}>Un asesor te contactará pronto.<br />También puedes escribirnos por WhatsApp.</p>
                <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', background: 'var(--whatsapp)', color: '#fff', padding: '.75rem 1.5rem', borderRadius: '10px', fontWeight: 700, textDecoration: 'none', marginTop: '1.5rem' }}>
                  <i className="fab fa-whatsapp" /> WhatsApp
                </a>
              </div>
            ) : (
              <>
                <div className="editorial-label">Envíanos un mensaje</div>
                <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, color: 'var(--azul)', fontSize: '1.3rem', marginBottom: '1.5rem', lineHeight: 1.2 }}>
                  Respuesta en menos de{' '}
                  <span style={{ fontFamily: '"Playfair Display", Georgia, serif', fontStyle: 'italic', color: 'var(--rojo)' }}>2 horas</span>
                </h2>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 700, color: '#666', letterSpacing: '.05em', display: 'block', marginBottom: '.3rem' }}>NOMBRE COMPLETO *</label>
                    <input type="text" required value={form.nombre} placeholder="Ej. María García"
                      onChange={e => setForm(v => ({ ...v, nombre: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 700, color: '#666', letterSpacing: '.05em', display: 'block', marginBottom: '.3rem' }}>TELÉFONO / WHATSAPP *</label>
                    <input type="tel" required value={form.telefono} placeholder="477 123 4567"
                      onChange={e => setForm(v => ({ ...v, telefono: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 700, color: '#666', letterSpacing: '.05em', display: 'block', marginBottom: '.3rem' }}>CORREO ELECTRÓNICO</label>
                    <input type="email" value={form.email} placeholder="correo@ejemplo.com"
                      onChange={e => setForm(v => ({ ...v, email: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 700, color: '#666', letterSpacing: '.05em', display: 'block', marginBottom: '.3rem' }}>¿EN QUÉ PODEMOS AYUDARTE?</label>
                    <textarea rows={4} value={form.mensaje} placeholder="Estoy buscando una nave industrial para renta en León..."
                      onChange={e => setForm(v => ({ ...v, mensaje: e.target.value }))}
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  {error && (
                    <p style={{ color: 'var(--error)', background: 'var(--error-fondo)', padding: '.6rem .8rem', borderRadius: '8px', fontSize: '.85rem', fontWeight: 600 }}>
                      <i className="fa fa-exclamation-circle" style={{ marginRight: '.4rem' }} />{error}
                    </p>
                  )}
                  <Consentimiento marcado={acepta} onChange={setAcepta} id="cons-contacto" />
                  <button type="submit" disabled={sending || !acepta}
                    style={{ background: 'var(--rojo)', color: '#fff', padding: '1rem', borderRadius: '0', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontSize: '.95rem', opacity: sending ? .7 : 1, letterSpacing: '.06em' }}>
                    <i className="fa fa-paper-plane" style={{ marginRight: '.5rem' }} />
                    {sending ? 'Enviando...' : 'Enviar mensaje'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .contact-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  )
}
