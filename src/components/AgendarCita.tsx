'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { useAuth } from '@/lib/useAuth'
import { llamarApi } from '@/lib/citas/cliente'
import { fechaLarga, horaCorta } from '@/lib/citas/zona'
import type { Disponibilidad } from '@/lib/citas/servicio'
import type { CitaVista } from '@/lib/citas/vista'

/**
 * «Agenda una cita» (5-nov-2026): la tarjeta de la ficha, encima de la campana de baja de precio. Mismo lenguaje visual que la
 * campana pero más grande; al tocarla se despliegan los días y las horas REALMENTE libres, y al elegir una se manda la solicitud.
 *
 *  · Solo con cuenta: sin sesión, tocarla lleva a entrar o crear cuenta (nada se guarda).
 *  · Si `citasEnLinea` está apagado la tarjeta NO aparece (no se promete lo que no se puede reservar).
 *  · Mandar la solicitud NO aparta el horario: solo la cita confirmada lo aparta (D-2). El texto lo dice.
 *  · Llega a «Mis citas» y por correo; la respuesta (confirmada, rechazada, otro horario) también.
 *  · La clave de idempotencia se renueva al cambiar de horario: la misma clave devuelve la misma cita, y un horario nuevo es otra solicitud.
 */
type Paso = 'cerrada' | 'abierta' | 'enviando' | 'enviada'

