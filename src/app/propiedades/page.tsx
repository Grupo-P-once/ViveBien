'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PropertyCard from '@/components/PropertyCard'
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
  whatsapp?: string
}

const WA_NUMBER = '524778116501'

function PropiedadesContent() {
  const searchParams = useSearchParams()
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    op: searchParams.get('op') || '',
    tipo: searchParams.get('tipo') || '',
    zona: searchParams.get('zona') || '',
  })
  const [selected, setSelected] = useState<Propiedad | null>(null)
  const [regOpen, setRegOpen] = useState(false)

  useEffect(() => {
    cargarPropiedades()
  }, [])

  async function cargarPropiedades() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'propiedades'))
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Propiedad))
      setPropiedades(data)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const filtradas = propiedades.filter(p => {
    if (p.estatus === 'pausada') return false
    if (filtros.op && p.operacion !== filtros.op) return false
    if (filtros.tipo && p.tipo !== filtros.tipo) return false
    if (filtros.zona && !p.ubicacion?.toLowerCase().includes(filtros.zona.toLowerCase())) return false
    return true
  })

  return (
    <>
      <Header />
      <RegisterModal isOpen={regOpen} onClose={() => setRegOpen(false)} propertyTitle={selected?.titulo} />

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg,rgba(139,26,26,.72) 0%,rgba(61,90,115,.68) 100%), url("https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1600&auto=format&fit=crop") center/cover no-repeat',
        padding: '5rem 2rem', textAlign: 'center', color: '#fff',
        minHeight: '35vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: 'clamp(2rem,5vw,3.6rem)', lineHeight: 1.15, marginBottom: '1rem', textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>
            Catálogo de Propiedades
          </h1>
          <p style={{ fontSize: 'clamp(1rem,2.5vw,1.25rem)', opacity: .92 }}>
            Naves industriales, casas, terrenos y locales en León y el Bajío
          </p>
        </div>
      </section>

      {/* Filtros sticky */}
      <div style={{ background: '#1B365D', padding: '.75rem 1rem', position: 'sticky', top: '80px', zIndex: 998 }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filtros.op} onChange={e => setFiltros(f => ({ ...f, op: e.target.value }))}
            style={{ padding: '.6rem 1rem', borderRadius: '8px', border: 'none', fontSize: '.9rem', minWidth: '130px' }}>
            <option value="">Comprar o Rentar</option>
            <option value="venta">Comprar</option>
            <option value="renta">Rentar</option>
          </select>
          <select value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}
            style={{ padding: '.6rem 1rem', borderRadius: '8px', border: 'none', fontSize: '.9rem', minWidth: '130px' }}>
            <option value="">Todos los tipos</option>
            <option value="casa">Casa</option>
            <option value="nave">Nave/Bodega</option>
            <option value="terreno">Terreno</option>
            <option value="comercial">Local</option>
          </select>
          <input type="text" placeholder="Zona o colonia" value={filtros.zona}
            onChange={e => setFiltros(f => ({ ...f, zona: e.target.value }))}
            style={{ padding: '.6rem 1rem', borderRadius: '8px', border: 'none', fontSize: '.9rem', minWidth: '180px' }} />
          <button onClick={() => setFiltros({ op: '', tipo: '', zona: '' })}
            style={{ padding: '.6rem 1rem', background: 'transparent', color: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '.85rem' }}>
            Limpiar
          </button>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: '.85rem', marginLeft: 'auto' }}>
            {filtradas.length} propiedad{filtradas.length !== 1 ? 'es' : ''}
          </span>
        </div>
      </div>

      {/* Grid */}
      <main style={{ background: '#F4F6F8', minHeight: '60vh', padding: '3rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>
              <i className="fa fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block' }} />
              Cargando propiedades...
            </div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>
              <i className="fa fa-search" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', opacity: .3 }} />
              <p>No se encontraron propiedades con esos filtros.</p>
              <button onClick={() => setFiltros({ op: '', tipo: '', zona: '' })}
                style={{ marginTop: '1rem', padding: '.6rem 1.5rem', background: '#8B1A1A', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                Ver todas
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1.8rem' }}>
              {filtradas.map(p => (
                <PropertyCard
                  key={p.id}
                  propiedad={p}
                  onClick={() => { setSelected(p); setRegOpen(false) }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal detalle */}
      {selected && (
        <PropModal p={selected} onClose={() => setSelected(null)} onContact={() => { setRegOpen(true) }} />
      )}

      <Footer />
    </>
  )
}

function PropModal({ p, onClose, onContact }: { p: Propiedad; onClose: () => void; onContact: () => void }) {
  const [foto, setFoto] = useState(0)
  const fotos = p.fotos?.length ? p.fotos : ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800']
  const wa = p.whatsapp || WA_NUMBER
  const waMsg = `Hola, me interesa la propiedad: ${p.titulo}`

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
      backdropFilter: 'blur(8px)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', width: '100%', maxWidth: '1000px', height: '85vh',
        borderRadius: '24px', overflow: 'hidden', display: 'flex',
        boxShadow: '0 20px 50px rgba(0,0,0,.5)', position: 'relative',
      }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '20px', right: '20px', background: 'rgba(0,0,0,.1)',
          border: 'none', width: '40px', height: '40px', borderRadius: '50%',
          fontSize: '1.2rem', cursor: 'pointer', zIndex: 10, transition: 'background .2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = '#8B1A1A'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,.1)'; e.currentTarget.style.color = '' }}
        >×</button>

        {/* Gallery */}
        <div style={{ flex: 1.4, background: '#0a0a0a', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Blurred background */}
          <div style={{
            position: 'absolute', inset: '-20px',
            backgroundImage: `url(${fotos[foto]})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(30px) brightness(.4)', opacity: .7,
          }} />
          <img src={fotos[foto]} alt={p.titulo} style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }} />
          {fotos.length > 1 && (
            <>
              <button onClick={() => setFoto(i => (i - 1 + fotos.length) % fotos.length)} style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 5,
                background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: '50%',
                width: '36px', height: '36px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><i className="fa fa-chevron-left" /></button>
              <button onClick={() => setFoto(i => (i + 1) % fotos.length)} style={{
                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 5,
                background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: '50%',
                width: '36px', height: '36px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><i className="fa fa-chevron-right" /></button>
              <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px', zIndex: 5 }}>
                {fotos.map((_, i) => (
                  <span key={i} onClick={() => setFoto(i)} style={{
                    width: '8px', height: '8px', borderRadius: '50%', cursor: 'pointer',
                    background: i === foto ? '#fff' : 'rgba(255,255,255,.4)', transition: 'background .2s',
                  }} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, padding: '3rem 2.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontFamily: 'var(--font-montserrat)', fontSize: '1.8rem', color: '#8B1A1A', marginBottom: '.5rem' }}>{p.titulo}</h2>
          <span style={{ color: '#1B365D', fontWeight: 600, marginBottom: '2rem', display: 'block' }}>
            <i className="fa fa-map-marker-alt" style={{ marginRight: '.4rem' }} />{p.ubicacion}
          </span>
          {p.descripcion && (
            <p style={{ lineHeight: 1.6, color: '#555', marginBottom: '2rem' }}>{p.descripcion}</p>
          )}
          {(p.metros || p.recamaras || p.banos) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2.5rem', padding: '1.5rem', background: '#F4F6F8', borderRadius: '16px' }}>
              {p.metros && <div><span style={{ fontSize: '.75rem', color: '#888', display: 'block' }}>Superficie</span><strong>{p.metros} m²</strong></div>}
              {p.recamaras && <div><span style={{ fontSize: '.75rem', color: '#888', display: 'block' }}>Recámaras</span><strong>{p.recamaras}</strong></div>}
              {p.banos && <div><span style={{ fontSize: '.75rem', color: '#888', display: 'block' }}>Baños</span><strong>{p.banos}</strong></div>}
              <div><span style={{ fontSize: '.75rem', color: '#888', display: 'block' }}>Operación</span><strong style={{ textTransform: 'capitalize' }}>{p.operacion}</strong></div>
            </div>
          )}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '2rem', fontWeight: 800, color: '#8B1A1A', marginBottom: '1rem' }}>
              {p.precio ? `$${p.precio.toLocaleString('es-MX')}` : 'Consultar precio'}
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(waMsg)}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  flex: 1, background: '#25D366', color: '#fff', textAlign: 'center',
                  padding: '1rem', borderRadius: '12px', fontWeight: 700,
                  fontFamily: 'var(--font-montserrat)', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
                }}>
                <i className="fab fa-whatsapp" /> WhatsApp
              </a>
              <button onClick={onContact} style={{
                flex: 1, background: '#8B1A1A', color: '#fff', border: 'none',
                padding: '1rem', borderRadius: '12px', fontWeight: 700,
                fontFamily: 'var(--font-montserrat)', cursor: 'pointer',
              }}>
                <i className="fa fa-envelope" style={{ marginRight: '.4rem' }} />Contactar
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 800px) {
          .modal-flex { flex-direction: column !important; }
        }
      `}</style>
    </div>
  )
}

export default function PropiedadesPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className="fa fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#8B1A1A' }} />
      </div>
    }>
      <PropiedadesContent />
    </Suspense>
  )
}
