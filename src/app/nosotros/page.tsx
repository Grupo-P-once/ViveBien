'use client'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'

const STATS = [
  { value: '15+', label: 'Años de experiencia', icon: 'fa-calendar-alt', color: '#1B365D' },
  { value: '100+', label: 'Propiedades gestionadas', icon: 'fa-home', color: '#8B1A1A' },
  { value: '500+', label: 'Clientes satisfechos', icon: 'fa-users', color: '#279546' },
  { value: '2', label: 'Ciudades atendidas', icon: 'fa-map-marker-alt', color: '#D97706' },
]

const VALORES = [
  {
    icon: 'fa-handshake',
    title: 'Integridad',
    desc: 'Actuamos con honestidad y transparencia en cada transacción. Nuestros clientes merecen información veraz y asesoría sin conflictos de interés.',
    color: '#1B365D',
  },
  {
    icon: 'fa-star',
    title: 'Excelencia',
    desc: 'Nos exigimos los más altos estándares en cada proceso, desde la primera consulta hasta la entrega de llaves. La calidad no es negociable.',
    color: '#8B1A1A',
  },
  {
    icon: 'fa-heart',
    title: 'Compromiso',
    desc: 'Tu satisfacción es nuestra prioridad. Nos comprometemos con cada cliente como si fuera nuestra propia familia buscando un hogar.',
    color: '#C0392B',
  },
  {
    icon: 'fa-lightbulb',
    title: 'Innovación',
    desc: 'Adoptamos tecnología y nuevas herramientas para ofrecerte búsquedas más eficientes, valuaciones precisas y una experiencia moderna.',
    color: '#5B4FCF',
  },
  {
    icon: 'fa-shield-halved',
    title: 'Confianza',
    desc: 'Cada propiedad en nuestro catálogo ha sido verificada. Respaldamos cada operación con documentación legal en orden y procesos seguros.',
    color: '#279546',
  },
]

const EQUIPO = [
  {
    nombre: 'José Ponce',
    rol: 'Director General & Fundador',
    desc: 'Con más de 15 años en el sector inmobiliario de Guanajuato, José lidera el equipo con visión estratégica y profundo conocimiento del mercado local.',
    foto: 'https://unavatar.io/github/jose',
    linkedin: '#',
  },
  {
    nombre: 'Ana Martínez',
    rol: 'Asesora Inmobiliaria Senior',
    desc: 'Especialista en propiedades residenciales de alto valor. Ana ha acompañado a más de 200 familias a encontrar el hogar de sus sueños en León.',
    foto: 'https://unavatar.io/github/ana',
    linkedin: '#',
  },
  {
    nombre: 'Carlos Reyes',
    rol: 'Asesor Industrial & Comercial',
    desc: 'Experto en naves industriales, bodegas y locales comerciales. Carlos conoce cada parque industrial y zona comercial clave de la región.',
    foto: 'https://unavatar.io/github/carlos',
    linkedin: '#',
  },
]

