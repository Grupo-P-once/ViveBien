'use client'
import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PropertyCard from '@/components/PropertyCard'
import RegisterModal from '@/components/RegisterModal'
import { useAuth } from '@/lib/useAuth'
import Link from 'next/link'

interface Propiedad {
  id: string
  titulo: string
  tipo: string
  operacion: string
  precio: number
  ubicacion: string
  descripcion?: string
  fotos: string[]
  estatus?: string
  estado?: string
  metros?: number
  m2?: number | string
  recamaras?: number
  banos?: number
  alturaLibre?: number
  andenes?: number
  mantenimiento?: number | string
  amenidades?: string[]
  features?: string[]
  whatsapp?: string
}

const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'

const SECCIONES = [
  { tipo: 'nave', titulo: 'Naves Industriales', icon: 'fa-industry', desc: 'Infraestructura de alto nivel para tu operación logística e industrial', color: '#1B365D' },
  { tipo: 'casa', titulo: 'Casas en Venta', icon: 'fa-house', desc: 'Espacios familiares pensados para ti en las mejores colonias de León', color: '#8B1A1A' },
  { tipo: 'departamento', titulo: 'Departamentos', icon: 'fa-building', desc: 'Vivienda vertical con acabados de primera, ideales para jóvenes y familias', color: '#5B4FCF' },
  { tipo: 'terreno', titulo: 'Terrenos', icon: 'fa-map', desc: 'Lotes residenciales e industriales con ubicación estratégica y alta plusvalía', color: '#279546' },
  { tipo: 'comercial', titulo: 'Locales Comerciales', icon: 'fa-store', desc: 'Espacios estratégicos para que tu negocio crezca en León', color: '#D97706' },
]

function PropiedadesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    op: searchParams.get('op') || '',
    tipo: searchParams.get('tipo') || '',
    zona: searchParams.get('zona') || '',
    precioMin: searchParams.get('pmin') || '',
    precioMax: searchParams.get('pmax') || '',
  })
  const [selected, setSelected] = useState<Propiedad | null>(null)
  const [regOpen, setRegOpen] = useState(false)
  const { isLoggedIn } = useAuth()

  // Sincronizar filtros con la URL
  const syncUrl = useCallback((f: typeof filtros) => {
    const params = new URLSearchParams()
    if (f.op) params.set('op', f.op)
    if (f.tipo) params.set('tipo', f.tipo)
    if (f.zona) params.set('zona', f.zona)
    if (f.precioMin) params.set('pmin', f.precioMin)
    if (f.precioMax) params.set('pmax', f.precioMax)
    const qs = params.toString()
    router.replace(qs ? `/propiedades?${qs}` : '/propiedades', { scroll: false })
  }, [router])

  function updateFiltros(partial: Partial<typeof filtros>) {
    const next = { ...filtros, ...partial }
    setFiltros(next)
    syncUrl(next)
  }

  function limpiarFiltros() {
    const empty = { op: '', tipo: '', zona: '', precioMin: '', precioMax: '' }
    setFiltros(empty)
    router.replace('/propiedades', { scroll: false })
  }

  useEffect(() => {
    cargarPropiedades()
  }, [])

  async function cargarPropiedades() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('propiedades').select('*')
      if (error) throw error
      // Map snake_case → camelCase for backwards compat
      const mapped = (data || []).map((p: any) => ({
        ...p,
        alturaLibre: p.altura_libre,
        m2: p.metros,
      }))
      setPropiedades(mapped)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  function getStatus(p: Propiedad) {
    return p.estatus || p.estado || 'disponible'
  }

  function getNormTipo(p: Propiedad) {
    // normalize 'depto' → 'departamento'
    return p.tipo === 'depto' ? 'departamento' : p.tipo
  }

  function filtrar(lista: Propiedad[], tipo?: string) {
    return lista.filter(p => {
      const st = getStatus(p)
      if (st === 'pausada' || st === 'vendida') return false
      const t = getNormTipo(p)
      if (tipo && t !== tipo) return false
      if (filtros.op && p.operacion !== filtros.op) return false
      if (filtros.tipo && filtros.tipo !== '' && t !== filtros.tipo) return false
      if (filtros.zona && !p.ubicacion?.toLowerCase().includes(filtros.zona.toLowerCase())) return false
      if (filtros.precioMin && p.precio < parseFloat(filtros.precioMin)) return false
      if (filtros.precioMax && p.precio > parseFloat(filtros.precioMax)) return false
      return true
    })
  }

  const hayFiltroActivo = filtros.op || filtros.tipo || filtros.zona || filtros.precioMin || filtros.precioMax
  const totalFiltradas = filtrar(propiedades).length

  return (
    <>
      <Header />
      <RegisterModal isOpen={regOpen} onClose={() => setRegOpen(false)} propertyTitle={selected?.titulo} />

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg,rgba(10,20,40,.72) 0%,rgba(139,26,26,.55) 100%), url("https://images.unsplash.com/photo-1622547748225-3fc4abd2cca0?w=1600&auto=format&fit=crop") center/cover no-repeat',
        padding: '4rem 2rem 3rem', textAlign: 'center', color: '#fff',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <span style={{ background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', padding: '.4rem 1.2rem', borderRadius: '20px', fontSize: '.85rem', fontWeight: 600, letterSpacing: '.08em', marginBottom: '1rem', display: 'inline-block' }}>
            CATÁLOGO COMPLETO
          </span>
          <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,3rem)', lineHeight: 1.15, margin: '.8rem 0 1rem', textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>
            Naves, Casas, Terrenos y más<br />en León, Guanajuato
          </h1>
          <p style={{ fontSize: '1.05rem', opacity: .9 }}>
            {loading ? 'Cargando propiedades...' : `${propiedades.filter(p => (p.estatus || p.estado) === 'disponible').length}+ propiedades disponibles`}
          </p>
        </div>
      </section>

      {/* Sticky filter bar */}
      <div style={{ background: '#1B365D', padding: '.8rem 1.5rem', position: 'sticky', top: '80px', zIndex: 998, boxShadow: '0 4px 16px rgba(0,0,0,.35)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filtros.op} onChange={e => updateFiltros({ op: e.target.value })}
            style={{ padding: '.6rem 1rem', borderRadius: '8px', border: 'none', background: '#fff', color: '#222', fontSize: '.88rem', minWidth: '145px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500 }}>
            <option value="">Comprar o Rentar</option>
            <option value="venta">Comprar</option>
            <option value="renta">Rentar</option>
          </select>
          <select value={filtros.tipo} onChange={e => updateFiltros({ tipo: e.target.value })}
            style={{ padding: '.6rem 1rem', borderRadius: '8px', border: 'none', background: '#fff', color: '#222', fontSize: '.88rem', minWidth: '150px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500 }}>
            <option value="">Todos los tipos</option>
            <option value="nave">Nave/Bodega</option>
            <option value="casa">Casa</option>
            <option value="departamento">Departamento</option>
            <option value="terreno">Terreno</option>
            <option value="comercial">Local Comercial</option>
          </select>
          <input type="text" placeholder="📍 Zona o colonia" value={filtros.zona}
            onChange={e => updateFiltros({ zona: e.target.value })}
            style={{ padding: '.6rem 1rem', borderRadius: '8px', border: 'none', background: '#fff', color: '#222', fontSize: '.88rem', minWidth: '175px', fontFamily: 'inherit' }} />
          <input type="number" placeholder="$ Precio mín." value={filtros.precioMin}
            onChange={e => updateFiltros({ precioMin: e.target.value })}
            style={{ padding: '.6rem 1rem', borderRadius: '8px', border: 'none', background: '#fff', color: '#222', fontSize: '.88rem', width: '120px', fontFamily: 'inherit' }} />
          <input type="number" placeholder="$ Precio máx." value={filtros.precioMax}
            onChange={e => updateFiltros({ precioMax: e.target.value })}
            style={{ padding: '.6rem 1rem', borderRadius: '8px', border: 'none', background: '#fff', color: '#222', fontSize: '.88rem', width: '120px', fontFamily: 'inherit' }} />
          {hayFiltroActivo && (
            <button onClick={limpiarFiltros}
              style={{ padding: '.6rem 1.1rem', background: '#C0392B', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '.85rem', fontWeight: 700 }}>
              ✕ Limpiar
            </button>
          )}
          <span style={{ color: '#fff', fontSize: '.9rem', marginLeft: 'auto', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {hayFiltroActivo ? `${totalFiltradas} resultado${totalFiltradas !== 1 ? 's' : ''}` : `${propiedades.filter(p => (p.estatus || p.estado) === 'disponible').length} disponibles`}
          </span>
        </div>
      </div>

      <main style={{ background: '#F4F6F8' }}>
        {loading ? (
          // ── Skeleton loading ──
          <section style={{ padding: '4rem 2rem' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              {/* Section header skeleton */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', marginBottom: '2.5rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite' }} />
                <div style={{ width: '200px', height: '28px', borderRadius: '8px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: '1.8rem' }}>
                {[1, 2, 3].map(n => (
                  <div key={n} style={{ background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,.06)' }}>
                    <div style={{ height: '220px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite' }} />
                    <div style={{ padding: '1.1rem 1.2rem 1.4rem' }}>
                      <div style={{ height: '18px', width: '80%', borderRadius: '6px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite', marginBottom: '.5rem' }} />
                      <div style={{ height: '14px', width: '60%', borderRadius: '6px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite', marginBottom: '.9rem' }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.9rem' }}>
                        {[1,2].map(x => <div key={x} style={{ height: '16px', borderRadius: '6px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite' }} />)}
                      </div>
                      <div style={{ borderTop: '1px solid #eee', paddingTop: '.85rem', display: 'flex', gap: '8px' }}>
                        <div style={{ height: '34px', flex: 1, borderRadius: '8px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite' }} />
                        <div style={{ height: '34px', width: '34px', borderRadius: '8px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite' }} />
                        <div style={{ height: '34px', width: '34px', borderRadius: '8px', background: 'linear-gradient(90deg,#e8ecf0 25%,#d8dde3 50%,#e8ecf0 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <style>{`
              @keyframes skeletonShimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
          </section>
        ) : hayFiltroActivo ? (
          // Filtered view — flat grid
          <section style={{ padding: '3rem 2rem' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.4rem', color: '#1B365D', marginBottom: '2rem' }}>
                <i className="fa fa-search" style={{ marginRight: '.6rem', color: '#8B1A1A' }} />
                Resultados de búsqueda ({totalFiltradas})
              </h2>
              {totalFiltradas === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#888', background: '#fff', borderRadius: '16px' }}>
                  <i className="fa fa-search" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', opacity: .3 }} />
                  <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>No se encontraron propiedades.</p>
                  <button onClick={limpiarFiltros}
                    style={{ padding: '.7rem 1.5rem', background: '#8B1A1A', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                    Ver todas las propiedades
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: '1.8rem' }}>
                  {filtrar(propiedades).map(p => (
                    <PropertyCard key={p.id} propiedad={p} />
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          // Default view — sections by type
          <>
            {SECCIONES.map(sec => {
              const lista = filtrar(propiedades, sec.tipo)
              if (lista.length === 0) return null
              return (
                <section key={sec.tipo} id={sec.tipo} style={{ padding: '4rem 2rem', borderBottom: '1px solid #E8ECF0' }}>
                  <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', marginBottom: '.5rem' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: sec.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className={`fa ${sec.icon}`} style={{ color: '#fff', fontSize: '1rem' }} />
                          </div>
                          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.4rem,3vw,2rem)', color: '#1B365D', margin: 0 }}>
                            {sec.titulo}
                          </h2>
                        </div>
                        <p style={{ color: '#666', fontSize: '.95rem', margin: 0 }}>{sec.desc}</p>
                      </div>
                      <span style={{ background: sec.color, color: '#fff', padding: '.3rem .8rem', borderRadius: '20px', fontSize: '.8rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {lista.length} disponible{lista.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: '1.8rem' }}>
                      {lista.map(p => (
                        <PropertyCard key={p.id} propiedad={p} />
                      ))}
                    </div>
                  </div>
                </section>
              )
            })}
            {propiedades.filter(p => (p.estatus || p.estado) === 'disponible').length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '6rem 2rem', color: '#888' }}>
                <i className="fa fa-home" style={{ fontSize: '3rem', opacity: .3, display: 'block', marginBottom: '1rem' }} />
                <p>No hay propiedades disponibles por el momento.</p>
              </div>
            )}
          </>
        )}

        {/* Ventajas */}
        <section style={{ padding: '4rem 2rem', background: 'linear-gradient(135deg,#1B365D 0%,#0d1e2c 100%)', color: '#fff' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '1.8rem', marginBottom: '.8rem' }}>¿Por qué elegir Vive Bien?</h2>
            <p style={{ opacity: .75, marginBottom: '3rem' }}>Tu aliado de confianza en el mercado inmobiliario de León</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '2rem' }}>
              {[
                { icon: 'fa-shield-halved', title: '100% Confiable', desc: '15 años de experiencia en el mercado inmobiliario de León.' },
                { icon: 'fa-hands-helping', title: 'Asesoría Integral', desc: 'Te acompañamos desde la búsqueda hasta la firma de escrituras.' },
                { icon: 'fa-tag', title: 'Mejores Precios', desc: 'Propiedades valoradas con transparencia y al precio justo del mercado.' },
                { icon: 'fa-headset', title: 'Atención 24/7', desc: 'Siempre disponibles para resolver tus dudas por WhatsApp o teléfono.' },
              ].map(v => (
                <div key={v.title} style={{ background: 'rgba(255,255,255,.08)', borderRadius: '16px', padding: '2rem', backdropFilter: 'blur(4px)' }}>
                  <i className={`fa ${v.icon}`} style={{ fontSize: '2rem', color: '#C0392B', marginBottom: '1rem', display: 'block' }} />
                  <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, marginBottom: '.5rem' }}>{v.title}</h3>
                  <p style={{ fontSize: '.9rem', opacity: .8, lineHeight: 1.6 }}>{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Modal detalle */}
      {selected && (
        <PropModal p={selected} onClose={() => setSelected(null)} onContact={() => setRegOpen(true)} isLoggedIn={isLoggedIn} />
      )}

      <Footer />
    </>
  )
}

function PropModal({ p, onClose, onContact, isLoggedIn }: { p: Propiedad; onClose: () => void; onContact: () => void; isLoggedIn: boolean }) {
  const [foto, setFoto] = useState(0)
  const fotos = p.fotos?.length ? p.fotos : ['https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200']
  const wa = p.whatsapp || WA_NUMBER

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleKey) }
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} onClick={onClose}>
      <div style={{ background: '#fff', width: '100%', maxWidth: '1000px', maxHeight: '90vh', borderRadius: '24px', overflow: 'hidden', display: 'flex', boxShadow: '0 20px 60px rgba(0,0,0,.6)', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(0,0,0,.15)', border: 'none', width: '38px', height: '38px', borderRadius: '50%', fontSize: '1.1rem', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>

        {/* Gallery */}
        <div style={{ flex: 1.4, background: '#000', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: '-20px', backgroundImage: `url(${fotos[foto]})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(30px) brightness(.35)' }} />
          <img src={fotos[foto]} alt={p.titulo} style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }} />
          {fotos.length > 1 && (
            <>
              <button onClick={() => setFoto(i => (i - 1 + fotos.length) % fotos.length)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 5, background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa fa-chevron-left" /></button>
              <button onClick={() => setFoto(i => (i + 1) % fotos.length)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 5, background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa fa-chevron-right" /></button>
              <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '5px', zIndex: 5 }}>
                {fotos.map((_, i) => <span key={i} onClick={() => setFoto(i)} style={{ width: '7px', height: '7px', borderRadius: '50%', background: i === foto ? '#fff' : 'rgba(255,255,255,.4)', cursor: 'pointer' }} />)}
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, padding: '2.5rem 2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span style={{ background: '#1B365D', color: '#fff', padding: '3px 12px', borderRadius: '20px', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase' }}>{p.tipo}</span>
            <span style={{ background: p.operacion === 'venta' ? '#8B1A1A' : '#279546', color: '#fff', padding: '3px 12px', borderRadius: '20px', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase' }}>{p.operacion === 'venta' ? 'VENTA' : 'RENTA'}</span>
          </div>
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '1.5rem', color: '#1B365D', marginBottom: '.4rem', fontWeight: 800 }}>{p.titulo}</h2>
          <p style={{ color: '#666', fontSize: '.85rem', marginBottom: '1.5rem' }}>
            <i className="fa fa-map-marker-alt" style={{ color: '#8B1A1A', marginRight: '.4rem' }} />{p.ubicacion}
          </p>
          {(p.metros || p.recamaras || p.banos) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem', marginBottom: '1.5rem', padding: '1rem', background: '#F4F6F8', borderRadius: '12px' }}>
              {p.metros && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '.72rem', color: '#888' }}>Superficie</div><strong style={{ fontSize: '1rem' }}>{p.metros} m²</strong></div>}
              {p.recamaras && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '.72rem', color: '#888' }}>Recámaras</div><strong>{p.recamaras}</strong></div>}
              {p.banos && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '.72rem', color: '#888' }}>Baños</div><strong>{p.banos}</strong></div>}
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: '.72rem', color: '#888' }}>Operación</div><strong style={{ textTransform: 'capitalize' }}>{p.operacion}</strong></div>
            </div>
          )}
          {p.descripcion && <p style={{ lineHeight: 1.7, color: '#555', fontSize: '.9rem', marginBottom: '1.5rem' }}>{p.descripcion}</p>}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.8rem', color: '#8B1A1A', marginBottom: '1rem' }}>
              {p.precio ? `$${p.precio.toLocaleString('es-MX')}` : 'Consultar precio'}
            </div>
            {!isLoggedIn && (
              <div style={{ marginBottom: '.8rem', padding: '.5rem .8rem', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', fontSize: '.8rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <i className="fa fa-lock" style={{ fontSize: '.75rem' }} />
                <span><strong>Inicia sesión</strong> para contactar al asesor</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
              {isLoggedIn ? (
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent('Hola, me interesa la propiedad: ' + p.titulo)}`} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, minWidth: '120px', background: '#25D366', color: '#fff', textAlign: 'center', padding: '.85rem', borderRadius: '10px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', fontFamily: 'Montserrat, sans-serif' }}>
                  <i className="fab fa-whatsapp" /> WhatsApp
                </a>
              ) : (
                <button onClick={onContact}
                  style={{ flex: 1, minWidth: '120px', background: '#25D366', color: '#fff', border: 'none', padding: '.85rem', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
                  <i className="fab fa-whatsapp" /> WhatsApp
                </button>
              )}
              <button onClick={onContact} style={{ flex: 1, minWidth: '120px', background: '#8B1A1A', color: '#fff', border: 'none', padding: '.85rem', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}>
                <i className="fa fa-envelope" style={{ marginRight: '.4rem' }} />Contactar
              </button>
            </div>
            <Link href={`/propiedades/${p.id}`} style={{ display: 'block', textAlign: 'center', marginTop: '.8rem', color: '#1B365D', fontWeight: 600, fontSize: '.85rem', textDecoration: 'underline' }}>
              Ver página completa →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PropiedadesPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#8B1A1A' }} /></div>}>
      <PropiedadesContent />
    </Suspense>
  )
}
