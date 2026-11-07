'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, Clock, ExternalLink, Loader2, MapPin, Phone, TriangleAlert, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import AppointmentStatus from '@/components/citas/AppointmentStatus'
import { ETIQUETA_ACCION, type AccionCita } from '@/lib/citas/estados'
import { descargarArchivo, llamarApi } from '@/lib/citas/cliente'
import { horaCorta, fechaLarga } from '@/lib/citas/zona'
import type { CitaVista } from '@/lib/citas/vista'
import type { Disponibilidad } from '@/lib/citas/servicio'
import { TEXTO_DE_TIPO, cuando, quienVa } from './uiCitas'

/**
 * El detalle de una cita: qué es, quién, cuándo, el historial y SOLO las acciones que el servidor dijo que esta persona puede hacer
 * (`cita.acciones`). El servidor vuelve a decidir al recibir la acción (versión, rol, regla de 2 h): aquí nunca se asume un permiso.
 */

type Evento = { tipo: string; estadoAntes: string | null; estadoDespues: string | null; por: string; en: string; datos?: Record<string, unknown> }

const POR: Record<string, string> = { cliente: 'La persona interesada', asesor: 'El responsable', admin: 'VIVE BIEN', sistema: 'El sistema' }
const TEXTO_EVENTO: Record<string, string> = {
  CREATED: 'Solicitud enviada', REQUESTED: 'Solicitud enviada', CONFIRMED: 'Cita confirmada', REJECTED: 'Solicitud rechazada',
  RESCHEDULE_REQUESTED: 'Se propuso otro horario', RESCHEDULED: 'Cambio de horario aceptado', RESCHEDULE_REJECTED: 'Cambio de horario rechazado',
  RESCHEDULE_WITHDRAWN: 'Propuesta retirada', CANCELLED: 'Cita cancelada', EXPIRED: 'La solicitud expiró sin respuesta',
  COMPLETED: 'Visita realizada', NO_SHOW: 'No asistió', CORRECTED: 'Resultado corregido',
}
/** Acciones que piden un motivo escrito (el servidor lo exige para rechazar y para que el equipo cancele). */
const PIDEN_MOTIVO: AccionCita[] = ['rechazar', 'cancelar', 'rechazar_cambio']

/**
 * Se monta SOLO mientras hay una cita abierta y con `key={cita.id}`: al abrir otra cita el componente nace de cero, así que no
 * hace falta ningún efecto que "reinicie" el estado (y no hay estado de una cita pegándose a la siguiente).
 */
