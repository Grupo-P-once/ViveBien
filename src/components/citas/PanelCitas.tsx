'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { llamarApi } from '@/lib/citas/cliente'
import type { CitaVista } from '@/lib/citas/vista'
import type { VistaCalendario } from '@/lib/citas/servicio'
import CalendarioCitas, { type RangoVisible } from './CalendarioCitas'
import ListaCitas from './ListaCitas'
import FiltrosCitas from './FiltrosCitas'
import DetalleCita from './DetalleCita'
import { SIN_FILTROS, aplicarFiltros, type Filtros } from './filtros'
import { indicadores } from './uiCitas'

/**
 * El panel de citas de TODOS los roles. Lo único que cambia entre roles es la `vista` que se le pide al servidor; el servidor decide
 * qué citas y qué campos ve cada persona. Aquí solo se muestran, se filtran y se abren.
 *
 *   · Calendario (mes/semana/día/agenda), Agenda (lista por día, la que se usa en el celular) e Historial.
 *   · Se actualiza cada 45 s mientras la pestaña está visible y al volver a enfocarla (sin WebSockets, a propósito: el primer paso).
 *   · `?cita=<id>` abre el detalle (enlace de un correo o de un aviso).
 */

type Pestana = 'calendario' | 'agenda' | 'historial'
const PESTANAS: Array<{ id: Pestana; texto: string }> = [
  { id: 'calendario', texto: 'Calendario' },
  { id: 'agenda', texto: 'Agenda' },
  { id: 'historial', texto: 'Historial' },
]
const DIA = 86_400_000
const REFRESCO_MS = 45_000

