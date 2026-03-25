'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [clima, setClima] = useState<{ temp: number; desc: string; icon: string } | null>(null)

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=21.1236&longitude=-101.6832&current_weather=true&hourly=weathercode&timezone=America%2FMexico_City')
      .then(r => r.json())
      .then(d => {
        const temp = Math.round(d.current_weather?.temperature ?? 0)
        const code = d.current_weather?.weathercode ?? 0
        const icons: Record<number, [string, string]> = {
          0: ['☀️', 'Despejado'], 1: ['🌤️', 'Mayormente despejado'],
          2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'],
          61: ['🌧️', 'Lluvia'], 63: ['🌧️', 'Lluvia moderada'],
          80: ['🌦️', 'Chubascos'], 95: ['⛈️', 'Tormenta'],
        }
        const [icon, desc] = icons[code] ?? ['🌡️', 'Variable']
        setClima({ temp, desc, icon })
      }).catch(() => {})
  }, [])

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 1000,
      background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 2rem', height: '120px',
    }}>
      {/* Brand */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '.8rem', textDecoration: 'none' }}>
        <Image src="/logo_transparent.png" alt="Vive Bien" width={100} height={100} style={{ objectFit: 'contain' }} priority />
        <div style={{ fontFamily: 'Montserrat, sans-serif', lineHeight: 1.15 }}>
          <div>
            <span style={{ color: '#8B1A1A', fontWeight: 800, fontSize: '1.8rem' }}>VIVE </span>
            <span style={{ color: '#8B1A1A', fontWeight: 800, fontSize: '1.8rem' }}>BIEN</span>
          </div>
          <span style={{ color: '#1B365D', fontWeight: 600, fontSize: '.85rem', display: 'block', letterSpacing: '.04em' }}>
            Grupo inmobiliario
          </span>
        </div>
      </Link>

      {/* Desktop nav */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '1.8rem' }} className="vb-nav-desktop">
        {/* Weather widget */}
        {clima && (
          <div style={{
            background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(0,0,0,.05)', borderRadius: '50px',
            padding: '0.35rem 0.9rem', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '1px', fontFamily: 'Montserrat, sans-serif',
            boxShadow: '0 2px 8px rgba(0,0,0,.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, fontSize: '0.8rem', color: '#1B365D' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '.05em' }}>LEÓN</span>
              <span>{clima.icon}</span>
              <span>{clima.temp}°C</span>
            </div>
            <span style={{ fontSize: '0.65rem', color: '#666' }}>{clima.desc}</span>
          </div>
        )}

        {[
          { href: '/', label: 'Inicio' },
          { href: '/propiedades', label: 'Propiedades' },
          { href: '/valuador', label: 'Valuador' },
          { href: '/#contacto', label: 'Contacto' },
        ].map(l => (
          <Link key={l.href} href={l.href}
            style={{ color: '#222831', fontWeight: 600, fontSize: '.9rem', textDecoration: 'none', transition: 'color .2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#8B1A1A')}
            onMouseLeave={e => (e.currentTarget.style.color = '#222831')}>
            {l.label}
          </Link>
        ))}

        <Link href="/dashboard"
          style={{ color: '#222831', fontWeight: 600, fontSize: '.9rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '.3rem', transition: 'color .2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#8B1A1A')}
          onMouseLeave={e => (e.currentTarget.style.color = '#222831')}>
          <i className="fa fa-lock" style={{ fontSize: '.8rem' }} /> Ingresar
        </Link>
      </nav>

      {/* Mobile toggle */}
      <button onClick={() => setMenuOpen(!menuOpen)} className="vb-nav-mobile-btn"
        style={{ display: 'none', fontSize: '1.5rem', color: '#1B365D', background: 'none', border: 'none', cursor: 'pointer' }}
        aria-label="Menú">
        <i className={menuOpen ? 'fas fa-times' : 'fas fa-bars'} />
      </button>

      {menuOpen && (
        <div style={{
          position: 'absolute', top: '120px', left: 0, right: 0, background: '#fff',
          padding: '1rem 2rem', boxShadow: '0 4px 12px rgba(0,0,0,.1)',
          display: 'flex', flexDirection: 'column', gap: '1rem', zIndex: 999,
        }}>
          <Link href="/" onClick={() => setMenuOpen(false)} style={{ fontWeight: 600, color: '#222831' }}>Inicio</Link>
          <Link href="/propiedades" onClick={() => setMenuOpen(false)} style={{ fontWeight: 600, color: '#222831' }}>Propiedades</Link>
          <Link href="/valuador" onClick={() => setMenuOpen(false)} style={{ fontWeight: 600, color: '#222831' }}>Valuador</Link>
          <Link href="/#contacto" onClick={() => setMenuOpen(false)} style={{ fontWeight: 600, color: '#222831' }}>Contacto</Link>
          <Link href="/dashboard" onClick={() => setMenuOpen(false)} style={{ fontWeight: 700, color: '#1B365D' }}>
            <i className="fa fa-lock" style={{ marginRight: '.4rem' }} />Ingresar
          </Link>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .vb-nav-desktop { display: none !important; }
          .vb-nav-mobile-btn { display: block !important; }
        }
      `}</style>
    </header>
  )
}
