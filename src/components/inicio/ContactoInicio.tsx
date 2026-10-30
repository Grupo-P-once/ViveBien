'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowUpRight, CheckCircle2, Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react'
import Consentimiento, { PistaConsentimiento } from '@/components/Consentimiento'
import { NEGOCIO, enlaceWhatsApp } from '@/lib/config/negocio'

/** El mapa (Leaflet) se carga aparte y solo en el navegador: no pesa en la carga de la portada. */
const MapaTienda = dynamic(() => import('./MapaTienda'), { ssr: false, loading: () => <div className="ini-mapa-lienzo ini-mapa-cargando" aria-hidden /> })

const DIRECCION_TIENDA = `${NEGOCIO.calle}, ${NEGOCIO.colonia}, ${NEGOCIO.ciudad}, ${NEGOCIO.estadoCorto} ${NEGOCIO.cp}`

/** Monta el mapa cuando la sección está por entrar en pantalla (a 300 px): no se piden teselas de OpenStreetMap al cargar la portada. */
function UbicacionTienda() {
  const caja = useRef<HTMLDivElement>(null)
  const [cerca, setCerca] = useState(false)
  useEffect(() => {
    const el = caja.current
    if (!el || cerca) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setCerca(true); io.disconnect() } }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [cerca])
  return (
    <div className="ini-ubicacion" ref={caja} data-ubicacion-tienda>
      <p className="ini-direccion"><MapPin aria-hidden size={18} /><span>{DIRECCION_TIENDA}</span></p>
      {cerca ? <MapaTienda lat={NEGOCIO.lat} lng={NEGOCIO.lng} nombre="VIVE BIEN Grupo Inmobiliario" direccion={DIRECCION_TIENDA} /> : <div className="ini-mapa-lienzo ini-mapa-cargando" aria-hidden />}
      <a className="ini-como-llegar" href={NEGOCIO.mapaUrl} target="_blank" rel="noopener noreferrer">
        Cómo llegar <ArrowUpRight aria-hidden size={16} /><span className="ini-solo-lectores"> (se abre en Google Maps, en una pestaña nueva)</span>
      </a>
    </div>
  )
}

/**
 * «Contáctanos», más compacto: panel breve con los canales a un lado y el formulario al otro (escritorio); apilado en el teléfono.
 *
 * El FLUJO es el de siempre: `POST /api/registro-lead` con `origen: 'portada'` y el consentimiento tal como la persona lo marcó, la casilla
 * común `Consentimiento`, y los mismos estados (enviando, éxito, error). Lo nuevo:
 *  · «Oficina» entre las opciones de «Me interesa» (clave `oficina`, la misma del catálogo).
 *  · validación en el navegador ANTES de enviar, con el mensaje junto al campo (`aria-invalid`, `aria-describedby`, `role="alert"`) y foco en el
 *    primero con error. Antes el formulario iba con `noValidate` y un campo vacío solo daba «Hubo un error». El servidor sigue validando.
 *  · campos de 48 px de alto, etiquetas visibles (un `placeholder` no es una etiqueta) y `autocomplete` correcto.
 */
const INTERESES = [
  { v: 'casa', t: 'Casa' },
  { v: 'departamento', t: 'Departamento' },
  { v: 'terreno', t: 'Terreno' },
  { v: 'comercial', t: 'Local comercial' },
  { v: 'oficina', t: 'Oficina' },
  { v: 'otro', t: 'Otro' },
] as const

type Campos = { nombre: string; telefono: string; email: string; interes: string; mensaje: string }
type Errores = Partial<Record<'nombre' | 'telefono' | 'email', string>>

/** Reglas mínimas y laxas a propósito: el servidor es quien decide. Un teléfono con lada son 10 dígitos; se aceptan +52 y separadores. */
export function validarContacto(d: Campos): Errores {
  const e: Errores = {}
  if (d.nombre.trim().length < 2) e.nombre = 'Escribe tu nombre.'
  const digitos = d.telefono.replace(/\D/g, '')
  if (digitos.length < 10) e.telefono = 'Escribe un teléfono de 10 dígitos, con lada.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) e.email = 'Escribe un correo válido, por ejemplo nombre@ejemplo.com.'
  return e
}

