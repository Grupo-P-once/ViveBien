'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { useAuth } from '@/lib/useAuth'
import { llamarApi } from '@/lib/citas/cliente'
import { TEXTO_CONSENTIMIENTO_CITAS } from '@/lib/contacto'
import { diaLocal, fechaLarga, horaCorta } from '@/lib/citas/zona'
import { esMes, etiquetaDeMes, mesDe, rangoDeMes, semanaDeReserva, semanasDelMes, sumarMeses } from '@/lib/citas/mes'
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
 *  · Los días se enseñan POR SEMANA (hoy y los 6 siguientes). Debajo, un acceso discreto «Ver calendario completo» abre un mes (se puede avanzar hasta 3 meses) con los días que tienen horarios
 *    marcados, para quien prefiere una fecha de dentro de una semana o de un mes (10-nov-2026). Es el mismo estado: elegir un día del mes enseña sus horas y todo lo demás (casilla, notas, envío) no cambia.
 */
type Paso = 'cerrada' | 'abierta' | 'enviando' | 'enviada'
type Horarios = Array<{ inicio: string; fin: string }>

/** Cuántos meses hacia adelante se puede mirar el calendario completo (la ventana real la fija el horario del asesor: lo que no tenga horarios sale apagado). */
const MESES_ADELANTE = 3

