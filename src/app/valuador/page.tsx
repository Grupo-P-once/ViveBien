'use client'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'

const WA_NUMBER = '524778116501'

const ZONAS: Record<string, { label: string; min: number; max: number }> = {
  popular:     { label: 'Zona Popular / Periferia',                 min: 1500,  max: 3500  },
  industrial:  { label: 'Zona Industrial / Bodegas',                min: 2000,  max: 4500  },
  centro:      { label: 'Zona Centro / Tradicional',                min: 3500,  max: 6000  },
  residencial: { label: 'Zona Residencial / Norte / Campestre',     min: 5000,  max: 12000 },
}

export default function ValuadorPage() {
  const [zona, setZona] = useState('')
  const [m2, setM2] = useState('')
  const [resultado, setResultado] = useState<{ min: number; max: number } | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [tipo, setTipo] = useState('casa')
  const [comparables, setComparables] = useState<number>(0)
  const [loadingComp, setLoadingComp] = useState(false)

  // Lead capture after result
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')

  async function calcular() {
    const z = ZONAS[zona]
    const metros = parseFloat(m2)
    if (!z || !metros || isNaN(metros) || metros <= 0) {
      alert('Por favor, selecciona una zona y escribe una cantidad válida de metros cuadrados.')
      return
    }
    const min = z.min * metros
    const max = z.max * metros
    setResultado({ min, max })
    // Load real comparables from Supabase
    setLoadingComp(true)
    try {
      const { count } = await supabase
        .from('propiedades')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', tipo)
        .eq('estatus', 'disponible')
        .gte('precio', min * 0.7)
        .lte('precio', max * 1.3)
      setComparables(count || 0)
    } catch { setComparables(0) }
    setLoadingComp(false)
  }

  async function solicitarAvaluo() {
    const msg = `Hola Vive Bien. Usé el Valuador web y me gustaría solicitar un avalúo oficial. Tipo: ${tipo}, Zona: ${ZONAS[zona]?.label || zona}, ${m2}m².`
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')
    if (nombre && telefono) {
      try {
        await supabase.from('leads').insert({
          nombre, telefono, interes: `avaluo - ${tipo}`, origen: 'valuador',
        })
        setGuardado(true)
      } catch { }
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

  return (
    <>
      <Header />

      {/* Hero */}
      <section style={{ position: 'relative', height: '42vh', minHeight: '340px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <img
            src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,8,8,.92) 0%, rgba(8,8,8,.65) 60%, rgba(8,8,8,.2) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 60%)' }} />
        <div className="hero-top-line" />
        <div style={{ position: 'relative', zIndex: 2, padding: '0 max(4vw, 2rem) 3.5rem', maxWidth: '740px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', marginBottom: '1rem' }}>
            <div style={{ width: '28px', height: '2px', background: '#C9A96E', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '.68rem', letterSpacing: '3.5px', textTransform: 'uppercase', color: '#C9A96E' }}>
              Herramienta gratuita · León, Gto.
            </span>
          </div>
          <h1 style={{ margin: '0 0 .8rem', lineHeight: 1.08 }}>
            <span style={{ display: 'block', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,3rem)', color: '#fff', letterSpacing: '-.02em' }}>
              Valuador
            </span>
            <span style={{ display: 'block', fontFamily: '"Playfair Display", Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(1.8rem,4vw,3rem)', color: '#C9A96E' }}>
              de Propiedades
            </span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,.72)', fontSize: '.95rem', lineHeight: 1.7, maxWidth: '440px', margin: 0 }}>
            Estima el valor comercial de tu propiedad en León, Guanajuato según zona y metros cuadrados.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <main style={{ background: '#EDEAE5', padding: '2rem 1rem 4rem', minHeight: '60vh' }}>
        <div style={{
          maxWidth: '800px', margin: '-2rem auto 0',
          background: '#fff', padding: '3rem',
          borderRadius: '0', boxShadow: '0 10px 40px rgba(0,0,0,.08)',
          position: 'relative', zIndex: 10,
          borderTop: '3px solid #8B1A1A',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Zona */}
            <div>
              <label style={{ display: 'block', fontWeight: 700, color: '#1B365D', marginBottom: '.5rem', fontFamily: 'var(--font-montserrat)' }}>
                Zona de la ciudad
              </label>
              <select value={zona} onChange={e => { setZona(e.target.value); setResultado(null) }}
                style={{ width: '100%', padding: '12px 15px', border: '1.5px solid #E0E0E0', borderRadius: '8px', fontSize: '1rem', color: '#333', fontFamily: 'inherit', transition: 'border-color .3s' }}
                onFocus={e => (e.target.style.borderColor = '#1B365D')}
                onBlur={e => (e.target.style.borderColor = '#E0E0E0')}>
                <option value="" disabled>Selecciona una zona...</option>
                {Object.entries(ZONAS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            {/* Metros */}
            <div>
              <label style={{ display: 'block', fontWeight: 700, color: '#1B365D', marginBottom: '.5rem', fontFamily: 'var(--font-montserrat)' }}>
                Metros Cuadrados (m²)
              </label>
              <input type="number" value={m2} onChange={e => { setM2(e.target.value); setResultado(null) }}
                placeholder="Ej. 120" min="1"
                style={{ width: '100%', padding: '12px 15px', border: '1.5px solid #E0E0E0', borderRadius: '8px', fontSize: '1rem', color: '#333', fontFamily: 'inherit', transition: 'border-color .3s' }}
                onFocus={e => (e.target.style.borderColor = '#1B365D')}
                onBlur={e => (e.target.style.borderColor = '#E0E0E0')} />
            </div>
          </div>

          {/* Tipo de propiedad */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 700, color: '#1B365D', marginBottom: '.5rem', fontFamily: 'var(--font-montserrat)' }}>
              Tipo de propiedad
            </label>
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
              {[
                { value: 'casa', label: '🏠 Casa' },
                { value: 'nave', label: '🏭 Nave/Bodega' },
                { value: 'terreno', label: '🗺️ Terreno' },
                { value: 'comercial', label: '🏪 Local Comercial' },
                { value: 'departamento', label: '🏢 Departamento' },
              ].map(t => (
                <button key={t.value} type="button" onClick={() => { setTipo(t.value); setResultado(null) }}
                  style={{
                    padding: '.5rem 1rem', borderRadius: '8px', border: '2px solid',
                    borderColor: tipo === t.value ? '#1B365D' : '#E0E0E0',
                    background: tipo === t.value ? '#1B365D' : '#fff',
                    color: tipo === t.value ? '#fff' : '#555',
                    cursor: 'pointer', fontWeight: 600, fontSize: '.88rem', transition: 'all .2s',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={calcular} style={{
            width: '100%', background: '#8B1A1A', color: '#fff',
            border: 'none', padding: '15px', fontFamily: 'var(--font-montserrat)',
            fontSize: '1.05rem', fontWeight: 800, borderRadius: '0',
            cursor: 'pointer', marginTop: '1rem', display: 'flex',
            justifyContent: 'center', alignItems: 'center', gap: '10px',
            transition: 'background .3s', letterSpacing: '.06em',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#C0392B')}
            onMouseLeave={e => (e.currentTarget.style.background = '#8B1A1A')}
          >
            <i className="fa fa-calculator" /> Calcular Estimado
          </button>

          {/* Result */}
          {resultado && (
            <div style={{
              marginTop: '2.5rem', padding: '2rem',
              background: '#EDEAE5', borderRadius: '0',
              borderLeft: '4px solid #8B1A1A',
              animation: 'fadeInResult .5s ease forwards',
            }}>
              <div className="editorial-label" style={{ justifyContent: 'center' }}>Estimación de Valor de Mercado</div>
              <h2 style={{ fontSize: '1.15rem', color: '#1B365D', fontWeight: 900, marginBottom: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-montserrat)', letterSpacing: '-.01em' }}>
                <span style={{ fontFamily: '"Playfair Display", Georgia, serif', fontStyle: 'italic', color: '#8B1A1A' }}>Resultado</span> de tu propiedad
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.03)' }}>
                  <p style={{ fontSize: '.85rem', color: '#666', marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>
                    Valor Mínimo Estimado
                  </p>
                  <h3 style={{ fontSize: '1.6rem', color: '#8B1A1A', fontFamily: 'var(--font-montserrat)', fontWeight: 800 }}>
                    {fmt(resultado.min)}
                  </h3>
                </div>
                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.03)' }}>
                  <p style={{ fontSize: '.85rem', color: '#666', marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>
                    Valor Máximo Estimado
                  </p>
                  <h3 style={{ fontSize: '1.6rem', color: '#8B1A1A', fontFamily: 'var(--font-montserrat)', fontWeight: 800 }}>
                    {fmt(resultado.max)}
                  </h3>
                </div>
              </div>

              <div style={{ fontSize: '.85rem', color: '#555', textAlign: 'center', background: '#FFF3CD', padding: '1rem', borderRadius: '8px', border: '1px solid #FFEEBA', marginBottom: '1.5rem' }}>
                <i className="fa fa-circle-info" style={{ color: '#d39e00', marginRight: '5px' }} />
                <strong>Aviso Importante:</strong> Estos valores son rangos <strong>referenciales y no oficiales</strong> basados en estimaciones comerciales de mercado. Factores como acabados, conservación y ubicación exacta pueden alterar este valor. Para un Avalúo Oficial certificado en León, se requiere una visita presencial.
              </div>

              {/* Comparables reales de Supabase */}
              <div style={{ marginBottom: '1.2rem', padding: '.85rem 1.1rem', background: '#EFF6FF', borderRadius: '10px', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', gap: '.7rem', fontSize: '.88rem' }}>
                <i className="fa fa-database" style={{ color: '#1B365D', fontSize: '1rem', flexShrink: 0 }} />
                {loadingComp ? (
                  <span style={{ color: '#555' }}>Buscando propiedades similares...</span>
                ) : comparables > 0 ? (
                  <span style={{ color: '#1e40af', fontWeight: 600 }}>
                    Hay <strong>{comparables}</strong> propiedad{comparables !== 1 ? 'es' : ''} de tipo <strong>{tipo}</strong> disponible{comparables !== 1 ? 's' : ''} en un rango similar en nuestro catálogo.{' '}
                    <a href={`/propiedades?tipo=${tipo}`} style={{ color: '#1B365D', textDecoration: 'underline' }}>Ver propiedades →</a>
                  </span>
                ) : (
                  <span style={{ color: '#555' }}>
                    No hay propiedades de tipo <strong>{tipo}</strong> en ese rango en este momento, pero contáctanos — podemos ayudarte.
                  </span>
                )}
              </div>

              {/* Lead capture */}
              <div style={{ background: '#f9f9f9', borderRadius: '10px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <p style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 700, color: '#1B365D', marginBottom: '1rem', textAlign: 'center' }}>
                  ¿Quieres una valuación profesional gratuita?
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                    placeholder="Tu nombre" style={{ padding: '10px 12px', border: '1.5px solid #E0E0E0', borderRadius: '8px', fontSize: '.9rem', width: '100%' }} />
                  <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)}
                    placeholder="Tu teléfono" style={{ padding: '10px 12px', border: '1.5px solid #E0E0E0', borderRadius: '8px', fontSize: '.9rem', width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <a href="https://leon.gob.mx/appportal/consultacartografica/" target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
                    padding: '12px', background: '#f8f9fa', color: '#1B365D',
                    border: '2px solid #1B365D', borderRadius: '8px', fontWeight: 700,
                    textDecoration: 'none', transition: 'background .3s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#1B365D'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.color = '#1B365D' }}
                >
                  <i className="fa fa-map-location-dot" /> Consultar Plano Catastral Oficial (León)
                </a>
                <button onClick={solicitarAvaluo} style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
                  padding: '12px', background: '#25D366', color: '#fff',
                  border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
                  fontSize: '1rem', transition: 'background .3s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1EBE5D')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#25D366')}
                >
                  <i className="fab fa-whatsapp" /> Solicitar Avalúo Oficial con Vive Bien
                </button>
              </div>

              {guardado && (
                <p style={{ textAlign: 'center', marginTop: '1rem', color: '#279546', fontWeight: 600, fontSize: '.9rem' }}>
                  <i className="fa fa-check-circle" style={{ marginRight: '.4rem' }} />Datos guardados. ¡Te contactaremos pronto!
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes fadeInResult {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <Footer />
    </>
  )
}
