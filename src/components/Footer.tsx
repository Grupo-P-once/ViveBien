import Link from 'next/link'

const linkStyle = {
  fontSize: '.875rem', lineHeight: '2',
  color: 'rgba(255,255,255,.7)' as const, display: 'block' as const,
}

export default function Footer() {
  return (
    <footer style={{
      background: 'linear-gradient(135deg,#1a0808 0%,#0d1e2c 100%)',
      color: 'rgba(255,255,255,.85)',
      padding: '3.5rem 2rem 0',
    }}>
      <div style={{
        maxWidth: '1100px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
        gap: '2rem', paddingBottom: '2.5rem',
      }}>

        {/* Columna 1 — Marca */}
        <div>
          <h4 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.1rem', color: '#fff', marginBottom: '1rem' }}>
            Vive Bien Grupo Inmobiliario
          </h4>
          <p style={{ fontSize: '.875rem', lineHeight: 1.9, color: 'rgba(255,255,255,.7)', marginBottom: '1rem' }}>
            Tu aliado de confianza en el mercado inmobiliario de León, Guanajuato. Ayudándote a encontrar el espacio ideal desde 2009.
          </p>
          {/* Redes sociales */}
          <div style={{ display: 'flex', gap: '.8rem', marginTop: '.8rem' }}>
            {[
              { href: 'https://www.facebook.com/profile.php?id=61582687400323', icon: 'fab fa-facebook-f' },
              { href: 'https://www.instagram.com/vive_bien_mx/', icon: 'fab fa-instagram' },
              { href: 'https://wa.me/524778116501', icon: 'fab fa-whatsapp' },
            ].map(r => (
              <a key={r.href} href={r.href} target="_blank" rel="noopener noreferrer"
                style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  background: 'rgba(255,255,255,.12)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '.95rem', color: '#fff', transition: 'background .2s',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#8B1A1A')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}
              >
                <i className={r.icon} />
              </a>
            ))}
          </div>
        </div>

        {/* Columna 2 — Contacto */}
        <div>
          <h4 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '1rem' }}>
            Contacto
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', fontSize: '.875rem', color: 'rgba(255,255,255,.75)' }}>
            <span><i className="fa fa-phone" style={{ marginRight: '.5rem', color: '#C0392B' }} />477 811 6501</span>
            <span><i className="fa fa-envelope" style={{ marginRight: '.5rem', color: '#C0392B' }} />jpepeponce200903@gmail.com</span>
            <span><i className="fa fa-clock" style={{ marginRight: '.5rem', color: '#C0392B' }} />Lun – Vie: 9:00 – 18:00</span>
            <span><i className="fa fa-clock" style={{ marginRight: '.5rem', color: '#C0392B' }} />Sáb – Dom: 11:00 – 14:00</span>
          </div>
        </div>

        {/* Columna 3 — Ubicación */}
        <div>
          <h4 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '1rem' }}>
            Ubicación
          </h4>
          <div style={{ fontSize: '.875rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.8 }}>
            <i className="fa fa-map-marker-alt" style={{ marginRight: '.5rem', color: '#C0392B' }} />
            Blvd. Campestre 2910 - LOCAL 10,<br />
            Cañada del Refugio, C.P. 37358,<br />
            León, Guanajuato.
          </div>
        </div>

        {/* Columna 4 — Propiedades */}
        <div>
          <h4 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '1rem' }}>
            Propiedades
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { href: '/propiedades?tipo=casa', label: 'Casas en venta' },
              { href: '/propiedades?tipo=depto', label: 'Departamentos' },
              { href: '/propiedades?tipo=terreno', label: 'Terrenos' },
              { href: '/propiedades?tipo=comercial', label: 'Locales comerciales' },
            ].map(l => (
              <Link key={l.href} href={l.href} style={linkStyle}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.7)')}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,.1)',
        padding: '1.5rem 0 2rem',
        maxWidth: '1100px', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '1rem',
      }}>
        {/* Logo Grupo P-ONCE — círculo */}
        <a
          href="https://grupo-p-once.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flexShrink: 0,
            width: '64px', height: '64px', borderRadius: '50%',
            background: '#ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px',
            opacity: 0.92,
            transition: 'opacity .2s, transform .2s',
            border: '1px solid rgba(255,255,255,.15)',
            textDecoration: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-p11-full.png" alt="Grupo P-ONCE" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        </a>

        <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.45)', textAlign: 'center', flex: 1 }}>
          © {new Date().getFullYear()} Vive Bien Grupo Inmobiliario. Todos los derechos reservados. | León, Guanajuato, México.
        </p>
      </div>
    </footer>
  )
}
