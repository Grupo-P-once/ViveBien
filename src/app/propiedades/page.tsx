'use client'
import BarraComparar from '@/components/BarraComparar'
import dynamic from 'next/dynamic'

// Leaflet toca `window` al importarse: sin ssr:false rompe el prerenderizado.
const MapaListado = dynamic(() => import('@/components/MapaListado'), {
  ssr: false,
  loading: () => <div style={{ height: 460, borderRadius: 12, background: 'var(--hueso-hundido,#E7E4DF)', display: 'grid', placeItems: 'center', color: '#8B95A3', fontSize: '.88rem' }}>Cargando el mapa…</div>,
})
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
  { tipo: 'nave', titulo: 'Naves Industriales', icon: 'fa-industry', desc: 'Infraestructura de alto nivel para tu operación logística e industrial', color: 'var(--azul)' },
  { tipo: 'casa', titulo: 'Casas en Venta', icon: 'fa-house', desc: 'Espacios familiares pensados para ti en las mejores colonias de León', color: 'var(--rojo)' },
  { tipo: 'departamento', titulo: 'Departamentos', icon: 'fa-building', desc: 'Vivienda vertical con acabados de primera, ideales para jóvenes y familias', color: 'var(--morado)' },
  { tipo: 'terreno', titulo: 'Terrenos', icon: 'fa-map', desc: 'Lotes residenciales e industriales con ubicación estratégica y alta plusvalía', color: 'var(--exito)' },
  { tipo: 'comercial', titulo: 'Locales Comerciales', icon: 'fa-store', desc: 'Espacios estratégicos para que tu negocio crezca en León', color: 'var(--aviso)' },
]

function PropiedadesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [falloConsulta, setFalloConsulta] = useState(false)
  const [desactualizado, setDesactualizado] = useState(false)
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista')
  const [filtros, setFiltros] = useState({
    op: searchParams.get('op') || '',
    tipo: searchParams.get('tipo') || '',
    zona: searchParams.get('zona') || '',
    precioMin: searchParams.get('pmin') || '',
    precioMax: searchParams.get('pmax') || '',
  })
  const [ordenar, setOrdenar] = useState('')
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
      // Por /api/catalogo y no directo a Supabase: esa ruta cachea y guarda
      // la última copia buena, así que una caída de la base ya no vacía el
      // sitio. Antes esto iba navegador -> Supabase, sin red debajo.
      const res = await fetch('/api/catalogo')
      if (!res.ok) throw new Error(`catalogo ${res.status}`)
      const payload = await res.json()
      const visibles = (payload.propiedades || []) as any[]
      setDesactualizado(Boolean(payload.desactualizado))
      // Map snake_case → camelCase for backwards compat
      const mapped = visibles.map((p: any) => ({
        ...p,
        alturaLibre: p.altura_libre,
        m2: p.metros,
      }))
      setPropiedades(mapped)
      setFalloConsulta(false)
    } catch (err) {
      // Antes esto era `console.error(err)` y nada mas. La lista se quedaba
      // vacia y la pagina decia «Sin propiedades activas» — es decir, mentia:
      // afirmaba que no hay inventario cuando en realidad no se pudo
      // preguntar. Paso de verdad el 2026-09-10, con Supabase devolviendo 504.
      console.error(err)
      setFalloConsulta(true)
    }
    setLoading(false)
  }

  function getStatus(p: Propiedad) {
    return p.estatus || p.estado || 'disponible'
  }

  function getNormTipo(p: Propiedad) {
    // normalize 'depto' → 'departamento'
    return p.tipo === 'depto' ? 'departamento' : p.tipo
  }

  // Normaliza acentos: "León" → "leon", "Gómez" → "gomez"
  function norm(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  function filtrar(lista: Propiedad[], tipo?: string) {
    return lista.filter(p => {
      const st = getStatus(p)
      if (st === 'pausada' || st === 'vendida' || st === 'eliminada') return false
      const t = getNormTipo(p)
      if (tipo && t !== tipo) return false
      if (filtros.op && p.operacion !== filtros.op) return false
      if (filtros.tipo && filtros.tipo !== '' && t !== filtros.tipo) return false
      if (filtros.zona && !norm(p.ubicacion || '').includes(norm(filtros.zona))) return false
      if (filtros.precioMin && p.precio < parseFloat(filtros.precioMin)) return false
      if (filtros.precioMax && p.precio > parseFloat(filtros.precioMax)) return false
      return true
    })
  }

  function sortear(lista: Propiedad[]) {
    const arr = [...lista]
    switch (ordenar) {
      case 'precio_asc': return arr.sort((a, b) => (a.precio || 0) - (b.precio || 0))
      case 'precio_desc': return arr.sort((a, b) => (b.precio || 0) - (a.precio || 0))
      case 'm2_desc': return arr.sort((a, b) => ((b.metros || 0) + (typeof b.m2 === 'number' ? b.m2 : 0)) - ((a.metros || 0) + (typeof a.m2 === 'number' ? a.m2 : 0)))
      case 'm2_asc': return arr.sort((a, b) => ((a.metros || 0) + (typeof a.m2 === 'number' ? a.m2 : 0)) - ((b.metros || 0) + (typeof b.m2 === 'number' ? b.m2 : 0)))
      default: return arr
    }
  }

  const hayFiltroActivo = filtros.op || filtros.tipo || filtros.zona || filtros.precioMin || filtros.precioMax
  const totalFiltradas = filtrar(propiedades).length

  const disponibles = propiedades.filter(p => (p.estatus || p.estado) === 'disponible').length

  /**
   * El lugar sale de lo que hay en el catálogo, no escrito a mano.
   *
   * Decía «León, Guanajuato» siempre. En cuanto entre una propiedad de otra
   * ciudad, el titular miente — y en un portal inmobiliario la ubicación no es
   * un detalle decorativo, es la mitad de la decisión.
   *
   * Con una sola ciudad la nombra; con varias dice cuántas. Sin datos cae a
   * León, que es donde opera la casa.
   */
  const lugarDelCatalogo = (() => {
    const ciudades = new Set(
      propiedades
        .map(p => {
          const u = (p as unknown as Record<string, unknown>).ciudad ?? p.ubicacion ?? ''
          const txt = String(u).trim()
          if (!txt) return null
          // «San Juan Bosco, León, Guanajuato» -> «León»
          const partes = txt.split(',').map(x => x.trim()).filter(Boolean)
          return partes.length >= 2 ? partes[partes.length - 2] : partes[0]
        })
        .filter((c): c is string => Boolean(c)),
    )
    if (ciudades.size === 0) return 'León, Guanajuato'
    if (ciudades.size === 1) return [...ciudades][0]
    return `${ciudades.size} ciudades`
  })()

  return (
    <>
      <Header />
      <RegisterModal isOpen={regOpen} onClose={() => setRegOpen(false)} propertyTitle={selected?.titulo} />

      {/* ── HERO ── */}
      <section style={{
        position: 'relative', minHeight: '52vh',
        display: 'flex', alignItems: 'flex-end',
        overflow: 'hidden', background: '#08101e',
      }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <img
            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&auto=format&fit=crop&q=80"
            alt="Catálogo Vive Bien"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%' }}
          />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,16,30,.3) 0%, rgba(8,16,30,.75) 60%, rgba(8,16,30,.97) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(139,26,26,.35) 0%, transparent 60%)' }} />
        {/* Animated top line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--rojo),var(--dorado),var(--azul))', zIndex: 5 }} />

        <div style={{ position: 'relative', zIndex: 3, width: '100%', maxWidth: '1240px', margin: '0 auto', padding: '0 2.5rem 3.5rem' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1.5rem', color: 'rgba(255,255,255,.45)', fontSize: '.75rem', fontFamily: 'Montserrat,sans-serif', letterSpacing: '1px' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,.45)', textDecoration: 'none' }}>Inicio</Link>
            <i className="fa fa-chevron-right" style={{ fontSize: '.6rem' }} />
            <span style={{ color: 'var(--lavanda)' }}>Propiedades</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <span style={{ display: 'inline-block', background: 'rgba(200,16,46,.16)', border: '1px solid rgba(200,16,46,.38)', color: 'var(--rojo-marca)', padding: '.3rem .9rem', borderRadius: '50px', fontSize: '.68rem', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '1rem' }}>
                Catálogo completo
              </span>
              <h1 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontWeight: 700, fontSize: 'clamp(2rem,4.5vw,3.8rem)', color: '#fff', lineHeight: 1.1, margin: 0, letterSpacing: '-1px' }}>
                Propiedades en<br />
                <span style={{ fontStyle: 'italic', color: 'var(--lavanda)' }}>{lugarDelCatalogo}</span>
              </h1>
            </div>
            {/* Stats pill */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {[
                { n: disponibles, label: 'disponibles', icon: 'fa-building' },
                { n: 15, label: 'años exp.', icon: 'fa-award' },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '14px', padding: '.8rem 1.2rem', textAlign: 'center', minWidth: '100px' }}>
                  <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: '1.6rem', color: '#fff', lineHeight: 1 }}>{loading || falloConsulta ? '—' : s.n}{!loading && !falloConsulta && s.label !== 'años exp.' ? '+' : ''}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--dorado)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700, marginTop: '.2rem' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Category quick-nav chips */}
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <button onClick={() => updateFiltros({ tipo: '' })}
              style={{ padding: '.45rem 1.1rem', borderRadius: '50px', border: '1px solid rgba(255,255,255,.2)', background: !filtros.tipo ? 'rgba(201,169,110,.25)' : 'rgba(255,255,255,.07)', color: !filtros.tipo ? 'var(--dorado)' : 'rgba(255,255,255,.6)', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: '.72rem', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all .2s' }}>
              Todos
            </button>
            {SECCIONES.map(sec => (
              <button key={sec.tipo} onClick={() => updateFiltros({ tipo: sec.tipo })}
                style={{ padding: '.45rem 1.1rem', borderRadius: '50px', border: `1px solid ${filtros.tipo === sec.tipo ? sec.color : 'rgba(255,255,255,.15)'}`, background: filtros.tipo === sec.tipo ? `${sec.color}33` : 'rgba(255,255,255,.06)', color: filtros.tipo === sec.tipo ? '#fff' : 'rgba(255,255,255,.55)', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: '.72rem', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <i className={`fa ${sec.icon}`} style={{ fontSize: '.68rem' }} />
                {sec.titulo}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── STICKY FILTER BAR ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--gris-calido-claro)', position: 'sticky', top: '72px', zIndex: 998, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '.75rem 2.5rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Op toggle */}
          <div style={{ display: 'flex', background: '#f4f1ec', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--gris-calido)', flexShrink: 0 }}>
            {[{ label: 'Todo', val: '' }, { label: 'Comprar', val: 'venta' }, { label: 'Rentar', val: 'renta' }].map(t => (
              <button key={t.val} onClick={() => updateFiltros({ op: t.val })}
                style={{ padding: '.5rem .9rem', border: 'none', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: '.75rem', letterSpacing: '1px', textTransform: 'uppercase', transition: 'all .18s', background: filtros.op === t.val ? 'var(--rojo)' : 'transparent', color: filtros.op === t.val ? '#fff' : '#666', borderRadius: '6px' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tipo */}
          <select value={filtros.tipo} onChange={e => updateFiltros({ tipo: e.target.value })}
            style={{ padding: '.52rem .9rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: '#fff', color: '#333', fontSize: '.83rem', fontFamily: 'Montserrat,sans-serif', fontWeight: 600, cursor: 'pointer', minWidth: '150px' }}>
            <option value="">Todos los tipos</option>
            <option value="nave">Nave / Bodega</option>
            <option value="casa">Casa</option>
            <option value="departamento">Departamento</option>
            <option value="terreno">Terreno</option>
            <option value="comercial">Local Comercial</option>
          </select>

          {/* Zona */}
          <div style={{ position: 'relative', flex: '1 1 160px' }}>
            <i className="fa fa-location-dot" style={{ position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--rojo)', fontSize: '.8rem', pointerEvents: 'none' }} />
            <input type="text" placeholder="Zona o colonia" value={filtros.zona}
              onChange={e => updateFiltros({ zona: e.target.value })}
              style={{ width: '100%', padding: '.52rem .9rem .52rem 2.1rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: '#fff', color: '#333', fontSize: '.83rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>

          {/* Precios */}
          <div style={{ position: 'relative', width: '115px' }}>
            <span style={{ position: 'absolute', left: '.7rem', top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: '.8rem', pointerEvents: 'none' }}>$</span>
            <input type="number" placeholder="Mín." value={filtros.precioMin}
              onChange={e => updateFiltros({ precioMin: e.target.value })}
              style={{ width: '100%', padding: '.52rem .7rem .52rem 1.5rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: '#fff', color: '#333', fontSize: '.83rem', boxSizing: 'border-box' }} />
          </div>
          <div style={{ position: 'relative', width: '115px' }}>
            <span style={{ position: 'absolute', left: '.7rem', top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: '.8rem', pointerEvents: 'none' }}>$</span>
            <input type="number" placeholder="Máx." value={filtros.precioMax}
              onChange={e => updateFiltros({ precioMax: e.target.value })}
              style={{ width: '100%', padding: '.52rem .7rem .52rem 1.5rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: '#fff', color: '#333', fontSize: '.83rem', boxSizing: 'border-box' }} />
          </div>

          {/* Ordenar */}
          <select value={ordenar} onChange={e => setOrdenar(e.target.value)}
            style={{ padding: '.52rem .9rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: '#fff', color: '#333', fontSize: '.83rem', fontFamily: 'Montserrat,sans-serif', fontWeight: 600, cursor: 'pointer', minWidth: '160px' }}>
            <option value="">Ordenar por...</option>
            <option value="precio_asc">Precio: menor a mayor</option>
            <option value="precio_desc">Precio: mayor a menor</option>
            <option value="m2_desc">Mayor superficie</option>
            <option value="m2_asc">Menor superficie</option>
          </select>

          {hayFiltroActivo && (
            <button onClick={limpiarFiltros}
              style={{ padding: '.52rem 1rem', background: 'rgba(139,26,26,.08)', color: 'var(--rojo)', border: '1.5px solid rgba(139,26,26,.2)', borderRadius: '8px', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700, fontFamily: 'Montserrat,sans-serif', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '.35rem', whiteSpace: 'nowrap' }}>
              <i className="fa fa-xmark" style={{ fontSize: '.75rem' }} /> Limpiar
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.5rem', flexShrink: 0 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: '.85rem', color: 'var(--azul)', whiteSpace: 'nowrap' }}>
              {hayFiltroActivo ? `${totalFiltradas} resultado${totalFiltradas !== 1 ? 's' : ''}` : `${disponibles} disponibles`}
            </span>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main style={{ background: 'var(--gris)', minHeight: '50vh' }}>
        {loading ? (
          <section style={{ padding: '4rem 2.5rem' }}>
            <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1.8rem' }}>
                {[1,2,3,4,5,6].map(n => (
                  <div key={n} style={{ background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,.06)' }}>
                    <div style={{ height: '220px', background: 'linear-gradient(90deg,var(--gris-calido-claro) 25%,#d8d4ce 50%,var(--gris-calido-claro) 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite' }} />
                    <div style={{ padding: '1.2rem' }}>
                      {[80,60,40].map((w,i) => <div key={i} style={{ height: '14px', width: `${w}%`, borderRadius: '6px', background: 'linear-gradient(90deg,var(--gris-calido-claro) 25%,#d8d4ce 50%,var(--gris-calido-claro) 75%)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s infinite', marginBottom: '.6rem' }} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <style>{`@keyframes skeletonShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </section>

        ) : hayFiltroActivo ? (
          <section style={{ padding: '3rem 2.5rem' }}>
            <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
              {/* Results header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '.68rem', letterSpacing: '3px', textTransform: 'uppercase', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: 'var(--rojo)', borderBottom: '2px solid var(--rojo)', paddingBottom: '.25rem', marginBottom: '.5rem', width: 'fit-content' }}>Resultados</span>
                  <h2 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontWeight: 700, fontSize: 'clamp(1.4rem,2.5vw,2rem)', color: 'var(--azul)', margin: 0 }}>
                    {totalFiltradas} propiedad{totalFiltradas !== 1 ? 'es' : ''} encontrada{totalFiltradas !== 1 ? 's' : ''}
                  </h2>
                </div>
                <button onClick={limpiarFiltros}
                  style={{ padding: '.6rem 1.2rem', background: 'transparent', color: 'var(--rojo)', border: '1.5px solid var(--rojo)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: '.78rem', letterSpacing: '1px' }}>
                  Ver todas
                </button>
              </div>

              {totalFiltradas === 0 ? (
                <div style={{ textAlign: 'center', padding: '5rem 2rem', background: '#fff', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,.05)' }}>
                  <div style={{ width: '64px', height: '64px', background: 'rgba(139,26,26,.08)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.2rem' }}>
                    <i className="fa fa-search" style={{ fontSize: '1.5rem', color: 'var(--rojo)', opacity: .5 }} />
                  </div>
                  <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: 'var(--azul)', marginBottom: '.5rem' }}>Sin resultados</h3>
                  <p style={{ color: '#888', marginBottom: '1.5rem', fontSize: '.95rem' }}>Intenta con otros filtros o explora todo el catálogo.</p>
                  <button onClick={limpiarFiltros}
                    style={{ padding: '.8rem 2rem', background: 'var(--rojo)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontFamily: 'Montserrat,sans-serif', fontSize: '.9rem' }}>
                    Ver todas las propiedades
                  </button>
                </div>
              ) : (
                <>
                  {/* Lista o mapa. Mucha gente no busca por filtros, busca por
                      DONDE: «cerca del trabajo», «en esta zona». Eso una lista
                      no lo puede expresar. */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: '1.5rem' }}>
                    {([['lista', 'Lista', 'fa-grip'], ['mapa', 'Mapa', 'fa-map-location-dot']] as const).map(([v, t, ic]) => (
                      <button key={v} onClick={() => setVista(v)}
                        aria-pressed={vista === v}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '.45rem',
                          padding: '.55rem 1.1rem', borderRadius: 20, cursor: 'pointer',
                          fontSize: '.84rem', fontWeight: vista === v ? 700 : 500,
                          fontFamily: 'Montserrat,sans-serif',
                          border: `1px solid ${vista === v ? 'var(--azul)' : 'var(--borde-frio)'}`,
                          background: vista === v ? 'var(--azul)' : '#fff',
                          color: vista === v ? '#fff' : '#374151',
                        }}>
                        <i className={`fa ${ic}`} style={{ fontSize: '.78rem' }} />
                        {t}
                      </button>
                    ))}
                  </div>

                  {vista === 'mapa' && (
                    <div style={{ marginBottom: '1.8rem' }}>
                      <MapaListado propiedades={sortear(filtrar(propiedades)) as never[]} />
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1.8rem' }}>
                    {sortear(filtrar(propiedades)).map(p => <PropertyCard key={p.id} propiedad={p} />)}
                  </div>
                </>
              )}
            </div>
          </section>

        ) : (
          <>
            {SECCIONES.map((sec, secIdx) => {
              const lista = filtrar(propiedades, sec.tipo)
              if (lista.length === 0) return null
              const isEven = secIdx % 2 === 0
              return (
                <section key={sec.tipo} id={sec.tipo} style={{ padding: '5rem 2.5rem', background: isEven ? 'var(--gris)' : '#fff', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                  <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
                    {/* Section header */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <span style={{ display: 'block', fontSize: '.68rem', letterSpacing: '3.5px', textTransform: 'uppercase', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: sec.color, borderBottom: `2px solid ${sec.color}`, paddingBottom: '.25rem', marginBottom: '.8rem', width: 'fit-content' }}>
                          <i className={`fa ${sec.icon}`} style={{ marginRight: '.4rem' }} />{sec.tipo}
                        </span>
                        <h2 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontWeight: 700, fontSize: 'clamp(1.6rem,3vw,2.4rem)', color: 'var(--azul)', margin: '0 0 .4rem', letterSpacing: '-.5px' }}>
                          {sec.titulo}
                        </h2>
                        <p style={{ color: '#888', fontSize: '.9rem', margin: 0, maxWidth: '480px' }}>{sec.desc}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ background: sec.color, color: '#fff', padding: '.35rem .9rem', borderRadius: '50px', fontSize: '.75rem', fontWeight: 700, fontFamily: 'Montserrat,sans-serif', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
                          {lista.length} disponible{lista.length !== 1 ? 's' : ''}
                        </span>
                        <button onClick={() => updateFiltros({ tipo: sec.tipo })}
                          style={{ padding: '.35rem .9rem', background: 'transparent', border: `1.5px solid ${sec.color}`, borderRadius: '50px', color: sec.color, cursor: 'pointer', fontSize: '.75rem', fontWeight: 700, fontFamily: 'Montserrat,sans-serif', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
                          Ver solo estos
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1.8rem' }}>
                      {sortear(lista).map(p => <PropertyCard key={p.id} propiedad={p} />)}
                    </div>
                  </div>
                </section>
              )
            })}

            {desactualizado && !loading && (
              <div style={{
                background: 'var(--aviso-fondo-calido)', border: '1px solid #FDE68A',
                color: 'var(--aviso-fuerte)', padding: '10px 16px', borderRadius: 9,
                fontSize: '.86rem', marginBottom: '1.25rem', lineHeight: 1.55,
              }}>
                Estás viendo una copia reciente del catálogo: no pudimos conectar
                ahora mismo. Puede que falte algo publicado en los últimos minutos.
              </div>
            )}

            {disponibles === 0 && !loading && (
              falloConsulta ? (
                <div style={{ textAlign: 'center', padding: '6rem 2rem', maxWidth: 520, margin: '0 auto' }}>
                  <i className="fa fa-triangle-exclamation" style={{ fontSize: '3rem', color: 'var(--aviso)', opacity: .55, display: 'block', marginBottom: '1.2rem' }} />
                  <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: 'var(--azul)', marginBottom: '.6rem' }}>
                    No pudimos cargar el catálogo
                  </h3>
                  <p style={{ color: '#5A6472', lineHeight: 1.65, marginBottom: '1.5rem' }}>
                    Es un problema nuestro, no tuyo: <strong>las propiedades siguen ahí</strong>,
                    pero ahora mismo no pudimos consultarlas. Vuelve a intentarlo en un momento.
                  </p>
                  <button onClick={cargarPropiedades} style={{
                    background: 'var(--rojo-marca)', color: '#fff', border: 'none',
                    padding: '.85rem 1.8rem', borderRadius: 9, fontWeight: 700,
                    fontFamily: 'Montserrat,sans-serif', fontSize: '.92rem', cursor: 'pointer',
                  }}>
                    Reintentar
                  </button>
                  <p style={{ marginTop: '1.5rem', fontSize: '.85rem', color: '#8B95A3' }}>
                    ¿Buscas algo concreto? Escríbenos por WhatsApp y te lo mandamos.
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '8rem 2rem', color: '#888' }}>
                  <i className="fa fa-building" style={{ fontSize: '3.5rem', opacity: .2, display: 'block', marginBottom: '1.2rem' }} />
                  <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: 'var(--azul)', marginBottom: '.5rem' }}>Sin propiedades activas</h3>
                  <p>Pronto tendremos nuevas propiedades disponibles.</p>
                </div>
              )
            )}
          </>
        )}

        {/* ── Ventajas ── */}
        <section style={{ padding: '5rem 2.5rem', background: 'linear-gradient(135deg,#08101e 0%,var(--azul) 100%)', color: '#fff' }}>
          <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
              <span style={{ display: 'inline-block', color: 'var(--dorado)', fontWeight: 800, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '3.5px', fontFamily: 'Montserrat,sans-serif', borderBottom: '2px solid var(--dorado)', paddingBottom: '.25rem', marginBottom: '.9rem' }}>Por qué elegirnos</span>
              <h2 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontWeight: 700, fontSize: 'clamp(1.6rem,3vw,2.4rem)', margin: 0 }}>Tu aliado en León, Guanajuato</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1.5rem' }}>
              {[
                { icon: 'fa-shield-halved', title: '100% Confiable', desc: '15 años de experiencia en el mercado inmobiliario de León.' },
                { icon: 'fa-hands-helping', title: 'Asesoría Integral', desc: 'Te acompañamos desde la búsqueda hasta la firma de escrituras.' },
                { icon: 'fa-tag', title: 'Precio Justo', desc: 'Propiedades valoradas con transparencia y al precio real del mercado.' },
                { icon: 'fa-headset', title: 'Atención Inmediata', desc: 'Siempre disponibles por WhatsApp o llamada para resolver tus dudas.' },
              ].map(v => (
                <div key={v.title} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(8px)', borderRadius: '18px', padding: '2rem', transition: 'border-color .3s, background .3s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,169,110,.35)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(201,169,110,.07)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,.08)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.06)' }}>
                  <div style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg,rgba(201,169,110,.2),rgba(201,169,110,.04))', border: '1px solid rgba(201,169,110,.25)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dorado)', fontSize: '1.2rem', marginBottom: '1.2rem' }}>
                    <i className={`fa ${v.icon}`} />
                  </div>
                  <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: '1rem', marginBottom: '.5rem' }}>{v.title}</h3>
                  <p style={{ fontSize: '.88rem', color: 'rgba(255,255,255,.6)', lineHeight: 1.65, margin: 0 }}>{v.desc}</p>
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

      <BarraComparar />
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
            <span style={{ background: 'var(--azul)', color: '#fff', padding: '3px 12px', borderRadius: '20px', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase' }}>{p.tipo}</span>
            <span style={{ background: p.operacion === 'venta' ? 'var(--rojo)' : 'var(--exito)', color: '#fff', padding: '3px 12px', borderRadius: '20px', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase' }}>{p.operacion === 'venta' ? 'VENTA' : 'RENTA'}</span>
          </div>
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '1.5rem', color: 'var(--azul)', marginBottom: '.4rem', fontWeight: 800 }}>{p.titulo}</h2>
          <p style={{ color: '#666', fontSize: '.85rem', marginBottom: '1.5rem' }}>
            <i className="fa fa-map-marker-alt" style={{ color: 'var(--rojo)', marginRight: '.4rem' }} />{p.ubicacion}
          </p>
          {(p.metros || p.recamaras || p.banos) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--superficie)', borderRadius: '12px' }}>
              {p.metros && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '.72rem', color: '#888' }}>Superficie</div><strong style={{ fontSize: '1rem' }}>{p.metros} m²</strong></div>}
              {p.recamaras && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '.72rem', color: '#888' }}>Recámaras</div><strong>{p.recamaras}</strong></div>}
              {p.banos && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '.72rem', color: '#888' }}>Baños</div><strong>{p.banos}</strong></div>}
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: '.72rem', color: '#888' }}>Operación</div><strong style={{ textTransform: 'capitalize' }}>{p.operacion}</strong></div>
            </div>
          )}
          {p.descripcion && <p style={{ lineHeight: 1.7, color: '#555', fontSize: '.9rem', marginBottom: '1.5rem' }}>{p.descripcion}</p>}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.8rem', color: 'var(--rojo)', marginBottom: '1rem' }}>
              {p.precio ? `$${p.precio.toLocaleString('es-MX')}` : 'Consultar precio'}
            </div>
            {!isLoggedIn && (
              <div style={{ marginBottom: '.8rem', padding: '.5rem .8rem', background: 'var(--aviso-fondo-calido)', border: '1px solid #FED7AA', borderRadius: '8px', fontSize: '.8rem', color: 'var(--aviso-fuerte)', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <i className="fa fa-lock" style={{ fontSize: '.75rem' }} />
                <span><strong>Inicia sesión</strong> para contactar al asesor</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
              {isLoggedIn ? (
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent('Hola, me interesa la propiedad: ' + p.titulo)}`} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, minWidth: '120px', background: 'var(--whatsapp)', color: '#fff', textAlign: 'center', padding: '.85rem', borderRadius: '10px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', fontFamily: 'Montserrat, sans-serif' }}>
                  <i className="fab fa-whatsapp" /> WhatsApp
                </a>
              ) : (
                <button onClick={onContact}
                  style={{ flex: 1, minWidth: '120px', background: 'var(--whatsapp)', color: '#fff', border: 'none', padding: '.85rem', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
                  <i className="fab fa-whatsapp" /> WhatsApp
                </button>
              )}
              <button onClick={onContact} style={{ flex: 1, minWidth: '120px', background: 'var(--rojo)', color: '#fff', border: 'none', padding: '.85rem', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}>
                <i className="fa fa-envelope" style={{ marginRight: '.4rem' }} />Contactar
              </button>
            </div>
            <Link href={`/propiedades/${p.id}`} style={{ display: 'block', textAlign: 'center', marginTop: '.8rem', color: 'var(--azul)', fontWeight: 600, fontSize: '.85rem', textDecoration: 'underline' }}>
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
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--rojo)' }} /></div>}>
      <PropiedadesContent />
    </Suspense>
  )
}
