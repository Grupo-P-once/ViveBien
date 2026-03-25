'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RegisterModal from '@/components/RegisterModal'
import { saveContacto } from '@/lib/firestore'

const WA_NUMBER = '524778116501'

/* ── Testimonios ─────────────────────────────────────────────────────────── */
const TESTIMONIOS = [
  { initials: 'RC', nombre: 'Ricardo Castillo', rol: 'Empresario Textil', color: 'linear-gradient(45deg,#8B1A1A,#C0392B)', texto: '"Excelente servicio para rentar mi nave industrial. El equipo fue muy profesional y directo. Encontramos el cliente ideal en menos de un mes."' },
  { initials: 'MG', nombre: 'Mariana G.', rol: 'Propietaria Residencial', color: 'linear-gradient(45deg,#1B365D,#2A3B5E)', texto: '"La transparencia fue clave. En todo momento estuvieron disponibles para mis dudas sobre mi primer terreno campestre."' },
  { initials: 'AL', nombre: 'Alberto Luna', rol: 'Gerente de Logística', color: 'linear-gradient(45deg,#FFD700,#DAA520)', texto: '"Recomiendo ampliamente a Vive Bien para cualquier operación industrial en el Bajío. Conocen la zona a la perfección."' },
  { initials: 'IM', nombre: 'Isabel Mora', rol: 'Consultora Independiente', color: 'linear-gradient(45deg,#2E7D32,#4CAF50)', texto: '"Atención de primer nivel, encontré mi departamento en una semana gracias a su catálogo actualizado."' },
  { initials: 'JP', nombre: 'Juan Pablo S.', rol: 'General Manager', color: 'linear-gradient(45deg,#1565C0,#1976D2)', texto: '"La mejor decisión para nuestra bodega logística. Eficiencia, rapidez y un trato humano excepcional."' },
  { initials: 'SM', nombre: 'Sofía Méndez', rol: 'Propietaria', color: 'linear-gradient(45deg,#6A1B9A,#8E24AA)', texto: '"Asesoría legal clara y honesta. Vendí mi propiedad en tiempo récord y con total seguridad jurídica."' },
]

/* ── Beneficios ──────────────────────────────────────────────────────────── */
const BENEFICIOS = [
  { icon: 'fa-shield-halved', color: '#8B1A1A', bg: 'rgba(139,26,26,.08)', title: 'Seguridad y Transparencia', desc: 'Procesos claros con revisión legal y contratos rigurosos para proteger tu patrimonio al máximo.' },
  { icon: 'fa-user-tie', color: '#1B365D', bg: 'rgba(27,54,93,.08)', title: 'Atención Personalizada', desc: 'Sin intermediarios innecesarios. Te acompañamos desde la primera búsqueda hasta la firma.' },
  { icon: 'fa-chart-line', color: '#279546', bg: 'rgba(39,149,70,.08)', title: 'Asegura tu Plusvalía', desc: 'Conocemos el mercado a la perfección y te orientamos sobre las zonas con mayor retorno de inversión.' },
]

