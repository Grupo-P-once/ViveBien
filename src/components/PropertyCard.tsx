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
  estatus?: string
  estado?: string
  metros?: number
  m2?: number | string
  recamaras?: number
  banos?: number
  alturaLibre?: number
  andenes?: number
  mantenimiento?: number | string
  whatsapp?: string
  amenidades?: string[]
  features?: string[]
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
  departamento: '#5B4FCF',
}

const tipoLabel: Record<string, string> = {
  casa: 'Casa',
  nave: 'Nave/Bodega',
  terreno: 'Terreno',
  comercial: 'Local',
  depto: 'Depto.',
  departamento: 'Depto.',
}

const PLACEHOLDER = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&auto=format&fit=crop'

export default function PropertyCard({ propiedad: p, onClick }: PropertyCardProps) {
  const [fotoIdx, setFotoIdx] = useState(0)
  const fotos = p.fotos?.length ? p.fotos : [PLACEHOLDER]
  const color = tipoColors[p.tipo] || '#8B1A1A'
  const label = tipoLabel[p.tipo] || p.tipo

  // Normalize fields — support both old (m2/estado) and new (metros/estatus) naming
  const superficie = p.metros || (typeof p.m2 === 'number' ? p.m2 : undefined)
  const disponible = (p.estatus === 'disponible') || (p.estado === 'disponible')
  const esNave = p.tipo === 'nave'

  // Price display
  const precio = p.precio
    ? `$${Number(p.precio).toLocaleString('es-MX')}`
    : 'Consultar precio'

  // Mantenimiento display
  const manto = p.mantenimiento
    ? typeof p.mantenimiento === 'number'
      ? `+$${Number(p.mantenimiento).toLocaleString('es-MX')} manto.`
      : `+$${p.mantenimiento} manto.`
    : null

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
        el.style.boxShadow = '0 16px 40px rgba(0,0,0,.14)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = '0 8px 30px rgba(0,0,0,.08)'
      }}
    >
      {/* ── Image slider ── */}
      <div style={{ position: 'relative', height: '220px', background: '#e8ecf0', overflow: 'hidden' }}>
        <img
          src={fotos[fotoIdx]}
          alt={p.titulo}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .4s' }}
          onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER }}
        />

        {/* Type label */}
        <span style={{
          position: 'absolute', top: '12px', left: '12px',
          background: color, color: '#fff',
          padding: '.25rem .75rem', borderRadius: '20px',
          fontSize: '.72rem', fontWeight: 700,
          letterSpacing: '.04em', textTransform: 'uppercase',
          zIndex: 10, boxShadow: '0 2px 6px rgba(0,0,0,.25)',
        }}>
          {label}
        </span>

        {/* Operación badge */}
        <span style={{
          position: 'absolute', top: '12px', right: '12px',
          background: p.operacion === 'venta' ? '#8B1A1A' : '#279546',
          color: '#fff', padding: '4px 12px', borderRadius: '4px',
          fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase',
          zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        }}>
          {p.operacion === 'venta' ? 'VENTA' : 'RENTA'}
        </span>

        {/* Slider nav */}
        {fotos.length > 1 && (
          <>
            <button onClick={prev} style={{
              position: 'absolute', top: '50%', left: '8px',
              transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,.45)', color: '#fff', border: 'none',
              borderRadius: '50%', width: '30px', height: '30px',
              cursor: 'pointer', zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fa fa-chevron-left" style={{ fontSize: '.8rem' }} />
            </button>
            <button onClick={next} style={{
              position: 'absolute', top: '50%', right: '8px',
              transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,.45)', color: '#fff', border: 'none',
              borderRadius: '50%', width: '30px', height: '30px',
              cursor: 'pointer', zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fa fa-chevron-right" style={{ fontSize: '.8rem' }} />
            </button>
            <div style={{
              position: 'absolute', bottom: '8px', left: '50%',
              transform: 'translateX(-50%)', display: 'flex', gap: '5px', zIndex: 5,
            }}>
              {fotos.map((_, i) => (
                <span key={i} onClick={e => { e.stopPropagation(); setFotoIdx(i) }} style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: i === fotoIdx ? '#fff' : 'rgba(255,255,255,.5)',
                  cursor: 'pointer', transition: 'background .2s', display: 'block',
                }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Card body ── */}
      <div style={{ padding: '1.1rem 1.2rem 1.3rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{
          fontFamily: 'Montserrat, sans-serif', fontSize: '.98rem',
          fontWeight: 700, color: '#222831', marginBottom: '.35rem', lineHeight: 1.3,
        }}>
          {p.titulo}
        </h3>
        <p style={{ fontSize: '.82rem', color: '#666', marginBottom: '.75rem', display: 'flex', alignItems: 'flex-start', gap: '.3rem' }}>
          <i className="fa fa-map-marker-alt" style={{ color: '#1B365D', marginTop: '.1rem', flexShrink: 0 }} />
          {p.ubicacion}
        </p>

        {/* ── Features grid ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '.45rem', marginBottom: '.75rem', fontSize: '.81rem',
        }}>
          {superficie && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#444' }}>
              <i className="fa fa-ruler-combined" style={{ color: '#1B365D', width: '16px', textAlign: 'center' }} />
              {superficie} m²
            </span>
          )}
          {p.recamaras && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#444' }}>
              <i className="fa fa-bed" style={{ color: '#1B365D', width: '16px', textAlign: 'center' }} />
              {p.recamaras} rec.
            </span>
          )}
          {p.banos && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#444' }}>
              <i className="fa fa-bath" style={{ color: '#1B365D', width: '16px', textAlign: 'center' }} />
              {p.banos} baños
            </span>
          )}
          {/* Industrial-specific fields */}
          {esNave && p.alturaLibre && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#444' }}>
              <i className="fa fa-arrows-alt-v" style={{ color: '#1B365D', width: '16px', textAlign: 'center' }} />
              {p.alturaLibre}m altura
            </span>
          )}
          {esNave && p.andenes && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#444' }}>
              <i className="fa fa-truck" style={{ color: '#1B365D', width: '16px', textAlign: 'center' }} />
              {p.andenes} andén{p.andenes !== 1 ? 'es' : ''}
            </span>
          )}
        </div>

        {/* ── Card footer ── */}
        <div style={{
          marginTop: 'auto', paddingTop: '.85rem',
          borderTop: '1px solid #EEE',
        }}>
          {/* Price row */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.65rem', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
              fontSize: '1.1rem', color: '#8B1A1A',
            }}>
              {precio}
            </span>
            {manto && (
              <span style={{ fontSize: '.72rem', color: '#888', fontWeight: 600 }}>{manto}</span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <a
              href={`https://wa.me/${p.whatsapp || '524778116501'}?text=${encodeURIComponent('Hola, me interesa la propiedad: ' + p.titulo)}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Contactar por WhatsApp"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '34px', height: '34px', borderRadius: '8px',
                background: '#25D366', color: '#fff', fontSize: '1rem',
                textDecoration: 'none', flexShrink: 0,
              }}
            >
              <i className="fab fa-whatsapp" />
            </a>
            <a
              href="tel:+524778116501"
              onClick={e => e.stopPropagation()}
              title="Llamar"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '34px', height: '34px', borderRadius: '8px',
                background: '#1B365D', color: '#fff', fontSize: '.85rem',
                textDecoration: 'none', flexShrink: 0,
              }}
            >
              <i className="fa fa-phone" />
            </a>
            {onClick && (
              <button
                onClick={onClick}
                style={{
                  flex: 1, height: '34px', borderRadius: '8px',
                  background: 'transparent', color: '#1B365D',
                  border: '1.5px solid #1B365D', fontWeight: 700,
                  fontFamily: 'Montserrat, sans-serif', fontSize: '.82rem',
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
                Ver más <i className="fa fa-arrow-right" style={{ fontSize: '.75rem', marginLeft: '.3rem' }} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