const nuevaClave = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`)

export default function AgendarCita({ propiedadId, isLoggedIn }: { propiedadId: string; isLoggedIn: boolean }) {
  const router = useRouter()
  const { loading: sesionCargando } = useAuth()
  const [encendido, setEncendido] = useState<boolean | null>(null)
  const [paso, setPaso] = useState<Paso>('cerrada')
  const [huecos, setHuecos] = useState<Disponibilidad | null>(null)
  const [cargando, setCargando] = useState(false)
  const [dia, setDia] = useState<string | null>(null)
  const [inicio, setInicio] = useState<string | null>(null)
  const [consiente, setConsiente] = useState(false)
  const [notas, setNotas] = useState('')
  const [telefono, setTelefono] = useState('')
  const [pideTelefono, setPideTelefono] = useState(false)
  const [error, setError] = useState('')
  const [enviada, setEnviada] = useState<CitaVista | null>(null)
  const clave = useRef<{ inicio: string; valor: string } | null>(null)

  useEffect(() => {
    let vivo = true
    void fetch('/api/citas/estado').then((r) => r.json()).then((j: { citasEnLinea?: boolean }) => { if (vivo) setEncendido(j.citasEnLinea === true) }).catch(() => { if (vivo) setEncendido(false) })
    return () => { vivo = false }
  }, [])

  async function cargarHuecos() {
    setCargando(true); setError('')
    const r = await llamarApi<Disponibilidad>(`/api/citas/disponibilidad?propiedad=${encodeURIComponent(propiedadId)}&dias=14`)
    setCargando(false)
    if (!r.ok) { setError(r.error); return }
    setHuecos(r.data)
    setDia(r.data.dias.find((d) => d.horarios.length)?.dia ?? null)
  }

  function alternar() {
    if (!isLoggedIn) { router.push(rutaDeEntrada(`${window.location.pathname}${window.location.search}`)); return }
    if (paso === 'abierta') { setPaso('cerrada'); return }
    if (paso === 'enviada') { setPaso('cerrada'); setEnviada(null); return }
    setPaso('abierta')
    if (!huecos) void cargarHuecos()
  }

  async function enviar() {
    if (!inicio || paso === 'enviando') return
    if (!consiente) { setError('Marca la casilla para que podamos compartir tus datos con quien atiende la visita.'); return }
    if (!clave.current || clave.current.inicio !== inicio) clave.current = { inicio, valor: nuevaClave() }
    setPaso('enviando'); setError('')
    const r = await llamarApi<{ cita: CitaVista }>('/api/citas', {
      method: 'POST', clave: clave.current.valor,
      cuerpo: { propiedadId, inicio, consentimiento: true, ...(notas.trim() ? { notas: notas.trim() } : {}), ...(telefono.trim() ? { telefono: telefono.trim() } : {}) },
    })
    if (r.ok) { setEnviada(r.data.cita); setPaso('enviada'); return }
    setPaso('abierta'); setError(r.error)
    if (/tel[eé]fono/i.test(r.error)) setPideTelefono(true)
    // El horario se ocupó mientras se elegía: se refrescan los huecos.
    if (r.status === 409) { setInicio(null); void cargarHuecos() }
  }

  // Con el flag apagado (o sin saberlo todavía) no se muestra: no se promete lo que no se puede reservar.
  if (!encendido) return null

  const abierta = paso === 'abierta' || paso === 'enviando'
  const diasConHuecos = huecos?.dias.filter((d) => d.horarios.length) ?? []
  const horas = diasConHuecos.find((d) => d.dia === dia)?.horarios ?? []
  const titulo = (d: string) => fechaLarga(new Date(`${d}T18:00:00Z`))
  const chip = (activo: boolean): React.CSSProperties => ({
    minHeight: 44, padding: '0 .9rem', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: '.88rem',
    border: '2px solid var(--azul)', background: activo ? 'var(--azul)' : '#fff', color: activo ? '#fff' : 'var(--azul)',
  })

  return (
    <section aria-labelledby="agendar-cita-t" data-agendar-cita style={{ marginTop: '1rem', background: '#fff', borderRadius: 20, boxShadow: '0 8px 30px rgba(0,0,0,.08)', border: '1px solid #E8ECF1', padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={alternar} aria-expanded={abierta} aria-controls="agendar-cita-panel"
          aria-label={abierta ? 'Cerrar agenda de cita' : 'Agenda una cita'} disabled={sesionCargando} aria-busy={sesionCargando} data-agendar-boton
          style={{ width: 58, height: 58, flex: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: abierta ? 'var(--azul)' : '#fff', color: abierta ? '#fff' : 'var(--azul)', border: '2px solid var(--azul)', transition: 'transform .15s, background .2s' }}>
          <i className={abierta ? 'fas fa-calendar-check' : 'far fa-calendar-check'} aria-hidden="true" />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 id="agendar-cita-t" style={{ margin: 0, fontFamily: 'Montserrat, sans-serif', fontSize: '1.05rem', fontWeight: 800, color: 'var(--azul)' }}>Agenda una cita</h3>
          <p style={{ margin: '.2rem 0 0', fontSize: '.82rem', lineHeight: 1.35, color: '#4b5563' }}>
            {!isLoggedIn ? 'Con tu cuenta eliges día y hora para visitarla.' : 'Elige el día y la hora que mejor te acomoden.'}
          </p>
        </div>
      </div>

      {abierta && (
        <div id="agendar-cita-panel" style={{ marginTop: '.9rem' }}>
          {cargando && <p role="status" style={{ fontSize: '.85rem', color: '#4b5563' }}>Buscando horarios disponibles…</p>}
          {!cargando && huecos && diasConHuecos.length === 0 && !error && (
            <p role="status" style={{ fontSize: '.88rem', color: '#4b5563' }}>Por ahora no hay horarios libres en los próximos 14 días. Escríbenos por WhatsApp y te ayudamos a acordar uno.</p>
          )}
          {diasConHuecos.length > 0 && (
            <>
              <div role="group" aria-label="Día de la visita" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                {diasConHuecos.map((d) => (
                  <button key={d.dia} type="button" aria-pressed={dia === d.dia} onClick={() => { setDia(d.dia); setInicio(null) }} style={{ ...chip(dia === d.dia), flex: 'none', textTransform: 'capitalize' }}>
                    {titulo(d.dia).replace(/^(\p{L}+),?\s*/u, (_, w: string) => `${w.slice(0, 3)} `)}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Hora de la visita" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: '.6rem' }}>
                {horas.map((h) => (
                  <button key={h.inicio} type="button" aria-pressed={inicio === h.inicio} onClick={() => { setInicio(h.inicio); setError('') }} style={{ ...chip(inicio === h.inicio), minWidth: 76 }}>
                    {horaCorta(new Date(h.inicio))}
                  </button>
                ))}
              </div>
            </>
          )}

          {inicio && (
            <div style={{ marginTop: '.9rem', display: 'grid', gap: '.6rem' }}>
              <p style={{ margin: 0, fontSize: '.88rem', color: '#1f2937' }}>
                Pediste: <strong style={{ textTransform: 'capitalize' }}>{fechaLarga(new Date(inicio))}, {horaCorta(new Date(inicio))}</strong>. <span style={{ color: '#4b5563' }}>Tu solicitud no aparta el horario hasta que la confirmen.</span>
              </p>
              {pideTelefono && (
                <label style={{ fontSize: '.8rem', fontWeight: 700, color: '#374151' }}>Teléfono (10 dígitos)
                  <input type="tel" inputMode="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={20}
                    style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 44, borderRadius: 10, border: '1px solid #cbd5e1', padding: '0 .7rem', fontSize: '1rem' }} />
                </label>
              )}
              <label style={{ fontSize: '.8rem', fontWeight: 700, color: '#374151' }}>Notas para quien te atiende (opcional)
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} rows={2}
                  style={{ display: 'block', width: '100%', marginTop: 4, borderRadius: 10, border: '1px solid #cbd5e1', padding: '.5rem .7rem', fontSize: '1rem' }} />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.8rem', color: '#374151' }}>
                <input type="checkbox" checked={consiente} onChange={(e) => setConsiente(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flex: 'none' }} />
                <span>Acepto que VIVE BIEN comparta mi nombre y teléfono con quien atiende esta visita.</span>
              </label>
              <button type="button" onClick={enviar} disabled={paso === 'enviando'}
                style={{ minHeight: 48, borderRadius: 12, border: 'none', background: 'var(--rojo, #8B1A1A)', color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', opacity: paso === 'enviando' ? 0.7 : 1 }}>
                {paso === 'enviando' ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          )}
        </div>
      )}

      {paso === 'enviada' && enviada && (
        <div role="status" data-solicitud-enviada style={{ marginTop: '.9rem', background: '#ecfdf3', border: '1px solid #abefc6', borderRadius: 12, padding: '.7rem .9rem', fontSize: '.88rem', color: '#054f31' }}>
          <strong>Solicitud enviada.</strong> Te avisaremos en <Link href={`/portal/citas?cita=${enviada.id}`} style={{ color: '#054f31', fontWeight: 800 }}>Mis citas</Link> y por correo cuando la confirmen, la rechacen o propongan otro horario.
        </div>
      )}
      {error && <p role="alert" style={{ margin: '.7rem 0 0', fontSize: '.84rem', color: 'var(--error-fuerte, #991b1b)' }}>{error}</p>}
    </section>
  )
}
