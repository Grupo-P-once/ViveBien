'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Consentimiento, { PistaConsentimiento } from '@/components/Consentimiento'
import { CORREO_CONTACTO, mailtoDe } from '@/lib/contacto'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { registrarEvento } from '@/lib/eventos'
import { enviarGa } from '@/lib/ga'
import { NEGOCIO, enlaceTelefono, enlaceWhatsApp } from '@/lib/config/negocio'
import {
  ArrowUpRight, BadgeCheck, CalendarCheck, CheckCircle2, Clock, FileText, Handshake, Mail, MapPin, MessageCircle, Phone, Send, User, Users, type LucideIcon,
} from 'lucide-react'
import '@/components/nosotros/nosotros.css'
import '@/components/inicio/inicio.css'
import '@/components/contacto/contacto.css'

/** El mapa (Leaflet) se carga aparte y solo en el navegador, y se monta cuando la sección está por entrar en pantalla. */
const MapaTienda = dynamic(() => import('@/components/inicio/MapaTienda'), { ssr: false, loading: () => <div className="ini-mapa-lienzo ini-mapa-cargando" aria-hidden /> })

const CALLE = `${NEGOCIO.calle}, ${NEGOCIO.colonia}`
const CIUDAD = `${NEGOCIO.ciudad}, ${NEGOCIO.estado}, México`
const DIRECCION = `${NEGOCIO.calle}, ${NEGOCIO.colonia}, ${NEGOCIO.ciudad}, ${NEGOCIO.estadoCorto} ${NEGOCIO.cp}`

function Visitanos() {
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
    <section className="cto-visita" aria-labelledby="cto-visita-t" data-seccion="cto-visitanos">
      <div className="cto-visita-texto">
        <p className="nos-eyebrow nos-eyebrow-gris">Visítanos</p>
        <h3 id="cto-visita-t" className="cto-h3">Nuestra oficina<br />en León, Gto.</h3>
        <address className="cto-direccion">{CALLE}<br />{CIUDAD}</address>
        <a className="nos-boton cto-como-llegar" href={NEGOCIO.mapaUrl} target="_blank" rel="noopener noreferrer">
          <MapPin aria-hidden size={18} /> Cómo llegar<span className="nos-solo-lectores"> (se abre en Google Maps, en una pestaña nueva)</span>
        </a>
      </div>
      <div className="cto-mapa" ref={caja} data-ubicacion-tienda>
        {cerca ? <MapaTienda lat={NEGOCIO.lat} lng={NEGOCIO.lng} nombre="VIVE BIEN Grupo Inmobiliario" direccion={DIRECCION} /> : <div className="ini-mapa-lienzo ini-mapa-cargando" aria-hidden />}
      </div>
    </section>
  )
}

type Dato = { Icono: LucideIcon; tono: string; titulo: string; valor: string[]; href: string | null; externo?: boolean }