/** Solo la primera letra en mayúscula («noviembre de 2026» → «Noviembre de 2026»); `capitalize` de CSS pondría «De». */
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const nuevaClave = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`)

export default function AgendarCita({ propiedadId, isLoggedIn }: { propiedadId: string; isLoggedIn: boolean }) {
  const router = useRouter()
  const { loading: sesionCargando } = useAuth()
  const [encendido, setEncendido] = useState<boolean | null>(null)
  const [paso, setPaso] = useState<Paso>('cerrada')
  const [huecos, setHuecos] = useState<Disponibilidad | null>(null)
  const [cargando, setCargando] = useState(false)
  const [dia, setDia] = useState<string | null>(null)
  const [vista, setVista] = useState<'semana' | 'mes'>('semana')
  const [mes, setMes] = useState<string>(() => mesDe(diaLocal(new Date())))
  const [extra, setExtra] = useState<Record<string, Horarios>>({})
  const [mesesListos, setMesesListos] = useState<string[]>([])
  const [cargandoMes, setCargandoMes] = useState(false)
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

  /** Pide los horarios de un mes (desde hoy si es el actual). Una sola vez por mes; si falla, se dice y se puede reintentar. */
  async function cargarMes(m: string, forzar = false) {
    const rango = rangoDeMes(m, diaLocal(new Date()))
    if (!rango || (!forzar && mesesListos.includes(m))) return
    setCargandoMes(true); setError('')
    const r = await llamarApi<Disponibilidad>(`/api/citas/disponibilidad?propiedad=${encodeURIComponent(propiedadId)}&desde=${rango.desde}&dias=${rango.dias}`)
    setCargandoMes(false)
    if (!r.ok) { setError(r.error); return }
    setExtra((prev) => ({ ...prev, ...Object.fromEntries(r.data.dias.map((d) => [d.dia, d.horarios])) }))
    setMesesListos((prev) => (prev.includes(m) ? prev : [...prev, m]))
  }

  function abrirCalendario() {
    const m = dia && esMes(mesDe(dia)) ? mesDe(dia) : mesDe(diaLocal(new Date()))
    setVista('mes'); setMes(m); void cargarMes(m)
  }

  function cambiarMes(delta: number) {
    const hoyMes = mesDe(diaLocal(new Date()))
    const m = sumarMeses(mes, delta)
    if (m < hoyMes || m > sumarMeses(hoyMes, MESES_ADELANTE)) return
    setMes(m); void cargarMes(m)
  }

  function volverASemana(semana: string[], porDia: Map<string, Horarios>) {
    setVista('semana')
    if (!dia || !semana.includes(dia)) { setDia(semana.find((d) => (porDia.get(d)?.length ?? 0) > 0) ?? null); setInicio(null) }
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
    if (r.status === 409) { setInicio(null); setExtra({}); setMesesListos([]); void cargarHuecos(); if (vista === 'mes') void cargarMes(mes, true) }
  }

  // Con el flag apagado (o sin saberlo todavía) no se muestra: no se promete lo que no se puede reservar.
  if (!encendido) return null

  const abierta = paso === 'abierta' || paso === 'enviando'
  const hoy = diaLocal(new Date())
  // Todos los horarios conocidos por día: los 14 días del primer pedido y los meses que se hayan abierto.
  const porDia = new Map<string, Horarios>()
  for (const d of huecos?.dias ?? []) if (d.horarios.length) porDia.set(d.dia, d.horarios)
  for (const [d, h] of Object.entries(extra)) if (h.length) porDia.set(d, h)
  const semana = semanaDeReserva(hoy)
  const diasConHuecos = semana.filter((d) => (porDia.get(d)?.length ?? 0) > 0).map((d) => ({ dia: d, horarios: porDia.get(d) as Horarios }))
  const horas = dia ? porDia.get(dia) ?? [] : []
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
          {vista === 'semana' && (
            <>
              {!cargando && huecos && diasConHuecos.length === 0 && !error && (
                <p role="status" style={{ margin: 0, fontSize: '.88rem', color: '#4b5563' }}>No hay horarios libres en los próximos 7 días. Mira el calendario para elegir otra fecha, o escríbenos por WhatsApp y te ayudamos a acordar uno.</p>
              )}
              {diasConHuecos.length > 0 && (
                <>
                  <p style={{ margin: '0 0 .4rem', fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5A6472' }}>Esta semana</p>
                  <div role="group" aria-label="Día de la visita" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                    {diasConHuecos.map((d) => (
                      <button key={d.dia} type="button" aria-pressed={dia === d.dia} onClick={() => { setDia(d.dia); setInicio(null) }} style={{ ...chip(dia === d.dia), flex: 'none' }}>
                        {cap(titulo(d.dia).replace(/^(\p{L}+),?\s*/u, (_, w: string) => `${w.slice(0, 3)} `))}
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
              {huecos && (
                <div style={{ marginTop: '.7rem', paddingTop: '.2rem', borderTop: '1px dashed #E1E7EF' }}>
                  <button type="button" onClick={abrirCalendario} aria-expanded={false} aria-controls="agendar-cita-mes" data-agendar-calendario
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--azul)', fontWeight: 700, fontSize: '.86rem' }}>
                    <i className="far fa-calendar-alt" aria-hidden="true" />
                    <span style={{ textDecoration: 'underline', textDecorationColor: 'rgba(30,58,95,.35)', textUnderlineOffset: 4 }}>Ver calendario completo</span>
                    <i className="fas fa-chevron-right" aria-hidden="true" style={{ fontSize: '.65rem' }} />
                  </button>
                </div>
              )}
            </>
          )}

          {vista === 'mes' && (
            <div id="agendar-cita-mes" role="group" aria-label="Calendario de fechas disponibles" data-agendar-mes style={{ background: '#F8FAFC', border: '1px solid #E8ECF1', borderRadius: 16, padding: '.75rem .75rem .6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <button type="button" onClick={() => cambiarMes(-1)} disabled={mes <= mesDe(hoy)} aria-label="Mes anterior"
                  style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: 'transparent', color: 'var(--azul)', cursor: 'pointer', opacity: mes <= mesDe(hoy) ? 0.35 : 1 }}>
                  <i className="fas fa-chevron-left" aria-hidden="true" />
                </button>
                <p aria-live="polite" style={{ margin: 0, fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '.95rem', color: 'var(--azul)' }}>{cap(etiquetaDeMes(mes))}</p>
                <button type="button" onClick={() => cambiarMes(1)} disabled={mes >= sumarMeses(mesDe(hoy), MESES_ADELANTE)} aria-label="Mes siguiente"
                  style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: 'transparent', color: 'var(--azul)', cursor: 'pointer', opacity: mes >= sumarMeses(mesDe(hoy), MESES_ADELANTE) ? 0.35 : 1 }}>
                  <i className="fas fa-chevron-right" aria-hidden="true" />
                </button>
              </div>
              <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, margin: '.2rem 0', textAlign: 'center', fontSize: '.7rem', fontWeight: 700, color: '#5A6472' }}>
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => <span key={i}>{l}</span>)}
              </div>
              {cargandoMes && <p role="status" style={{ margin: '.2rem 0', fontSize: '.8rem', color: '#4b5563' }}>Buscando horarios disponibles…</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
                {semanasDelMes(mes).flat().map((c) => {
                  if (!c.delMes) return <span key={c.dia} aria-hidden="true" />
                  const n = porDia.get(c.dia)?.length ?? 0
                  const libre = n > 0 && c.dia >= hoy
                  const elegido = dia === c.dia
                  const etiqueta = `${fechaLarga(new Date(`${c.dia}T18:00:00Z`))}, ${libre ? `${n} horario${n === 1 ? '' : 's'} libre${n === 1 ? '' : 's'}` : 'sin horarios'}`
                  return (
                    <button key={c.dia} type="button" disabled={!libre} aria-pressed={elegido} aria-label={etiqueta} data-dia={c.dia}
                      onClick={() => { setDia(c.dia); setInicio(null); setError('') }}
                      style={{ minHeight: 44, borderRadius: 12, cursor: libre ? 'pointer' : 'default', fontSize: '.88rem', fontWeight: c.dia === hoy ? 800 : 600, position: 'relative',
                        border: elegido ? '2px solid var(--azul)' : libre ? '1px solid #D5DEE9' : '1px solid transparent',
                        background: elegido ? 'var(--azul)' : libre ? '#fff' : 'transparent', color: elegido ? '#fff' : libre ? 'var(--azul)' : '#9AA3AF',
                        boxShadow: c.dia === hoy && !elegido ? 'inset 0 0 0 1.5px rgba(139,26,26,.5)' : 'none' }}>
                      {Number(c.dia.slice(8))}
                      {libre && !elegido && <span aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: 5, width: 5, height: 5, marginLeft: -2.5, borderRadius: '50%', background: 'var(--rojo, #8B1A1A)' }} />}
                    </button>
                  )
                })}
              </div>
              <p style={{ margin: '.5rem .2rem .1rem', fontSize: '.74rem', color: '#5A6472' }}>Los días con punto tienen horarios libres. Elige uno para ver sus horas.</p>
              {dia && horas.length > 0 && (
                <>
                  <p style={{ margin: '.6rem 0 .4rem', fontSize: '.82rem', fontWeight: 700, color: '#1f2937' }}>{cap(titulo(dia))}</p>
                  <div role="group" aria-label="Hora de la visita" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {horas.map((h) => (
                      <button key={h.inicio} type="button" aria-pressed={inicio === h.inicio} onClick={() => { setInicio(h.inicio); setError('') }} style={{ ...chip(inicio === h.inicio), minWidth: 76 }}>
                        {horaCorta(new Date(h.inicio))}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button type="button" onClick={() => volverASemana(semana, porDia)} aria-expanded={true} aria-controls="agendar-cita-mes" data-agendar-semana
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, marginTop: '.4rem', padding: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--azul)', fontWeight: 700, fontSize: '.84rem' }}>
                <i className="fas fa-chevron-left" aria-hidden="true" style={{ fontSize: '.65rem' }} />
                <span style={{ textDecoration: 'underline', textDecorationColor: 'rgba(30,58,95,.35)', textUnderlineOffset: 4 }}>Volver a esta semana</span>
              </button>
            </div>
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
                <span>{TEXTO_CONSENTIMIENTO_CITAS} Conozco el <Link href="/privacidad" target="_blank" style={{ color: 'var(--azul)', textDecoration: 'underline' }}>Aviso de privacidad</Link>.</span>
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
