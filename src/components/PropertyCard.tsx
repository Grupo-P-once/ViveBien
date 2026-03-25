'use client'
import { useState } from 'react'

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

interface PropertyCardProps {
  propiedad: Propiedad
  onClick?: () => void
}

const tipoColors: Record<string, string> = {
  casa: '#8B1A1A',
  nave: '#1B365D',
  terreno: '#279546',
  comercial: '#D97706',
  depto: '#5B4FCF',
}

const tipoLabel: Record<string, string> = {
  casa: 'Casa',
  nave: 'Nave/Bodega',
  terreno: 'Terreno',
  comercial: 'Local',
  depto: 'Depto.',
}

const PLACEHOLDER = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&auto=format&fit=crop'

export default function PropertyCard({ propiedad: p, onClick }: PropertyCardProps) {
  const [fotoIdx, setFotoIdx] = useState(0)
  const fotos = p.fotos?.length ? p.fotos : [PLACEHOLDER]
  const precio = p.precio ? `$${p.precio.toLocaleString('es-MX')}` : 'Consultar'
  const color = tipoColors[p.tipo] || '#8B1A1A'

  function prev(e: React.MouseEvent) {
    e.stopPropagation()
    setFotoIdx(i => (i - 1 + fotos.length) % fotos.length)
  }

  function next(e: React.MouseEvent) {
    e.stopPropagation()
    setFotoIdx(i => (i + 1) % fotos.length)
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,.08)',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform .3s ease, box-shadow .3s ease',
      }}
      onMouseEnter={e => {
        if (!onClick) return
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-8px)'
        el.style.boxShadow = '0 16px 40px rgba(0,0,0,.12)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = '0 8px 30px rgba(0,0,0,.08)'
      }}
    >
      {/* Image slider */}
      <div style={{ position: 'relative', height: '220px', background: '#f0f0f0', overflow: 'hidden' }}>
        <img
          src={fotos[fotoIdx]}
          alt={p.titulo}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .4s' }}
          onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER }}
        />

        {/* Type badge */}
        <span style={{
          position: 'absolute', top: '12px', left: '12px',
          background: color, color: '#fff',
          padding: '.25rem .75rem', borderRadius: '20px',
          fontSize: '.72rem', fontWeight: 700,
          fontFamily: 'var(--font-montserrat)', letterSpacing: '.04em',
          zIndex: 10,
        }}>
          {tipoLabel[p.tipo] || p.tipo}
        </span>

        {/* Status badge */}
        <span style={{
          position: 'absolute', top: '12px', right: '12px',
          background: p.estatus === 'disponible' ? '#279546' : '#666',
          color: '#fff', padding: '4px 12px', borderRadius: '4px',
          fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase',
          zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        }}>
          {p.operacion === 'venta' ? 'VENTA' : 'RENTA'}
        </span>

        {/* Slider navigation */}
        {fotos.length > 1 && (
          <>
            <button onClick={prev} style={{
              position: 'absolute', top: '50%', left: '8px',
              transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,.45)', color: '#fff', border: 'none',
              borderRadius: '50%', width: '30px', height: '30px',
              fontSize: '.9rem', cursor: 'pointer', zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fa fa-chevron-left" />
            </button>
            <button onClick={next} style={{
              position: 'absolute', top: '50%', right: '8px',
              transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,.45)', color: '#fff', border: 'none',
              borderRadius: '50%', width: '30px', height: '30px',
              fontSize: '.9rem', cursor: 'pointer', zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fa fa-chevron-right" />
            </button>
            {/* Dots */}
            <div style={{
              position: 'absolute', bottom: '8px', left: '50%',
              transform: 'translateX(-50%)', display: 'flex', gap: '5px', zIndex: 5,
            }}>
              {fotos.map((_, i) => (
                <span
                  key={i}
                  onClick={e => { e.stopPropagation(); setFotoIdx(i) }}
                  style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: i === fotoIdx ? '#fff' : 'rgba(255,255,255,.5)',
                    cursor: 'pointer', transition: 'background .2s',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '1.1rem 1.2rem 1.4rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{
          fontFamily: 'var(--font-montserrat)', fontSize: '1rem',
          fontWeight: 700, color: '#222831', marginBottom: '.35rem',
        }}>
          {p.titulo}
        </h3>
        <p style={{ fontSize: '.82rem', color: '#666', marginBottom: '.7rem' }}>
          <i className="fa fa-map-marker-alt" style={{ color: '#1B365D', marginRight: '.3rem' }} />
          {p.ubicacion}
        </p>

        {/* Features grid */}
        {(p.metros || p.recamaras || p.banos) && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '.5rem', marginBottom: '.7rem', fontSize: '.82rem',
          }}>
            {p.metros && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#444' }}>
                <i className="fa fa-ruler-combined" style={{ color: '#1B365D', width: '16px' }} />
                {p.metros} m²
              </span>
            )}
            {p.recamaras && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#444' }}>
                <i className="fa fa-bed" style={{ color: '#1B365D', width: '16px' }} />
                {p.recamaras} rec.
              </span>
            )}
            {p.banos && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#444' }}>
                <i className="fa fa-bath" style={{ color: '#1B365D', width: '16px' }} />
                {p.banos} baños
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 'auto', paddingTop: '.85rem',
          borderTop: '1px solid #EEE',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem',
        }}>
          <span style={{
            fontFamily: 'var(--font-montserrat)', fontWeight: 800,
            fontSize: '1.1rem', color: '#8B1A1A',
          }}>
            {precio}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <a
              href={`https://wa.me/${p.whatsapp || '524778116501'}?text=${encodeURIComponent('Hola, me interesa la propiedad: ' + p.titulo)}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '34px', height: '34px', borderRadius: '8px',
                background: '#25D366', color: '#fff', fontSize: '.95rem',
                textDecoration: 'none',
              }}
              title="WhatsApp"
            >
              <i className="fab fa-whatsapp" />
            </a>
            {onClick && (
              <button
                onClick={onClick}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '34px', padding: '0 .8rem', borderRadius: '8px',
                  background: 'transparent', color: '#1B365D',
                  border: '1px solid #1B365D', fontWeight: 700,
                  fontFamily: 'var(--font-montserrat)', fontSize: '.82rem',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all .2s',
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget
                  b.style.background = '#1B365D'
                  b.style.color = '#fff'
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget
                  b.style.background = 'transparent'
                  b.style.color = '#1B365D'
                }}
              >
                Ver más
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
