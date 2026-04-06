'use client'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'

const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'

export default function ContactoPage() {
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', mensaje: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.telefono) { setError('Nombre y teléfono son requeridos.'); return }
    setSending(true); setError('')
    try {
      const { error: sbErr } = await supabase.from('contactos').insert({
        nombre: form.nombre.trim(), telefono: form.telefono.trim(),
        email: form.email.trim(), mensaje: form.mensaje.trim(),
      })
      if (sbErr) throw sbErr
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
      <section style={{ background: 'linear-gradient(135deg,#1B365D 0%,#0d1e2c 100%)', padding: '4rem 2rem', textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.8rem)', marginBottom: '.8rem' }}>
          Contáctanos
        </h1>
        <p style={{ opacity: .8, fontSize: '1.05rem', maxWidth: '520px', margin: '0 auto' }}>
          Estamos para ayudarte a encontrar la propiedad perfecta en León, Guanajuato.
        </p>
      </section>

      <main style={{ background: '#F4F6F8', padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'start' }} className="contact-grid">

          {/* Info */}
          <div>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: '#1B365D', fontSize: '1.5rem', marginBottom: '2rem' }}>
              Información de contacto
            </h2>
            {[
              { icon: 'fa-phone', color: '#1B365D', title: 'Teléfono', val: `+52 477 811 6501`, href: `tel:+${WA_NUMBER}` },
              { icon: 'fab fa-whatsapp', color: '#25D366', title: 'WhatsApp', val: `+52 477 811 6501`, href: `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola, quiero más información sobre una propiedad.')}` },
              { icon: 'fa-envelope', color: '#8B1A1A', title: 'Correo', val: 'contacto@vivebieninmobiliaria.com', href: 'mailto:contacto@vivebieninmobiliaria.com' },
              { icon: 'fa-map-marker-alt', color: '#D97706', title: 'Ubicación', val: 'León, Guanajuato, México', href: 'https://maps.google.com/?q=León,Guanajuato' },
              { icon: 'fa-clock', color: '#5B4FCF', title: 'Horario', val: 'Lun–Vie 9:00–18:00 | Sáb 9:00–14:00', href: null },
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
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem', background: '#25D366', color: '#fff', padding: '1rem 1.5rem', borderRadius: '12px', fontWeight: 800, fontFamily: 'Montserrat, sans-serif', textDecoration: 'none', fontSize: '1rem', marginTop: '1rem' }}>
              <i className="fab fa-whatsapp" style={{ fontSize: '1.3rem' }} /> Chatear por WhatsApp ahora
            </a>
          </div>

          {/* Form */}
          <div style={{ background: '#fff', borderRadius: '20px', padding: '2.5rem', boxShadow: '0 8px 30px rgba(0,0,0,.08)' }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <i className="fa fa-check-circle" style={{ fontSize: '3.5rem', color: '#279546', display: 'block', marginBottom: '1rem' }} />
                <h3 style={{ fontFamily: 'Montserrat, sans-serif', color: '#1B365D', fontSize: '1.3rem', marginBottom: '.5rem' }}>¡Mensaje enviado!</h3>
                <p style={{ color: '#666' }}>Un asesor te contactará pronto.<br />También puedes escribirnos por WhatsApp.</p>
                <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', background: '#25D366', color: '#fff', padding: '.75rem 1.5rem', borderRadius: '10px', fontWeight: 700, textDecoration: 'none', marginTop: '1.5rem' }}>
                  <i className="fab fa-whatsapp" /> WhatsApp
                </a>
              </div>
            ) : (
              <>
                <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: '#1B365D', fontSize: '1.3rem', marginBottom: '1.5rem' }}>
                  Envíanos un mensaje
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
                    <p style={{ color: '#991b1b', background: '#fef2f2', padding: '.6rem .8rem', borderRadius: '8px', fontSize: '.85rem', fontWeight: 600 }}>
                      <i className="fa fa-exclamation-circle" style={{ marginRight: '.4rem' }} />{error}
                    </p>
                  )}
                  <button type="submit" disabled={sending}
                    style={{ background: 'linear-gradient(135deg,#8B1A1A,#C0392B)', color: '#fff', padding: '1rem', borderRadius: '12px', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontSize: '1rem', opacity: sending ? .7 : 1 }}>
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