export default function PanelCitas({
  vista, vacioAgenda, conResponsable, citaInicial,
}: {
  vista: VistaCalendario
  /** Qué decir cuando no hay nada, según el rol (qué aparecerá ahí y cómo llegar). */
  vacioAgenda: React.ReactNode
  conResponsable?: boolean
  /** `?cita=` de la dirección. */
  citaInicial?: string | null
}) {
  const [pestana, setPestana] = useState<Pestana>('agenda')
  const [citas, setCitas] = useState<CitaVista[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sinPermiso, setSinPermiso] = useState(false)
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS)
  const [rango, setRango] = useState<RangoVisible | null>(null)
  const [abierta, setAbierta] = useState<CitaVista | null>(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [actualizada, setActualizada] = useState<Date | null>(null)
  const turno = useRef(0)

  const ventana = useMemo(() => {
    const ahora = Date.now()
    if (pestana === 'calendario') return rango ? { desde: rango.desde, hasta: rango.hasta, canceladas: false } : null
    if (pestana === 'agenda') return { desde: new Date(ahora - DIA), hasta: new Date(ahora + 99 * DIA), canceladas: false }
    return { desde: new Date(ahora - 99 * DIA), hasta: new Date(ahora + DIA), canceladas: true }
  }, [pestana, rango])

  const cargar = useCallback(async (silencioso = false) => {
    if (!ventana) return
    const mio = ++turno.current
    if (!silencioso) setCargando(true)
    const q = new URLSearchParams({ vista, desde: ventana.desde.toISOString(), hasta: ventana.hasta.toISOString(), ...(ventana.canceladas ? { canceladas: '1' } : {}) })
    const r = await llamarApi<{ citas: CitaVista[] }>(`/api/citas?${q}`)
    if (mio !== turno.current) return           // llegó tarde: ya se pidió otra cosa
    if (r.ok) { setCitas(r.data.citas); setError(null); setSinPermiso(false); setActualizada(new Date()) }
    else { setError(r.error); setSinPermiso(r.status === 403); if (r.status === 403) setCitas([]) }
    setCargando(false)
  }, [ventana, vista])

  useEffect(() => { void cargar() }, [cargar])

  // Refresco: cada 45 s si la pestaña se ve, y al volver a ella.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void cargar(true) }, REFRESCO_MS)
    const volver = () => { if (document.visibilityState === 'visible') void cargar(true) }
    document.addEventListener('visibilitychange', volver)
    window.addEventListener('focus', volver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', volver); window.removeEventListener('focus', volver) }
  }, [cargar])

  // Enlace directo desde un correo o un aviso.
  useEffect(() => {
    if (!citaInicial) return
    void llamarApi<{ cita: CitaVista }>(`/api/citas/${citaInicial}`).then((r) => {
      if (r.ok) { setAbierta(r.data.cita); setDetalleAbierto(true) } else setError(r.status === 404 ? 'No encontramos esa cita en tu cuenta.' : r.error)
    })
  }, [citaInicial])

  const visibles = useMemo(() => {
    const base = pestana === 'historial'
      ? citas.filter((c) => ['CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'].includes(c.estado) || new Date(c.fin) < new Date())
      : pestana === 'agenda' ? citas.filter((c) => !['CANCELLED', 'REJECTED', 'EXPIRED'].includes(c.estado))
      : citas
    return aplicarFiltros(base, filtros)
  }, [citas, pestana, filtros])

  // El calendario solo pinta lo acordado; las solicitudes sin confirmar viven en «Agenda» (no aparten horario, D-2).
  const paraCalendario = useMemo(() => visibles.filter((c) => c.firme || c.estado === 'REQUESTED' || c.estado === 'PENDING_CONFIRMATION' || c.estado === 'RESCHEDULE_REQUESTED'), [visibles])
  const ind = useMemo(() => indicadores(citas), [citas])

  const abrir = (c: CitaVista) => { setAbierta(c); setDetalleAbierto(true) }
  const cerrar = () => {
    setDetalleAbierto(false)
    // Quita ?cita= para que recargar la página no vuelva a abrirla.
    if (typeof window !== 'undefined' && window.location.search.includes('cita=')) {
      const u = new URL(window.location.href); u.searchParams.delete('cita'); window.history.replaceState(null, '', u.toString())
    }
  }

  const tarjeta = (n: number, texto: string, resalta = false) => (
    <div className={cn('rounded-xl border bg-card p-3', resalta && n > 0 && 'border-[#b54708]')} data-indicador={texto}>
      <div className="font-heading text-2xl font-bold tabular-nums">{n}</div>
      <div className="text-xs text-muted-foreground">{texto}</div>
    </div>
  )

  return (
    <div className="space-y-5" data-panel-citas data-vista={vista}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumen de tus citas">
        {tarjeta(ind.pendientes, 'Pendientes')}
        {tarjeta(ind.confirmadas, 'Confirmadas')}
        {tarjeta(ind.porResponder, 'Por responder', true)}
        {tarjeta(ind.conflictos, 'Con horario ocupado', true)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Qué ver" className="flex overflow-hidden rounded-lg border">
          {PESTANAS.map((p) => (
            <button key={p.id} type="button" aria-pressed={pestana === p.id} onClick={() => setPestana(p.id)}
              className={cn('h-11 px-4 text-sm font-semibold transition-colors', pestana === p.id ? 'bg-[#8B1A1A] text-white' : 'bg-card hover:bg-muted')}>
              {p.texto}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {actualizada && <span>Actualizado {actualizada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}</span>}
          <Button type="button" variant="outline" className="h-11" onClick={() => void cargar()} aria-label="Actualizar citas"><RefreshCw className={cn(cargando && 'animate-spin')} aria-hidden />Actualizar</Button>
        </div>
      </div>

      <FiltrosCitas citas={citas} filtros={filtros} onCambio={setFiltros} conResponsable={conResponsable} />

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-950">
          <span>{error}</span>
          {!sinPermiso && <Button type="button" variant="outline" onClick={() => void cargar()}>Reintentar</Button>}
        </div>
      )}

      {pestana === 'calendario' ? (
        <CalendarioCitas citas={paraCalendario} cargando={cargando} onSeleccionar={abrir} onRango={setRango} />
      ) : cargando && citas.length === 0 ? (
        <div className="space-y-2" role="status" aria-label="Cargando citas">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        <ListaCitas citas={visibles} onSeleccionar={abrir} orden={pestana === 'historial' ? 'desc' : 'asc'} resaltarId={abierta?.id}
          vacio={error ? 'No se pudieron cargar las citas.' : pestana === 'historial' ? 'Aquí aparecerán las citas realizadas, canceladas, rechazadas o expiradas.' : vacioAgenda} />
      )}

      <DetalleCita cita={abierta} abierta={detalleAbierto} onCerrar={cerrar} onCambio={() => void cargar(true)} />
    </div>
  )
}
