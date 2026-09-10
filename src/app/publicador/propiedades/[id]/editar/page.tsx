'use client'
import { useState, useEffect, useCallback, useRef, use } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import Link from 'next/link'
import { calcularCompletitud, faltantes, COMPLETITUD_MINIMA } from '@/lib/publicacion'
import { MINIMO_DESCRIPCION } from '@/lib/esquemas/propiedad'
import VistaPreviaAnuncio from '@/components/VistaPreviaAnuncio'
import dynamic from 'next/dynamic'

// Leaflet toca `window` al importarse: sin ssr:false rompe el prerenderizado.
const MapaSelector = dynamic(() => import('@/components/MapaSelector'), {
  ssr: false,
  loading: () => <div style={{ height: 320, borderRadius: 10, background: 'var(--hueso-hundido, #E7E4DF)', display: 'grid', placeItems: 'center', color: '#8B95A3', fontSize: '.85rem' }}>Cargando el mapa…</div>,
})

type Prop = {
  id: string
  titulo?: string
  tipo?: string
  operacion?: string
  precio?: number
  precio_incluye_iva?: boolean
  mantenimiento?: number
  ubicacion?: string
  descripcion?: string
  lat?: number | null
  lng?: number | null
  fotos?: string[]
  metros?: number
  recamaras?: number
  banos?: number
  altura_libre?: number
  andenes?: number
  amenidades?: string[]
  whatsapp?: string
  estado_pub?: string
  completitud?: number
  nota_moderacion?: string | null
}

const TIPOS = [
  { v: 'nave', t: 'Nave o bodega' },
  { v: 'casa', t: 'Casa' },
  { v: 'departamento', t: 'Departamento' },
  { v: 'terreno', t: 'Terreno' },
  { v: 'comercial', t: 'Local comercial' },
]

const OPERACIONES = [
  { v: 'venta', t: 'Venta' },
  { v: 'renta', t: 'Renta' },
]

/** Los pasos son fijos; lo que cambia dentro es qué campos pide el paso 3. */
const PASOS = [
  'Tipo',
  'Ubicación',
  'Características',
  'Precio',
  'Fotos',
  'Descripción',
  'Revisar',
] as const

const esResidencial = (tipo?: string) => tipo === 'casa' || tipo === 'departamento'
const esIndustrial = (tipo?: string) => tipo === 'nave'

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

/* ── Piezas de interfaz ───────────────────────────────────────── */

const campoBase: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  border: '1px solid var(--borde-frio)',
  borderRadius: 8,
  fontSize: '.95rem',
  fontFamily: 'inherit',
  background: '#fff',
}

function Campo({ etiqueta, ayuda, children }: {
  etiqueta: string
  ayuda?: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block', marginBottom: '1.1rem' }}>
      <span style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--texto)', marginBottom: 5 }}>
        {etiqueta}
      </span>
      {ayuda && (
        <span style={{ display: 'block', fontSize: '.78rem', color: '#6B7280', marginBottom: 6 }}>
          {ayuda}
        </span>
      )}
      {children}
    </label>
  )
}

