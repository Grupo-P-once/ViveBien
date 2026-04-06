'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/lib/useAuth'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [clima, setClima] = useState<{ temp: number; desc: string; icon: string } | null>(null)
  const [userMenu, setUserMenu] = useState(false)
  const { user } = useAuth()

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

  async function cerrarSesion() {
    await signOut(auth)
    setUserMenu(false)
    setMenuOpen(false)
  }

  const userInitial = user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'
  const userName = user?.displayName || user?.email?.split('@')[0] || 'Usuario'

  const NAV_LINKS = [
    { href: '/', label: 'Inicio' },
    { href: '/propiedades', label: 'Propiedades' },
    { href: '/nosotros', label: 'Nosotros' },
    { href: '/valuador', label: 'Valuador' },
    { href: '/contacto', label: 'Contacto' },
  ]

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 1000,
      background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 2rem', height: '120px',
    }}>
      {/* Brand */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        <Image src="/logo_transparent.png" alt="Vive Bien" width={130} height={100} style={{ objectFit: 'contain' }} priority />
      </Link>

      {/* Desktop nav */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '1.8rem' }} className="vb-nav-desktop">
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

        {NAV_LINKS.map(l => (
          <Link key={l.href} href={l.href}
            style={{ color: '#222831', fontWeight: 600, fontSize: '.9rem', textDecoration: 'none', transition: 'color .2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#8B1A1A')}
            onMouseLeave={e => (e.currentTarget.style.color = '#222831')}>
            {l.label}
          </Link>
        ))}

        {/* Auth area */}
        {user ? (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setUserMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '.5rem',
                background: 'linear-gradient(135deg,#1B365D,#2a4f84)',
                color: '#fff', border: 'none', borderRadius: '30px',
                padding: '.4rem .9rem .4rem .4rem', cursor: 'pointer',
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '.85rem',
              }}
            >
              <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#8B1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
                {user.photoURL
                  ? <img src={user.photoURL} alt="" style={{ width: '28px', height: '28px', objectFit: 'cover' }} />
                  : userInitial}
              </span>
              <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userName}
              </span>
              <i className={`fa fa-chevron-${userMenu ? 'up' : 'down'}`} style={{ fontSize: '.7rem' }} />
            </button>

            {userMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setUserMenu(false)} />
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  background: '#fff', borderRadius: '12px', minWidth: '200px',
                  boxShadow: '0 8px 30px rgba(0,0,0,.15)', padding: '.5rem',
                  zIndex: 1001,
                }}>
                  <div style={{ padding: '.7rem 1rem .6rem', borderBottom: '1px solid #eee', marginBottom: '.3rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#1B365D' }}>{userName}</div>
                    <div style={{ fontSize: '.75rem', color: '#888', marginTop: '.1rem' }}>{user.email}</div>
                  </div>
                  <Link href="/dashboard" onClick={() => setUserMenu(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem 1rem', borderRadius: '8px', color: '#1B365D', fontWeight: 600, fontSize: '.88rem', textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F4F6F8')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <i className="fa fa-tachometer-alt" style={{ width: '16px', color: '#8B1A1A' }} /> Mi cuenta
                  </Link>
                  <button onClick={cerrarSesion}
                    style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem 1rem', borderRadius: '8px', color: '#666', fontWeight: 600, fontSize: '.88rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = '#991b1b' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#666' }}>
                    <i className="fa fa-sign-out-alt" style={{ width: '16px' }} /> Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <Link href="/dashboard"
            style={{
              display: 'flex', alignItems: 'center', gap: '.4rem',
              background: 'linear-gradient(135deg,#8B1A1A,#C0392B)',
              color: '#fff', fontWeight: 700, fontSize: '.88rem',
              textDecoration: 'none', padding: '.5rem 1.2rem', borderRadius: '30px',
              fontFamily: 'Montserrat, sans-serif',
            }}>
            <i className="fa fa-lock" style={{ fontSize: '.8rem' }} /> Ingresar
          </Link>
        )}
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
          padding: '1rem 2rem 1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,.1)',
          display: 'flex', flexDirection: 'column', gap: '1rem', zIndex: 999,
        }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', padding: '.7rem 1rem', background: '#F4F6F8', borderRadius: '10px', marginBottom: '.2rem' }}>
              <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#1B365D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.9rem', flexShrink: 0, overflow: 'hidden' }}>
                {user.photoURL ? <img src={user.photoURL} alt="" style={{ width: '34px', height: '34px', objectFit: 'cover' }} /> : userInitial}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#1B365D' }}>{userName}</div>
                <div style={{ fontSize: '.73rem', color: '#888' }}>{user.email}</div>
              </div>
            </div>
          )}
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
              style={{ fontWeight: 600, color: '#222831', textDecoration: 'none' }}>
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} style={{ fontWeight: 700, color: '#1B365D', textDecoration: 'none' }}>
                <i className="fa fa-tachometer-alt" style={{ marginRight: '.4rem' }} />Mi cuenta
              </Link>
              <button onClick={cerrarSesion} style={{ background: 'none', border: 'none', fontWeight: 700, color: '#991b1b', cursor: 'pointer', textAlign: 'left', padding: 0, fontSize: '1rem', fontFamily: 'inherit' }}>
                <i className="fa fa-sign-out-alt" style={{ marginRight: '.4rem' }} />Cerrar sesión
              </button>
            </>
          ) : (
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} style={{ fontWeight: 700, color: '#1B365D', textDecoration: 'none' }}>
              <i className="fa fa-lock" style={{ marginRight: '.4rem' }} />Ingresar / Registrarse
            </Link>
          )}
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
