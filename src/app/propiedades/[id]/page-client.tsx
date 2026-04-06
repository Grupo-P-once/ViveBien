'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { useAuth } from '@/lib/useAuth'
import RegisterModal from '@/components/RegisterModal'

interface Propiedad {
  id: string
  titulo: string
  tipo: string
  operacion: string
  precio: number
  ubicacion: string
  descripcion?: string
  fotos: string[]
  estatus: string
  metros?: number
  recamaras?: number
  banos?: number
  alturaLibre?: number
  altura_libre?: number
  andenes?: number
  amenidades?: string[]
  whatsapp?: string
  mantenimiento?: number
}

const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'
const PLACEHOLDER = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&auto=format&fit=crop'

const tipoLabel: Record<string, string> = {
  nave: 'Nave Industrial', casa: 'Casa', terreno: 'Terreno',
  comercial: 'Local Comercial', departamento: 'Departamento',
}
const tipoColor: Record<string, string> = {
  nave: '#1B365D', casa: '#8B1A1A', terreno: '#279546',
  comercial: '#D97706', departamento: '#5B4FCF',
}

export default function DetallePropiedad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [prop, setProp] = useState<Propiedad | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [mainFoto, setMainFoto] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', mensaje: 'Estoy interesado en esta propiedad. Por favor, contáctenme.' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState('')
  const [regOpen, setRegOpen] = useState(false)
  const { isLoggedIn } = useAuth()

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('propiedades')
          .select('*')
          .eq('id', id)
          .single()
        if (error) throw error
        if (data) {
          setProp({ ...data, alturaLibre: data.altura_libre } as Propiedad)
        }
      } catch (e) {
        console.error('Error cargando propiedad:', e)
        setFetchError(true)
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function enviarSolicitud(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.telefono) return
    setSending(true)
    setSendError('')
    try {
      const { error } = await supabase.from('leads').insert({
        nombre: form.nombre,
        telefono: form.telefono,
        email: form.email,
        mensaje: form.mensaje,
        propiedad_id: id,
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      console.error('Error enviando solicitud:', err)
      setSendError('No se pudo enviar. Por favor contáctanos por WhatsApp.')
    }
    setSending(false)
  }

  function handleContactClick(action: () => void) {
    if (isLoggedIn) { action() } else { setRegOpen(true) }
  }

  if (loading) return (
    <>
      <Header />
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa fa-spinner fa-spin" style={{ fontSize: '2.5rem', color: '#1B365D', display: 'block', marginBottom: '1rem' }} />
          <p style={{ color: '#666' }}>Cargando propiedad...</p>
        </div>
      </div>
      <Footer />
    </>
  )

  if (fetchError) return (
    <>
      <Header />
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <i className="fa fa-wifi" style={{ fontSize: '3rem', color: '#ddd' }} />
        <h2 style={{ color: '#555', fontFamily: 'Montserrat, sans-serif' }}>Error al cargar la propiedad</h2>
        <p style={{ color: '#888', maxWidth: '380px' }}>No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => window.location.reload()} style={{ background: '#1B365D', color: '#fff', padding: '.7rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            <i className="fa fa-redo" style={{ marginRight: '.5rem' }} />Reintentar
          </button>
          <Link href="/propiedades" style={{ background: '#8B1A1A', color: '#fff', padding: '.7rem 1.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}>
            Ver todas las propiedades
          </Link>
        </div>
      </div>
      <Footer />
    </>
  )

  if (!prop) return (
    <>
      <Header />
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <i className="fa fa-home" style={{ fontSize: '4rem', color: '#ddd' }} />
        <h2 style={{ color: '#888', fontFamily: 'Montserrat, sans-serif' }}>Propiedad no encontrada</h2>
        <p style={{ color: '#aaa' }}>Es posible que haya sido removida o el enlace sea incorrecto.</p>
        <Link href="/propiedades" style={{ background: '#8B1A1A', color: '#fff', padding: '.7rem 1.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}>
          Ver todas las propiedades
        </Link>
      </div>
      <Footer />
    </>
  )

  const fotos = prop.fotos?.length ? prop.fotos : [PLACEHOLDER]
  const wa = prop.whatsapp || WA_NUMBER
  const waMsg = encodeURIComponent(`Hola, me interesa la propiedad: ${prop.titulo} (ID: ${id})`)
  const color = tipoColor[prop.tipo] || '#1B365D'

  return (
    <>
      <Header />
      <RegisterModal isOpen={regOpen} onClose={() => setRegOpen(false)} propertyTitle={prop.titulo} />

      {/* Breadcrumb */}
      <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '.75rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', fontSize: '.85rem', color: '#888' }}>
          <Link href="/" style={{ color: '#1B365D', textDecoration: 'none' }}>Inicio</Link>
          <span style={{ margin: '0 .5rem' }}>›</span>
          <Link href="/propiedades" style={{ color: '#1B365D', textDecoration: 'none' }}>Propiedades</Link>
          <span style={{ margin: '0 .5rem' }}>›</span>
          <span style={{ color: '#333' }}>{prop.titulo}</span>
        </div>
      </div>

      {/* Gallery */}
      <div style={{ background: '#0a0a0a', maxHeight: '520px', overflow: 'hidden' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 280px', gap: '4px', padding: '4px', height: '480px' }} className="gallery-grid">
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px 0 0 12px', cursor: 'pointer' }} onClick={() => setLightbox(mainFoto)}>
            <img src={fotos[mainFoto]} alt={prop.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .3s' }}
              onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER }}
              onMouseEnter={e => { (e.target as HTMLImageElement).style.transform = 'scale(1.02)' }}
              onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = '' }} />
            {fotos.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); setMainFoto(i => (i - 1 + fotos.length) % fotos.length) }} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa fa-chevron-left" />
                </button>
                <button onClick={e => { e.stopPropagation(); setMainFoto(i => (i + 1) % fotos.length) }} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa fa-chevron-right" />
                </button>
              </>
            )}
            <span style={{ position: 'absolute', bottom: '12px', right: '12px', background: 'rgba(0,0,0,.6)', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontSize: '.78rem', fontWeight: 600 }}>
              {mainFoto + 1} / {fotos.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {fotos.slice(0, 2).map((f, i) => (
              <div key={i} onClick={() => setMainFoto(i)} style={{ flex: 1, overflow: 'hidden', borderRadius: i === 0 ? '0 12px 0 0' : '0 0 12px 0', cursor: 'pointer', position: 'relative', border: mainFoto === i ? '3px solid #C0392B' : 'none' }}>
                <img src={f} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .3s', display: 'block' }}
                  onMouseEnter={e => { (e.target as HTMLImageElement).style.transform = 'scale(1.05)' }}
                  onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = '' }} />
              </div>
            ))}
            {fotos.length > 2 && (
              <div onClick={() => setLightbox(2)} style={{ flex: 0.5, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '0 0 12px 0', color: '#fff', fontWeight: 700, fontSize: '.9rem' }}>
                +{fotos.length - 2} fotos
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ background: '#F4F6F8', padding: '2.5rem 2rem 4rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2.5rem', alignItems: 'start' }} className="detail-grid">

          {/* Left: Info */}
          <div>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span style={{ background: color, color: '#fff', padding: '4px 14px', borderRadius: '20px', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase' }}>{tipoLabel[prop.tipo] || prop.tipo}</span>
              <span style={{ background: prop.operacion === 'venta' ? '#8B1A1A' : '#279546', color: '#fff', padding: '4px 14px', borderRadius: '20px', fontSize: '.75rem', fontWeight: 800 }}>{prop.operacion === 'venta' ? 'EN VENTA' : 'EN RENTA'}</span>
              <span style={{ background: '#e6f4ea', color: '#279546', padding: '4px 14px', borderRadius: '20px', fontSize: '.75rem', fontWeight: 700 }}>● Disponible</span>
            </div>

            <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.5rem,3vw,2.2rem)', color: '#1B365D', marginBottom: '.7rem', lineHeight: 1.2 }}>{prop.titulo}</h1>
            <p style={{ color: '#666', marginBottom: '2rem', fontSize: '1rem' }}>
              <i className="fa fa-map-marker-alt" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />
              {prop.ubicacion}
            </p>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
              {[
                prop.metros ? { icon: 'fa-ruler-combined', val: `${prop.metros} m²`, label: 'Superficie' } : null,
                prop.recamaras ? { icon: 'fa-bed', val: prop.recamaras, label: 'Recámaras' } : null,
                prop.banos ? { icon: 'fa-bath', val: prop.banos, label: 'Baños' } : null,
                (prop.alturaLibre || prop.altura_libre) ? { icon: 'fa-arrows-up-down', val: `${prop.alturaLibre || prop.altura_libre} m`, label: 'Altura libre' } : null,
                prop.andenes ? { icon: 'fa-truck-loading', val: prop.andenes, label: 'Andenes' } : null,
              ].filter(Boolean).map((s: any) => (
                <div key={s.label} style={{ background: '#fff', borderRadius: '12px', padding: '1.2rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.06)', border: '1px solid #EEE' }}>
                  <i className={`fa ${s.icon}`} style={{ fontSize: '1.3rem', color: color, marginBottom: '.4rem', display: 'block' }} />
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.1rem', color: '#222' }}>{s.val}</div>
                  <div style={{ fontSize: '.73rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {prop.descripcion && (
              <div style={{ background: '#fff', borderRadius: '16px', padding: '1.8rem', marginBottom: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
                <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: '#1B365D', marginBottom: '1rem', fontSize: '1.1rem' }}>
                  <i className="fa fa-info-circle" style={{ marginRight: '.5rem', color: '#8B1A1A' }} />Sobre esta propiedad
                </h3>
                <p style={{ lineHeight: 1.8, color: '#555', fontSize: '.95rem' }}>{prop.descripcion}</p>
              </div>
            )}

            {prop.amenidades && prop.amenidades.length > 0 && (
              <div style={{ background: '#fff', borderRadius: '16px', padding: '1.8rem', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
                <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: '#1B365D', marginBottom: '1.2rem', fontSize: '1.1rem' }}>
                  <i className="fa fa-star" style={{ marginRight: '.5rem', color: '#8B1A1A' }} />Amenidades y Características
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '.7rem' }}>
                  {prop.amenidades.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.6rem .8rem', background: '#F4F6F8', borderRadius: '8px', fontSize: '.88rem', fontWeight: 600, color: '#333' }}>
                      <i className="fa fa-check-circle" style={{ color: '#279546', flexShrink: 0 }} />
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Sticky contact panel */}
          <div style={{ position: 'sticky', top: '100px' }}>
            <div style={{ background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}>
              <div style={{ background: color, padding: '1.5rem', color: '#fff', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '1.8rem' }}>
                  {prop.precio ? `$${prop.precio.toLocaleString('es-MX')}` : 'Consultar precio'}
                </div>
                {prop.mantenimiento && <div style={{ fontSize: '.8rem', opacity: .85, marginTop: '.3rem' }}>+ ${prop.mantenimiento.toLocaleString('es-MX')} mantenimiento</div>}
                <div style={{ fontSize: '.78rem', opacity: .75, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  {prop.operacion === 'venta' ? 'Precio de venta' : 'Renta mensual'}
                </div>
              </div>

              {/* Banner de sesión requerida */}
              {!isLoggedIn && (
                <div style={{ background: '#FFF7ED', borderBottom: '1px solid #FED7AA', padding: '.7rem 1.2rem', display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem', color: '#92400e' }}>
                  <i className="fa fa-lock" />
                  <span><strong>Inicia sesión</strong> para ver los datos de contacto del asesor</span>
                </div>
              )}

              {sent ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <i className="fa fa-check-circle" style={{ fontSize: '3rem', color: '#279546', display: 'block', marginBottom: '1rem' }} />
                  <h3 style={{ fontFamily: 'Montserrat, sans-serif', color: '#1B365D', marginBottom: '.5rem' }}>¡Solicitud enviada!</h3>
                  <p style={{ color: '#666', fontSize: '.9rem', marginBottom: '1.5rem' }}>Un asesor te contactará a la brevedad.</p>
                  <button onClick={() => handleContactClick(() => window.open(`https://wa.me/${wa}?text=${waMsg}`, '_blank'))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', background: '#25D366', color: '#fff', padding: '.85rem', borderRadius: '10px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', border: 'none', cursor: 'pointer', width: '100%' }}>
                    <i className="fab fa-whatsapp" /> También por WhatsApp
                  </button>
                </div>
              ) : (
                <form onSubmit={enviarSolicitud} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
                  {[
                    { key: 'nombre', label: 'NOMBRE COMPLETO', type: 'text', icon: 'fa-user', placeholder: 'Ej. Juan Pérez', required: true },
                    { key: 'telefono', label: 'WHATSAPP / TELÉFONO', type: 'tel', icon: 'fa-phone', placeholder: '477 123 4567', required: true },
                    { key: 'email', label: 'CORREO ELECTRÓNICO', type: 'email', icon: 'fa-envelope', placeholder: 'correo@ejemplo.com', required: false },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: '.72rem', fontWeight: 700, color: '#888', letterSpacing: '.06em', display: 'block', marginBottom: '.3rem' }}>
                        <i className={`fa ${f.icon}`} style={{ marginRight: '.3rem', color: color }} />{f.label}
                      </label>
                      <input type={f.type} required={f.required} value={(form as any)[f.key]} placeholder={f.placeholder}
                        onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '.65rem .85rem', border: '1.5px solid #E0E4EA', borderRadius: '8px', fontSize: '.9rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: '.72rem', fontWeight: 700, color: '#888', letterSpacing: '.06em', display: 'block', marginBottom: '.3rem' }}>
                      <i className="fa fa-comment" style={{ marginRight: '.3rem', color: color }} />DUDAS O COMENTARIOS
                    </label>
                    <textarea rows={3} value={form.mensaje} onChange={e => setForm(v => ({ ...v, mensaje: e.target.value }))}
                      style={{ width: '100%', padding: '.65rem .85rem', border: '1.5px solid #E0E4EA', borderRadius: '8px', fontSize: '.9rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  {sendError && (
                    <p style={{ color: '#991b1b', background: '#fef2f2', padding: '.6rem .8rem', borderRadius: '8px', fontSize: '.82rem', fontWeight: 600 }}>
                      <i className="fa fa-exclamation-circle" style={{ marginRight: '.4rem' }} />{sendError}
                    </p>
                  )}
                  <button type="submit" disabled={sending} style={{ background: color, color: '#fff', border: 'none', padding: '.9rem', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '.95rem', fontFamily: 'Montserrat, sans-serif', opacity: sending ? .7 : 1 }}>
                    <i className="fa fa-paper-plane" style={{ marginRight: '.5rem' }} />{sending ? 'Enviando...' : 'ENVIAR SOLICITUD'}
                  </button>
                  <button type="button" onClick={() => handleContactClick(() => window.open(`https://wa.me/${wa}?text=${waMsg}`, '_blank'))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', background: '#25D366', color: '#fff', padding: '.8rem', borderRadius: '10px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', fontSize: '.9rem', border: 'none', cursor: 'pointer' }}>
                    <i className="fab fa-whatsapp" /> HABLAR POR WHATSAPP
                  </button>
                  <button type="button" onClick={() => handleContactClick(() => { window.location.href = `tel:+${wa}` })}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', background: 'transparent', color: '#1B365D', padding: '.8rem', borderRadius: '10px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', fontSize: '.9rem', border: '1.5px solid #1B365D', cursor: 'pointer' }}>
                    <i className="fa fa-phone" /> LLAMAR AHORA
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: '44px', height: '44px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
          <button onClick={e => { e.stopPropagation(); setLightbox(i => (i! - 1 + fotos.length) % fotos.length) }} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: '50px', height: '50px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer' }}>&#8249;</button>
          <img src={fotos[lightbox]} alt="" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }} onClick={e => e.stopPropagation()} />
          <button onClick={e => { e.stopPropagation(); setLightbox(i => (i! + 1) % fotos.length) }} style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: '50px', height: '50px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer' }}>&#8250;</button>
          <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px' }}>
            {fotos.map((_, i) => <span key={i} onClick={e => { e.stopPropagation(); setLightbox(i) }} style={{ width: '8px', height: '8px', borderRadius: '50%', background: i === lightbox ? '#fff' : 'rgba(255,255,255,.4)', cursor: 'pointer' }} />)}
          </div>
        </div>
      )}

      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .detail-grid { grid-template-columns: 1fr !important; }
          .gallery-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  )
}
