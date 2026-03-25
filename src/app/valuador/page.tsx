'use client'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { saveLead } from '@/lib/firestore'

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

  // Lead capture after result
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')

  function calcular() {
    const z = ZONAS[zona]
    const metros = parseFloat(m2)

    if (!z || !metros || isNaN(metros) || metros <= 0) {
      alert('Por favor, selecciona una zona y escribe una cantidad válida de metros cuadrados.')
      return
    }

    setResultado({ min: z.min * metros, max: z.max * metros })
  }

  async function solicitarAvaluo() {
    const msg = `Hola Vive Bien. Usé el Valuador web y me gustaría solicitar un avalúo oficial o vender mi propiedad. Zona: ${ZONAS[zona]?.label || zona}, ${m2}m².`
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')

    // Save lead if name/phone provided
    if (nombre && telefono) {
      try {
        await saveLead({ nombre, telefono, interes: 'avaluo', origen: 'valuador' })
        setGuardado(true)
      } catch { }
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

  return (
    <>
      <Header />

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(rgba(24,37,66,.9),rgba(24,37,66,.9)), url("https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80") center/cover',
        padding: '4rem 1rem', textAlign: 'center', color: '#fff',
      }}>
        <h1 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.8rem)', marginBottom: '.5rem' }}>
          Valuador Vive Bien
        </h1>
        <p style={{ fontSize: '1.1rem', opacity: .9, maxWidth: '600px', margin: '0 auto' }}>
          Conoce un estimado del valor comercial de tu propiedad en León, Guanajuato basado en tu zona.
        </p>
      </div>

      {/* Calculator */}
      <main style={{ background: '#F5F7FA', padding: '2rem 1rem 4rem', minHeight: '60vh' }}>
        <div style={{
          maxWidth: '800px', margin: '-2rem auto 0',
          background: '#fff', padding: '3rem',
          borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,.08)',
          position: 'relative', zIndex: 10,
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

          <button onClick={calcular} style={{
            width: '100%', background: '#1B365D', color: '#fff',
            border: 'none', padding: '15px', fontFamily: 'var(--font-montserrat)',
            fontSize: '1.1rem', fontWeight: 700, borderRadius: '8px',
            cursor: 'pointer', marginTop: '1rem', display: 'flex',
            justifyContent: 'center', alignItems: 'center', gap: '10px',
            transition: 'background .3s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#3D5A73')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1B365D')}
          >
            <i className="fa fa-calculator" /> Calcular Estimado
          </button>

          {/* Result */}
          {resultado && (
            <div style={{
              marginTop: '2.5rem', padding: '2rem',
              background: '#F5F7FA', borderRadius: '12px',
              borderLeft: '5px solid #8B1A1A',
              animation: 'fadeInResult .5s ease forwards',
            }}>
              <h2 style={{ fontSize: '1.2rem', color: '#1B365D', fontWeight: 900, marginBottom: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-montserrat)' }}>
                Estimación de Valor de Mercado
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
        @media (max-width: 600px) {
          .calc-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <Footer />
    </>
  )
}
