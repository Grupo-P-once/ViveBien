'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

function getFavs(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('vb_favorites') || '[]') } catch { return [] }
}
function setFavs(favs: string[]) {
  localStorage.setItem('vb_favorites', JSON.stringify(favs))
}

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

const tipoLabel: Record<string, string> = {
  casa: 'Casa', nave: 'Nave', terreno: 'Terreno',
  comercial: 'Local', depto: 'Depto.', departamento: 'Depto.',
}

const PLACEHOLDER = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&auto=format&fit=crop'

export default function PropertyCard({ propiedad: p }: PropertyCardProps) {
  const [fotoIdx, setFotoIdx] = useState(0)
  const [liked, setLiked] = useState(false)

  useEffect(() => {
    setLiked(getFavs().includes(p.id))
  }, [p.id])
  const fotos = p.fotos?.length ? p.fotos : [PLACEHOLDER]
  const label = tipoLabel[p.tipo] || p.tipo?.toUpperCase() || 'PROPIEDAD'
  const superficie = p.metros || (typeof p.m2 === 'number' ? p.m2 : undefined)

  const precio = p.precio
    ? `$${Number(p.precio).toLocaleString('es-MX')} MXN`
    : 'Consultar precio'

  const opBadge = p.operacion === 'venta' ? 'En Venta' : 'En Renta'
  const opColor = p.operacion === 'venta' ? '#8B1A1A' : '#E07B00'

  const wa = p.whatsapp || process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'
  const waMsg = encodeURIComponent(`Hola, me interesa la propiedad: ${p.titulo}`)

  function prev(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setFotoIdx(i => (i - 1 + fotos.length) % fotos.length)
  }
  function next(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setFotoIdx(i => (i + 1) % fotos.length)
  }

  return (
    <div style={{
      background: '#fff', borderRadius: '20px', overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,.09)', display: 'flex',
      flexDirection: 'column', transition: 'transform .25s, box-shadow .25s',
      fontFamily: 'Open Sans, sans-serif',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-6px)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 36px rgba(0,0,0,.14)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = ''
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.09)'
      }}
    >
      {/* ── Photo ── */}
      <div style={{ position: 'relative', height: '230px', background: '#e8ecf0', overflow: 'hidden' }}>
        <img
          src={fotos[fotoIdx]} alt={p.titulo}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .4s' }}
          onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER }}
        />

        {/* Operación badge */}
        <span style={{
          position: 'absolute', top: '14px', left: '14px',
          background: opColor, color: '#fff',
          padding: '.3rem .85rem', borderRadius: '30px',
          fontSize: '.78rem', fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,.25)',
        }}>
          {opBadge}
        </span>

        {/* Slider nav */}
        {fotos.length > 1 && (
          <>
            <button onClick={prev} style={{
              position: 'absolute', top: '50%', left: '10px', transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,.4)', color: '#fff', border: 'none',
              borderRadius: '50%', width: '32px', height: '32px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><i className="fa fa-chevron-left" style={{ fontSize: '.8rem' }} /></button>
            <button onClick={next} style={{
              position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,.4)', color: '#fff', border: 'none',
              borderRadius: '50%', width: '32px', height: '32px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><i className="fa fa-chevron-right" style={{ fontSize: '.8rem' }} /></button>
            {/* Dots */}
            <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '5px' }}>
              {fotos.map((_, i) => (
                <span key={i} onClick={e => { e.preventDefault(); e.stopPropagation(); setFotoIdx(i) }} style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: i === fotoIdx ? '#fff' : 'rgba(255,255,255,.5)',
                  cursor: 'pointer', display: 'block', transition: 'background .2s',
                }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '1.1rem 1.2rem 1.3rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>

        {/* Title */}
        <h3 style={{
          fontFamily: 'Montserrat, sans-serif', fontSize: '1rem',
          fontWeight: 800, color: '#1a1a2e', lineHeight: 1.3, margin: 0,
        }}>
          {p.titulo}{superficie ? ` – ${superficie} m²` : ''}
        </h3>

        {/* Location */}
        <p style={{ fontSize: '.82rem', color: '#666', margin: 0, display: 'flex', alignItems: 'flex-start', gap: '.3rem' }}>
          <i className="fa fa-map-marker-alt" style={{ color: '#1B365D', marginTop: '.15rem', flexShrink: 0 }} />
          {p.ubicacion}
        </p>

        {/* Tipo badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <i className="fa fa-industry" style={{ color: '#555', fontSize: '.8rem' }} />
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {label}
          </span>
          {p.alturaLibre && (
            <span style={{ fontSize: '.75rem', color: '#888', marginLeft: '.5rem' }}>• {p.alturaLibre}m altura</span>
          )}
          {p.andenes && (
            <span style={{ fontSize: '.75rem', color: '#888' }}>• {p.andenes} andenes</span>
          )}
        </div>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
            fontSize: '1.25rem', color: '#8B1A1A',
          }}>
            {precio}
          </span>
          {p.mantenimiento && (
            <span style={{ fontSize: '.72rem', color: '#999', fontWeight: 600 }}>
              + ${Number(p.mantenimiento).toLocaleString('es-MX')} manto.
            </span>
          )}
        </div>

        {/* Ver más button */}
        <Link
          href={`/propiedades/${p.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '.4rem',
            padding: '.6rem 1.2rem', borderRadius: '10px',
            border: '2px solid #1B365D', color: '#1B365D', fontWeight: 700,
            fontFamily: 'Montserrat, sans-serif', fontSize: '.85rem',
            textDecoration: 'none', width: 'fit-content',
            transition: 'all .2s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLAnchorElement
            el.style.background = '#1B365D'
            el.style.color = '#fff'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLAnchorElement
            el.style.background = 'transparent'
            el.style.color = '#1B365D'
          }}
        >
          Ver más <i className="fa fa-arrow-right" style={{ fontSize: '.75rem' }} />
        </Link>

        {/* Bottom action bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: '.7rem', borderTop: '1px solid #EEF0F3', marginTop: '.2rem',
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Phone */}
            <a href={`tel:+${p.whatsapp || process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'}`} onClick={e => e.stopPropagation()}
              title="Llamar"
              style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: '#1B365D', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: '.95rem',
              }}>
              <i className="fa fa-phone" />
            </a>
            {/* WhatsApp */}
            <a href={`https://wa.me/${wa}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="WhatsApp"
              style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: '#25D366', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: '1.05rem',
              }}>
              <i className="fab fa-whatsapp" />
            </a>
            {/* Email */}
            <a href={`mailto:contacto@vivebieninmobiliaria.com?subject=Interesado en: ${encodeURIComponent(p.titulo)}`}
              onClick={e => e.stopPropagation()}
              title="Email"
              style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: '#8B1A1A', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: '.9rem',
              }}>
              <i className="fa fa-envelope" />
            </a>
          </div>

          {/* Heart / favorite */}
          <button
            onClick={e => {
              e.stopPropagation()
              const favs = getFavs()
              const next = favs.includes(p.id) ? favs.filter(f => f !== p.id) : [...favs, p.id]
              setFavs(next)
              setLiked(next.includes(p.id))
            }}
            title={liked ? 'Quitar de favoritos' : 'Guardar'}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: liked ? '#fee2e2' : '#F4F6F8',
              color: liked ? '#8B1A1A' : '#aaa',
              border: 'none', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
              transition: 'all .2s',
            }}>
            <i className={liked ? 'fas fa-heart' : 'far fa-heart'} />
          </button>
        </div>
      </div>
    </div>
  )
}
