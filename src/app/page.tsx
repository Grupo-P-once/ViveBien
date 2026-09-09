'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useScroll, useTransform } from 'framer-motion'
import CountUp from 'react-countup'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RegisterModal from '@/components/RegisterModal'
import { supabase } from '@/lib/supabase'
import { FadeUp, FadeLeft, FadeRight, ScalePop, HoverCard } from '@/components/Animate'
import ShinyText from '@/components/ShinyText'
import GradientText from '@/components/GradientText'
import FadeContent from '@/components/FadeContent'
import AnimatedContent from '@/components/AnimatedContent'
import GlareHover from '@/components/GlareHover'
import ScrollReveal from '@/components/ScrollReveal'

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

/* ── Typewriter cycling component ────────────────────────────────────────── */
function TypewriterCycle({ words }: { words: string[] }) {
  const [idx, setIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const current = words[idx]
    if (paused) {
      const t = setTimeout(() => { setPaused(false); setDeleting(true) }, 2200)
      return () => clearTimeout(t)
    }
    if (!deleting) {
      if (displayed.length < current.length) {
        const t = setTimeout(() => setDisplayed(current.slice(0, displayed.length + 1)), 55)
        return () => clearTimeout(t)
      } else { setPaused(true) }
    } else {
      if (displayed.length > 0) {
        const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30)
        return () => clearTimeout(t)
      } else { setDeleting(false); setIdx(i => (i + 1) % words.length) }
    }
  }, [displayed, deleting, paused, idx, words])
  return (
    <span>
      {displayed}
      <span style={{ display: 'inline-block', width: '2px', height: '1em', background: '#C9A96E', marginLeft: '2px', verticalAlign: 'middle', animation: 'cursorBlink .8s steps(1) infinite' }} />
    </span>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [form, setForm] = useState({ op: 'venta', tipo: '', zona: '' })
  const [regOpen, setRegOpen] = useState(false)
  const [testiIdx, setTestiIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', '28%'])

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

      {/* ===== HERO — CINEMATIC REDESIGN ===== */}
      <section ref={heroRef} style={{
        position: 'relative', minHeight: '100vh',
        overflow: 'hidden', background: '#08101e',
        display: 'flex', alignItems: 'center',
      }}>
        {/* Parallax background image */}
        <motion.div style={{ position: 'absolute', inset: 0, y: imageY }}>
          <motion.img
            initial={{ scale: 1.1 }} animate={{ scale: 1 }}
            transition={{ duration: 10, ease: 'easeOut' }}
            src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&auto=format&fit=crop&q=80"
            alt="Propiedad de lujo León Guanajuato"
            style={{ width: '100%', height: '115%', objectFit: 'cover', objectPosition: 'center 30%' }}
          />
        </motion.div>

        {/* Gradient overlays */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,16,30,.25) 0%, rgba(8,16,30,.55) 50%, rgba(8,16,30,.88) 100%)', zIndex: 1 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(139,26,26,.4) 0%, transparent 55%)', zIndex: 1 }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.025) 1px, transparent 1px)', backgroundSize: '28px 28px', zIndex: 1, pointerEvents: 'none' }} />

        {/* Top animated accent line */}
        <motion.div
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #8B1A1A 0%, #C9A96E 50%, #1B365D 100%)', transformOrigin: 'left', zIndex: 10 }}
        />

        {/* Main content grid */}
        <div style={{
          position: 'relative', zIndex: 5, width: '100%',
          maxWidth: '1240px', margin: '0 auto',
          padding: 'clamp(7rem,12vh,9rem) 2.5rem clamp(5rem,8vh,7rem)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,400px)',
          gap: '3.5rem', alignItems: 'center',
        }} className="hero-grid">

          {/* ── LEFT CONTENT ── */}
          <div>
            {/* Location label */}
            <motion.div
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '2.2rem' }}
            >
              <div style={{ width: '28px', height: '1.5px', background: '#C9A96E', flexShrink: 0 }} />
              <span style={{ color: 'rgba(255,255,255,.6)', fontSize: '.68rem', letterSpacing: '4.5px', textTransform: 'uppercase', fontFamily: 'var(--font-montserrat)', fontWeight: 600 }}>
                León · Guanajuato · México
              </span>
              <div style={{ width: '28px', height: '1.5px', background: '#C9A96E', flexShrink: 0 }} />
            </motion.div>

            {/* GIANT SERIF H1 */}
            <h1 style={{ margin: '0 0 1.8rem', lineHeight: 1.0 }}>
              <motion.span
                initial={{ opacity: 0, y: 55 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: 'block', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 'clamp(3.2rem,6.5vw,7rem)', fontWeight: 400, color: '#fff', letterSpacing: '-1.5px' }}
              >
                Encuentra tu
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 55 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.33, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: 'block', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 'clamp(3.2rem,6.5vw,7rem)', fontWeight: 700, fontStyle: 'italic', color: '#C9A96E', letterSpacing: '-1.5px' }}
              >
                espacio
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 55 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.46, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: 'block', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 'clamp(3.2rem,6.5vw,7rem)', fontWeight: 900, WebkitTextStroke: '2px rgba(255,255,255,.75)', color: 'transparent', letterSpacing: '-1.5px' }}
              >
                ideal
              </motion.span>
            </h1>

            {/* Typewriter sub-line */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.85 }}
              style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '2.8rem', color: 'rgba(255,255,255,.5)', fontFamily: 'var(--font-montserrat)', fontSize: 'clamp(.85rem,1.6vw,1rem)', fontWeight: 500, letterSpacing: '.5px', minHeight: '1.8rem' }}
            >
              <i className="fa fa-location-dot" style={{ color: '#C9A96E', fontSize: '.8rem', flexShrink: 0 }} />
              <TypewriterCycle words={['Naves Industriales en León', 'Casas Residenciales', 'Terrenos en Venta', 'Locales Comerciales']} />
            </motion.div>

            {/* Tab switcher + search */}
            <motion.div
              initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Tabs */}
              <div style={{ display: 'inline-flex', borderRadius: '10px 10px 0 0', overflow: 'hidden', border: '1px solid rgba(255,255,255,.1)', borderBottom: 'none' }}>
                {[{ label: 'Comprar', val: 'venta' }, { label: 'Rentar', val: 'renta' }].map(tab => (
                  <button key={tab.val} type="button"
                    onClick={() => setForm(f => ({ ...f, op: tab.val }))}
                    style={{
                      padding: '.55rem 1.5rem', border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-montserrat)', fontWeight: 700,
                      fontSize: '.75rem', letterSpacing: '2px', textTransform: 'uppercase',
                      transition: 'all .2s',
                      background: form.op === tab.val ? 'rgba(201,169,110,.22)' : 'rgba(255,255,255,.06)',
                      color: form.op === tab.val ? '#C9A96E' : 'rgba(255,255,255,.45)',
                    }}
                  >{tab.label}</button>
                ))}
              </div>
              {/* Form */}
              <form onSubmit={buscar} style={{
                background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,.12)', borderRadius: '0 10px 10px 10px',
                padding: '1.1rem', display: 'flex', flexWrap: 'wrap', gap: '.6rem',
              }}>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  style={{ flex: '1 1 160px', padding: '.72rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.08)', color: '#fff', fontFamily: 'var(--font-montserrat)', fontWeight: 600, fontSize: '.84rem' }}>
                  <option value="" style={{ background: '#0d1a2e' }}>Tipo de propiedad</option>
                  <option value="casa" style={{ background: '#0d1a2e' }}>Casa Residencial</option>
                  <option value="nave" style={{ background: '#0d1a2e' }}>Nave / Bodega</option>
                  <option value="terreno" style={{ background: '#0d1a2e' }}>Terreno</option>
                  <option value="comercial" style={{ background: '#0d1a2e' }}>Local Comercial</option>
                </select>
                <input type="text" placeholder="Zona o colonia..." value={form.zona}
                  onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
                  style={{ flex: '1 1 170px', padding: '.72rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '.84rem' }} />
                <button type="submit" style={{
                  background: 'linear-gradient(135deg, #C9A96E 0%, #a07830 100%)',
                  color: '#0a0e1a', border: 'none', borderRadius: '8px',
                  padding: '.72rem 1.6rem', cursor: 'pointer',
                  fontFamily: 'var(--font-montserrat)', fontWeight: 800,
                  fontSize: '.78rem', letterSpacing: '2px', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', gap: '.45rem', whiteSpace: 'nowrap',
                  transition: 'opacity .2s',
                }}>
                  <i className="fa fa-search" style={{ fontSize: '.75rem' }} />Buscar
                </button>
              </form>
            </motion.div>

            {/* Secondary CTAs */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 1.35 }}
              style={{ marginTop: '1.6rem', display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}
            >
              <Link href="/propiedades" style={{ color: '#C9A96E', fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: '.78rem', letterSpacing: '1.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                Ver catálogo completo <i className="fa fa-arrow-right" style={{ fontSize: '.72rem' }} />
              </Link>
              <span style={{ color: 'rgba(255,255,255,.15)', fontSize: '1.2rem' }}>|</span>
              <Link href="#contacto" style={{ color: 'rgba(255,255,255,.38)', fontFamily: 'var(--font-montserrat)', fontWeight: 600, fontSize: '.78rem', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Asesoría gratis
              </Link>
            </motion.div>
          </div>

          {/* ── RIGHT PANEL: Stats cards ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }} className="hero-stats">
            {[
              { n: 100, suffix: '+', label: 'Propiedades', icon: 'fa-building', desc: 'en catálogo activo' },
              { n: 15, suffix: '', label: 'Años de experiencia', icon: 'fa-award', desc: 'en el mercado del Bajío' },
              { n: 500, suffix: '+', label: 'Clientes', icon: 'fa-handshake', desc: 'operaciones cerradas' },
            ].map((s, i) => (
              <motion.div key={s.label}
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 + i * 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  background: 'rgba(255,255,255,.055)', backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,.09)', borderRadius: '16px',
                  padding: '1.1rem 1.4rem', display: 'flex', alignItems: 'center', gap: '1.1rem',
                  transition: 'border-color .3s, background .3s',
                }}
                whileHover={{ borderColor: 'rgba(201,169,110,.35)', background: 'rgba(201,169,110,.07)' } as any}
              >
                <div style={{
                  width: '46px', height: '46px', flexShrink: 0, borderRadius: '12px',
                  background: 'linear-gradient(135deg,rgba(201,169,110,.18),rgba(201,169,110,.04))',
                  border: '1px solid rgba(201,169,110,.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#C9A96E', fontSize: '1.05rem',
                }}>
                  <i className={`fa ${s.icon}`} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '1.75rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                    <CountUp end={s.n} duration={2.5} suffix={s.suffix} enableScrollSpy scrollSpyOnce />
                  </div>
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#C9A96E', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: '.15rem' }}>{s.label}</div>
                  <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.35)', marginTop: '.1rem' }}>{s.desc}</div>
                </div>
              </motion.div>
            ))}

            {/* WhatsApp card */}
            <motion.a
              href={`https://wa.me/524778116501?text=${encodeURIComponent('Hola, me interesa una propiedad en León')}`}
              target="_blank" rel="noopener noreferrer"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.4, duration: 0.7 }}
              whileHover={{ scale: 1.02 } as any}
              style={{
                background: 'linear-gradient(135deg, rgba(37,211,102,.15), rgba(18,140,126,.1))',
                border: '1px solid rgba(37,211,102,.25)', borderRadius: '16px',
                padding: '1rem 1.4rem', display: 'flex', alignItems: 'center', gap: '1rem',
                textDecoration: 'none', color: '#fff', transition: 'border-color .3s',
              }}
            >
              <i className="fab fa-whatsapp" style={{ fontSize: '1.75rem', color: '#25D366', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: '.88rem' }}>¿Dudas? Escríbenos</div>
                <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.5)', marginTop: '.1rem' }}>Respuesta inmediata · WhatsApp</div>
              </div>
              <i className="fa fa-chevron-right" style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.3)' }} />
            </motion.a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.4rem',
          color: 'rgba(255,255,255,.25)', fontSize: '.62rem', fontFamily: 'var(--font-montserrat)',
          letterSpacing: '3px', textTransform: 'uppercase',
        }}>
          <motion.div
            animate={{ y: [0, 7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: '18px', height: '30px', border: '1.5px solid rgba(255,255,255,.2)', borderRadius: '9px', position: 'relative' }}
          >
            <div style={{ position: 'absolute', top: '5px', left: '50%', transform: 'translateX(-50%)', width: '2.5px', height: '6px', background: '#C9A96E', borderRadius: '2px' }} />
          </motion.div>
          <span>Scroll</span>
        </div>
      </section>

      {/* ===== MARQUEE STRIP ===== */}
      <div style={{
        background: '#0a0a0a', overflow: 'hidden',
        padding: '.9rem 0', borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        <div style={{
          display: 'flex', width: 'max-content',
          animation: 'marquee 28s linear infinite',
        }}
          onMouseEnter={e => (e.currentTarget.style.animationPlayState = 'paused')}
          onMouseLeave={e => (e.currentTarget.style.animationPlayState = 'running')}
        >
          {[...Array(2)].map((_, rep) => (
            <div key={rep} style={{ display: 'flex', alignItems: 'center', gap: '0', whiteSpace: 'nowrap' }}>
              {[
                { text: 'Naves Industriales', icon: 'fa-industry' },
                { text: 'León, Guanajuato', icon: 'fa-map-marker-alt' },
                { text: 'Casas Residenciales', icon: 'fa-home' },
                { text: '15+ Años de Experiencia', icon: 'fa-star' },
                { text: 'Terrenos en Venta', icon: 'fa-map' },
                { text: 'Atención Personalizada', icon: 'fa-user-tie' },
                { text: 'Locales Comerciales', icon: 'fa-store' },
                { text: '+500 Clientes Satisfechos', icon: 'fa-thumbs-up' },
              ].map((item) => (
                <span key={item.text} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '.6rem',
                  padding: '0 2.2rem', color: 'rgba(255,255,255,.75)',
                  fontFamily: 'var(--font-montserrat)', fontWeight: 700,
                  fontSize: '.78rem', letterSpacing: '1.5px', textTransform: 'uppercase',
                }}>
                  <i className={`fa ${item.icon}`} style={{ color: '#C0392B', fontSize: '.8rem' }} />
                  {item.text}
                  <span style={{ color: 'rgba(255,255,255,.2)', marginLeft: '.4rem' }}>·</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ===== SOBRE NOSOTROS ===== */}
      <section style={{ background: '#fff', padding: '6rem 2rem' }}>
        <div style={{
          maxWidth: '1100px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: '4rem', alignItems: 'center',
        }}>
          <FadeLeft>
            <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: '2.2rem', marginBottom: '.5rem', lineHeight: 1.15 }}>
              <GradientText colors={['#8B1A1A', '#C0392B', '#8B1A1A']} animationSpeed={5}>
                ¿Qué es Vive Bien?
              </GradientText>
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
          </FadeLeft>
          <FadeRight delay={0.15}>
            <div style={{ position: 'relative' }}>
              <motion.img
                src="/hero-industrial.jpg"
                onError={e => { (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1622547748225-3fc4abd2cca0?w=800&auto=format&fit=crop' }}
                alt="Nave Industrial Vive Bien"
                whileHover={{ scale: 1.03 }}
                transition={{ duration: 0.4 }}
                style={{
                  width: '100%', maxWidth: '480px', height: '340px',
                  objectFit: 'cover', borderRadius: '20px',
                  boxShadow: '0 24px 60px rgba(27,54,93,.18)',
                  display: 'block', cursor: 'pointer',
                }}
              />
            </div>
          </FadeRight>
        </div>
      </section>

      {/* ===== POR QUÉ ELEGIRNOS ===== */}
      <section style={{ background: '#EDEAE5', padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span style={{
              display: 'inline-block', color: '#8B1A1A', fontWeight: 800,
              fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '3.5px',
              fontFamily: 'var(--font-montserrat)',
              borderBottom: '2px solid #8B1A1A', paddingBottom: '.3rem',
              marginBottom: '.9rem',
            }}>
              ¿Por qué elegirnos?
            </span>
            <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', color: '#1B365D', marginTop: '.5rem' }}>
              Permítenos guiarte.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '2rem' }}>
            {BENEFICIOS.map((b, i) => (
              <AnimatedContent key={b.title} delay={i * 0.12} distance={40}>
                <GlareHover
                  background="#fff"
                  borderRadius="16px"
                  glareColor="#ffffff"
                  glareOpacity={0.22}
                  glareSize={300}
                  glareAngle={-40}
                  style={{ boxShadow: '0 4px 20px rgba(0,0,0,.06)', padding: '2rem', height: '100%' }}
                >
                  <div style={{
                    width: '54px', height: '54px', background: b.bg, color: b.color,
                    borderRadius: '14px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '1.5rem', marginBottom: '1rem',
                  }}>
                    <i className={`fa ${b.icon}`} />
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 700, marginBottom: '.5rem' }}>{b.title}</h3>
                  <p style={{ color: '#666', lineHeight: 1.6, fontSize: '.9rem' }}>{b.desc}</p>
                </GlareHover>
              </AnimatedContent>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MISIÓN Y VISIÓN ===== */}
      <section style={{ padding: '6rem 2rem', background: '#fff' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span style={{
              display: 'inline-block', color: '#8B1A1A', fontWeight: 800,
              fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '3.5px',
              fontFamily: 'var(--font-montserrat)',
              borderBottom: '2px solid #8B1A1A', paddingBottom: '.3rem',
              marginBottom: '.9rem',
            }}>Identidad corporativa</span>
            <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', color: '#1B365D' }}>
              Nuestra <span style={{ fontWeight: 700, color: '#8B1A1A' }}>Esencia</span>
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '2rem' }}>
            <AnimatedContent direction="vertical" distance={50} delay={0}>
              <div style={{ background: 'rgba(139,26,26,.04)', borderLeft: '5px solid #8B1A1A', borderRadius: '20px', padding: '2.5rem', transition: 'all .35s', height: '100%' }}
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
            </AnimatedContent>
            <AnimatedContent direction="vertical" distance={50} delay={0.1}>
              <div style={{ background: 'rgba(27,54,93,.04)', borderLeft: '5px solid #1B365D', borderRadius: '20px', padding: '2.5rem', transition: 'all .35s', height: '100%' }}
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
            </AnimatedContent>
            <AnimatedContent direction="vertical" distance={50} delay={0.2}>
              <div style={{ background: 'rgba(39,149,70,.04)', borderLeft: '5px solid #279546', borderRadius: '20px', padding: '2.5rem', transition: 'all .35s', height: '100%' }}
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
            </AnimatedContent>
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
          <span style={{
            display: 'inline-block', color: 'rgba(192,57,43,.9)', fontWeight: 800,
            fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '3.5px',
            fontFamily: 'var(--font-montserrat)',
            borderBottom: '2px solid rgba(192,57,43,.6)', paddingBottom: '.3rem',
            marginBottom: '.9rem',
          }}>Lo que dicen de nosotros</span>
          <h2 style={{ color: '#fff', fontSize: 'clamp(1.8rem,3vw,2.6rem)', fontFamily: 'var(--font-montserrat)', fontWeight: 900 }}>
            Nuestros <span style={{ fontWeight: 300 }}>Clientes</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,.7)', marginTop: '.5rem', fontSize: '1.05rem' }}>
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
              <FadeContent key={i} blur delay={i * 120} duration={700} threshold={0.1}>
                <GlareHover
                  background="rgba(255,255,255,.05)"
                  borderRadius="20px"
                  borderColor="rgba(255,255,255,.1)"
                  glareColor="#ffffff"
                  glareOpacity={0.1}
                  glareSize={280}
                  style={{ boxShadow: '0 10px 30px rgba(0,0,0,.3)', color: '#fff', padding: '2.5rem', transition: 'border-color .3s' }}
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
                </GlareHover>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CONTACTO ===== */}
      <section id="contacto" style={{ background: '#EDEAE5', padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <span style={{
              display: 'inline-block', color: '#8B1A1A', fontWeight: 800,
              fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '3.5px',
              fontFamily: 'var(--font-montserrat)',
              borderBottom: '2px solid #8B1A1A', paddingBottom: '.3rem',
              marginBottom: '.9rem',
            }}>Estamos para ayudarte</span>
            <h2 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', color: '#1B365D' }}>
              <span style={{ fontWeight: 300 }}>Contáctanos</span>
            </h2>
            <p style={{ color: '#555', marginTop: '.4rem', fontSize: '1rem' }}>
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
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        input::placeholder { color: rgba(255,255,255,.35) !important; }
        select option { background: #0d1a2e; color: #fff; }
        @media (max-width: 860px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-stats { display: none !important; }
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
      const { error } = await supabase.from('contactos').insert({
        nombre: data.nombre,
        telefono: data.telefono,
        email: data.email,
        interes: data.interes,
        mensaje: data.mensaje,
      })
      if (error) throw error
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
