'use client'
import { CORREO_CONTACTO } from '@/lib/contacto'
import Link from 'next/link'
import Image from 'next/image'
import { NEGOCIO, enlaceWhatsApp } from '@/lib/config/negocio'
import { EVENTO_ABRIR_ANALITICA } from '@/lib/ga'

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

        {/* ── Los títulos de columna son `h3`, no `h4` ──
            Eran `h4` y las páginas que los preceden cierran en `h2`, así que
            el salto H2 → H4 rompía el orden de encabezados. Lo señala axe
            (`heading-order`) y lo nota de verdad quien navega con lector de
            pantalla: un nivel que se salta sugiere una sección que no existe.

            El cambio es **sólo semántico**: los cuatro llevan `fontSize` y
            `fontWeight` en línea, que ganan al tamaño por defecto del
            navegador. No se mueve un píxel.

            Afecta a TODAS las páginas públicas, no sólo al Centro de Ayuda,
            porque este pie es compartido. Se comprobó la misma violación en
            `/terminos`, que ya lo pintaba antes. */}
        {/* Columna 1 — Marca */}
        <div>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.1rem', color: '#fff', marginBottom: '1rem' }}>
            Vive Bien Grupo Inmobiliario
          </h3>
          <p style={{ fontSize: '.875rem', lineHeight: 1.9, color: 'rgba(255,255,255,.7)', marginBottom: '1rem' }}>
            Tu aliado de confianza en el mercado inmobiliario de León, Guanajuato. Ayudándote a encontrar el espacio ideal desde 2009.
          </p>
          {/* Redes sociales */}
          <div style={{ display: 'flex', gap: '.8rem', marginTop: '.8rem' }}>
            {[
              // Sin `nombre`, un lector de pantalla anunciaba «enlace» tres
              // veces seguidas: el icono no dice nada, es una fuente.
              { href: NEGOCIO.facebook, icon: 'fab fa-facebook-f', nombre: 'Facebook de Vive Bien' },
              { href: NEGOCIO.instagram, icon: 'fab fa-instagram', nombre: 'Instagram de Vive Bien' },
              { href: enlaceWhatsApp(), icon: 'fab fa-whatsapp', nombre: 'Escribir por WhatsApp' },
            ].map(r => (
              <a key={r.href} href={r.href} target="_blank" rel="noopener noreferrer" aria-label={r.nombre}
                style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  background: 'rgba(255,255,255,.12)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '.95rem', color: '#fff', transition: 'background .2s',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--rojo)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}
              >
                <i className={r.icon} />
              </a>
            ))}
          </div>
        </div>

        {/* Columna 2 — Contacto */}
        <div>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '1rem' }}>
            Contacto
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', fontSize: '.875rem', color: 'rgba(255,255,255,.75)' }}>
            <span><i className="fa fa-phone" style={{ marginRight: '.5rem', color: 'var(--rojo-claro)' }} />{NEGOCIO.telefonoVisible}</span>
            <span><i className="fa fa-envelope" style={{ marginRight: '.5rem', color: 'var(--rojo-claro)' }} />{CORREO_CONTACTO}</span>
            {NEGOCIO.horario.map((h) => (
              <span key={h.dias}><i className="fa fa-clock" style={{ marginRight: '.5rem', color: 'var(--rojo-claro)' }} />{h.dias}: {h.horas}</span>
            ))}
          </div>
        </div>

        {/* Columna 3 — Ubicación */}
        <div>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '1rem' }}>
            Ubicación
          </h3>
          <div style={{ fontSize: '.875rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.8 }}>
            <i className="fa fa-map-marker-alt" style={{ marginRight: '.5rem', color: 'var(--rojo-claro)' }} />
            {NEGOCIO.calleCorta} - LOCAL 10,<br />
            {NEGOCIO.colonia}, C.P. {NEGOCIO.cp},<br />
            {NEGOCIO.ciudad}, {NEGOCIO.estado}.
          </div>
        </div>

        {/* Columna 4 — Propiedades */}
        <div>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '1rem' }}>
            Propiedades
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { href: '/propiedades?tipo=casa', label: 'Casas en venta' },
              { href: '/propiedades?tipo=depto', label: 'Departamentos' },
              { href: '/propiedades?tipo=terreno', label: 'Terrenos' },
              { href: '/propiedades?tipo=comercial', label: 'Locales comerciales' },
              { href: '/propiedades?tipo=oficina', label: 'Oficinas' },
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
          href="https://gp-once.com/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Grupo P-ONCE (se abre en una pestaña nueva)"
          data-enlace="grupo-p-once"
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
          {/* Logotipo NUEVO de Grupo P-ONCE: el símbolo «11P» en negro sobre transparente (de `logo nuevo.png`, carpeta `logop11`), 6 KB.
              Antes: `logo-p11-full.png`, el logotipo viejo (470 KB en el pie de CADA página). */}
          <Image src="/logo-p11-simbolo.png" alt="Grupo P-ONCE" width={120} height={120}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        </a>

        <div style={{ flex: 1, textAlign: 'center' }}>
          {/* Los legales van en el pie porque es donde la gente los busca.
              /terminos no tenia NI UN enlace en todo el sitio: existia y era
              inalcanzable, como paso en E-13. */}
          <p style={{ fontSize: '.82rem', marginBottom: '.5rem' }}>
            <Link href="/ayuda" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none' }}>
              Centro de Ayuda
            </Link>
            <span style={{ color: 'rgba(255,255,255,.25)', margin: '0 .6rem' }}>·</span>
            <Link href="/privacidad" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none' }}>
              Aviso de privacidad
            </Link>
            <span style={{ color: 'rgba(255,255,255,.25)', margin: '0 .6rem' }}>·</span>
            <Link href="/terminos" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none' }}>
              Términos y condiciones
            </Link>
            <span style={{ color: 'rgba(255,255,255,.25)', margin: '0 .6rem' }}>·</span>
            <button type="button" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_ANALITICA))}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'rgba(255,255,255,.7)', cursor: 'pointer' }}>
              Preferencias de analítica
            </button>
          </p>
          <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.45)' }}>
            © {new Date().getFullYear()} Vive Bien Grupo Inmobiliario. Todos los derechos reservados. | León, Guanajuato, México.
          </p>
        </div>
      </div>
    </footer>
  )
}
