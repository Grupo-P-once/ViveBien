'use client'
import BarraComparar from '@/components/BarraComparar'
import dynamic from 'next/dynamic'

// Leaflet toca `window` al importarse: sin ssr:false rompe el prerenderizado. (El propio mapa descarga Leaflet solo cuando se abre.)
const MapaCatalogo = dynamic(() => import('@/components/catalogo/MapaCatalogo'), {
  ssr: false,
  loading: () => <div className="mc" style={{ minHeight: 64 }} aria-hidden="true" />,
})
import { useState, useEffect, Suspense, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SeccionCarrusel from '@/components/catalogo/SeccionCarrusel'
import TarjetaCompacta, { type PropiedadCatalogo } from '@/components/catalogo/TarjetaCompacta'
import '@/components/catalogo/catalogo.css'
import RegisterModal from '@/components/RegisterModal'
import { useAuth } from '@/lib/useAuth'
import { coincide, normalizarFiltros, aHref } from '@/lib/busquedas'
import { CLAVES_MAS } from '@/lib/filtros-mas'
import PanelMasFiltros, { FiltrosActivos } from '@/components/catalogo/PanelMasFiltros'
import { SUBTIPOS, type Tipo } from '@/lib/esquemas/propiedad'
import { tipoBase } from '@/lib/caracteristicas'
import Link from 'next/link'
import { registrarEvento } from '@/lib/eventos'
import { registrarContactoDelCliente } from '@/lib/registrar-contacto-cliente'
import { textoDeInformes } from '@/lib/whatsapp-propiedad'
import { rutaDe } from '@/lib/propiedad-publica'
import { useDebounce } from '@/lib/useDebounce'
import { NEGOCIO } from '@/lib/config/negocio'
import { fotoOptimizada, imgResponsiva } from '@/lib/medios/optimizar'

interface Propiedad extends PropiedadCatalogo {
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
  extras?: unknown
}

const WA_NUMBER = NEGOCIO.whatsapp

const SECCIONES = [
  { tipo: 'nave', titulo: 'Naves', enfasis: 'Industriales', icon: 'fa-industry', desc: 'Infraestructura de alto nivel para tu operación logística e industrial' },
  { tipo: 'casa', titulo: 'Casas en', enfasis: 'Venta', icon: 'fa-house', desc: 'Espacios familiares pensados para ti en las mejores colonias de León' },
  { tipo: 'departamento', titulo: 'Departamentos', enfasis: '', icon: 'fa-building', desc: 'Vivienda vertical con acabados de primera, ideales para jóvenes y familias' },
  { tipo: 'terreno', titulo: 'Terrenos', enfasis: '', icon: 'fa-map', desc: 'Lotes residenciales e industriales con ubicación estratégica y alta plusvalía' },
  { tipo: 'comercial', titulo: 'Locales', enfasis: 'Comerciales', icon: 'fa-store', desc: 'Espacios estratégicos para que tu negocio crezca en León' },
  { tipo: 'oficina', titulo: 'Oficinas', enfasis: '', icon: 'fa-briefcase', desc: 'Oficinas y consultorios listos para operar en las mejores zonas de León' },
]

/** Filtros de características (además de tipo, operación, zona y precio). Todos viajan en la URL y en las búsquedas guardadas. */
const CLAVES_EXTRA = ['rec', 'ban', 'est', 'smin', 'smax', 'amu', 'masc', 'sub', ...CLAVES_MAS] as const
type ClaveFiltro = 'op' | 'tipo' | 'zona' | 'precioMin' | 'precioMax' | (typeof CLAVES_EXTRA)[number]
type EstadoFiltros = Record<ClaveFiltro, string>
const FILTROS_VACIOS: EstadoFiltros = Object.fromEntries(['op', 'tipo', 'zona', 'precioMin', 'precioMax', ...CLAVES_EXTRA].map(k => [k, ''])) as EstadoFiltros
const MINIMOS = [['', 'Cualquiera'], ['1', '1 o más'], ['2', '2 o más'], ['3', '3 o más'], ['4', '4 o más']] as const

function PropiedadesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [falloConsulta, setFalloConsulta] = useState(false)
  const [desactualizado, setDesactualizado] = useState(false)
  // La propiedad elegida en el mapa (desde su tarjeta o tocando su marcador). `null` = se ven todas las del momento.
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<EstadoFiltros>(() => ({
    ...FILTROS_VACIOS,
    op: searchParams.get('op') || '',
    tipo: searchParams.get('tipo') || '',
    zona: searchParams.get('zona') || '',
    precioMin: searchParams.get('pmin') || '',
    precioMax: searchParams.get('pmax') || '',
    ...Object.fromEntries(CLAVES_EXTRA.map(k => [k, searchParams.get(k) || ''])),
  }))
  const [masFiltros, setMasFiltros] = useState(() => CLAVES_EXTRA.some(k => Boolean(searchParams.get(k))))
  // Resultado de la consulta FILTRADA al servidor (los filtros corren en la consulta, antes del tope de 500). `null` = se ve el catálogo completo.
  const [servidor, setServidor] = useState<{ consulta: string; lista: Propiedad[]; truncado: boolean; degradado: boolean; desactualizado: boolean } | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [falloFiltrado, setFalloFiltrado] = useState(false)
  const [reintento, setReintento] = useState(0)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [ordenar, setOrdenar] = useState('')
  const [selected, setSelected] = useState<Propiedad | null>(null)
  const [regOpen, setRegOpen] = useState(false)
  const { isLoggedIn, user } = useAuth()
  const [busqueda, setBusqueda] = useState<{ estado: 'guardando' | 'ok' | 'ya' | 'error'; texto?: string } | null>(null)

  // Sincronizar filtros con la URL
  const syncUrl = useCallback((f: EstadoFiltros) => {
    const params = new URLSearchParams()
    if (f.op) params.set('op', f.op)
    if (f.tipo) params.set('tipo', f.tipo)
    if (f.zona) params.set('zona', f.zona)
    if (f.precioMin) params.set('pmin', f.precioMin)
    if (f.precioMax) params.set('pmax', f.precioMax)
    for (const k of CLAVES_EXTRA) if (f[k]) params.set(k, f[k])
    const qs = params.toString()
    router.replace(qs ? `/propiedades?${qs}` : '/propiedades', { scroll: false })
  }, [router])

  async function guardarBusqueda() {
    if (!isLoggedIn || !user) { setRegOpen(true); return }
    setBusqueda({ estado: 'guardando' })
    try {
      const t = await user.getIdToken()
      const res = await fetch('/api/busquedas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ filtros }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setBusqueda({ estado: 'error', texto: j.error || 'No se pudo guardar la búsqueda.' })
      else setBusqueda({ estado: j.yaEstaba ? 'ya' : 'ok' })
    } catch {
      setBusqueda({ estado: 'error', texto: 'Se perdió la conexión. Inténtalo otra vez.' })
    }
  }

  /* ── Registrar la búsqueda cuando la persona termina de escribir ──
     Qué busca la gente es el dato más útil que produce el sitio: dice qué
     inventario falta. Pero se registraba en CADA tecla, y el panel acabó con
     «San», «San j», «San ju», «San juan bosc» como zonas buscadas distintas.

     Ahora se espera a que los filtros dejen de cambiar 500 ms. Y sólo cuenta
     lo que cambió la persona: abrir la página con filtros en la URL no es una
     búsqueda nueva, ni lo es repetir la misma. */
  const filtrosEstables = useDebounce(filtros, 500)
  const tocadoPorLaPersona = useRef(false)
  const ultimaRegistrada = useRef<string | null>(null)

  useEffect(() => {
    if (!tocadoPorLaPersona.current) return
    const hayAlgo = Object.values(filtrosEstables).some((v) => String(v ?? '').trim() !== '')
    if (!hayAlgo) return
    const clave = JSON.stringify(filtrosEstables)
    if (clave === ultimaRegistrada.current) return
    ultimaRegistrada.current = clave
    registrarEvento('search_performed', { datos: filtrosEstables })
  }, [filtrosEstables])

  function updateFiltros(partial: Partial<EstadoFiltros>) {
    const next = { ...filtros, ...partial }
    // «Amueblado» y «mascotas» sólo existen en renta: al salir de ahí se quitan.
    if (next.op !== 'renta') { next.amu = ''; next.masc = '' }
    // El subtipo pertenece a un tipo: al cambiar o quitar el tipo, se quita.
    if (partial.tipo !== undefined && partial.tipo !== filtros.tipo) next.sub = ''
    tocadoPorLaPersona.current = true
    setFiltros(next)
    // Otros filtros, otra búsqueda: el «guardada» anterior ya no es verdad.
    setBusqueda(null)
    syncUrl(next)
  }

  function limpiarFiltros() {
    setFiltros({ ...FILTROS_VACIOS })
    setBusqueda(null)
    router.replace('/propiedades', { scroll: false })
  }

  /** «Limpiar» del panel: solo los filtros de «Más filtros»; tipo, operación, zona y precio se conservan. */
  function limpiarPanel() {
    updateFiltros(Object.fromEntries(CLAVES_EXTRA.map(k => [k, ''])) as Partial<EstadoFiltros>)
  }

  /* ── Filtros en la CONSULTA ─────────────────────────────────────────────
     Con algún filtro activo se pide al servidor `/api/catalogo?<filtros>`: la base filtra ANTES del tope de 500, así que una propiedad que cumple no se
     queda fuera por caer más allá de la 500. El navegador vuelve a aplicar `coincide` sobre lo recibido (misma regla, resultado exacto e inmediato al teclear). */
  const consultaFiltros = (() => { const n = normalizarFiltros(filtros); return n ? (aHref(n).split('?')[1] ?? '') : '' })()
  const consultaEstable = useDebounce(consultaFiltros, 350)
  const pendiente = Boolean(consultaFiltros) && (consultaFiltros !== consultaEstable || buscando)
  useEffect(() => {
    if (!consultaEstable) { setServidor(null); setBuscando(false); setFalloFiltrado(false); return }
    const ctl = new AbortController()
    setBuscando(true)
    fetch(`/api/catalogo?${consultaEstable}`, { signal: ctl.signal })
      .then(async res => {
        if (!res.ok) throw new Error(`catalogo ${res.status}`)
        const j = await res.json()
        setServidor({ consulta: consultaEstable, lista: mapear(j.propiedades || []), truncado: Boolean(j.truncado), degradado: Boolean(j.degradado), desactualizado: Boolean(j.desactualizado) })
        setFalloFiltrado(false)
      })
      .catch(err => { if (err?.name !== 'AbortError') { console.error(err); setFalloFiltrado(true) } })
      .finally(() => { if (!ctl.signal.aborted) setBuscando(false) })
    return () => ctl.abort()
  }, [consultaEstable, reintento])

  const cargarPropiedades = useCallback(async () => {
    setLoading(true)
    try {
      // Por /api/catalogo y no directo a Supabase: esa ruta cachea y guarda
      // la última copia buena, así que una caída de la base ya no vacía el
      // sitio. Antes esto iba navegador -> Supabase, sin red debajo.
      const res = await fetch('/api/catalogo')
      if (!res.ok) throw new Error(`catalogo ${res.status}`)
      const payload = await res.json()
      const visibles = (payload.propiedades || []) as Array<Record<string, unknown>>
      setDesactualizado(Boolean(payload.desactualizado))
      // Map snake_case → camelCase for backwards compat
      setPropiedades(mapear(visibles))
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
  }, [])

  useEffect(() => {
    cargarPropiedades()
  }, [cargarPropiedades])

  function getNormTipo(p: Propiedad) {
    // normalize 'depto' → 'departamento'
    return p.tipo === 'depto' ? 'departamento' : p.tipo
  }

  // La regla vive en lib/busquedas y la comparten el listado y el panel del
  // cliente: si «coincide» fuera distinto en cada sitio, «3 nuevas» en el
  // panel abriría un listado con 2.
  function filtrar(lista: Propiedad[], tipo?: string) {
    const f = normalizarFiltros(filtros) ?? {}
    return lista.filter(p => {
      if (tipo && getNormTipo(p) !== tipo) return false
      return coincide(p, f)
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

  // «Activo» lo dice la normalización: un valor inválido de la URL (p. ej. ban=abc) no cuenta como filtro.
  const hayFiltroActivo = normalizarFiltros(filtros) !== null
  // Solo se usa la respuesta del servidor si es de ESTA consulta; una anterior (más estrecha) escondería resultados mientras llega la nueva o si ésta falla.
  const servidorVigente = servidor && servidor.consulta === consultaFiltros ? servidor : null
  const base = hayFiltroActivo && servidorVigente ? servidorVigente.lista : propiedades
  const filtradas = filtrar(base)
  const totalFiltradas = filtradas.length

  /* ── Qué enseña el mapa: TODO el catálogo, o lo que están viendo (tipo o filtros); y UNA propiedad si se eligió ── */
  const listaMapa = hayFiltroActivo ? sortear(filtradas) : propiedades
  const secTipo = SECCIONES.find(s => s.tipo === filtros.tipo)
  const etiquetaMapa = !hayFiltroActivo ? 'Todas las propiedades' : filtros.tipo && secTipo ? `${secTipo.titulo}${secTipo.enfasis ? ` ${secTipo.enfasis}` : ''}` : 'Resultados de tu búsqueda'
  // Si la elegida ya no está en lo que se ve (cambió un filtro), se suelta.
  useEffect(() => { if (seleccionId && !listaMapa.some(p => p.id === seleccionId)) setSeleccionId(null) }, [seleccionId, listaMapa])
  const verEnMapa = useCallback((id: string) => {
    setSeleccionId(id)
    // Con «reducir movimiento» el salto es directo, sin animación (E-53).
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => document.getElementById('mapa-catalogo')?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' }))
  }, [])



  /** «Ver resultados»: cierra el panel y lleva el foco al encabezado de resultados (lector de pantalla y teclado). */
  function verResultados() {
    setMasFiltros(false)
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => {
      const h = document.getElementById('titulo-resultados')
      h?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
      h?.focus({ preventScroll: true })
    })
  }

  return (
    <>
      <Header />
      <RegisterModal isOpen={regOpen} onClose={() => setRegOpen(false)} propertyTitle={selected?.titulo} />

      {/* ── HERO ── */}
      <section className="prop-hero" style={{
        position: 'relative',
        display: 'flex', alignItems: 'flex-end',
        overflow: 'hidden', background: '#08101e',
      }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* TASK 20.01 / R-07: esta foto pesaba 342 KB y se bajaba igual en el teléfono. Ahora Unsplash la sirve al ancho de la ventana, con
              prioridad alta (es el LCP) y precargada desde el servidor (`precargarHero`, mismos src/srcset). */}
          <picture>
            {/* Teléfono: recorte vertical propio (edificio + chevrón) a resolución nativa; escritorio: la portada ancha completa (2055×765). */}
            <source media="(max-width: 700px)" srcSet="/portadas/propiedades-movil.webp" width={880} height={765} />
            <img
              src="/portadas/propiedades.webp"
              width={2055}
              height={765}
              fetchPriority="high"
              decoding="async"
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 40%' }}
            />
          </picture>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,16,30,.18) 0%, rgba(8,16,30,.04) 40%, rgba(8,16,30,.46) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(95deg, rgba(8,16,30,.58) 0%, rgba(8,16,30,.22) 36%, transparent 58%)' }} />
        {/* Animated top line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--rojo),var(--dorado),var(--azul))', zIndex: 5 }} />

        <div style={{ position: 'relative', zIndex: 3, width: '100%', maxWidth: '1240px', margin: '0 auto', padding: '0 2.5rem 3.5rem' }}>
          {/* Breadcrumb */}
          <div className="migas" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1.5rem', color: 'rgba(255,255,255,.45)', fontSize: '.75rem', fontFamily: 'Montserrat,sans-serif', letterSpacing: '1px' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,.45)', textDecoration: 'none' }}>Inicio</Link>
            <i className="fa fa-chevron-right" style={{ fontSize: '.6rem' }} />
            <span style={{ color: 'var(--lavanda)' }}>Propiedades</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <span style={{ display: 'inline-block', background: 'rgba(200,16,46,.5)', border: '1.5px solid var(--rojo-marca)', color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.5)', padding: '.3rem .9rem', borderRadius: '50px', fontSize: '.68rem', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '1rem' }}>
                Catálogo completo
              </span>
              <h1 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontWeight: 700, fontSize: 'clamp(2rem,4.5vw,3.8rem)', color: '#fff', lineHeight: 1.1, margin: 0, letterSpacing: '-1px' }}>
                Propiedades
              </h1>
            </div>
          </div>

          {/* Category quick-nav chips */}
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <button onClick={() => updateFiltros({ tipo: '' })}
              style={{ padding: '.45rem 1.1rem', borderRadius: '50px', border: '1px solid rgba(255,255,255,.2)', background: !filtros.tipo ? 'var(--rojo-marca)' : 'rgba(8,16,30,.58)', color: '#fff', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: '.72rem', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all .2s' }}>
              Todos
            </button>
            {SECCIONES.map(sec => (
              <button key={sec.tipo} onClick={() => updateFiltros({ tipo: sec.tipo })}
                style={{ padding: '.45rem 1.1rem', borderRadius: '50px', border: `1px solid ${filtros.tipo === sec.tipo ? 'var(--rojo-marca)' : 'rgba(255,255,255,.28)'}`, background: filtros.tipo === sec.tipo ? 'var(--rojo-marca)' : 'rgba(8,16,30,.58)', color: '#fff', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: '.72rem', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <i className={`fa ${sec.icon}`} style={{ fontSize: '.68rem' }} />
                {sec.titulo}{sec.enfasis ? ` ${sec.enfasis}` : ''}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── STICKY FILTER BAR ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--gris-calido-claro)', // Con «Más filtros» abierto la barra deja de ser pegajosa: el panel es más alto que un teléfono y, pegado, tapaba los resultados y sus propios botones (hallado en E2E a 360 px).
        position: masFiltros ? 'relative' : 'sticky', top: '72px', zIndex: 998, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        <div className="barra-filtros" style={{ maxWidth: '1240px', margin: '0 auto', padding: '.75rem 2.5rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Op toggle */}
          <div className="selector-operacion" style={{ display: 'flex', background: '#f4f1ec', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--gris-calido)', flexShrink: 0 }}>
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
            <option value="oficina">Oficina</option>
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

          {/* Más filtros: características (recámaras, baños, estacionamientos, superficie, renta) */}
          <button type="button" onClick={() => setMasFiltros(v => !v)} aria-expanded={masFiltros} aria-controls="mas-filtros"
            style={{ padding: '.52rem 1rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: CLAVES_EXTRA.some(k => filtros[k]) ? 'rgba(139,26,26,.08)' : '#fff', color: '#333', fontSize: '.83rem', fontFamily: 'Montserrat,sans-serif', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <i className="fa fa-sliders" aria-hidden="true" /> Más filtros{CLAVES_EXTRA.some(k => filtros[k]) ? ' •' : ''}
          </button>

          {masFiltros && (
            <div id="mas-filtros" role="group" aria-label="Más filtros" style={{ flexBasis: '100%', display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end', paddingTop: '.4rem' }}>
              {([['rec', 'Recámaras']] as const).map(([k, etiqueta]) => (
                <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '.72rem', fontWeight: 700, color: '#4b5563', fontFamily: 'Montserrat,sans-serif' }}>
                  {etiqueta}
                  <select value={filtros[k]} onChange={e => updateFiltros({ [k]: e.target.value })}
                    style={{ padding: '.48rem .8rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: '#fff', color: '#333', fontSize: '.83rem', minWidth: 120 }}>
                    {MINIMOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </label>
              ))}
              {filtros.tipo && (SUBTIPOS[tipoBase(filtros.tipo) as Tipo] ?? []).length > 0 && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '.72rem', fontWeight: 700, color: '#4b5563', fontFamily: 'Montserrat,sans-serif' }}>
                  Subtipo
                  <select value={filtros.sub} onChange={e => updateFiltros({ sub: e.target.value })}
                    style={{ padding: '.48rem .8rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: '#fff', color: '#333', fontSize: '.83rem', minWidth: 170 }}>
                    <option value="">Cualquiera</option>
                    {SUBTIPOS[tipoBase(filtros.tipo) as Tipo].map(s => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
                  </select>
                </label>
              )}
              {([['smin', 'Superficie mín. (m²)'], ['smax', 'Superficie máx. (m²)']] as const).map(([k, etiqueta]) => (
                <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '.72rem', fontWeight: 700, color: '#4b5563', fontFamily: 'Montserrat,sans-serif' }}>
                  {etiqueta}
                  <input type="number" min={0} value={filtros[k]} onChange={e => updateFiltros({ [k]: e.target.value })}
                    style={{ padding: '.48rem .7rem', borderRadius: '8px', border: '1.5px solid var(--gris-calido)', background: '#fff', color: '#333', fontSize: '.83rem', width: 150, boxSizing: 'border-box' }} />
                </label>
              ))}
              {filtros.op === 'renta' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.83rem', fontWeight: 600, minHeight: 40 }}>
                    <input type="checkbox" checked={filtros.masc === '1'} onChange={e => updateFiltros({ masc: e.target.checked ? '1' : '' })} style={{ width: 17, height: 17 }} /> Admite mascotas
                  </label>
                </>
              )}
              <div ref={panelRef} style={{ flexBasis: '100%', minWidth: 0 }}>
                <PanelMasFiltros valores={filtros} onCambio={updateFiltros} onLimpiar={limpiarPanel} onVer={verResultados} total={totalFiltradas} buscando={pendiente} />
              </div>
            </div>
          )}

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

          {hayFiltroActivo && (
            busqueda?.estado === 'ok' || busqueda?.estado === 'ya' ? (
              <Link href="/dashboard" role="status"
                style={{ padding: '.52rem 1rem', background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)', borderRadius: '8px', fontSize: '.78rem', fontWeight: 700, fontFamily: 'Montserrat,sans-serif', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '.35rem', whiteSpace: 'nowrap' }}>
                <i className="fa fa-check" aria-hidden="true" />
                {busqueda.estado === 'ya' ? 'Ya la tenías guardada' : 'Búsqueda guardada'} · ver en mi panel
              </Link>
            ) : (
              <button onClick={guardarBusqueda} disabled={busqueda?.estado === 'guardando'}
                title={isLoggedIn ? 'Guardar estos filtros y ver las novedades en tu panel' : 'Crea tu cuenta para guardar búsquedas'}
                style={{ padding: '.52rem 1rem', background: '#fff', color: 'var(--azul)', border: '1.5px solid var(--azul)', borderRadius: '8px', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700, fontFamily: 'Montserrat,sans-serif', letterSpacing: '.5px', display: 'flex', alignItems: 'center', gap: '.35rem', whiteSpace: 'nowrap' }}>
                <i className="fa fa-bookmark" aria-hidden="true" style={{ fontSize: '.75rem' }} />
                {busqueda?.estado === 'guardando' ? 'Guardando…' : 'Guardar búsqueda'}
              </button>
            )
          )}
          {busqueda?.estado === 'error' && (
            <span role="alert" style={{ fontSize: '.78rem', color: 'var(--error-fuerte)', flexBasis: '100%' }}>{busqueda.texto}</span>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.5rem', flexShrink: 0 }}>
            {/* Sólo cuando hay filtros: cuántas encajan es una respuesta a lo
                que la persona acaba de pedir. El total del catálogo, no. */}
            {hayFiltroActivo && (
              <>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: '.85rem', color: 'var(--azul)', whiteSpace: 'nowrap' }}>
                  {totalFiltradas} resultado{totalFiltradas !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── MAPA: todas las propiedades que se están viendo, o la elegida; y «Mapa completo» ── */}
      {!loading && propiedades.length > 0 && (
        <div id="mapa-catalogo" style={{ background: 'var(--gris)', paddingBottom: '.2rem', scrollMarginTop: 150 }}>
          <MapaCatalogo propiedades={listaMapa as PropiedadCatalogo[]} etiqueta={etiquetaMapa} seleccionId={seleccionId} onSeleccionar={setSeleccionId} />
        </div>
      )}

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
                  <h2 id="titulo-resultados" tabIndex={-1} style={{ fontFamily: '"Playfair Display",Georgia,serif', fontWeight: 700, fontSize: 'clamp(1.4rem,2.5vw,2rem)', color: 'var(--azul)', margin: 0, outline: 'none' }}>
                    {pendiente && !falloFiltrado ? 'Buscando…' : `${totalFiltradas} propiedad${totalFiltradas !== 1 ? 'es' : ''} encontrada${totalFiltradas !== 1 ? 's' : ''}`}
                  </h2>
                </div>
                <button onClick={limpiarFiltros}
                  style={{ padding: '.6rem 1.2rem', background: 'transparent', color: 'var(--rojo)', border: '1.5px solid var(--rojo)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: '.78rem', letterSpacing: '1px' }}>
                  Ver todas
                </button>
              </div>

              <FiltrosActivos valores={filtros} onCambio={updateFiltros} />

              {/* Un resultado PARCIAL nunca debe parecer completo: tope de 500, base sin responder (copia vieja) o filtros resueltos aquí con el catálogo reciente. */}
              {servidorVigente && !falloFiltrado && (servidorVigente.truncado || servidorVigente.degradado || servidorVigente.desactualizado) && (
                <p role="note" className="mf-aviso" data-resultado-parcial={servidorVigente.truncado ? 'si' : 'no'}>
                  {servidorVigente.truncado
                    ? (servidorVigente.degradado || servidorVigente.desactualizado
                      ? 'No pudimos consultar toda la base ahora mismo: estos resultados pueden estar INCOMPLETOS (solo revisamos las 500 propiedades más recientes). Vuelve a intentarlo en unos minutos.'
                      : 'Hay más de 500 propiedades con estos filtros y solo mostramos las primeras 500. Afina la búsqueda para ver el resto.')
                    : (servidorVigente.desactualizado
                      ? 'Estás viendo una copia reciente del catálogo: no pudimos conectar ahora mismo. Puede que falte algo publicado en los últimos minutos.'
                      : 'Los filtros avanzados no estuvieron disponibles un momento; los aplicamos aquí sobre el catálogo completo, así que el resultado es correcto.')}
                </p>
              )}

              {falloFiltrado ? (
                <div role="alert" className="mf-error">
                  <h3>No pudimos consultar los filtros</h3>
                  <p>Es un problema nuestro, no tuyo: las propiedades siguen ahí. Vuelve a intentarlo.</p>
                  <button type="button" onClick={() => setReintento(n => n + 1)}>Reintentar</button>
                </div>
              ) : pendiente && totalFiltradas === 0 ? (
                <p role="status" className="mf-aviso">Buscando propiedades…</p>
              ) : totalFiltradas === 0 ? (
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
                <div className="cat-rejilla-auto">
                  {sortear(filtradas).map((p, i) => (
                    <TarjetaCompacta key={p.id} propiedad={p} prioridad={i < 4} seleccionada={seleccionId === p.id} onVerEnMapa={verEnMapa} />
                  ))}
                </div>
              )}
            </div>
          </section>

        ) : (
          <>
            {(() => {
              let primera = true
              return SECCIONES.map(sec => {
                const lista = sortear(filtrar(propiedades, sec.tipo))
                if (lista.length === 0) return null
                const esPrimera = primera; primera = false
                return (
                  <SeccionCarrusel key={sec.tipo} tipo={sec.tipo} titulo={sec.titulo} tituloEnfasis={sec.enfasis || undefined} icono={sec.icon} descripcion={sec.desc}
                    propiedades={lista} seleccionId={seleccionId} onVerEnMapa={verEnMapa} onVerSoloEstos={() => updateFiltros({ tipo: sec.tipo })} prioridad={esPrimera} />
                )
              })
            })()}


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

            {propiedades.length === 0 && !loading && (
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
  // V-1.1.77 (D-02): siempre el número de VIVE BIEN.
  const wa = WA_NUMBER

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
          {/* El fondo desenfocado se ve a 30 px de blur: pedirlo a 400 px es indistinguible del original y ahorra casi todo su peso. */}
          <div style={{ position: 'absolute', inset: '-20px', backgroundImage: `url(${fotoOptimizada(fotos[foto] ?? '', 400)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(30px) brightness(.35)' }} />
          <img
            {...imgResponsiva(fotos[foto] ?? '', '(max-width: 1000px) 100vw, 580px', 1200)}
            alt={p.titulo}
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }}
          />
          {fotos.length > 1 && (
            <>
              <button aria-label="Foto anterior" onClick={() => setFoto(i => (i - 1 + fotos.length) % fotos.length)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 5, background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa fa-chevron-left" /></button>
              <button aria-label="Foto siguiente" onClick={() => setFoto(i => (i + 1) % fotos.length)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 5, background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa fa-chevron-right" /></button>
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
                <a href={`https://wa.me/${wa}?text=${textoDeInformes(p)}`} target="_blank" rel="noopener noreferrer" onClick={() => { void registrarContactoDelCliente(p.id, 'whatsapp') }}
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
            <Link href={rutaDe(p)} style={{ display: 'block', textAlign: 'center', marginTop: '.8rem', color: 'var(--azul)', fontWeight: 600, fontSize: '.85rem', textDecoration: 'underline' }}>
              Ver página completa →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/** snake_case → camelCase (compatibilidad con las tarjetas). */
function mapear(filas: Array<Record<string, unknown>>): Propiedad[] {
  return filas.map((p) => ({ ...p, alturaLibre: p.altura_libre, m2: p.metros })) as unknown as Propiedad[]
}

export default function PropiedadesPage() {
  return (
    // `useSearchParams` obliga a que todo el catálogo se pinte en el navegador: el HTML que entrega el servidor es solo este respaldo. Con un spinner
    // solamente, esa página llegaba a Google sin encabezado (revisión SEO del 23-oct-2026). El `<h1>` visible lo pinta el catálogo al cargar y
    // reemplaza a este: nunca hay dos a la vez, y el texto es equivalente.
    <Suspense fallback={(
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sr-only">
          <h1>Propiedades en venta y renta en León, Guanajuato</h1>
          <p>Casas, departamentos, terrenos, naves industriales y locales comerciales. Filtra por tipo, operación, zona y precio.</p>
        </div>
        <i className="fa fa-spinner fa-spin" aria-hidden style={{ fontSize: '2rem', color: 'var(--rojo)' }} />
      </div>
    )}>
      <PropiedadesContent />
    </Suspense>
  )
}