function Opciones({ valor, opciones, onChange }: {
  valor?: string
  opciones: { v: string; t: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {opciones.map(o => {
        const activo = valor === o.v
        return (
          <button
            key={o.v} type="button" onClick={() => onChange(o.v)}
            aria-pressed={activo}
            style={{
              padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
              fontSize: '.9rem', fontFamily: 'inherit',
              fontWeight: activo ? 700 : 500,
              border: activo ? '2px solid var(--rojo)' : '1px solid var(--borde-frio)',
              background: activo ? '#fdf4f4' : '#fff',
              color: activo ? 'var(--rojo)' : 'var(--texto)',
            }}
          >
            {o.t}
          </button>
        )
      })}
    </div>
  )
}

/* ── Página ───────────────────────────────────────────────────── */

export default function EditarPropiedad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [user, setUser] = useState<User | null>(null)
  const [cargando, setCargando] = useState(true)
  const [prop, setProp] = useState<Prop | null>(null)
  const [paso, setPaso] = useState(0)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState<'limpio' | 'guardando' | 'guardado' | 'error'>('limpio')
  const [subiendo, setSubiendo] = useState(false)
  const [progresoFotos, setProgresoFotos] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [faltaPerfil, setFaltaPerfil] = useState(false)

  const pendiente = useRef<Record<string, unknown>>({})
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/publicador/propiedades', { headers: await cabeceras() })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'No se pudo cargar la propiedad.')
        return
      }
      const todas: Prop[] = await res.json()
      const mia = todas.find(p => p.id === id)
      if (!mia) { setError('Esa propiedad no existe o no es tuya.'); return }
      setProp(mia)
      setError('')
    } catch {
      setError('Error de red.')
    }
  }, [id])

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setCargando(false)
      if (u) cargar()
    })
  }, [cargar])

  /**
   * Autoguardado con retardo.
   *
   * Acumula los cambios y los manda juntos 1,2 s después de la última tecla.
   * El estado local se actualiza al instante: escribir nunca debe sentirse
   * lento por esperar a la red.
   */
  const guardar = useCallback((cambios: Record<string, unknown>) => {
    setProp(p => (p ? { ...p, ...cambios } : p))
    pendiente.current = { ...pendiente.current, ...cambios }
    setGuardado('guardando')

    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(async () => {
      const envio = pendiente.current
      pendiente.current = {}
      if (Object.keys(envio).length === 0) return
      try {
        const res = await fetch(`/api/admin/propiedades/${id}`, {
          method: 'PATCH',
          headers: await cabeceras(),
          body: JSON.stringify(envio),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError(j.error || 'No se pudo guardar.')
          setGuardado('error')
          return
        }
        setError('')
        setGuardado('guardado')
        setTimeout(() => setGuardado(g => (g === 'guardado' ? 'limpio' : g)), 2500)
      } catch {
        setError('Se perdió la conexión. Lo escrito sigue aquí; se guardará al reintentar.')
        setGuardado('error')
      }
    }, 1200)
  }, [id])

  async function subirFotos(archivos: FileList) {
    const nube = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
    if (!nube || !preset) {
      setError('Falta configurar Cloudinary en las variables de entorno.')
      return
    }
    setSubiendo(true)
    const lista = Array.from(archivos)
    const urls: string[] = []
    let fallidas = 0

    for (let i = 0; i < lista.length; i++) {
      setProgresoFotos(Math.round((i / lista.length) * 100))
      const fd = new FormData()
      fd.append('file', lista[i])
      fd.append('upload_preset', preset)
      fd.append('folder', 'vivebien')
      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${nube}/image/upload`, {
          method: 'POST', body: fd,
        })
        const data = await res.json()
        if (data.secure_url) urls.push(data.secure_url)
        else fallidas++
      } catch { fallidas++ }
    }

    setSubiendo(false)
    setProgresoFotos(0)
    if (urls.length) guardar({ fotos: [...(prop?.fotos ?? []), ...urls] })
    // Decir cuántas fallaron es mejor que fingir que subieron todas.
    if (fallidas) setError(`${fallidas} de ${lista.length} fotos no se pudieron subir. Inténtalo otra vez con esas.`)
  }

  function quitarFoto(url: string) {
    guardar({ fotos: (prop?.fotos ?? []).filter(f => f !== url) })
  }

  function moverPortada(url: string) {
    const resto = (prop?.fotos ?? []).filter(f => f !== url)
    guardar({ fotos: [url, ...resto] })
  }

  async function enviarARevision() {
    setEnviando(true)
    // Vaciar lo que quede pendiente antes de enviar, o se perdería.
    if (temporizador.current) clearTimeout(temporizador.current)
    const envio = pendiente.current
    pendiente.current = {}
    if (Object.keys(envio).length) {
      await fetch(`/api/admin/propiedades/${id}`, {
        method: 'PATCH', headers: await cabeceras(), body: JSON.stringify(envio),
      }).catch(() => { })
    }

    const res = await fetch(`/api/propiedades/${id}/estado`, {
      method: 'POST',
      headers: await cabeceras(),
      body: JSON.stringify({ estado: 'en_revision' }),
    })
    const j = await res.json().catch(() => ({}))
    setEnviando(false)
    if (!res.ok) {
      setError(j.error || 'No se pudo enviar a revisión.')
      // Falta el contacto del publicador, no algo de esta propiedad: el sitio
      // donde se arregla es el perfil, y hay que llevarlo hasta ahí.
      setFaltaPerfil(Boolean(j.perfilIncompleto))
      return
    }
    setError('')
    setFaltaPerfil(false)
    cargar()
  }

  if (cargando) return <div style={{ padding: '6rem 2rem', textAlign: 'center' }}>Cargando…</div>

  if (!user) return (
    <div style={{ padding: '6rem 2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Editar propiedad</h1>
      <Link href="/dashboard" style={{ background: 'var(--rojo)', color: '#fff', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
        Iniciar sesión
      </Link>
    </div>
  )

  if (!prop) return (
    <div style={{ padding: '6rem 2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <p style={{ color: 'var(--error)' }}>{error || 'Cargando…'}</p>
      <Link href="/publicador" style={{ color: 'var(--azul)' }}>← Volver a mis propiedades</Link>
    </div>
  )

  const pct = calcularCompletitud(prop as Record<string, unknown>)
  const falta = faltantes(prop as Record<string, unknown>)
  const lista = falta.length === 0
  const largoDescripcion = (prop.descripcion ?? '').trim().length
  const editable = prop.estado_pub !== 'en_revision' && prop.estado_pub !== 'publicada'
  const fotos = prop.fotos ?? []

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.25rem 6rem', fontFamily: 'system-ui' }}>
      <Link href="/publicador" style={{ fontSize: '.85rem', color: 'var(--azul)', textDecoration: 'none' }}>
        ← Mis propiedades
      </Link>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--azul)', margin: '.6rem 0 .2rem' }}>
        {prop.titulo || 'Propiedad sin título'}
      </h1>

      {!editable && (
        <p style={{ background: 'var(--aviso-fondo)', color: 'var(--aviso-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.88rem', marginTop: 10 }}>
          {prop.estado_pub === 'en_revision'
            ? 'Está en revisión. Para poder editarla, retírala primero desde tus propiedades.'
            : 'Está publicada. Para cambiarla, pide a un administrador que la pase a borrador.'}
        </p>
      )}

      {prop.nota_moderacion && (
        <p style={{ background: 'var(--aviso-fondo-calido)', borderLeft: '3px solid var(--aviso)', padding: '10px 14px', fontSize: '.88rem', color: 'var(--aviso-fuerte)', borderRadius: '0 8px 8px 0', marginTop: 10 }}>
          <strong>Nota del revisor:</strong> {prop.nota_moderacion}
        </p>
      )}

      {/* ── Progreso ── */}
      <section style={{ margin: '1.5rem 0' }} aria-label="Progreso del anuncio">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontSize: '.85rem', color: '#5A6472' }}>
            {lista ? 'Listo para enviar a revisión' : `Necesita ${COMPLETITUD_MINIMA}% para poder enviarse`}
          </span>
          <strong style={{ fontSize: '1rem', color: 'var(--texto)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</strong>
        </div>
        <div style={{ height: 8, background: '#F1F4F8', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 4,
            background: lista ? 'var(--exito-fuerte)' : 'var(--aviso)',
            transition: 'width .3s ease',
          }} />
        </div>
      </section>

      {/* ── Pasos ── */}
      <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.5rem' }} aria-label="Pasos">
        {PASOS.map((p, i) => (
          <button
            key={p} type="button" onClick={() => setPaso(i)}
            aria-current={paso === i ? 'step' : undefined}
            style={{
              padding: '6px 13px', borderRadius: 20, cursor: 'pointer',
              fontSize: '.8rem', fontFamily: 'inherit',
              fontWeight: paso === i ? 700 : 500,
              border: paso === i ? '2px solid var(--azul)' : '1px solid var(--borde-frio)',
              background: paso === i ? 'var(--azul)' : '#fff',
              color: paso === i ? '#fff' : '#5A6472',
            }}
          >
            {i + 1}. {p}
          </button>
        ))}
      </nav>

      {error && (
        <p style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.88rem', marginBottom: '1rem' }}>
          {error}
          {faltaPerfil && (
            <>
              {' '}
              <Link href="/mi-cuenta?motivo=publicar" style={{ color: 'var(--error-fuerte)', fontWeight: 700 }}>
                Completar mi perfil →
              </Link>
            </>
          )}
        </p>
      )}

      <fieldset disabled={!editable} style={{ border: 'none', padding: 0, margin: 0, opacity: editable ? 1 : .6 }}>
        <section style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 12, padding: '1.5rem' }}>

          {paso === 0 && (
            <>
              <Campo etiqueta="Título del anuncio" ayuda="Lo primero que ve la gente. Sé concreto: qué es, dónde y cuánto mide.">
                <input value={prop.titulo ?? ''} onChange={e => guardar({ titulo: e.target.value })}
                  placeholder="Bodega en renta en Blvd. San Juan Bosco, 1,244 m²" style={campoBase} />
              </Campo>
              <Campo etiqueta="Tipo de inmueble">
                <Opciones valor={prop.tipo} opciones={TIPOS} onChange={v => guardar({ tipo: v })} />
              </Campo>
              <Campo etiqueta="Operación">
                <Opciones valor={prop.operacion} opciones={OPERACIONES} onChange={v => guardar({ operacion: v })} />
              </Campo>
            </>
          )}

          {paso === 1 && (
            <>
              <Campo etiqueta="Ubicación" ayuda="Calle o boulevard y colonia. No hace falta el número exacto si prefieres reservarlo.">
                <input value={prop.ubicacion ?? ''} onChange={e => guardar({ ubicacion: e.target.value })}
                  placeholder="Blvd. San Juan Bosco, Cañada del Refugio, León, Gto." style={campoBase} />
              </Campo>

              {/* El pin en el mapa. Sin coordenadas no hay busqueda por area,
                  que es lo que mas se espera de un portal inmobiliario.
                  Mientras 07-ubicacion-y-fotos.sql no este aplicado no existe
                  la columna: la ruta PATCH reintenta sin ella, asi que esto no
                  rompe nada — sencillamente todavia no guarda. */}
              <Campo etiqueta="Marca el punto en el mapa"
                ayuda="Es lo que permite que te encuentren buscando por zona.">
                <MapaSelector
                  lat={typeof prop.lat === 'number' ? prop.lat : null}
                  lng={typeof prop.lng === 'number' ? prop.lng : null}
                  direccion={prop.ubicacion ?? ''}
                  deshabilitado={!editable}
                  onCambio={({ lat, lng, direccion }) =>
                    guardar(direccion ? { lat, lng, ubicacion: direccion } : { lat, lng })
                  }
                />
              </Campo>
            </>
          )}

          {paso === 2 && (
            <>
              <Campo etiqueta="Superficie en m²">
                <input type="number" min={0} value={prop.metros ?? ''}
                  onChange={e => guardar({ metros: e.target.value ? Number(e.target.value) : null })}
                  placeholder="1244" style={campoBase} />
              </Campo>

              {esResidencial(prop.tipo) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem' }}>
                  <Campo etiqueta="Recámaras">
                    <input type="number" min={0} value={prop.recamaras ?? ''}
                      onChange={e => guardar({ recamaras: e.target.value ? Number(e.target.value) : null })} style={campoBase} />
                  </Campo>
                  <Campo etiqueta="Baños">
                    <input type="number" min={0} step="0.5" value={prop.banos ?? ''}
                      onChange={e => guardar({ banos: e.target.value ? Number(e.target.value) : null })} style={campoBase} />
                  </Campo>
                </div>
              )}

              {esIndustrial(prop.tipo) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem' }}>
                  <Campo etiqueta="Altura libre en metros">
                    <input type="number" min={0} step="0.1" value={prop.altura_libre ?? ''}
                      onChange={e => guardar({ altura_libre: e.target.value ? Number(e.target.value) : null })} style={campoBase} />
                  </Campo>
                  <Campo etiqueta="Andenes de carga">
                    <input type="number" min={0} value={prop.andenes ?? ''}
                      onChange={e => guardar({ andenes: e.target.value ? Number(e.target.value) : null })} style={campoBase} />
                  </Campo>
                </div>
              )}

              <Campo etiqueta="Amenidades" ayuda="Separadas por comas. Ej: trifásica, patio de maniobras, cisterna">
                <input
                  value={(prop.amenidades ?? []).join(', ')}
                  onChange={e => guardar({
                    amenidades: e.target.value.split(',').map(a => a.trim()).filter(Boolean),
                  })}
                  placeholder="Trifásica, patio de maniobras, oficinas" style={campoBase} />
              </Campo>
            </>
          )}

          {paso === 3 && (
            <>
              <Campo etiqueta={prop.operacion === 'renta' ? 'Precio mensual en pesos' : 'Precio en pesos'}>
                <input type="number" min={0} value={prop.precio ?? ''}
                  onChange={e => guardar({ precio: e.target.value ? Number(e.target.value) : null })}
                  placeholder="118180" style={campoBase} />
              </Campo>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: '1.1rem', fontSize: '.9rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!prop.precio_incluye_iva}
                  onChange={e => guardar({ precio_incluye_iva: e.target.checked })}
                  style={{ width: 17, height: 17, cursor: 'pointer' }} />
                El precio ya incluye IVA
              </label>
              <Campo etiqueta="Mantenimiento mensual" ayuda="Déjalo vacío si no aplica.">
                <input type="number" min={0} value={prop.mantenimiento ?? ''}
                  onChange={e => guardar({ mantenimiento: e.target.value ? Number(e.target.value) : null })}
                  style={campoBase} />
              </Campo>
            </>
          )}

          {paso === 4 && (
            <>
              <p style={{ fontSize: '.88rem', color: '#5A6472', marginBottom: '1rem' }}>
                Mínimo <strong>3 fotos</strong>. La primera es la portada — arrástrala tú eligiendo
                «Hacer portada».
              </p>

              <input type="file" accept="image/*" multiple disabled={subiendo}
                onChange={e => e.target.files && subirFotos(e.target.files)}
                style={{ ...campoBase, padding: 10, cursor: 'pointer' }} />

              {subiendo && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 6, background: '#F1F4F8', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progresoFotos}%`, background: 'var(--azul)' }} />
                  </div>
                  <span style={{ fontSize: '.8rem', color: '#6B7280' }}>Subiendo… {progresoFotos}%</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginTop: '1.2rem' }}>
                {fotos.map((f, i) => (
                  <figure key={f} style={{ margin: 0, position: 'relative', borderRadius: 8, overflow: 'hidden', border: i === 0 ? '2px solid var(--rojo)' : '1px solid #e8ecf1' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f} alt={`Foto ${i + 1} de ${prop.titulo || 'la propiedad'}`}
                      style={{ width: '100%', height: 105, objectFit: 'cover', display: 'block' }} />
                    {i === 0 && (
                      <figcaption style={{ position: 'absolute', top: 6, left: 6, background: 'var(--rojo)', color: '#fff', fontSize: '.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>
                        Portada
                      </figcaption>
                    )}
                    <div style={{ display: 'flex', gap: 4, padding: 6, background: '#fafbfc' }}>
                      {i !== 0 && (
                        <button type="button" onClick={() => moverPortada(f)}
                          style={{ flex: 1, fontSize: '.7rem', padding: '4px', border: '1px solid var(--borde-frio)', borderRadius: 4, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Hacer portada
                        </button>
                      )}
                      <button type="button" onClick={() => quitarFoto(f)}
                        aria-label={`Quitar foto ${i + 1}`}
                        style={{ flex: i === 0 ? 1 : undefined, fontSize: '.7rem', padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: 4, background: '#fff', color: 'var(--error-fuerte)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Quitar
                      </button>
                    </div>
                  </figure>
                ))}
              </div>
            </>
          )}

          {paso === 5 && (
            <>
              <Campo etiqueta="Descripción" ayuda="Lo que no se ve en las fotos: accesos, estado, para qué sirve, qué hay cerca.">
                <textarea value={prop.descripcion ?? ''} onChange={e => guardar({ descripcion: e.target.value })}
                  rows={8} placeholder="Bodega sobre Blvd. San Juan Bosco, con acceso rápido a vialidades principales…"
                  aria-describedby="contador-descripcion"
                  style={{
                    ...campoBase, resize: 'vertical', lineHeight: 1.6,
                    borderColor: largoDescripcion > 0 && largoDescripcion < MINIMO_DESCRIPCION
                      ? 'var(--error-fuerte)' : undefined,
                  }} />
                {/* Avisa mientras escribe, sin bloquearle el teclado. Una
                    descripción de dos líneas no vende nada, y quien la escribe
                    así no sabe que se está perjudicando. */}
                <div id="contador-descripcion" aria-live="polite" style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  marginTop: 5, fontSize: '.78rem',
                  color: largoDescripcion >= MINIMO_DESCRIPCION ? 'var(--exito-fuerte)' : '#8B95A3',
                }}>
                  <span>
                    {largoDescripcion === 0
                      ? `Escribe un mínimo de ${MINIMO_DESCRIPCION} caracteres.`
                      : largoDescripcion < MINIMO_DESCRIPCION
                        ? `Te faltan ${MINIMO_DESCRIPCION - largoDescripcion} caracteres.`
                        : 'Buena longitud.'}
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {largoDescripcion}
                  </strong>
                </div>
              </Campo>
              <Campo etiqueta="WhatsApp de contacto" ayuda="Sólo lo usa el sistema para avisarte. No se publica.">
                <input value={prop.whatsapp ?? ''} onChange={e => guardar({ whatsapp: e.target.value })}
                  placeholder="524771234567" style={campoBase} />
              </Campo>
            </>
          )}

          {paso === 6 && (
            <>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--azul)', marginBottom: '1rem' }}>
                Antes de enviar
              </h2>

              {/* La tarjeta real, no un resumen de campos. Es donde uno ve que
                  la portada esta oscura o que el titulo se corta. */}
              <div style={{ marginBottom: '1.5rem' }}>
                <VistaPreviaAnuncio {...prop} />
              </div>

              {lista ? (
                <p style={{ background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)', padding: '12px 15px', borderRadius: 8, fontSize: '.9rem', lineHeight: 1.6 }}>
                  El anuncio está completo. Al enviarlo, un administrador lo revisa y decide si
                  se publica. Mientras esté en revisión no podrás editarlo.
                </p>
              ) : (
                <div style={{ background: 'var(--aviso-fondo)', padding: '12px 15px', borderRadius: 8 }}>
                  <p style={{ color: 'var(--aviso-fuerte)', fontSize: '.9rem', fontWeight: 600, marginBottom: 8 }}>
                    Falta esto para poder enviarlo:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '.88rem', color: 'var(--aviso-fuerte)', lineHeight: 1.8 }}>
                    {falta.map(f => <li key={f}>{f}</li>)}
                  </ul>
                </div>
              )}

              <button type="button" onClick={enviarARevision} disabled={!lista || enviando || !editable}
                style={{
                  marginTop: '1.5rem', width: '100%', padding: '14px',
                  background: lista && editable ? 'var(--rojo)' : '#cbd5e1',
                  color: '#fff', border: 'none', borderRadius: 9,
                  fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit',
                  cursor: lista && editable ? 'pointer' : 'not-allowed',
                }}>
                {enviando ? 'Enviando…' : 'Enviar a revisión'}
              </button>
            </>
          )}
        </section>
      </fieldset>

      {/* ── Navegación entre pasos ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.2rem', gap: 12 }}>
        <button type="button" onClick={() => setPaso(p => Math.max(0, p - 1))} disabled={paso === 0}
          style={{
            padding: '10px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: '.9rem',
            border: '1px solid var(--borde-frio)', background: '#fff',
            cursor: paso === 0 ? 'not-allowed' : 'pointer', opacity: paso === 0 ? .45 : 1,
          }}>
          Anterior
        </button>

        <span aria-live="polite" style={{ fontSize: '.8rem', color: guardado === 'error' ? 'var(--error-fuerte)' : '#8B95A3' }}>
          {guardado === 'guardando' && 'Guardando…'}
          {guardado === 'guardado' && 'Guardado'}
          {guardado === 'error' && 'No se pudo guardar'}
        </span>

        <button type="button" onClick={() => setPaso(p => Math.min(PASOS.length - 1, p + 1))}
          disabled={paso === PASOS.length - 1}
          style={{
            padding: '10px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: '.9rem', fontWeight: 600,
            border: 'none', background: 'var(--azul)', color: '#fff',
            cursor: paso === PASOS.length - 1 ? 'not-allowed' : 'pointer',
            opacity: paso === PASOS.length - 1 ? .45 : 1,
          }}>
          Siguiente
        </button>
      </div>
    </main>
  )
}
