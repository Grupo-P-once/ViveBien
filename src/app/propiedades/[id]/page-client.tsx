'use client'
import NextImage, { getImageProps } from 'next/image'
import { cargadorCloudinary } from '@/lib/medios/cargador-cloudinary'
import { precioPorM2, pesosPorM2 } from '@/lib/medidas'
import Consentimiento, { PistaConsentimiento } from '@/components/Consentimiento'
import { lugarDe } from '@/lib/ubicacion'
import { useState, useEffect, useRef, use } from 'react'
import { supabase } from '@/lib/supabase'
import { SELECT_PUBLICO } from '@/lib/propiedad-publica'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { useAuth } from '@/lib/useAuth'
import RegisterModal from '@/components/RegisterModal'
import GaleriaFluida from '@/components/catalogo/GaleriaFluida'
import CarruselRelacionadas from '@/components/catalogo/CarruselRelacionadas'
import DescripcionRica from '@/components/catalogo/DescripcionRica'
import type { PropiedadCatalogo } from '@/components/catalogo/TarjetaCompacta'
import { recomendadasPara } from '@/lib/catalogo/recomendadas'
import '@/components/catalogo/catalogo.css'
import { idYoutube } from '@/lib/youtube'
import { registrarEvento } from '@/lib/eventos'
import { enviarGa } from '@/lib/ga'
import { contarFichaVista, debeOfrecerRegistro, marcarOfrecido } from '@/lib/momento-registro'
import { nombreDe } from '@/lib/propiedad-publica'
import { textoDeInformes } from '@/lib/whatsapp-propiedad'
import AvisoBajaDePrecio from '@/components/AvisoBajaDePrecio'
import CorazonDeGuardadas from '@/components/CorazonDeGuardadas'
import { SITIO } from '@/lib/sitio'
import { NEGOCIO } from '@/lib/config/negocio'
import { registrarContactoDelCliente } from '@/lib/registrar-contacto-cliente'
import { esVisibleAlPublico } from '@/lib/visibilidad-publica'
import { etiquetaSuperficie, superficiesDe } from '@/lib/caracteristicas'
import CaracteristicasFicha from '@/components/CaracteristicasFicha'
import { amenidadesParaFicha } from '@/lib/caracteristicas'

interface Propiedad {
  id: string
  /** VB-AAAA-NNNNN: lo que se dicta por teléfono. Lo asigna la base. */
  folio?: string | null
  titulo: string
  tipo: string
  operacion: string
  precio: number
  precio_incluye_iva?: boolean
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
  extras?: unknown
  whatsapp?: string
  mantenimiento?: number
  video_url?: string
  videos?: string[]
  planos?: string[]
}

const WA_NUMBER = NEGOCIO.whatsapp
const PLACEHOLDER = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&auto=format&fit=crop'

const tipoLabel: Record<string, string> = {
  nave: 'Nave Industrial', casa: 'Casa', terreno: 'Terreno',
  comercial: 'Local Comercial', departamento: 'Departamento', oficina: 'Oficina',
}
const tipoColor: Record<string, string> = {
  nave: 'var(--azul)', casa: 'var(--rojo)', terreno: 'var(--exito)',
  comercial: 'var(--aviso)', departamento: 'var(--morado)', oficina: 'var(--azul)',
}