export default function HomePage() {
  const router = useRouter()
  const [form, setForm] = useState({ op: '', tipo: '', zona: '' })
  const [regOpen, setRegOpen] = useState(false)
  const [testiIdx, setTestiIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* Show register modal once if user hasn't registered */
  useEffect(() => {
    const ya = localStorage.getItem('vb_registered')
    if (!ya) {
      const t = setTimeout(() => setRegOpen(true), 4000)
      return () => clearTimeout(t)
    }
  }, [])

  /* Testimonials auto-play */
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTestiIdx(i => (i + 1) % Math.ceil(TESTIMONIOS.length / 3))
    }, 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (form.op) params.set('op', form.op)
    if (form.tipo) params.set('tipo', form.tipo)
    if (form.zona) params.set('zona', form.zona)
    router.push(`/propiedades?${params.toString()}`)
  }

  function handleRegClose() {
    localStorage.setItem('vb_registered', '1')
    setRegOpen(false)
  }

  return (
    <>
      <Header />
      <RegisterModal isOpen={regOpen} onClose={handleRegClose} />

      {/* ===== HERO ===== */}
      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', overflow: 'hidden', background: '#0a0a0a',
      }}>
        <video autoPlay muted loop playsInline
          poster="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1600&auto=format&fit=crop"
          style={{
            position: 'absolute', top: '50%', left: '50%',
            minWidth: '100%', minHeight: '100%',
            transform: 'translate(-50%,-50%)', objectFit: 'cover', zIndex: 0, opacity: .6,
          }}>
          <source src="https://cdn.coverr.co/videos/coverr-an-aerial-view-of-a-neighborhood-4851/1080p.mp4" type="video/mp4" />
        </video>

        {/* Overlay */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(180deg,rgba(10,10,10,.3) 0%,transparent 30%,transparent 60%,rgba(10,10,10,.7) 100%),linear-gradient(135deg,rgba(139,26,26,.55) 0%,rgba(27,54,93,.5) 100%)',
        }} />

        {/* Top line decoration */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '4px', zIndex: 5,
          background: 'linear-gradient(90deg,#8B1A1A,#FF6B00,#8B1A1A)',
        }} />

        <div style={{ position: 'relative', zIndex: 2, color: '#fff', padding: '2rem 1.5rem', maxWidth: '900px', width: '100%' }}>
          {/* Badge */}
          <span style={{
            display: 'inline-block', background: 'rgba(255,255,255,.12)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,.2)', borderRadius: '50px',
            padding: '.4rem 1.2rem', fontFamily: 'var(--font-montserrat)',
            fontSize: '.8rem', fontWeight: 600, letterSpacing: '2px',
            textTransform: 'uppercase', marginBottom: '1.5rem',
          }}>
            <i className="fa fa-star" style={{ color: '#FF6B00', marginRight: '.4rem' }} />
            Tu aliado inmobiliario en León, Gto.
          </span>

          <h1 style={{
            fontFamily: 'var(--font-montserrat)', fontSize: 'clamp(2.2rem,5vw,4rem)',
            fontWeight: 900, lineHeight: 1.1, marginBottom: '1.2rem',
            textShadow: '0 4px 20px rgba(0,0,0,.5)',
          }}>
            Encuentra tu próximo{' '}
            <span style={{ color: '#FF6B00' }}>espacio ideal</span>
          </h1>

          <p style={{ fontSize: 'clamp(1rem,2.5vw,1.2rem)', marginBottom: '2rem', opacity: .88, maxWidth: '600px', margin: '0 auto 2rem', lineHeight: 1.7 }}>
            Naves industriales, casas residenciales, terrenos y locales comerciales con atención personalizada y transparencia total.
          </p>

          {/* Stats */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
            {[['100+', 'Propiedades'], ['15', 'Años exp.'], ['500+', 'Clientes']].map(([n, l]) => (
              <div key={l} style={{
                background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,.15)', borderRadius: '16px',
                padding: '1rem 1.5rem', minWidth: '140px',
              }}>
                <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{n}</div>
                <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '.3rem' }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Search form */}
          <form onSubmit={buscar} style={{
            display: 'flex', flexWrap: 'wrap', gap: '.8rem',
            background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,.3)', borderRadius: '16px',
            padding: '1.4rem 1.6rem', justifyContent: 'center',
          }}>
            <select value={form.op} onChange={e => setForm(f => ({ ...f, op: e.target.value }))}
              style={{ flex: '1 1 120px', padding: '.7rem .8rem', borderRadius: '8px', border: '1.5px solid rgba(255,255,255,.3)', fontSize: '.85rem', background: 'rgba(255,255,255,.95)', color: '#222831' }}>
              <option value="">Cualquier tipo</option>
              <option value="venta">Comprar</option>
              <option value="renta">Rentar</option>
            </select>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              style={{ flex: '1 1 120px', padding: '.7rem .8rem', borderRadius: '8px', border: '1.5px solid rgba(255,255,255,.3)', fontSize: '.85rem', background: 'rgba(255,255,255,.95)', color: '#222831' }}>
              <option value="">Cualquier tipo</option>
              <option value="casa">Casa</option>
              <option value="nave">Nave/Bodega</option>
              <option value="terreno">Terreno</option>
              <option value="comercial">Local</option>
            </select>
            <input type="text" placeholder="📍 Zona o colonia (ej. Campestre)" value={form.zona}
              onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
              style={{ flex: '1 1 180px', padding: '.7rem .8rem', borderRadius: '8px', border: '1.5px solid rgba(255,255,255,.3)', fontSize: '.85rem', background: 'rgba(255,255,255,.95)', color: '#222831' }} />
            <button type="submit" style={{
              background: '#C0392B', color: '#fff', fontFamily: 'var(--font-montserrat)',
              fontWeight: 700, border: 'none', borderRadius: '8px',
              padding: '.7rem 1.8rem', cursor: 'pointer', fontSize: '.95rem',
            }}>
              <i className="fa fa-search" style={{ marginRight: '.4rem' }} />Ver resultados
            </button>
          </form>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem',
          color: 'rgba(255,255,255,.5)', fontSize: '.7rem', fontFamily: 'var(--font-montserrat)',
          letterSpacing: '2px', textTransform: 'uppercase',
        }}>
          <div style={{
            width: '24px', height: '38px', border: '2px solid rgba(255,255,255,.4)',
            borderRadius: '12px', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: '6px', left: '50%', transform: 'translateX(-50%)',
              width: '4px', height: '8px', background: 'rgba(255,255,255,.6)', borderRadius: '2px',
            }} />
          </div>
          <span>Descubre más</span>
        </div>
      </section>

      {/* ===== SOBRE NOSOTROS ===== */}
      <section style={{ background: '#fff', padding: '6rem 2rem' }}>
        <div style={{
          maxWidth: '1100px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: '4rem', alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: '2.2rem', color: '#8B1A1A', marginBottom: '.5rem', lineHeight: 1.15 }}>
              ¿Qué es <span style={{ fontWeight: 700 }}>Vive Bien</span>?
            </h2>
            <p style={{ color: '#3D5A73', fontWeight: 600, fontSize: '1rem', marginBottom: '1.5rem', letterSpacing: '.5px' }}>
              Grupo Inmobiliario · León, Guanajuato
            </p>
            <p style={{ lineHeight: 1.75, marginBottom: '1rem', fontSize: '.95rem' }}>
              Somos un equipo apasionado por conectar a las personas con el espacio perfecto. Desde naves industriales hasta terrenos residenciales, en <strong>Vive Bien</strong> ofrecemos acompañamiento personalizado durante todo el proceso de renta o venta.
            </p>
            <p style={{ lineHeight: 1.75, fontSize: '.95rem' }}>
              Nos distingue la atención directa, la transparencia en cada operación y nuestro profundo conocimiento del mercado inmobiliario en la zona del Bajío.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: '280px', height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(139,26,26,.04)', borderRadius: '50%',
            }}>
              <i className="fas fa-building" style={{ fontSize: '8rem', color: '#8B1A1A', opacity: .15 }} />
            </div>
          </div>
        </div>
      </section>

      {/* ===== POR QUÉ ELEGIRNOS ===== */}
      <section style={{ background: '#F4F6F8', padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span style={{ color: '#1B365D', fontWeight: 800, fontSize: '.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
              ¿Por qué elegirnos?
            </span>
            <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', color: '#8B1A1A', marginTop: '.5rem' }}>
              Permítenos guiarte.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '2rem' }}>
            {BENEFICIOS.map(b => (
              <div key={b.title} style={{ background: '#fff', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,.06)', transition: 'transform .3s' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-6px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = '')}>
                <div style={{
                  width: '54px', height: '54px', background: b.bg, color: b.color,
                  borderRadius: '14px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '1.5rem', marginBottom: '1rem',
                }}>
                  <i className={`fa ${b.icon}`} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 700, marginBottom: '.5rem' }}>{b.title}</h3>
                <p style={{ color: '#666', lineHeight: 1.6, fontSize: '.9rem' }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MISIÓN Y VISIÓN ===== */}
      <section style={{ padding: '6rem 2rem', background: '#fff' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: '2rem', color: '#8B1A1A', textAlign: 'center', marginBottom: '3rem' }}>
            Nuestra <span style={{ fontWeight: 700 }}>Esencia</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '2rem' }}>
            <div style={{ background: 'rgba(139,26,26,.04)', borderLeft: '5px solid #8B1A1A', borderRadius: '20px', padding: '2.5rem', transition: 'all .35s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-12px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(139,26,26,.12)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
              <div style={{ width: '50px', height: '50px', background: '#8B1A1A', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.3rem', marginBottom: '1.2rem' }}>
                <i className="fa fa-bullseye" />
              </div>
              <h3 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: '1.3rem', color: '#8B1A1A', marginBottom: '.8rem' }}>Misión</h3>
              <p style={{ fontSize: '.92rem', lineHeight: 1.75, color: '#555' }}>
                Facilitar el acceso a espacios que mejoren la calidad de vida de nuestros clientes, ofreciendo inmuebles de calidad con un servicio honesto, ágil y cercano en la región del Bajío.
              </p>
            </div>
            <div style={{ background: 'rgba(27,54,93,.04)', borderLeft: '5px solid #1B365D', borderRadius: '20px', padding: '2.5rem', transition: 'all .35s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-12px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(27,54,93,.12)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
              <div style={{ width: '50px', height: '50px', background: '#1B365D', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.3rem', marginBottom: '1.2rem' }}>
                <i className="fa fa-eye" />
              </div>
              <h3 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: '1.3rem', color: '#1B365D', marginBottom: '.8rem' }}>Visión</h3>
              <p style={{ fontSize: '.92rem', lineHeight: 1.75, color: '#555' }}>
                Ser el grupo inmobiliario de referencia en León y el Bajío, reconocido por la confianza, la innovación y el compromiso con cada persona que busca su espacio ideal para vivir, trabajar o invertir.
              </p>
            </div>
            <div style={{ background: 'rgba(39,149,70,.04)', borderLeft: '5px solid #279546', borderRadius: '20px', padding: '2.5rem', transition: 'all .35s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-12px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(39,149,70,.12)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
              <div style={{ width: '50px', height: '50px', background: '#279546', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.3rem', marginBottom: '1.2rem' }}>
                <i className="fa fa-gem" />
              </div>
              <h3 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: '1.3rem', color: '#279546', marginBottom: '.8rem' }}>Valores</h3>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
                {['Honestidad ante todo', 'Empatía con cada cliente', 'Compromiso con los resultados', 'Profesionalismo continuo', 'Innovación con sentido humano'].map(v => (
                  <li key={v} style={{ display: 'flex', alignItems: 'center', gap: '.8rem', fontSize: '.9rem', color: '#555', fontWeight: 600 }}>
                    <span style={{ width: '30px', height: '30px', background: 'rgba(39,149,70,.1)', color: '#279546', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', flexShrink: 0 }}>
                      <i className="fa fa-check" />
                    </span>
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA PROPIEDADES ===== */}
      <section style={{ background: 'linear-gradient(135deg,#8B1A1A 0%,#1B365D 100%)', padding: '5rem 2rem', textAlign: 'center', color: '#fff' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: 'clamp(1.4rem,3vw,2rem)', marginBottom: '1rem' }}>
            Explora Nuestras Propiedades
          </h2>
          <p style={{ opacity: .9, marginBottom: '2rem', fontSize: '1.05rem' }}>
            Naves industriales, casas, terrenos y locales en León, Guanajuato
          </p>
          <Link href="/propiedades" style={{
            display: 'inline-block', background: '#fff', color: '#8B1A1A',
            padding: '1rem 2.5rem', borderRadius: '10px', fontWeight: 700,
            fontFamily: 'var(--font-montserrat)', fontSize: '1rem',
            transition: 'transform .2s',
          }}>
            Ver todas las propiedades <i className="fa fa-arrow-right" style={{ marginLeft: '.5rem' }} />
          </Link>
        </div>
      </section>

      {/* ===== TESTIMONIOS ===== */}
      <section style={{
        background: 'linear-gradient(135deg,#1a2634 0%,#000 100%)',
        padding: '6rem 2rem', position: 'relative', overflow: 'hidden',
      }}>
        {/* Decoración */}
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '300px', height: '300px', background: 'rgba(139,26,26,.1)', borderRadius: '50%', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '-100px', width: '300px', height: '300px', background: 'rgba(26,38,52,.2)', borderRadius: '50%', filter: 'blur(60px)' }} />

        <div style={{ textAlign: 'center', marginBottom: '4rem', position: 'relative', zIndex: 2 }}>
          <h2 style={{ color: '#fff', fontSize: 'clamp(1.8rem,3vw,2.6rem)', fontFamily: 'var(--font-montserrat)', fontWeight: 900 }}>
            <i className="fa fa-quote-left" style={{ color: '#8B1A1A', marginRight: '15px' }} />
            Nuestros <span style={{ fontWeight: 300 }}>Clientes</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,.7)', marginTop: '.5rem', fontSize: '1.1rem' }}>
            La confianza de nuestros clientes es nuestro mayor activo
          </p>
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 2 }}
          onMouseEnter={() => { if (timerRef.current) clearInterval(timerRef.current) }}
          onMouseLeave={() => {
            timerRef.current = setInterval(() => {
              setTestiIdx(i => (i + 1) % Math.ceil(TESTIMONIOS.length / 3))
            }, 5000)
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '2rem' }}>
            {TESTIMONIOS.map((t, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,.05)', backdropFilter: 'blur(10px)',
                padding: '2.5rem', borderRadius: '20px',
                border: '1px solid rgba(255,255,255,.1)',
                boxShadow: '0 10px 30px rgba(0,0,0,.3)', color: '#fff',
                transition: 'transform .3s ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-10px)'; e.currentTarget.style.borderColor = '#8B1A1A' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)' }}
              >
                <p style={{ fontStyle: 'italic', opacity: .9, lineHeight: 1.6, marginBottom: '2rem', fontSize: '1.05rem' }}>
                  {t.texto}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: '1.5rem' }}>
                  <div style={{
                    width: '55px', height: '55px', background: t.color, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0,
                  }}>
                    {t.initials}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontFamily: 'var(--font-montserrat)', color: '#fff' }}>{t.nombre}</h4>
                    <small style={{ color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>{t.rol}</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CONTACTO ===== */}
      <section id="contacto" style={{ background: '#F4F6F8', padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', color: '#8B1A1A' }}>
              <i className="fa fa-envelope" style={{ marginRight: '.5rem' }} />
              <span style={{ fontWeight: 300 }}>Contáctanos</span>
            </h2>
            <p style={{ color: '#1B365D', marginTop: '.4rem', fontSize: '1.05rem' }}>
              Déjanos tus datos y uno de nuestros asesores te contactará a la brevedad
            </p>
          </div>
          <div style={{
            background: '#fff', borderRadius: '20px',
            boxShadow: '0 6px 32px rgba(0,0,0,.08)', padding: '2.5rem 2rem',
          }}>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* ===== WhatsApp flotante ===== */}
      <a
        href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola, me interesa una propiedad')}`}
        target="_blank" rel="noopener noreferrer"
        style={{
          position: 'fixed', bottom: '25px', right: '25px',
          width: '60px', height: '60px', background: '#25D366', color: '#fff',
          borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '1.8rem', zIndex: 9999,
          boxShadow: '2px 2px 3px rgba(0,0,0,.4)', textDecoration: 'none',
          animation: 'pulseGreen 2s infinite',
        }}
        aria-label="WhatsApp"
      >
        <i className="fab fa-whatsapp" />
      </a>

      <style>{`
        @keyframes pulseGreen {
          0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(37,211,102,.7); }
          70%  { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(37,211,102,0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37,211,102,0); }
        }
      `}</style>

      <Footer />
    </>
  )
}

/* ── Contact Form ─────────────────────────────────────────────────────────── */
const INPUT: React.CSSProperties = {
  width: '100%', padding: '.75rem 1rem', border: '1.5px solid #DDE',
  borderRadius: '8px', fontFamily: 'inherit', fontSize: '.92rem',
  color: '#222831', background: '#fff', boxSizing: 'border-box',
  transition: 'border-color .2s',
}

function ContactForm() {
  const [data, setData] = useState({ nombre: '', telefono: '', email: '', interes: 'casa', mensaje: '' })
  const [acepto, setAcepto] = useState(false)
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'err'>('idle')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!acepto) { alert('Debes aceptar el aviso de privacidad'); return }
    setEstado('enviando')
    try {
      await saveContacto({
        nombre: data.nombre,
        telefono: data.telefono,
        email: data.email,
        interes: data.interes,
        mensaje: data.mensaje,
      })
      setEstado('ok')
    } catch {
      setEstado('err')
    }
  }

  if (estado === 'ok') return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <i className="fa fa-check-circle" style={{ color: '#25D366', fontSize: '3rem', display: 'block', marginBottom: '1rem' }} />
      <h3 style={{ fontFamily: 'var(--font-montserrat)', color: '#1B365D' }}>¡Mensaje enviado!</h3>
      <p style={{ color: '#555', marginTop: '.5rem' }}>Un asesor se pondrá en contacto contigo a la brevedad.</p>
    </div>
  )

  return (
    <form onSubmit={enviar} noValidate>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Nombre completo *</label>
          <input required value={data.nombre} onChange={e => setData(d => ({ ...d, nombre: e.target.value }))} placeholder="Juan Pérez" style={INPUT} />
        </div>
        <div>
          <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Teléfono *</label>
          <input required value={data.telefono} onChange={e => setData(d => ({ ...d, telefono: e.target.value }))} placeholder="477 123 4567" style={INPUT} />
        </div>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Correo electrónico *</label>
        <input required type="email" value={data.email} onChange={e => setData(d => ({ ...d, email: e.target.value }))} placeholder="juan@ejemplo.com" style={INPUT} />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Me interesa</label>
        <select value={data.interes} onChange={e => setData(d => ({ ...d, interes: e.target.value }))} style={INPUT}>
          <option value="casa">Casa</option>
          <option value="departamento">Departamento</option>
          <option value="terreno">Terreno</option>
          <option value="comercial">Local comercial</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Mensaje</label>
        <textarea rows={4} value={data.mensaje} onChange={e => setData(d => ({ ...d, mensaje: e.target.value }))}
          placeholder="Cuéntanos qué necesitas o alguna duda que tengas..."
          style={{ ...INPUT, resize: 'vertical', minHeight: '110px' } as React.CSSProperties} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '1rem' }}>
        <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)}
          style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer', flexShrink: 0 }} />
        <label style={{ fontSize: '.85rem', color: '#666', lineHeight: 1.4, cursor: 'pointer' }}>
          He leído y acepto el <strong style={{ color: '#8B1A1A' }}>Aviso de Privacidad</strong>
        </label>
      </div>
      <button type="submit" disabled={estado === 'enviando'} style={{
        width: '100%', marginTop: '.5rem', padding: '.9rem',
        background: 'linear-gradient(135deg,#8B1A1A,#C0392B)',
        color: '#fff', fontFamily: 'var(--font-montserrat)', fontWeight: 700,
        fontSize: '1rem', border: 'none', borderRadius: '10px', cursor: 'pointer',
        opacity: estado === 'enviando' ? .7 : 1,
      }}>
        <i className="fa fa-paper-plane" style={{ marginRight: '.5rem' }} />
        {estado === 'enviando' ? 'Enviando...' : 'Enviar mensaje'}
      </button>
      {estado === 'err' && (
        <p style={{ color: '#8B1A1A', textAlign: 'center', marginTop: '1rem', fontSize: '.9rem' }}>
          Hubo un error. Inténtalo de nuevo.
        </p>
      )}
    </form>
  )
}