export default function NosotrosPage() {
  return (
    <>
      <Header />

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #1B365D 0%, #0d1e2c 60%, #8B1A1A 100%)',
        padding: '6rem 2rem 5rem',
        textAlign: 'center',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '350px', height: '350px', borderRadius: '50%', background: 'rgba(192,57,43,.12)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-60px', left: '-60px', width: '280px', height: '280px', borderRadius: '50%', background: 'rgba(255,255,255,.04)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span style={{
            display: 'inline-block', background: 'rgba(192,57,43,.3)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(192,57,43,.5)', padding: '.4rem 1.4rem',
            borderRadius: '30px', fontSize: '.8rem', fontWeight: 700, letterSpacing: '.12em',
            color: '#ffb3a7', marginBottom: '1.5rem', textTransform: 'uppercase',
          }}>
            Quiénes somos
          </span>
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
            fontSize: 'clamp(2rem,5vw,3.5rem)', lineHeight: 1.1,
            margin: '0 0 1.5rem', textShadow: '0 2px 12px rgba(0,0,0,.4)',
          }}>
            Más de 15 años<br />construyendo confianza
          </h1>
          <p style={{ fontSize: 'clamp(1rem,2vw,1.2rem)', opacity: .85, lineHeight: 1.7, maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            Somos el grupo inmobiliario de referencia en León, Guanajuato. Conectamos personas con propiedades que transforman su vida y sus negocios.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/propiedades" style={{
              background: '#8B1A1A', color: '#fff', padding: '.9rem 2rem',
              borderRadius: '10px', textDecoration: 'none', fontWeight: 800,
              fontFamily: 'Montserrat, sans-serif', fontSize: '.95rem',
              display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            }}>
              <i className="fa fa-search" /> Ver propiedades
            </Link>
            <a href="https://wa.me/524778116501" target="_blank" rel="noopener noreferrer" style={{
              background: 'rgba(255,255,255,.12)', backdropFilter: 'blur(8px)',
              color: '#fff', padding: '.9rem 2rem', borderRadius: '10px',
              textDecoration: 'none', fontWeight: 700, border: '1px solid rgba(255,255,255,.25)',
              fontFamily: 'Montserrat, sans-serif', fontSize: '.95rem',
              display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            }}>
              <i className="fab fa-whatsapp" /> Contáctanos
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ background: '#fff', padding: '0' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', transform: 'translateY(-40px)' }}>
          {STATS.map(s => (
            <div key={s.label} style={{
              background: '#fff', borderRadius: '16px', padding: '2rem 1.5rem',
              textAlign: 'center', margin: '0 .5rem',
              boxShadow: '0 8px 30px rgba(0,0,0,.1)',
              borderBottom: `4px solid ${s.color}`,
            }}>
              <i className={`fa ${s.icon}`} style={{ fontSize: '1.6rem', color: s.color, marginBottom: '.8rem', display: 'block' }} />
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '2.4rem', color: '#1B365D', lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: '.85rem', color: '#666', marginTop: '.4rem', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Nuestra Historia */}
      <section style={{ background: '#F4F6F8', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
          <div>
            <span style={{ color: '#8B1A1A', fontWeight: 800, fontSize: '.8rem', letterSpacing: '.12em', textTransform: 'uppercase', display: 'block', marginBottom: '.8rem' }}>
              Nuestra Historia
            </span>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,3vw,2.4rem)', color: '#1B365D', lineHeight: 1.2, marginBottom: '1.5rem' }}>
              Nacimos para hacer<br />el proceso más humano
            </h2>
            <p style={{ lineHeight: 1.85, color: '#555', fontSize: '1rem', marginBottom: '1.2rem' }}>
              Vive Bien Grupo Inmobiliario nació en 2009 de la mano de José Ponce, con una convicción simple pero poderosa: en el mercado inmobiliario, lo más importante no son los metros cuadrados, sino las personas que los van a habitar.
            </p>
            <p style={{ lineHeight: 1.85, color: '#555', fontSize: '1rem', marginBottom: '1.2rem' }}>
              Comenzamos como una agencia pequeña en León, Guanajuato, enfocada en el segmento residencial. Con el paso de los años, y gracias a la confianza de nuestros clientes, expandimos nuestra operación a propiedades industriales, comerciales y de terrenos, convirtiéndonos en un grupo integral.
            </p>
            <p style={{ lineHeight: 1.85, color: '#555', fontSize: '1rem', marginBottom: '2rem' }}>
              Hoy somos un equipo de asesores certificados que han acompañado a más de 500 familias y empresas a tomar una de las decisiones más importantes de su vida. Cada operación es única, y la tratamos como tal.
            </p>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              {[
                { icon: 'fa-certificate', label: 'Asesores certificados' },
                { icon: 'fa-file-contract', label: 'Procesos legales seguros' },
                { icon: 'fa-map-marked-alt', label: 'Cobertura en todo Guanajuato' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', color: '#1B365D', fontWeight: 700, fontSize: '.9rem' }}>
                  <div style={{ width: '36px', height: '36px', background: 'rgba(27,54,93,.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`fa ${f.icon}`} style={{ color: '#8B1A1A', fontSize: '.9rem' }} />
                  </div>
                  {f.label}
                </div>
              ))}
            </div>
          </div>

          {/* Decorative element */}
          <div style={{ position: 'relative' }}>
            <div style={{
              background: 'linear-gradient(135deg, #1B365D 0%, #8B1A1A 100%)',
              borderRadius: '24px', padding: '3rem 2.5rem', color: '#fff',
              boxShadow: '0 20px 50px rgba(27,54,93,.3)',
            }}>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '3.5rem', lineHeight: 1, marginBottom: '.5rem', color: '#ffb3a7' }}>2009</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1.5rem', opacity: .9 }}>Año de fundación</div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[
                  { year: '2009', event: 'Fundación en León, Gto.' },
                  { year: '2013', event: 'Expansión al sector industrial' },
                  { year: '2017', event: 'Apertura segmento comercial' },
                  { year: '2021', event: 'Plataforma digital propia' },
                  { year: '2024', event: '+500 clientes atendidos' },
                ].map(h => (
                  <div key={h.year} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span style={{ background: 'rgba(255,255,255,.15)', padding: '3px 10px', borderRadius: '6px', fontSize: '.72rem', fontWeight: 800, whiteSpace: 'nowrap', minWidth: '46px', textAlign: 'center' }}>{h.year}</span>
                    <span style={{ fontSize: '.88rem', opacity: .85 }}>{h.event}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Floating accent */}
            <div style={{
              position: 'absolute', top: '-20px', right: '-20px',
              width: '80px', height: '80px', borderRadius: '50%',
              background: '#C0392B', display: 'flex', alignItems: 'center',
              justifyContent: 'center', boxShadow: '0 8px 20px rgba(192,57,43,.4)',
            }}>
              <i className="fa fa-award" style={{ fontSize: '2rem', color: '#fff' }} />
            </div>
          </div>
        </div>
      </section>

      {/* Valores */}
      <section style={{ background: '#F4F6F8', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <span style={{ color: '#8B1A1A', fontWeight: 800, fontSize: '.8rem', letterSpacing: '.12em', textTransform: 'uppercase', display: 'block', marginBottom: '.8rem' }}>
              Lo que nos define
            </span>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,3vw,2.4rem)', color: '#1B365D', margin: '0 0 1rem' }}>
              Nuestros Valores
            </h2>
            <p style={{ color: '#666', fontSize: '1rem', maxWidth: '500px', margin: '0 auto', lineHeight: 1.7 }}>
              Cinco pilares que guían cada decisión, cada asesoría y cada relación con nuestros clientes.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1.8rem' }}>
            {VALORES.map(v => (
              <div key={v.title} style={{
                background: '#fff', borderRadius: '16px', padding: '2rem',
                boxShadow: '0 2px 12px rgba(0,0,0,.06)',
                borderLeft: `4px solid ${v.color}`,
                transition: 'transform .25s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = '' }}
              >
                <div style={{
                  width: '50px', height: '50px', borderRadius: '12px',
                  background: v.color, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', marginBottom: '1.2rem',
                }}>
                  <i className={`fa ${v.icon}`} style={{ fontSize: '1.2rem', color: '#fff' }} />
                </div>
                <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.1rem', color: '#1B365D', marginBottom: '.7rem' }}>{v.title}</h3>
                <p style={{ color: '#666', fontSize: '.9rem', lineHeight: 1.7 }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Por qué elegirnos */}
      <section style={{ background: '#fff', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <span style={{ color: '#8B1A1A', fontWeight: 800, fontSize: '.8rem', letterSpacing: '.12em', textTransform: 'uppercase', display: 'block', marginBottom: '.8rem' }}>
              ¿Por qué nosotros?
            </span>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,3vw,2.2rem)', color: '#1B365D', lineHeight: 1.2, marginBottom: '2rem' }}>
              La diferencia está en los detalles
            </h2>
            {[
              { icon: 'fa-map-marked-alt', title: 'Conocimiento local profundo', desc: 'Conocemos cada colonia, cada parque industrial y cada tendencia de precio en León y Guanajuato.' },
              { icon: 'fa-balance-scale', title: 'Asesoría legal incluida', desc: 'Contamos con aliados legales especializados en bienes raíces para garantizar operaciones 100% seguras.' },
              { icon: 'fa-camera', title: 'Marketing profesional', desc: 'Fotografía profesional, tours virtuales y difusión en las principales plataformas digitales para cada propiedad.' },
              { icon: 'fa-clock', title: 'Respuesta inmediata', desc: 'Nuestro equipo responde en menos de 2 horas, todos los días de la semana, incluso fines de semana.' },
            ].map(r => (
              <div key={r.title} style={{ display: 'flex', gap: '1.2rem', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#F4F6F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa ${r.icon}`} style={{ fontSize: '1rem', color: '#8B1A1A' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: '#1B365D', marginBottom: '.3rem', fontSize: '.95rem' }}>{r.title}</div>
                  <div style={{ color: '#666', fontSize: '.88rem', lineHeight: 1.6 }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            background: 'linear-gradient(135deg,#F4F6F8 0%,#EBF0F8 100%)',
            borderRadius: '24px', padding: '3rem 2.5rem',
            border: '1px solid rgba(27,54,93,.08)',
          }}>
            <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.3rem', color: '#1B365D', marginBottom: '2rem', textAlign: 'center' }}>
              Nuestra área de cobertura
            </h3>
            {[
              { ciudad: 'León, Guanajuato', focus: 'Residencial, Industrial, Comercial', color: '#1B365D' },
              { ciudad: 'Silao, Guanajuato', focus: 'Parques Industriales, Logística', color: '#8B1A1A' },
            ].map(c => (
              <div key={c.ciudad} style={{
                background: '#fff', borderRadius: '12px', padding: '1.2rem 1.5rem',
                marginBottom: '1rem', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.05)',
              }}>
                <div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: '#1B365D', fontSize: '.95rem' }}>
                    <i className="fa fa-map-marker-alt" style={{ color: c.color, marginRight: '.5rem' }} />
                    {c.ciudad}
                  </div>
                  <div style={{ color: '#888', fontSize: '.8rem', marginTop: '.2rem' }}>{c.focus}</div>
                </div>
                <span style={{ background: c.color, color: '#fff', padding: '3px 10px', borderRadius: '6px', fontSize: '.72rem', fontWeight: 700 }}>Activo</span>
              </div>
            ))}

            <div style={{ marginTop: '2rem', padding: '1.2rem', background: 'rgba(27,54,93,.06)', borderRadius: '10px', textAlign: 'center' }}>
              <i className="fa fa-phone" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />
              <span style={{ fontSize: '.9rem', color: '#333', fontWeight: 700 }}>477 811 6501</span>
              <br />
              <span style={{ fontSize: '.78rem', color: '#888' }}>Atención Lun–Vie 9:00–18:00 | Sáb–Dom 11:00–14:00</span>
            </div>
          </div>
        </div>
      </section>

      {/* Grupo P-Once — Nuestra Familia Empresarial */}
      <section style={{
        background: 'linear-gradient(135deg, #1a1a14 0%, #2a2a1e 50%, #1a1a14 100%)',
        padding: '6rem 2rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* subtle texture overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(192,156,40,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span style={{
            display: 'inline-block', letterSpacing: '.2em', fontSize: '.72rem',
            fontWeight: 700, color: '#C09C28', textTransform: 'uppercase', marginBottom: '1.2rem',
          }}>
            Nuestra Familia Empresarial
          </span>
          <h2 style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
            fontSize: 'clamp(2.2rem,5vw,3.8rem)', color: 'rgba(255,255,255,.88)',
            letterSpacing: '.06em', lineHeight: 1, margin: '0 0 1.5rem',
          }}>
            GRUPO P-ONCE
          </h2>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '1rem', lineHeight: 1.8, maxWidth: '520px', margin: '0 auto 4rem' }}>
            Vive Bien es parte de un grupo empresarial con presencia en múltiples sectores en León, Guanajuato.
          </p>

          {/* Company cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1.5rem' }}>
            {[
              {
                nombre: 'VIVE BIEN', sector: 'Bienes Raíces',
                icon: 'fa-home',
                desc: 'Tu nuevo hogar comienza aquí. Compra, venta y renta de propiedades en León.',
                active: true,
                href: '/',
              },
              {
                nombre: 'INTEN', sector: 'Telecomunicaciones',
                icon: 'fa-wifi',
                desc: 'Conectividad sin límites para hogar y empresa. Internet y telefonía móvil.',
                active: false,
                href: '#',
              },
              {
                nombre: 'PROIN', sector: 'Desarrollo Inmobiliario',
                icon: 'fa-building',
                desc: 'Creamos espacios con visión de futuro. Desarrollo y gestión de proyectos inmobiliarios.',
                active: false,
                href: '#',
              },
              {
                nombre: 'ANDAX', sector: 'Construcción',
                icon: 'fa-tools',
                desc: 'Seguridad y altura para tus obras. Renta de andamiaje y equipo de construcción.',
                active: false,
                href: '#',
              },
              {
                nombre: 'VELARE', sector: 'Diseño de Interiores',
                icon: 'fa-layer-group',
                desc: 'Elegancia en cada detalle. Cortinas y persianas premium para hogar y empresa.',
                active: false,
                href: 'https://grupo-p-once.github.io/velare/',
              },
            ].map(c => (
              <a key={c.nombre} href={c.href}
                target={c.href.startsWith('http') ? '_blank' : undefined}
                rel={c.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                style={{
                  background: c.active
                    ? 'linear-gradient(135deg,rgba(192,156,40,.25),rgba(192,156,40,.12))'
                    : 'rgba(255,255,255,.04)',
                  border: c.active ? '1px solid rgba(192,156,40,.55)' : '1px solid rgba(255,255,255,.08)',
                  borderRadius: '16px', padding: '2rem 1.5rem',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.8rem',
                  textDecoration: 'none',
                  transition: 'transform .2s, border-color .2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-5px)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(192,156,40,.6)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = ''; (e.currentTarget as HTMLAnchorElement).style.borderColor = c.active ? 'rgba(192,156,40,.55)' : 'rgba(255,255,255,.08)' }}
              >
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  background: c.active ? 'rgba(192,156,40,.3)' : 'rgba(255,255,255,.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={`fa ${c.icon}`} style={{ fontSize: '1.3rem', color: c.active ? '#C09C28' : 'rgba(255,255,255,.5)' }} />
                </div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '.95rem', letterSpacing: '.08em', color: c.active ? '#C09C28' : 'rgba(255,255,255,.75)' }}>
                  {c.nombre}
                </div>
                <div style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: c.active ? 'rgba(192,156,40,.7)' : 'rgba(255,255,255,.3)' }}>
                  {c.sector}
                </div>
                <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.4)', lineHeight: 1.6, textAlign: 'center', margin: 0 }}>
                  {c.desc}
                </p>
              </a>
            ))}
          </div>

          {/* GP11 logo badge */}
          <div style={{ marginTop: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ height: '1px', width: '80px', background: 'rgba(192,156,40,.3)' }} />
            <a href="https://grupo-p-once.github.io" target="_blank" rel="noopener noreferrer"
              style={{
                width: '92px', height: '92px', borderRadius: '50%',
                background: '#fff', border: '3px solid rgba(192,156,40,.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none', overflow: 'hidden',
                boxShadow: '0 0 20px rgba(192,156,40,.3)',
                transition: 'border-color .2s, box-shadow .2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#C09C28'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 30px rgba(192,156,40,.6)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(192,156,40,.6)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 20px rgba(192,156,40,.3)' }}
            >
              <img src="/logo-p11-real.png" alt="Grupo P-Once" style={{ width: '78px', height: '78px', objectFit: 'contain' }} />
            </a>
            <div style={{ height: '1px', width: '80px', background: 'rgba(192,156,40,.3)' }} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        background: 'linear-gradient(135deg, #1B365D 0%, #0d1e2c 50%, #8B1A1A 100%)',
        padding: '5rem 2rem', textAlign: 'center', color: '#fff',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '300px', background: 'rgba(255,255,255,.03)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '700px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <i className="fa fa-home" style={{ fontSize: '3rem', color: 'rgba(255,255,255,.25)', display: 'block', marginBottom: '1.5rem' }} />
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.8rem)', marginBottom: '1rem', lineHeight: 1.15 }}>
            ¿Listo para encontrar tu propiedad ideal?
          </h2>
          <p style={{ opacity: .8, fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '2.5rem' }}>
            Nuestro equipo está listo para asesorarte sin compromiso. Cuéntanos qué buscas y te ayudamos a encontrarlo.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/propiedades" style={{
              background: '#C0392B', color: '#fff', padding: '1rem 2.5rem',
              borderRadius: '12px', textDecoration: 'none', fontWeight: 800,
              fontFamily: 'Montserrat, sans-serif', fontSize: '1rem',
              display: 'inline-flex', alignItems: 'center', gap: '.6rem',
              boxShadow: '0 6px 20px rgba(192,57,43,.4)',
            }}>
              <i className="fa fa-search" /> Ver catálogo
            </Link>
            <a href="https://wa.me/524778116501?text=Hola,%20me%20gustaría%20recibir%20asesoría%20sobre%20propiedades%20en%20León." target="_blank" rel="noopener noreferrer" style={{
              background: '#25D366', color: '#fff', padding: '1rem 2.5rem',
              borderRadius: '12px', textDecoration: 'none', fontWeight: 800,
              fontFamily: 'Montserrat, sans-serif', fontSize: '1rem',
              display: 'inline-flex', alignItems: 'center', gap: '.6rem',
              boxShadow: '0 6px 20px rgba(37,211,102,.35)',
            }}>
              <i className="fab fa-whatsapp" /> WhatsApp directo
            </a>
            <a href="tel:+524778116501" style={{
              background: 'rgba(255,255,255,.12)', backdropFilter: 'blur(8px)',
              color: '#fff', padding: '1rem 2.5rem', borderRadius: '12px',
              textDecoration: 'none', fontWeight: 700, border: '1px solid rgba(255,255,255,.25)',
              fontFamily: 'Montserrat, sans-serif', fontSize: '1rem',
              display: 'inline-flex', alignItems: 'center', gap: '.6rem',
            }}>
              <i className="fa fa-phone" /> Llamar ahora
            </a>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .nosotros-two-col { grid-template-columns: 1fr !important; gap: 2rem !important; }
        }
      `}</style>
    </>
  )
}