export default function DetallePropiedad({ params, idInterno, inicial }: { params: Promise<{ id: string }>; idInterno?: string; inicial?: (Record<string, unknown> & { estado_pub?: string | null; estatus?: string | null }) | null }) {
  const { id: nombreUrl } = use(params)
  // La URL puede traer el nombre público (slug) o el id de siempre. El servidor
  // ya resolvió cuál es la propiedad y pasa su id interno: se busca por clave
  // primaria, que funciona exista o no la columna `slug`.
  const id = idInterno ?? nombreUrl
  // R-09 / QA-007 (D-62): el servidor ya leyó la propiedad para el SEO y la entrega como `inicial` (solo columnas públicas, ya filtradas por
  // visibilidad). Se pinta en el HTML del servidor: la foto principal (el LCP) se descubre al instante en vez de esperar al JS + a una consulta del
  // navegador a Supabase (dos viajes en cascada). El efecto de abajo sigue refrescando y registrando la visita igual que antes.
  const propInicial = inicial && esVisibleAlPublico(inicial) ? ({ ...inicial, alturaLibre: inicial.altura_libre } as unknown as Propiedad) : null
  const [prop, setProp] = useState<Propiedad | null>(propInicial)
  const [loading, setLoading] = useState(!propInicial)
  const [fetchError, setFetchError] = useState(false)
  const [acepta, setAcepta] = useState(false)
  const [mainFoto, setMainFoto] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  // Pies de foto (tabla `fotos`, migración 07). Si no hay, no se enseña nada:
  // una franja vacía sobre la imagen es peor que no tenerla.
  const [pies, setPies] = useState<Record<string, string>>({})
  // Los planos se ven AQUÍ, no en otra pestaña: abrir una pestaña nueva saca a
  // la persona de la ficha y en un teléfono la deja perdida entre pestañas.
  const [plano, setPlano] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', mensaje: 'Estoy interesado en esta propiedad. Por favor, contáctenme.' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  // Con sesión, la consulta queda LIGADA A LA CUENTA (solicitudes_contacto): es la que leen «Mis consultas» y «Me interesan» del portal.
  // Sin sesión es un PROSPECTO (leads). `duplicada`: el servidor ya tenía esa misma solicitud reciente.
  const [conCuenta, setConCuenta] = useState(false)
  const [duplicada, setDuplicada] = useState(false)
  const [sendError, setSendError] = useState('')
  const [regOpen, setRegOpen] = useState(false)
  const [similares, setSimilares] = useState<Propiedad[]>([])
  const { isLoggedIn, user } = useAuth()
  // La carga de la ficha no debe repetirse al iniciar sesión; solo necesita saber, cuando decide ofrecer el registro, si HAY sesión en ese momento.
  const sesionRef = useRef(isLoggedIn)
  useEffect(() => { sesionRef.current = isLoggedIn }, [isLoggedIn])

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('propiedades')
          .select(SELECT_PUBLICO)
          .eq('id', id)
          .single()
        if (error) throw error
        if (data && !esVisibleAlPublico(data)) {
          // Existe pero no está aprobada, o está pausada/archivada: para el público no existe.
          setProp(null)
        } else if (data) {
          const mapped = { ...data, alturaLibre: data.altura_libre } as Propiedad
          setProp(mapped)
          // Save to viewed history
          try {
            const key = 'vb_historial'
            const prev: string[] = JSON.parse(localStorage.getItem(key) || '[]')
            const next = [data.id, ...prev.filter((x: string) => x !== data.id)].slice(0, 12)
            localStorage.setItem(key, JSON.stringify(next))
          } catch {}
          // La visita queda registrada: es lo que alimenta el contador de
          // vistas del anuncio y las gráficas del panel, que hasta V-1.1.52
          // leían una tabla que nadie escribía.
          registrarEvento('property_view', { propiedadId: data.id })

          // El registro se ofrece aquí, no en la portada: a la segunda
          // propiedad que alguien abre ya hay una conversación.
          const vistas = contarFichaVista(data.id)
          if (debeOfrecerRegistro({ conSesion: sesionRef.current, fichasVistas: vistas })) {
            // Un respiro para que vea la propiedad primero: el formulario llega
            // después de la foto y el precio, no encima de ellos.
            setTimeout(() => {
              marcarOfrecido()
              setRegOpen(true)
            }, 9000)
          }

          // Pies de foto (tabla `fotos`). El RLS deja leer las de lo
          // publicado, así que esto va directo desde el navegador.
          try {
            const { data: filas } = await supabase
              .from('fotos')
              .select('url, pie')
              .eq('propiedad_id', data.id)
            const mapa: Record<string, string> = {}
            for (const f of filas ?? []) if (f.pie) mapa[f.url as string] = f.pie as string
            setPies(mapa)
          } catch { /* sin pies: la galería funciona igual */ }

          // Recomendadas: las más parecidas primero (mismo tipo y operación, misma ciudad, precio cercano) y, si faltan, otras que podrían interesar.
          try {
            const { data: simData } = await supabase
              .from('propiedades')
              .select(SELECT_PUBLICO)
              .eq('estatus', 'disponible')
              .neq('id', data.id)
              .order('created_at', { ascending: false })
              .limit(40)
            const visibles = (simData || []).filter(esVisibleAlPublico)
            setSimilares(recomendadasPara(data, visibles, 10).map((p) => ({ ...p, alturaLibre: (p as { altura_libre?: number }).altura_libre })) as unknown as Propiedad[])
          } catch {}
        }
      } catch (e) {
        console.error('Error cargando propiedad:', e)
        setFetchError(true)
      }
      setLoading(false)
    }
    load()
  }, [id])

  // Lightbox: al abrir una foto grande, sus vecinas (+1, −1, +2) se descargan y decodifican ya, para que pasar de foto sea instantáneo.
  useEffect(() => {
    if (lightbox === null || !prop?.fotos?.length) return
    const fs = prop.fotos
    for (const d of [1, -1, 2]) {
      const u = fs[(lightbox + d + fs.length) % fs.length]
      if (!u) continue
      // Se precarga EXACTAMENTE lo que pintará la ventana (mismo cargador, mismo `sizes`): si no coincidiera, el navegador no reutilizaría la descarga.
      const { props: a } = getImageProps({ loader: cargadorCloudinary, src: u, width: 0, height: 0, sizes: '90vw', alt: '' })
      const im = new Image()
      if (a.srcSet) { im.sizes = '90vw'; im.srcset = a.srcSet }
      im.src = a.src
      im.decode?.().catch(() => {})
    }
  }, [lightbox, prop])

  useEffect(() => {
    if (!user) return
    setForm((f) => ({ ...f, nombre: f.nombre || user.displayName || '', email: f.email || user.email || '' }))
  }, [user])

  // Marca la página con la propiedad que se está viendo: `MedicionGa` atribuye a ESTA propiedad los clics en WhatsApp, teléfono o correo del contenido
  // (no los del encabezado y el pie, que son del negocio). Se quita al salir.
  useEffect(() => {
    if (!prop?.id) return
    document.body.dataset.propiedadId = String(prop.id)
    return () => { delete document.body.dataset.propiedadId }
  }, [prop?.id])

  async function enviarSolicitud(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.telefono) return
    // La solicitud de una cuenta exige correo (para poder responderle y para que aparezca en «Mis consultas»).
    if (isLoggedIn && !form.email.trim()) { setSendError('Escribe tu correo: así podrás ver esta consulta en «Mis consultas».'); return }
    setSending(true)
    setSendError('')
    try {
      registrarEvento('contact_started', { propiedadId: prop?.id ?? null })
      if (isLoggedIn && user) {
        const token = await user.getIdToken().catch(() => null)
        if (token) {
          const r = await fetch('/api/contacto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              nombre: form.nombre, telefono: form.telefono, email: form.email, mensaje: form.mensaje,
              propiedadId: id, tipo: 'informacion', consentimiento: acepta,
            }),
          })
          const j = await r.json().catch(() => ({}))
          if (r.ok) { enviarGa('generate_lead', { origen: 'ficha', con_cuenta: true }); setConCuenta(true); setDuplicada(Boolean(j.duplicada)); setSent(true); setSending(false); return }
          // 401 = la sesión venció: se sigue como prospecto (sin perder los datos). Cualquier otro error se dice tal cual.
          if (r.status !== 401) throw new Error(j.error || 'fallo')
        }
      }
      const res = await fetch('/api/registro-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre, telefono: form.telefono, email: form.email,
          mensaje: form.mensaje, propiedadId: id,
          // Sin esto la columna «Interés» del panel salía vacía en todos los
          // leads de una ficha, que son los que más valen.
          interes: prop ? nombreDe(prop) : null,
          origen: 'ficha', consentimiento: acepta,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'fallo')
      }
      enviarGa('generate_lead', { origen: 'ficha', con_cuenta: false })
      setSent(true)
    } catch (err) {
      console.error('Error enviando solicitud:', err)
      const motivo = err instanceof Error && err.message && err.message !== 'fallo' ? err.message : ''
      setSendError(motivo || 'No se pudo enviar. Por favor contáctanos por WhatsApp.')
    }
    setSending(false)
  }

  // Se mide el CLIC (la intención de contactar), tenga o no sesión: contactar exige iniciar sesión y casi todas las visitas son anónimas, así que medir
  // solo lo que pasa tras iniciar sesión dejaría la métrica casi vacía. `MedicionGa` no ve estos botones (no son enlaces): se registran aquí.
  function handleContactClick(canal: 'whatsapp' | 'telefono', action: () => void) {
    registrarEvento('property_contact_click', { propiedadId: prop?.id ?? null, datos: { canal, lugar: 'ficha' } })
    if (isLoggedIn) { void registrarContactoDelCliente(prop?.id, canal); action() } else { setRegOpen(true) }
  }

  if (loading) return (
    <>
      <Header />
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa fa-spinner fa-spin" style={{ fontSize: '2.5rem', color: 'var(--azul)', display: 'block', marginBottom: '1rem' }} />
          <p style={{ color: '#666' }}>Cargando propiedad...</p>
        </div>
      </div>
      {/* Visor de un plano. Un plano se mira con detalle: se puede abrir en
          pestaña aparte SI la persona lo decide, con un enlace explícito. */}
      {plano && (
        <div
          onClick={() => setPlano(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Plano en grande"
          style={{
            position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '1rem', padding: '1rem',
          }}>
          <button type="button" onClick={() => setPlano(null)} aria-label="Cerrar"
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={plano} alt="Plano de la propiedad" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '96vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, background: '#fff' }} />
          <a href={plano} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ color: '#fff', fontSize: '.85rem', textDecoration: 'underline' }}>
            Abrir en otra pestaña para imprimirlo
          </a>
        </div>
      )}

      <Footer />
    </>
  )

  if (fetchError) return (
    <>
      <Header />
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <i className="fa fa-wifi" style={{ fontSize: '3rem', color: '#ddd' }} />
        <h2 style={{ color: '#555', fontFamily: 'Montserrat, sans-serif' }}>Error al cargar la propiedad</h2>
        <p style={{ color: '#5b6472', maxWidth: '380px' }}>No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => window.location.reload()} style={{ background: 'var(--azul)', color: '#fff', padding: '.7rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            <i className="fa fa-redo" style={{ marginRight: '.5rem' }} />Reintentar
          </button>
          <Link href="/propiedades" style={{ background: 'var(--rojo)', color: '#fff', padding: '.7rem 1.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}>
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
        <h2 style={{ color: '#5b6472', fontFamily: 'Montserrat, sans-serif' }}>Propiedad no encontrada</h2>
        <p style={{ color: '#aaa' }}>Es posible que haya sido removida o el enlace sea incorrecto.</p>
        <Link href="/propiedades" style={{ background: 'var(--rojo)', color: '#fff', padding: '.7rem 1.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}>
          Ver todas las propiedades
        </Link>
      </div>
      <Footer />
    </>
  )

  const fotos = prop.fotos?.length ? prop.fotos : [PLACEHOLDER]
  // V-1.1.77 (D-02, ADR-0006): el contacto público es siempre de VIVE BIEN,
  // nunca el WhatsApp que se haya guardado en el anuncio.
  const wa = WA_NUMBER
  // Antes terminaba en «(ID: propiedad-sin-titulo-d52n)»: la clave interna, en
  // el primer mensaje que un cliente le manda a la inmobiliaria. El enlace a la
  // ficha identifica la propiedad igual de bien y además se puede abrir.
  // Con el folio delante: es lo primero que ve quien atiende el mensaje, y
  // basta para saber de qué propiedad se habla aunque el enlace no se abra.
  const waMsg = textoDeInformes(prop, SITIO)
  const color = tipoColor[prop.tipo] || 'var(--azul)'

  return (
    <>
      <Header />
      <RegisterModal isOpen={regOpen} onClose={() => setRegOpen(false)} propertyTitle={nombreDe(prop)} propertyId={prop.id} />

      {/* Breadcrumb */}
      <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '.75rem 2rem' }}>
        <div className="migas" style={{ maxWidth: '1200px', margin: '0 auto', fontSize: '.85rem', color: '#5b6472', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '.15rem' }}>
          <Link href="/" style={{ color: 'var(--azul)', textDecoration: 'none' }}>Inicio</Link>
          <span style={{ margin: '0 .5rem' }}>›</span>
          <Link href="/propiedades" style={{ color: 'var(--azul)', textDecoration: 'none' }}>Propiedades</Link>
          <span style={{ margin: '0 .5rem' }}>›</span>
          <span style={{ color: '#333' }}>{nombreDe(prop)}</span>
        </div>
      </div>

      {/* Gallery */}
      <div className="fx-galeria-banda">
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 280px', gap: '4px', padding: '4px', height: '480px' }} className="gallery-grid">
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px 0 0 12px' }}>
            {/* Galería fluida: todas las fotos en una pista deslizable (dedo, trackpad, ratón arrastrando, flechas y teclado) con las vecinas ya
                descargadas: ya no se cambia el `src` de una sola imagen (eso era el retraso). Tocar la foto la abre en grande. */}
            <GaleriaFluida variante="ficha" fotos={fotos} titulo={nombreDe(prop)} sizes="(max-width: 1000px) 100vw, 920px" prioridad
              indice={mainFoto} alCambiar={setMainFoto} alAbrir={setLightbox}>
              <CorazonDeGuardadas propiedadId={prop.id} titulo={nombreDe(prop)} />
              <span style={{ position: 'absolute', bottom: '12px', right: '12px', zIndex: 3, background: 'rgba(0,0,0,.6)', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontSize: '.78rem', fontWeight: 600, pointerEvents: 'none' }}>
                {mainFoto + 1} / {fotos.length}
              </span>
              {/* El pie, solo si lo hay: una franja negra vacía sobre la foto es peor que no ponerla. */}
              {pies[fotos[mainFoto]] && (
                <p style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, margin: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.75))', color: '#fff', padding: '2rem 1rem .9rem', fontSize: '.86rem', lineHeight: 1.5, pointerEvents: 'none' }}>
                    {pies[fotos[mainFoto]]}
                </p>
              )}
            </GaleriaFluida>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {fotos.slice(0, 2).map((f, i) => (
              <div key={i} onClick={() => setMainFoto(i)} style={{ flex: 1, overflow: 'hidden', borderRadius: i === 0 ? '0 12px 0 0' : '0 0 12px 0', cursor: 'pointer', position: 'relative', border: mainFoto === i ? '3px solid var(--rojo-claro)' : 'none' }}>
                {/* Miniaturas de 280 px de ancho: no hace falta más. */}
                <NextImage
                  loader={cargadorCloudinary}
                  src={f}
                  fill
                  sizes="280px"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ objectFit: 'cover', transition: 'transform .3s', display: 'block' }}
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
      <div style={{ background: 'var(--superficie)', padding: '2.5rem 2rem 4rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2.5rem', alignItems: 'start' }} className="detail-grid">

          {/* Left: Info */}
          <div>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span style={{ background: color, color: '#fff', padding: '4px 14px', borderRadius: '20px', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase' }}>{tipoLabel[prop.tipo] || prop.tipo}</span>
              <span style={{ background: prop.operacion === 'venta' ? 'var(--rojo)' : '#166534', color: '#fff', padding: '4px 14px', borderRadius: '20px', fontSize: '.75rem', fontWeight: 800 }}>{prop.operacion === 'venta' ? 'EN VENTA' : 'EN RENTA'}</span>
              <span style={{ background: '#e6f4ea', color: '#14532d', padding: '4px 14px', borderRadius: '20px', fontSize: '.75rem', fontWeight: 700 }}>● Disponible</span>
              {/* El folio a la vista: quien llama o escribe puede decir «la
                  VB-2026-00006» en vez de describir la propiedad de memoria. */}
              {prop.folio && (
                <span title="Folio de la propiedad" style={{ background: 'var(--superficie)', color: 'var(--azul)', padding: '4px 12px', borderRadius: '20px', fontSize: '.75rem', fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.02em' }}>
                  {prop.folio}
                </span>
              )}
            </div>

            <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.5rem,3vw,2.2rem)', color: 'var(--azul)', marginBottom: '.7rem', lineHeight: 1.2 }}>{nombreDe(prop)}</h1>
            <p style={{ color: '#666', marginBottom: '2rem', fontSize: '1rem' }}>
              <i className="fa fa-map-marker-alt" style={{ color: 'var(--rojo)', marginRight: '.5rem' }} />
              {prop.ubicacion}
            </p>

            {/* Tarjeta de datos: lo esencial de un vistazo (iconos grandes) y el detalle en filas, todo en una sola pieza */}
            {(() => {
              // El TERRENO TOTAL va primero y más grande; la construcción, justo al lado (decisión del dueño, 27-oct-2026). Sin terreno capturado, la superficie principal de siempre.
              const sup = superficiesDe(prop)
              const clave = [
                sup.terreno ? { icono: 'fa-ruler-combined', valor: `${sup.terreno.toLocaleString('es-MX')} m²`, etiqueta: 'Terreno total', principal: true } : null,
                sup.terreno && sup.construccion ? { icono: 'fa-house', valor: `${sup.construccion.toLocaleString('es-MX')} m²`, etiqueta: `${sup.etiquetaConstruccion === 'Nave' ? 'Superficie de la nave' : 'Construcción'}` } : null,
                !sup.terreno && prop.metros ? { icono: 'fa-ruler-combined', valor: `${prop.metros} m²`, etiqueta: etiquetaSuperficie(prop.tipo), principal: true } : null,
                prop.recamaras ? { icono: 'fa-bed', valor: String(prop.recamaras), etiqueta: 'Recámaras' } : null,
                prop.banos ? { icono: 'fa-bath', valor: String(prop.banos), etiqueta: 'Baños' } : null,
                (prop.alturaLibre || prop.altura_libre) ? { icono: 'fa-arrows-up-down', valor: `${prop.alturaLibre || prop.altura_libre} m`, etiqueta: 'Altura libre' } : null,
                prop.andenes ? { icono: 'fa-truck-ramp-box', valor: String(prop.andenes), etiqueta: 'Andenes' } : null,
              ].filter((x): x is { icono: string; valor: string; etiqueta: string; principal?: boolean } => x !== null)
              const filas: [string, string][] = [
                ['Tipo', tipoLabel[prop.tipo] || prop.tipo],
                ['Operación', prop.operacion === 'venta' ? 'Venta' : 'Renta'],
                ['Ubicación', lugarDe(prop).completo],
                ...(prop.precio > 0 && (sup.terreno || prop.metros) ? [[`${prop.operacion === 'venta' ? 'Precio por m²' : 'Renta por m²'}${sup.terreno ? ' de terreno' : ''}`, `${pesosPorM2(precioPorM2(prop.precio, sup.terreno ?? prop.metros) ?? 0)} MXN`] as [string, string]] : []),
                ...(prop.precio > 0 && sup.terreno && sup.construccion ? [[`${prop.operacion === 'venta' ? 'Precio por m²' : 'Renta por m²'} de construcción`, `${pesosPorM2(precioPorM2(prop.precio, sup.construccion) ?? 0)} MXN`] as [string, string]] : []),
                ...(prop.precio > 0 ? [['IVA', prop.precio_incluye_iva ? 'Incluido en el precio' : 'No incluido (+ IVA)'] as [string, string]] : []),
                ...(prop.mantenimiento ? [['Mantenimiento', `$${Number(prop.mantenimiento).toLocaleString('es-MX')} / mes`] as [string, string]] : []),
                ['Disponibilidad', 'Disponible'],
              ]
              return (
                <section className="fd" aria-labelledby="fd-titulo" data-ficha-datos>
                  <header className="fd-cab">
                    <div>
                      <p className="fd-etq">{tipoLabel[prop.tipo] || prop.tipo} · {prop.operacion === 'venta' ? 'En venta' : 'En renta'}</p>
                      <h2 id="fd-titulo">Datos de la propiedad</h2>
                    </div>
                    {prop.folio && <span className="fd-folio" title="Folio de la propiedad">Folio <b>{prop.folio}</b></span>}
                  </header>
                  {clave.length > 0 && (
                    <ul className="fd-clave" aria-label="Lo esencial">
                      {clave.map(c => (
                        <li key={c.etiqueta} className={c.principal ? 'fd-principal' : undefined}>
                          <span className="fd-ico" aria-hidden="true"><i className={`fa ${c.icono}`} /></span>
                          <span><strong>{c.valor}</strong><small>{c.etiqueta}</small></span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="fd-lista">
                    {filas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                  </dl>
                </section>
              )
            })()}

            {prop.descripcion && (
              <div className="fx-card">
                <h3 className="fx-t">
                  <i className="fa fa-info-circle" style={{ marginRight: '.5rem', color: 'var(--rojo)' }} />Sobre esta propiedad
                </h3>
                <DescripcionRica texto={prop.descripcion} />
              </div>
            )}

            {/* Videos: sólo YouTube reconocido por `idYoutube`, incrustado con
                youtube-nocookie (no deja cookies hasta que se pulsa play).
                Antes se leía `video_url` —columna que no existe— y cualquier
                otra URL iba a un <video> sin revisar. */}
            {(() => {
              const ids = Array.from(new Set(
                [...(prop.videos ?? []), prop.video_url ?? '']
                  .map(v => idYoutube(v))
                  .filter((v): v is string => !!v),
              ))
              if (ids.length === 0) return null
              return (
                <div className="fx-card">
                  <h3 className="fx-t">
                    <i className="fa fa-play-circle" style={{ marginRight: '.5rem', color: 'var(--rojo)' }} />
                    {ids.length === 1 ? 'Video de la propiedad' : 'Videos de la propiedad'}
                  </h3>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {ids.map((vid, i) => (
                      <div key={vid} style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: '10px', overflow: 'hidden', background: '#000' }}>
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${vid}`}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          loading="lazy"
                          title={`Video ${i + 1} de ${nombreDe(prop)}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Planos en su propia sección: para una nave valen más que
                cualquier foto, y en la galería se veían como una más. */}
            {prop.planos && prop.planos.length > 0 && (
              <div className="fx-card">
                <h3 className="fx-t">
                  <i className="fa fa-ruler-combined" style={{ marginRight: '.5rem', color: 'var(--rojo)' }} />
                  {prop.planos.length === 1 ? 'Plano' : 'Planos'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {prop.planos.map((pl, i) => (
                    <button key={pl} type="button" onClick={() => setPlano(pl)}
                      aria-label={`Ver el plano ${i + 1} en grande`}
                      className="fx-plano">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pl} alt={`Plano ${i + 1} de ${nombreDe(prop)}`} loading="lazy"
                        style={{ width: '100%', height: 280, objectFit: 'contain', display: 'block', background: '#fafaf8' }} />
                      <span className="fx-plano-pie" aria-hidden="true"><i className="fa fa-magnifying-glass-plus" />Ampliar{prop.planos!.length > 1 ? ` plano ${i + 1}` : ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {amenidadesParaFicha(prop, prop.amenidades).length > 0 && (
              <div data-amenidades-ficha className="fx-card">
                <h3 className="fx-t">
                  <i className="fa fa-star" style={{ marginRight: '.5rem', color: 'var(--rojo)' }} />Amenidades
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '.7rem' }}>
                  {amenidadesParaFicha(prop, prop.amenidades).map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.6rem .8rem', background: 'var(--superficie)', borderRadius: '8px', fontSize: '.88rem', fontWeight: 600, color: '#333' }}>
                      <i className="fa fa-check-circle" style={{ color: 'var(--exito)', flexShrink: 0 }} />
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <CaracteristicasFicha propiedad={prop} omitir={['m_terreno']} />

            {/* Map */}
            <div className="fx-card fx-card-mapa">
              <div className="fx-mapa-cab">
                <i className="fa fa-map-location-dot" aria-hidden="true" />
                <h3 className="fx-t">Ubicación</h3>
              </div>
              <iframe
                src={`https://maps.google.com/maps?q=${encodeURIComponent(prop.ubicacion + ', León, Guanajuato, México')}&output=embed`}
                width="100%"
                height="300"
                style={{ border: 'none', display: 'block' }}
                loading="lazy"
                title={`Ubicación: ${prop.ubicacion}`}
              />
              <div className="fx-mapa-pie">
                <span><i className="fa fa-map-marker-alt" aria-hidden="true" style={{ color: 'var(--rojo)', marginRight: '.4rem' }} />{lugarDe(prop).completo}</span>
                <a className="fx-mapa-boton" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${prop.ubicacion}, León, Guanajuato, México`)}`} target="_blank" rel="noopener noreferrer"><i className="fa fa-diamond-turn-right" aria-hidden="true" />Cómo llegar<span className="sr-only"> (se abre en otra pestaña)</span></a>
              </div>
            </div>
          </div>

          {/* Right: Sticky contact panel */}
          <div id="contacto-ficha" style={{ position: 'sticky', top: '100px', scrollMarginTop: '90px', alignSelf: 'start' }}>
            <div style={{ background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}>
              <div style={{ background: 'linear-gradient(135deg, #0d1a2e 0%, var(--azul) 100%)', borderTop: '4px solid var(--rojo-marca)', padding: '1.5rem', color: '#fff', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '1.8rem' }}>
                  {prop.precio ? `$${prop.precio.toLocaleString('es-MX')}` : 'Consultar precio'}
                </div>
                {prop.precio > 0 && (
                  <div style={{
                    display: 'inline-block', marginTop: '.4rem',
                    fontSize: '.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '20px',
                    background: prop.precio_incluye_iva ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.2)',
                    color: '#fff', letterSpacing: '.06em', textTransform: 'uppercase',
                    border: `1px solid ${prop.precio_incluye_iva ? 'rgba(16,185,129,.5)' : 'rgba(255,255,255,.3)'}`,
                  }}>
                    {prop.precio_incluye_iva ? '✓ IVA incluido' : '+ IVA no incluido'}
                  </div>
                )}
                {prop.mantenimiento && <div style={{ fontSize: '.8rem', opacity: .85, marginTop: '.3rem' }}>+ ${prop.mantenimiento.toLocaleString('es-MX')} mantenimiento</div>}
                <div style={{ fontSize: '.78rem', opacity: .75, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  {prop.operacion === 'venta' ? 'Precio de venta' : 'Renta mensual'}
                </div>
              </div>

              {/* Banner de sesión requerida */}
              {!isLoggedIn && (
                <div style={{ background: 'var(--aviso-fondo-calido)', borderBottom: '1px solid #FED7AA', padding: '.7rem 1.2rem', display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem', color: 'var(--aviso-fuerte)' }}>
                  <i className="fa fa-lock" />
                  <span><strong>Inicia sesión</strong> para ver los datos de contacto del asesor</span>
                </div>
              )}

              {sent ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <i className="fa fa-check-circle" style={{ fontSize: '3rem', color: 'var(--exito)', display: 'block', marginBottom: '1rem' }} />
                  <h3 style={{ fontFamily: 'Montserrat, sans-serif', color: 'var(--azul)', marginBottom: '.5rem' }}>¡Solicitud enviada!</h3>
                  <p style={{ color: '#666', fontSize: '.9rem', marginBottom: conCuenta ? '.6rem' : '1.5rem' }}>
                    {duplicada ? 'Ya recibimos tu solicitud sobre esta propiedad. Un asesor te contactará a la brevedad.' : 'Un asesor te contactará a la brevedad.'}
                  </p>
                  {conCuenta && (
                    <p data-solicitud-con-cuenta style={{ color: '#444', fontSize: '.85rem', marginBottom: '1.5rem' }}>
                      Quedó en tu cuenta: puedes verla en <Link href="/portal/consultas" style={{ color: 'var(--azul)', fontWeight: 700 }}>Mis consultas</Link>.
                    </p>
                  )}
                  <button onClick={() => handleContactClick('whatsapp', () => window.open(`https://wa.me/${wa}?text=${waMsg}`, '_blank'))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', background: 'var(--whatsapp)', color: '#0b3d2e', padding: '.85rem', borderRadius: '10px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', border: 'none', cursor: 'pointer', width: '100%' }}>
                    <i className="fab fa-whatsapp" /> También por WhatsApp
                  </button>
                </div>
              ) : (
                <form onSubmit={enviarSolicitud} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
                  {[
                    { key: 'nombre', label: 'NOMBRE COMPLETO', type: 'text', icon: 'fa-user', placeholder: 'Ej. Juan Pérez', required: true },
                    { key: 'telefono', label: 'WHATSAPP / TELÉFONO', type: 'tel', icon: 'fa-phone', placeholder: '477 123 4567', required: true },
                    { key: 'email', label: 'CORREO ELECTRÓNICO', type: 'email', icon: 'fa-envelope', placeholder: 'correo@ejemplo.com', required: isLoggedIn },
                  ].map(f => (
                    <div key={f.key}>
                      <label htmlFor={`fc-${f.key}`} style={{ fontSize: '.72rem', fontWeight: 700, color: '#5b6472', letterSpacing: '.06em', display: 'block', marginBottom: '.3rem' }}>
                        <i className={`fa ${f.icon}`} style={{ marginRight: '.3rem', color: color }} />{f.label}
                      </label>
                      <input id={`fc-${f.key}`} type={f.type} required={f.required} value={(form as unknown as Record<string, string>)[f.key]} placeholder={f.placeholder}
                        onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '.65rem .85rem', border: '1.5px solid #E0E4EA', borderRadius: '8px', fontSize: '.9rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label htmlFor="fc-mensaje" style={{ fontSize: '.72rem', fontWeight: 700, color: '#5b6472', letterSpacing: '.06em', display: 'block', marginBottom: '.3rem' }}>
                      <i className="fa fa-comment" style={{ marginRight: '.3rem', color: color }} />DUDAS O COMENTARIOS
                    </label>
                    <textarea id="fc-mensaje" rows={3} value={form.mensaje} onChange={e => setForm(v => ({ ...v, mensaje: e.target.value }))}
                      style={{ width: '100%', padding: '.65rem .85rem', border: '1.5px solid #E0E4EA', borderRadius: '8px', fontSize: '.9rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  {sendError && (
                    <p style={{ color: 'var(--error)', background: 'var(--error-fondo)', padding: '.6rem .8rem', borderRadius: '8px', fontSize: '.82rem', fontWeight: 600 }}>
                      <i className="fa fa-exclamation-circle" style={{ marginRight: '.4rem' }} />{sendError}
                    </p>
                  )}
                  <Consentimiento marcado={acepta} onChange={setAcepta} id="cons-ficha" />
                  <button type="submit" disabled={sending || !acepta} style={{ background: color, color: '#fff', border: 'none', padding: '.9rem', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '.95rem', fontFamily: 'Montserrat, sans-serif', opacity: sending ? .7 : 1 }}>
                    <i className="fa fa-paper-plane" style={{ marginRight: '.5rem' }} />{sending ? 'Enviando...' : 'ENVIAR SOLICITUD'}
                  </button>
                  <PistaConsentimiento visible={!acepta && !sending} />
                  <button type="button" onClick={() => handleContactClick('whatsapp', () => window.open(`https://wa.me/${wa}?text=${waMsg}`, '_blank'))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', background: 'var(--whatsapp)', color: '#0b3d2e', padding: '.8rem', borderRadius: '10px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', fontSize: '.9rem', border: 'none', cursor: 'pointer' }}>
                    <i className="fab fa-whatsapp" /> HABLAR POR WHATSAPP
                  </button>
                  <button type="button" onClick={() => handleContactClick('telefono', () => { window.location.href = `tel:+${wa}` })}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', background: 'transparent', color: 'var(--azul)', padding: '.8rem', borderRadius: '10px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', fontSize: '.9rem', border: '1.5px solid var(--azul)', cursor: 'pointer' }}>
                    <i className="fa fa-phone" /> LLAMAR AHORA
                  </button>
                </form>
              )}
            </div>
            {/* La campana: avisar si baja de precio (solo con cuenta; abajo de la caja de precio y contacto) */}
            {prop.precio > 0 && (prop.estatus ?? 'disponible') === 'disponible' && (
              <AvisoBajaDePrecio propiedadId={prop.id} isLoggedIn={isLoggedIn} />
            )}
          </div>
        </div>
      </div>

      {/* Propiedades recomendadas, en carrusel */}
      <CarruselRelacionadas
        propiedades={similares as unknown as PropiedadCatalogo[]}
        titulo="Propiedades recomendadas"
        subtitulo={`Parecidas a esta en ${lugarDe(prop).ciudad} y otras que podrían interesarte.`}
      />

      {/* Lightbox */}
      {lightbox !== null && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: '44px', height: '44px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
          <button onClick={e => { e.stopPropagation(); setLightbox(i => (i! - 1 + fotos.length) % fotos.length) }} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: '50px', height: '50px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer' }}>&#8249;</button>
          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }} onClick={e => e.stopPropagation()}>
            {/* A pantalla completa sí se justifica pedirla grande, pero no la original de 1966 px: 1600 cubre cualquier portátil. */}
            <NextImage
              loader={cargadorCloudinary}
              src={fotos[lightbox] ?? ''}
              width={0}
              height={0}
              sizes="90vw"
              loading="eager"
              alt={pies[fotos[lightbox]] ?? ''}
              decoding="async"
              style={{ width: 'auto', height: 'auto', maxWidth: '90vw', maxHeight: pies[fotos[lightbox]] ? '78vh' : '85vh', objectFit: 'contain', borderRadius: '8px' }} />
            {pies[fotos[lightbox]] && (
              <figcaption style={{ color: '#fff', fontSize: '.9rem', maxWidth: '70ch', textAlign: 'center', lineHeight: 1.5 }}>
                {pies[fotos[lightbox]]}
              </figcaption>
            )}
          </figure>
          <button onClick={e => { e.stopPropagation(); setLightbox(i => (i! + 1) % fotos.length) }} style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: '50px', height: '50px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer' }}>&#8250;</button>
          <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px' }}>
            {fotos.map((_, i) => <span key={i} onClick={e => { e.stopPropagation(); setLightbox(i) }} style={{ width: '8px', height: '8px', borderRadius: '50%', background: i === lightbox ? '#fff' : 'rgba(255,255,255,.4)', cursor: 'pointer' }} />)}
          </div>
        </div>
      )}

      {/* Barra fija de contacto en móvil: la acción principal siempre a la mano (el botón flotante de WhatsApp se oculta aquí para no apilar dos). */}
      <div className="fx-barra-movil" data-barra-movil role="group" aria-label="Contactar sobre esta propiedad">
        <button type="button" className="fx-bm-wa" onClick={() => handleContactClick('whatsapp', () => window.open(`https://wa.me/${wa}?text=${waMsg}`, '_blank'))}><i className="fab fa-whatsapp" aria-hidden="true" />WhatsApp</button>
        <button type="button" className="fx-bm-tel" onClick={() => handleContactClick('telefono', () => { window.location.href = `tel:+${wa}` })}><i className="fa fa-phone" aria-hidden="true" />Llamar</button>
        <a className="fx-bm-form" href="#contacto-ficha"><i className="fa fa-paper-plane" aria-hidden="true" />Solicitar información</a>
      </div>

      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .detail-grid { grid-template-columns: 1fr !important; }

          /* La galería pasaba a una columna pero conservaba los 480 px de alto
             fijos: las tres filas quedaban de 157 px, las flechas se pegaban al
             borde y el contador «1 / 26» caía ENCIMA de la flecha derecha.
             Alto automático y proporción fija: la foto manda, no una cifra. */
          .gallery-grid {
            grid-template-columns: 1fr !important;
            height: auto !important;
          }
          .gallery-grid > div:first-child {
            aspect-ratio: 4 / 3;
          }
          /* Las dos miniaturas, una al lado de la otra: apiladas se comían
             media pantalla antes de llegar al precio. */
          .gallery-grid > div:last-child {
            flex-direction: row !important;
            height: 92px;
          }
          .gallery-grid > div:last-child > div {
            flex: 1;
          }
        }

        /* Fold cerrado: la foto vertical deja ver más del inmueble. */
        @media (max-width: 360px) {
          .gallery-grid > div:first-child { aspect-ratio: 1 / 1; }
          .gallery-grid > div:last-child { height: 74px; }
        }
      `}</style>
    </>
  )
}