export default function ContactoPage() {
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', mensaje: '' })
  // La propiedad que se estaba viendo, si se llegó desde una:
  // `/contacto?propiedad=<id>&interes=<título>`. Viaja con el lead para que no
  // llegue al panel con «Interés» y «Origen» vacíos.
  //
  // Se lee de `window.location` y no con `useSearchParams`: esta página se genera
  // estática, y ese hook obligaría a envolverla en un Suspense sólo por esto.
  const [contexto, setContexto] = useState<{ propiedadId: string; interes: string } | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const propiedadId = (q.get('propiedad') ?? '').trim().slice(0, 120)
    const interes = (q.get('interes') ?? '').trim().slice(0, 200)
    if (propiedadId || interes) setContexto({ propiedadId, interes })
  }, [])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [acepta, setAcepta] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.telefono) { setError('Nombre y teléfono son requeridos.'); return }
    setSending(true); setError('')
    try {
      // Por la API y no directo a Supabase: asi se valida, se normaliza el
      // telefono y -sobre todo- queda registrada la version del aviso que
      // esta persona acepto. Sin esa prueba no se pueden compartir sus datos.
      registrarEvento('contact_started')
      const res = await fetch('/api/registro-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(), telefono: form.telefono.trim(),
          email: form.email.trim(), mensaje: form.mensaje.trim(),
          origen: 'contacto', consentimiento: acepta,
          propiedadId: contexto?.propiedadId || null,
          interes: contexto?.interes || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'fallo')
      }
      enviarGa('generate_lead', { origen: 'contacto' })
      setSent(true)
    } catch {
      setError('No pudimos enviar tu mensaje. Por favor escríbenos por WhatsApp.')
    }
    setSending(false)
  }

  const DATOS: Dato[] = [
    { Icono: Phone, tono: 'azul', titulo: 'Teléfono', valor: [NEGOCIO.telefonoInternacional], href: enlaceTelefono() },
    { Icono: MessageCircle, tono: 'verde', titulo: 'WhatsApp', valor: [NEGOCIO.telefonoInternacional], href: enlaceWhatsApp('Hola, quiero más información sobre una propiedad.'), externo: true },
    { Icono: Mail, tono: 'rojo', titulo: 'Correo', valor: [CORREO_CONTACTO], href: mailtoDe() },
    { Icono: MapPin, tono: 'naranja', titulo: 'Ubicación', valor: ['León, Guanajuato, México'], href: NEGOCIO.mapaUrl, externo: true },
    { Icono: Clock, tono: 'morado', titulo: 'Horario', valor: NEGOCIO.horario.map(h => `${h.dias}: ${h.horas}`), href: null },
  ]
  const GARANTIAS: { Icono: LucideIcon; t: string; d: string }[] = [
    { Icono: Handshake, t: 'Asesoría personalizada', d: 'Te acompañamos en todo el proceso.' },
    { Icono: BadgeCheck, t: 'Procesos seguros', d: 'Compra con tranquilidad.' },
    { Icono: Users, t: 'Atención directa', d: 'Nuestro equipo está para ti.' },
  ]

  return (
    <>
      <Header />
      <main className="nos cto" id="contenido">
        {/* Hero */}
        <section className="cto-hero" aria-labelledby="cto-h1" data-seccion="cto-hero">
          <div aria-hidden className="cto-hero-foto"><img src="/portadas/contacto.webp" alt="" width={1218} height={749} fetchPriority="high" decoding="async" /></div>
          <div className="nos-wrap">
            <p className="nos-eyebrow">Hablemos · León, Gto.</p>
            <h1 id="cto-h1" className="cto-h1">Contáctanos <em>tu asesor te espera</em></h1>
            <p className="cto-hero-p">Estamos para ayudarte a encontrar la propiedad perfecta en León, Guanajuato.</p>
          </div>
        </section>

        <div className="cto-cuerpo">
          <div className="nos-wrap cto-grid">
            {/* Información */}
            <div className="cto-info">
              <p className="nos-eyebrow">Información de contacto</p>
              <h2 className="nos-h2 cto-h2">Hablemos de <em>tu próxima inversión</em></h2>
              <p className="nos-p">Visítanos, llámanos o escríbenos. Nuestro equipo está listo para asesorarte y ayudarte a encontrar la propiedad ideal.</p>

              <ul className="cto-datos">
                {DATOS.map(({ Icono, tono, titulo, valor, href, externo }) => (
                  <li key={titulo} className="cto-dato">
                    <span className={`nos-icono cto-ico cto-ico-${tono}`}><Icono aria-hidden size={22} /></span>
                    <div>
                      <span className="cto-dato-t">{titulo}</span>
                      {href ? (
                        <a href={href} target={externo ? '_blank' : undefined} rel={externo ? 'noopener noreferrer' : undefined} className="cto-dato-v">
                          {valor[0]}{externo && <span className="nos-solo-lectores"> (se abre en una pestaña nueva)</span>}
                        </a>
                      ) : valor.map(v => <span key={v} className="cto-dato-v">{v}</span>)}
                    </div>
                  </li>
                ))}
              </ul>

              <Visitanos />

              <ul className="cto-garantias">
                {GARANTIAS.map(({ Icono, t, d }) => (
                  <li key={t}><span className="nos-icono"><Icono aria-hidden size={22} /></span><div><strong>{t}</strong><span>{d}</span></div></li>
                ))}
              </ul>
            </div>

            {/* Formulario */}
            <div className="cto-form-caja" id="formulario">
              {sent ? (
                <div className="cto-enviado" role="status">
                  <CheckCircle2 aria-hidden size={56} />
                  <h2>¡Mensaje enviado!</h2>
                  <p>Un asesor te contactará pronto.<br />También puedes escribirnos por WhatsApp.</p>
                  <a href={enlaceWhatsApp()} target="_blank" rel="noopener noreferrer" className="nos-boton nos-boton-verde"><MessageCircle aria-hidden size={19} /> WhatsApp<span className="nos-solo-lectores"> (se abre en una pestaña nueva)</span></a>
                </div>
              ) : (
                <>
                  <p className="nos-eyebrow">Envíanos un mensaje</p>
                  <h2 className="cto-form-t">Respuesta en menos de <em>2 horas</em></h2>
                  <form onSubmit={handleSubmit} className="cto-form" noValidate={false}>
                    {/* Se enseña lo que se va a mandar: un dato oculto que la persona
                        no ve es un dato que no puede corregir. */}
                    {contexto?.interes && (
                      <p className="cto-contexto"><FileText aria-hidden size={16} /> Consulta sobre: <strong>{contexto.interes}</strong></p>
                    )}
                    <div className="cto-campo">
                      <label htmlFor="cto-nombre">Nombre completo *</label>
                      <span className="cto-input"><User aria-hidden size={18} />
                        <input id="cto-nombre" type="text" required autoComplete="name" value={form.nombre} placeholder="Ej. María García" onChange={e => setForm(v => ({ ...v, nombre: e.target.value }))} /></span>
                    </div>
                    <div className="cto-campo">
                      <label htmlFor="cto-tel">Teléfono / WhatsApp *</label>
                      <span className="cto-input"><Phone aria-hidden size={18} />
                        <input id="cto-tel" type="tel" required autoComplete="tel" value={form.telefono} placeholder="477 123 4567" onChange={e => setForm(v => ({ ...v, telefono: e.target.value }))} /></span>
                    </div>
                    <div className="cto-campo">
                      <label htmlFor="cto-correo">Correo electrónico</label>
                      <span className="cto-input"><Mail aria-hidden size={18} />
                        <input id="cto-correo" type="email" autoComplete="email" value={form.email} placeholder="correo@ejemplo.com" onChange={e => setForm(v => ({ ...v, email: e.target.value }))} /></span>
                    </div>
                    <div className="cto-campo">
                      <label htmlFor="cto-msg">¿En qué podemos ayudarte?</label>
                      <span className="cto-input cto-input-area"><FileText aria-hidden size={18} />
                        <textarea id="cto-msg" rows={4} value={form.mensaje} placeholder="Estoy buscando una nave industrial para renta en León..." onChange={e => setForm(v => ({ ...v, mensaje: e.target.value }))} /></span>
                    </div>
                    {error && <p className="cto-error" role="alert">{error}</p>}
                    <Consentimiento marcado={acepta} onChange={setAcepta} id="cons-contacto" />
                    <button type="submit" disabled={sending || !acepta} className="cto-enviar">
                      <Send aria-hidden size={18} /> {sending ? 'Enviando...' : 'Enviar mensaje'}
                    </button>
                    <PistaConsentimiento visible={!acepta && !sending} />
                  </form>
                  <p className="cto-cita"><CalendarCheck aria-hidden size={16} /> También puedes <a href={enlaceWhatsApp('Hola, quiero información sobre una propiedad en León.')} target="_blank" rel="noopener noreferrer">escribirnos por WhatsApp<ArrowUpRight aria-hidden size={14} /><span className="nos-solo-lectores"> (se abre en una pestaña nueva)</span></a></p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
