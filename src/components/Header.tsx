'use client'
import NextImage from 'next/image'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/lib/useAuth'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const { user } = useAuth()
  const ruta = usePathname() ?? '/'

  /* Con el menu abierto: Escape cierra, y la pagina de detras no se mueve.
     Sin el bloqueo, arrastrar sobre el fondo oscuro desplazaba el catalogo y
     al cerrar aparecias en otro sitio sin haber tocado nada. */
  useEffect(() => {
    if (!menuOpen) return
    const alEscapar = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', alEscapar)
    return () => {
      document.body.style.overflow = previo
      window.removeEventListener('keydown', alEscapar)
    }
  }, [menuOpen])

  // Al cambiar de pagina el menu se cierra solo: si el enlace lleva a la ruta
  // en la que ya estas, el onClick no basta para que desaparezca. Se ajusta durante el render (sin efecto): no hay un pintado intermedio con el menú abierto.
  const [rutaVista, setRutaVista] = useState(ruta)
  if (rutaVista !== ruta) { setRutaVista(ruta); setMenuOpen(false) }

  async function cerrarSesion() {
    await signOut(auth)
    setUserMenu(false)
    setMenuOpen(false)
  }

  const userInitial = user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'
  const userName = user?.displayName || user?.email?.split('@')[0] || 'Usuario'

  const NAV_LINKS = [
    { href: '/', label: 'Inicio', icono: 'fa-home' },
    { href: '/propiedades', label: 'Propiedades', icono: 'fa-building' },
    { href: '/nosotros', label: 'Nosotros', icono: 'fa-users' },
    { href: '/valuador', label: 'Valuador', icono: 'fa-calculator' },
    // Blog (21-oct-2026): apartado propio, pensado para el SEO. Una sola lista sirve a escritorio y móvil.
    { href: '/blog', label: 'Blog', icono: 'fa-newspaper' },
    { href: '/contacto', label: 'Contacto', icono: 'fa-comment-dots' },
    // 3c-3 · El Centro de Ayuda va en la navegación principal, como en el
    // montaje. `NAV_LINKS` la usan escritorio y móvil, así que con una
    // entrada basta: no hay dos listas que puedan divergir.
    { href: '/ayuda', label: 'Ayuda', icono: 'fa-circle-question' },
  ]

  return (
    <header className="vb-header" style={{
      position: 'sticky', top: 0, zIndex: 1000,
      background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {/* Brand. La altura sale de la clase, no de aquí: en línea le ganaría a
          la media query y la cabecera seguiría midiendo 120px en un teléfono
          — un 15% de la pantalla ocupado por algo pegajoso. Ver E-15. */}
      <Link href="/" aria-label="Vive Bien, ir al inicio" className="vb-logo" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        <Image src="/logo_transparent.png" alt="Vive Bien" width={130} height={100} priority />
      </Link>

      {/* Desktop nav */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '1.8rem' }} className="vb-nav-desktop">
        {NAV_LINKS.map(l => (
          <Link key={l.href} href={l.href}
            style={{ color: 'var(--texto)', fontWeight: 600, fontSize: '.9rem', textDecoration: 'none', transition: 'color .2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--rojo)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--texto)')}>
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
                background: 'linear-gradient(135deg,var(--azul),#2a4f84)',
                color: '#fff', border: 'none', borderRadius: '30px',
                padding: '.4rem .9rem .4rem .4rem', cursor: 'pointer',
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '.85rem',
              }}
            >
              <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--rojo)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
                {user.photoURL
                  ? <NextImage unoptimized src={user.photoURL} alt="" width={28} height={28} style={{ width: '28px', height: '28px', objectFit: 'cover' }} />
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
                    <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--azul)' }}>{userName}</div>
                    <div style={{ fontSize: '.75rem', color: '#888', marginTop: '.1rem' }}>{user.email}</div>
                  </div>
                  <Link href="/dashboard" onClick={() => setUserMenu(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem 1rem', borderRadius: '8px', color: 'var(--azul)', fontWeight: 600, fontSize: '.88rem', textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--superficie)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <i className="fa fa-tachometer-alt" style={{ width: '16px', color: 'var(--rojo)' }} /> Mi cuenta
                  </Link>
                  <button onClick={cerrarSesion}
                    style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem 1rem', borderRadius: '8px', color: '#666', fontWeight: 600, fontSize: '.88rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--error-fondo)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#666' }}>
                    <i className="fa fa-sign-out-alt" style={{ width: '16px' }} /> Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          // V-1.1.93 · quien no tiene sesión va directo a la pantalla de acceso.
          <Link href="/entrar"
            style={{
              display: 'flex', alignItems: 'center', gap: '.4rem',
              background: 'linear-gradient(135deg,var(--rojo),var(--rojo-claro))',
              color: '#fff', fontWeight: 700, fontSize: '.88rem',
              textDecoration: 'none', padding: '.5rem 1.2rem', borderRadius: '30px',
              fontFamily: 'Montserrat, sans-serif',
            }}>
            Ingresar
          </Link>
        )}
      </nav>

      {/* Mobile toggle */}
      <button onClick={() => setMenuOpen(!menuOpen)} className="vb-nav-mobile-btn"
        // `minWidth/minHeight`: el botón solo tiene un icono de Font Awesome (CDN externo). Si el CDN no carga (bloqueador, filtro de red, sin
        // conexión) el icono no existe y el botón medía 0×0: el menú del móvil quedaba sin forma de abrirse. Con tamaño propio, siempre se ve y se pulsa.
        style={{ display: 'none', minWidth: 36, minHeight: 36, fontSize: '1.5rem', color: 'var(--azul)', background: 'none', border: 'none', cursor: 'pointer' }}
        aria-expanded={menuOpen}
        aria-controls="menu-movil"
        aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}>
        <i className={menuOpen ? 'fas fa-times' : 'fas fa-bars'} />
      </button>

      {menuOpen && (
        <>
          {/* El fondo. Sin él, el menú flotaba sobre la página y se leían las
              dos cosas a la vez — en la captura del Fold parecía un error de
              maquetación. Además, tocar fuera cierra: es lo que todo el mundo
              intenta primero. */}
          <div
            onClick={() => setMenuOpen(false)}
            aria-hidden
            className="vb-menu-fondo"
            style={{
              position: 'fixed', inset: 0, top: 'var(--alto-cabecera, 76px)',
              background: 'rgba(11,11,12,.45)', backdropFilter: 'blur(2px)',
              zIndex: 998,
            }}
          />

          <nav
            id="menu-movil"
            aria-label="Menú principal"
            className="vb-menu-movil"
            style={{
              // `100%` y no 120px fijos: la cabecera mide 120 en escritorio y
              // 76 en teléfono, así que el menú quedaba despegado con una
              // franja de página asomando por debajo.
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: '#fff', zIndex: 999,
              boxShadow: '0 18px 40px rgba(11,11,12,.18)',
              borderTop: '1px solid var(--linea-oscura, rgba(11,11,12,.08))',
              maxHeight: 'calc(100vh - var(--alto-cabecera, 76px))',
              overflowY: 'auto',
              padding: '.5rem 0 1rem',
            }}>
            {user && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '.8rem',
                padding: '.9rem 1.25rem', margin: '.25rem .75rem .5rem',
                background: 'var(--superficie)', borderRadius: 12,
              }}>
                <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--azul)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.95rem', flexShrink: 0, overflow: 'hidden' }}>
                  {user.photoURL
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={user.photoURL} alt="" style={{ width: 40, height: 40, objectFit: 'cover' }} />
                    : userInitial}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--azul)' }}>{userName}</div>
                  <div style={{ fontSize: '.74rem', color: '#8B95A3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                </div>
              </div>
            )}

            {NAV_LINKS.map(l => {
              // La página en la que ya estás se marca: un menú que no dice
              // dónde estás obliga a recordarlo.
              const actual = ruta === l.href || (l.href !== '/' && ruta.startsWith(l.href))
              return (
                <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                  aria-current={actual ? 'page' : undefined}
                  className="vb-menu-fila"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '.9rem',
                    padding: '.95rem 1.35rem', textDecoration: 'none',
                    fontWeight: actual ? 800 : 600,
                    color: actual ? 'var(--rojo-marca)' : 'var(--texto)',
                    borderLeft: `3px solid ${actual ? 'var(--rojo-marca)' : 'transparent'}`,
                  }}>
                  <i className={`fa ${l.icono}`} aria-hidden="true"
                    style={{ width: 20, textAlign: 'center', color: actual ? 'var(--rojo-marca)' : '#8B95A3' }} />
                  <span style={{ flex: 1 }}>{l.label}</span>
                  <i className="fa fa-chevron-right" aria-hidden="true" style={{ fontSize: '.7rem', color: '#C9CDD4' }} />
                </Link>
              )
            })}

            <div style={{ height: 1, background: 'var(--linea-oscura, rgba(11,11,12,.08))', margin: '.5rem 1.35rem' }} />

            {user ? (
              <>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="vb-menu-fila"
                  style={{ display: 'flex', alignItems: 'center', gap: '.9rem', padding: '.95rem 1.35rem', textDecoration: 'none', fontWeight: 700, color: 'var(--azul)', borderLeft: '3px solid transparent' }}>
                  <i className="fa fa-tachometer-alt" aria-hidden="true" style={{ width: 20, textAlign: 'center' }} />
                  <span style={{ flex: 1 }}>Mi cuenta</span>
                  <i className="fa fa-chevron-right" aria-hidden="true" style={{ fontSize: '.7rem', color: '#C9CDD4' }} />
                </Link>
                <button onClick={cerrarSesion} className="vb-menu-fila"
                  style={{ display: 'flex', alignItems: 'center', gap: '.9rem', width: '100%', padding: '.95rem 1.35rem', background: 'none', border: 'none', borderLeft: '3px solid transparent', fontWeight: 700, color: 'var(--error-fuerte)', cursor: 'pointer', textAlign: 'left', fontSize: '1rem', fontFamily: 'inherit' }}>
                  <i className="fa fa-sign-out-alt" aria-hidden="true" style={{ width: 20, textAlign: 'center' }} />
                  <span>Cerrar sesión</span>
                </button>
              </>
            ) : (
              <div style={{ padding: '.4rem 1.35rem .2rem' }}>
                {/* El botón de entrar es el único destacado: en un menú donde
                    todo pesa igual, nada destaca. */}
                <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem',
                    padding: '.95rem 1rem', borderRadius: 10, textDecoration: 'none',
                    background: 'var(--rojo-marca)', color: '#fff', fontWeight: 800,
                  }}>
                  <i className="fa fa-user" aria-hidden="true" />
                  Ingresar o registrarse
                </Link>
              </div>
            )}
          </nav>
        </>
      )}

      <style>{`
        @media (max-width: 768px) {
          .vb-nav-desktop { display: none !important; }
          .vb-nav-mobile-btn { display: block !important; }
        }
        /* Si el menu queda abierto y la pantalla se ensancha (girar el Fold),
           antes se veian los dos menus a la vez. */
        @media (min-width: 769px) {
          .vb-menu-movil, .vb-menu-fondo { display: none !important; }
        }
        .vb-menu-movil {
          animation: vb-menu-entra .18s ease-out;
        }
        .vb-menu-fondo {
          animation: vb-fondo-entra .18s ease-out;
        }
        @keyframes vb-menu-entra {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes vb-fondo-entra {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* La fila entera responde al dedo: en una lista de cinco, saber cual
           se toco antes de que cargue la pagina es la mitad de la confianza. */
        .vb-menu-fila { transition: background .14s ease, padding-left .14s ease; }
        .vb-menu-fila:active { background: var(--superficie); }
        .vb-menu-fila:focus-visible {
          outline: 2px solid var(--azul);
          outline-offset: -2px;
          border-radius: 6px;
        }
        @media (hover: hover) {
          .vb-menu-fila:hover { background: var(--superficie); padding-left: 1.6rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .vb-menu-movil, .vb-menu-fondo { animation: none; }
          .vb-menu-fila { transition: none; }
        }
      `}</style>
    </header>
  )
}