function FormularioContacto() {
  const [data, setData] = useState<Campos>({ nombre: '', telefono: '', email: '', interes: 'casa', mensaje: '' })
  const [acepto, setAcepto] = useState(false)
  const [errores, setErrores] = useState<Errores>({})
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'err'>('idle')
  const [mensajeError, setMensajeError] = useState('')
  const refs = { nombre: useRef<HTMLInputElement>(null), telefono: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null) }
  const poner = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setData(d => ({ ...d, [k]: e.target.value }))
    if (k in errores) setErrores(prev => ({ ...prev, [k]: undefined }))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    // El botón ya está desactivado sin la casilla. Esto cubre un Enter o un envío forzado.
    if (!acepto) return
    const malos = validarContacto(data)
    setErrores(malos)
    const primero = (['nombre', 'telefono', 'email'] as const).find(k => malos[k])
    if (primero) { refs[primero].current?.focus(); return }
    setEstado('enviando'); setMensajeError('')
    try {
      const res = await fetch('/api/registro-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: data.nombre, telefono: data.telefono, email: data.email,
          interes: data.interes, mensaje: data.mensaje,
          // `acepto`, no `true` fijo: lo que se manda es lo que la persona hizo, no lo que se supone.
          origen: 'portada', consentimiento: acepto,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : 'fallo')
      }
      setEstado('ok')
    } catch (err) {
      setMensajeError(err instanceof Error && err.message !== 'fallo' ? err.message : '')
      setEstado('err')
    }
  }

  if (estado === 'ok') return (
    <div className="ini-contacto-ok" role="status">
      <CheckCircle2 aria-hidden size={44} />
      <h3>¡Mensaje enviado!</h3>
      <p>Un asesor se pondrá en contacto contigo a la brevedad.</p>
    </div>
  )

  const campoError = (k: keyof Errores) => errores[k] ? <p id={`contacto-${k}-error`} className="ini-error-campo" role="alert">{errores[k]}</p> : null
  const ocupado = estado === 'enviando'
  return (
    <form onSubmit={enviar} noValidate className="ini-form" aria-label="Formulario de contacto" data-form="contacto-portada">
      <div className="ini-form-fila">
        <div className="ini-campo">
          <label htmlFor="contacto-nombre">Nombre completo *</label>
          <input id="contacto-nombre" ref={refs.nombre} autoComplete="name" required value={data.nombre} onChange={poner('nombre')} placeholder="Juan Pérez"
            aria-invalid={errores.nombre ? true : undefined} aria-describedby={errores.nombre ? 'contacto-nombre-error' : undefined} />
          {campoError('nombre')}
        </div>
        <div className="ini-campo">
          <label htmlFor="contacto-telefono">Teléfono *</label>
          <input id="contacto-telefono" ref={refs.telefono} type="tel" inputMode="tel" autoComplete="tel" required value={data.telefono} onChange={poner('telefono')} placeholder="477 123 4567"
            aria-invalid={errores.telefono ? true : undefined} aria-describedby={errores.telefono ? 'contacto-telefono-error' : undefined} />
          {campoError('telefono')}
        </div>
      </div>
      <div className="ini-form-fila">
        <div className="ini-campo">
          <label htmlFor="contacto-email">Correo electrónico *</label>
          <input id="contacto-email" ref={refs.email} type="email" autoComplete="email" required value={data.email} onChange={poner('email')} placeholder="juan@ejemplo.com"
            aria-invalid={errores.email ? true : undefined} aria-describedby={errores.email ? 'contacto-email-error' : undefined} />
          {campoError('email')}
        </div>
        <div className="ini-campo">
          <label htmlFor="contacto-interes">Me interesa</label>
          <select id="contacto-interes" value={data.interes} onChange={poner('interes')}>
            {INTERESES.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
          </select>
        </div>
      </div>
      <div className="ini-campo">
        <label htmlFor="contacto-mensaje">Mensaje</label>
        <textarea id="contacto-mensaje" rows={3} value={data.mensaje} onChange={poner('mensaje')} placeholder="Cuéntanos qué necesitas o alguna duda que tengas..." />
      </div>
      {/* La misma casilla que el resto del sitio: el texto que se ve es el que queda registrado con la versión del aviso. */}
      <Consentimiento marcado={acepto} onChange={setAcepto} id="cons-portada" />
      <button type="submit" className="ini-enviar" disabled={ocupado || !acepto}>
        <Send aria-hidden size={18} />{ocupado ? 'Enviando...' : 'Enviar mensaje'}
      </button>
      <PistaConsentimiento visible={!acepto && !ocupado} />
      {estado === 'err' && (
        <p className="ini-error-envio" role="alert">{mensajeError || 'Hubo un error. Inténtalo de nuevo.'}</p>
      )}
    </form>
  )
}

export default function ContactoInicio() {
  return (
    <section id="contacto" className="ini-contacto" aria-labelledby="contacto-titulo" data-seccion="contacto">
      <div className="ini-contacto-grid">
        <div className="ini-contacto-intro">
          <p className="ini-eyebrow"><span aria-hidden className="ini-eyebrow-linea" />Estamos para ayudarte</p>
          <h2 id="contacto-titulo">Contáctanos</h2>
          <p>Déjanos tus datos y uno de nuestros asesores te contactará a la brevedad.</p>
          <ul className="ini-canales" aria-label="Otras formas de contactarnos">
            <li><a href={enlaceWhatsApp('Hola, me interesa una propiedad')} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden size={18} />WhatsApp</a></li>
            <li><a href={`tel:${NEGOCIO.telefono}`}><Phone aria-hidden size={18} />{NEGOCIO.telefonoVisible}</a></li>
            <li><a href={`mailto:${NEGOCIO.email}`}><Mail aria-hidden size={18} />{NEGOCIO.email}</a></li>
          </ul>
          <UbicacionTienda />
        </div>
        <div className="ini-contacto-tarjeta"><FormularioContacto /></div>
      </div>
    </section>
  )
}