export default function DetalleCita({
  cita, onCerrar, onCambio, conTipos = true,
}: {
  cita: CitaVista
  /** Mostrar «Solicitud de cliente / Visita propia». El cliente no lo ve. */
  conTipos?: boolean
  onCerrar: () => void
  /** Avisa que la cita cambió (o que otra persona la cambió antes) para que la pantalla recargue. */
  onCambio: () => void
}) {
  const [actual, setActual] = useState<CitaVista>(cita)
  const [historial, setHistorial] = useState<Evento[] | null>(null)
  const [accion, setAccion] = useState<AccionCita | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [huecos, setHuecos] = useState<Disponibilidad | null>(null)
  const [huecosFallo, setHuecosFallo] = useState(false)
  const [elegido, setElegido] = useState<string | null>(null)
  const refMotivo = useRef<HTMLTextAreaElement>(null)
  const id = cita.id
  // Radix solo devuelve el foco a un <Trigger>; aquí no hay (se monta al elegir una cita de la lista). El elemento que tenía el foco al abrir se
  // captura al NACER (antes de que el diálogo mueva el foco) y se restaura al cerrar: Escape/Cerrar vuelven a la tarjeta que se abrió.
  const [origen] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement))
  useEffect(() => () => { const el = origen as HTMLElement | null; setTimeout(() => { if (el?.isConnected) el.focus() }, 0) }, [origen])
  // «Buscando horarios» se DERIVA: se está buscando mientras se quiere proponer y todavía no llegó nada (ni falló).
  const cargandoHuecos = accion === 'proponer' && huecos === null && !huecosFallo

  // Lectura fresca (con el historial) al abrir. El estado solo se toca cuando llega la respuesta.
  useEffect(() => {
    let vivo = true
    void llamarApi<{ cita: CitaVista; historial: Evento[] }>(`/api/citas/${id}`).then((r) => {
      if (!vivo) return
      if (r.ok) { setActual(r.data.cita); setHistorial(r.data.historial) } else setHistorial([])
    })
    return () => { vivo = false }
  }, [id])
  async function recargar() {
    const r = await llamarApi<{ cita: CitaVista; historial: Evento[] }>(`/api/citas/${id}`)
    if (r.ok) { setActual(r.data.cita); setHistorial(r.data.historial) }
  }

  // Proponer otro horario: los huecos REALES (la propia cita no se cuenta como ocupada).
  useEffect(() => {
    if (accion !== 'proponer' || huecos) return
    let vivo = true
    void llamarApi<Disponibilidad>(`/api/citas/disponibilidad?cita=${id}&dias=14`).then((r) => {
      if (!vivo) return
      if (r.ok) setHuecos(r.data); else { setHuecosFallo(true); setError(r.error) }
    })
    return () => { vivo = false }
  }, [accion, id, huecos])

  useEffect(() => { if (accion && PIDEN_MOTIVO.includes(accion)) refMotivo.current?.focus() }, [accion])

  const c = actual
  const equipo = c.papel === 'asesor' || c.papel === 'admin'
  const acciones = c.acciones.filter((a) => a !== 'vencer')
  const necesitaMotivo = accion !== null && PIDEN_MOTIVO.includes(accion)
  // Rechazar siempre pide motivo; cancelar y rechazar el cambio solo cuando lo hace el equipo.
  const motivoObligatorio = accion === 'rechazar' || (equipo && (accion === 'cancelar'))

  async function ejecutar() {
    if (!accion || enviando) return
    if (motivoObligatorio && motivo.trim().length < 3) { setError('Escribe el motivo (al menos 3 letras).'); return }
    if (accion === 'proponer' && !elegido) { setError('Elige uno de los horarios disponibles.'); return }
    setEnviando(true); setError(null); setAviso(null)
    const r = await llamarApi<{ cita: CitaVista }>(`/api/citas/${c.id}/transicion`, {
      method: 'POST',
      cuerpo: { accion, version: c.version, ...(accion === 'proponer' ? { inicio: elegido } : {}), ...(motivo.trim() ? { motivo: motivo.trim() } : {}) },
    })
    setEnviando(false)
    if (r.ok) {
      setActual(r.data.cita); setAccion(null); setMotivo(''); setElegido(null); setHuecos(null); setHuecosFallo(false)
      setAviso('Listo: el cambio quedó registrado y se avisó a la otra parte.')
      onCambio(); void recargar()
      return
    }
    setError(r.error)
    // Otra persona cambió la cita antes: se muestra cómo quedó y se recarga la lista.
    const nueva = (r.data as { cita?: CitaVista } | undefined)?.cita
    if (r.status === 409) { if (nueva) setActual(nueva); setAccion(null); onCambio(); void recargar() }
  }

  async function descargar() {
    setError(null)
    const r = await descargarArchivo(`/api/citas/${c.id}/ics`, 'cita-vive-bien.ics')
    if (!r.ok) setError(r.error)
  }

  const puedeCalendario = c.firme && c.estado !== 'REQUESTED' && c.estado !== 'PENDING_CONFIRMATION' && new Date(c.fin) > new Date()
  const variante = (a: AccionCita) => (a === 'confirmar' || a === 'aceptar_cambio' || a === 'completar' ? 'default' : 'outline')

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCerrar() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" data-detalle-cita>
        <DialogHeader>
          <DialogTitle className="pr-6">{c.propiedad?.titulo ?? 'Cita'}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <AppointmentStatus estado={c.estado} />
            {conTipos && <span>{TEXTO_DE_TIPO[c.tipo]}</span>}
          </DialogDescription>
        </DialogHeader>

        {c.conflicto && (
          <p role="alert" className="flex gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Este horario ya lo ocupa otra cita confirmada. Ya no se puede confirmar: propón otro horario o rechaza la solicitud.</span>
          </p>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-4 shrink-0" aria-hidden />Cuándo</dt><dd className="pl-6 font-medium first-letter:uppercase">{cuando(c)}</dd></div>
          {c.lugar && <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="size-4 shrink-0" aria-hidden />Lugar</dt><dd className="pl-6 font-medium">{c.lugar}</dd></div>}
          <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><User className="size-4 shrink-0" aria-hidden />{c.papel === 'cliente' ? 'Responsable' : 'Quién va'}</dt><dd className="pl-6 font-medium">{c.papel === 'cliente' ? (c.asesor.nombre ?? 'VIVE BIEN') : quienVa(c)}</dd></div>
          {equipo && c.cliente.telefono && <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="size-4 shrink-0" aria-hidden />Teléfono</dt><dd className="pl-6 font-medium">{c.cliente.telefono}</dd></div>}
        </dl>

        {c.propuesta && (
          <p className="rounded-lg bg-muted p-3 text-sm">
            <strong>Horario propuesto{c.propuesta.por === 'cliente' ? ' por la persona interesada' : c.propuesta.por === 'asesor' ? ' por el responsable' : ' por VIVE BIEN'}:</strong>{' '}
            <span className="first-letter:uppercase">{fechaLarga(new Date(c.propuesta.inicio))}, {horaCorta(new Date(c.propuesta.inicio))}</span>.
            {c.estado === 'RESCHEDULE_REQUESTED' && ' Mientras no se acepte, la cita sigue en su horario actual.'}
          </p>
        )}
        {c.notasCliente && <p className="text-sm"><strong>Notas de la persona interesada:</strong> {c.notasCliente}</p>}
        {c.motivoCancelacion && <p className="text-sm"><strong>Motivo:</strong> {c.motivoCancelacion}</p>}
        {c.papel === 'propietario' && <p className="rounded-lg bg-muted p-3 text-sm">Es una cita en una de tus propiedades. La administra VIVE BIEN; aquí solo la consultas.</p>}

        {aviso && <p role="status" className="rounded-lg bg-green-100 p-3 text-sm text-green-950">{aviso}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-950">{error}</p>}

        {accion === null && acciones.length > 0 && (
          <div className="flex flex-wrap gap-2" data-acciones-cita>
            {acciones.map((a) => (
              // «Confirmar» no se ofrece si hay conflicto: el servidor tampoco lo permitiría.
              c.conflicto && a === 'confirmar' ? null :
              <Button key={a} type="button" variant={variante(a)} className="h-11"
                onClick={() => { setError(null); setAviso(null); setAccion(a) }}>
                {ETIQUETA_ACCION[a]}
              </Button>
            ))}
          </div>
        )}

        {accion !== null && (
          <section aria-label={ETIQUETA_ACCION[accion]} className="space-y-3 rounded-xl border p-3" data-confirmar-accion>
            <h3 className="font-heading text-sm font-semibold">{ETIQUETA_ACCION[accion]}</h3>
            {accion === 'proponer' && (
              <div>
                {cargandoHuecos && <p className="text-sm text-muted-foreground" role="status"><Loader2 className="mr-1 inline size-4 animate-spin" aria-hidden />Buscando horarios…</p>}
                {huecos && huecos.dias.filter((d) => d.horarios.length).length === 0 && <p className="text-sm text-muted-foreground">No hay horarios libres en los próximos 14 días.</p>}
                <div className="max-h-56 space-y-3 overflow-y-auto">
                  {huecos?.dias.filter((d) => d.horarios.length).map((d) => (
                    <fieldset key={d.dia}>
                      <legend className="mb-1 text-xs font-semibold text-muted-foreground first-letter:uppercase">{fechaLarga(new Date(`${d.dia}T18:00:00Z`))}</legend>
                      <div className="flex flex-wrap gap-2">
                        {d.horarios.map((h) => (
                          <button key={h.inicio} type="button" aria-pressed={elegido === h.inicio} onClick={() => setElegido(h.inicio)}
                            className={`h-11 min-w-[4.5rem] rounded-lg border px-3 text-sm font-semibold tabular-nums ${elegido === h.inicio ? 'border-[#8B1A1A] bg-[#8B1A1A] text-white' : 'bg-card hover:bg-muted'}`}>
                            {horaCorta(new Date(h.inicio))}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </div>
            )}
            {(necesitaMotivo || accion === 'proponer') && (
              <label className="block text-xs font-semibold text-muted-foreground">
                {motivoObligatorio ? 'Motivo (obligatorio)' : 'Motivo (opcional)'}
                <textarea ref={refMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3}
                  className="mt-1 w-full rounded-lg border bg-card p-2 text-sm font-normal text-foreground" />
              </label>
            )}
            {accion === 'cancelar' && !equipo && <p className="text-xs text-muted-foreground">Puedes cancelar hasta 2 horas antes de la cita.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-11" disabled={enviando || (accion === 'proponer' && !elegido)} onClick={ejecutar}>
                {enviando && <Loader2 className="animate-spin" aria-hidden />}Confirmar: {ETIQUETA_ACCION[accion].toLowerCase()}
              </Button>
              <Button type="button" variant="ghost" className="h-11" disabled={enviando} onClick={() => { setAccion(null); setError(null) }}>Volver</Button>
            </div>
          </section>
        )}

        {puedeCalendario && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={descargar}><CalendarPlus aria-hidden />Añadir al calendario (.ics)</Button>
            {c.propiedad?.ruta && <Button asChild variant="ghost" className="h-11"><a href={c.propiedad.ruta}><ExternalLink aria-hidden />Ver la propiedad</a></Button>}
          </div>
        )}

        <section aria-label="Historial de la cita">
          <h3 className="mb-2 font-heading text-sm font-semibold">Historial</h3>
          {historial === null ? <p className="text-sm text-muted-foreground" role="status">Cargando…</p>
            : historial.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
            : (
              <ol className="space-y-2 border-l pl-4 text-sm">
                {historial.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{TEXTO_EVENTO[e.tipo] ?? e.tipo}</span>
                    <span className="text-muted-foreground"> · {POR[e.por] ?? e.por} · {fechaLarga(new Date(e.en))}, {horaCorta(new Date(e.en))}</span>
                  </li>
                ))}
              </ol>
            )}
        </section>
      </DialogContent>
    </Dialog>
  )
}
