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
  const [error, setError] = useState<string | null>(null)
  const [sinPermiso, setSinPermiso] = useState(false)
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS)
  const [rango, setRango] = useState<RangoVisible | null>(null)
  // «Cargando» se DERIVA: la clave de lo que se ve (pestaña, vista, rango) contra la clave de lo último que llegó. Sin cambiar estado al pedir.
  const [listoPara, setListoPara] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const clave = `${pestana}|${vista}|${rango?.desde.getTime() ?? ''}`
  const cargando = listoPara !== clave
  const [abierta, setAbierta] = useState<CitaVista | null>(null)
  const [actualizada, setActualizada] = useState<Date | null>(null)
  const turno = useRef(0)

  type Llegada = { mio: number; miClave: string; r: Awaited<ReturnType<typeof llamarApi<{ citas: CitaVista[] }>>> }
  /** Pide las citas. NO toca el estado: devuelve lo que llegó (y a qué pedido corresponde). */
  const pedir = useCallback(async (): Promise<Llegada | null> => {
    // La ventana de fechas se calcula AL PEDIR (no al pintar): "ahora" cambia y cada refresco debe usar el de ese momento.
    const ahora = Date.now()
    const ventana = pestana === 'calendario'
      ? (rango ? { desde: rango.desde, hasta: rango.hasta, canceladas: false } : null)
      : pestana === 'agenda'
        ? { desde: new Date(ahora - DIA), hasta: new Date(ahora + 99 * DIA), canceladas: false }
        : { desde: new Date(ahora - 99 * DIA), hasta: new Date(ahora + DIA), canceladas: true }
    if (!ventana) return null
    const mio = ++turno.current
    const miClave = `${pestana}|${vista}|${rango?.desde.getTime() ?? ''}`
    const q = new URLSearchParams({ vista, desde: ventana.desde.toISOString(), hasta: ventana.hasta.toISOString(), ...(ventana.canceladas ? { canceladas: '1' } : {}) })
    return { mio, miClave, r: await llamarApi<{ citas: CitaVista[] }>(`/api/citas?${q}`) }
  }, [pestana, rango, vista])

  /** Aplica lo que llegó, salvo que ya se haya pedido otra cosa después (respuesta tardía). */
  const aplicar = useCallback((l: Llegada | null) => {
    if (!l || l.mio !== turno.current) return
    const { r } = l
    if (r.ok) { setCitas(r.data.citas); setError(null); setSinPermiso(false); setActualizada(new Date()) }
    else { setError(r.error); setSinPermiso(r.status === 403); if (r.status === 403) setCitas([]) }
    setListoPara(l.miClave)
  }, [])
  const cargar = useCallback(async () => { aplicar(await pedir()) }, [pedir, aplicar])

  // Primera carga y cada cambio de pestaña, vista o rango. El estado solo cambia cuando llega la respuesta.
  useEffect(() => { void pedir().then(aplicar) }, [pedir, aplicar])

  // Refresco: cada 45 s si la pestaña se ve, y al volver a ella.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void cargar() }, REFRESCO_MS)
    const volver = () => { if (document.visibilityState === 'visible') void cargar() }
    document.addEventListener('visibilitychange', volver)
    window.addEventListener('focus', volver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', volver); window.removeEventListener('focus', volver) }
  }, [cargar])

  // Enlace directo desde un correo o un aviso.
  useEffect(() => {
    if (!citaInicial) return
    void llamarApi<{ cita: CitaVista }>(`/api/citas/${citaInicial}`).then((r) => {
      if (r.ok) setAbierta(r.data.cita); else setError(r.status === 404 ? 'No encontramos esa cita en tu cuenta.' : r.error)
    })
  }, [citaInicial])

  const visibles = useMemo(() => {
    const base = pestana === 'historial'
      ? citas.filter((c) => ['CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'].includes(c.estado) || new Date(c.fin) < new Date())
      : pestana === 'agenda' ? citas.filter((c) => !['CANCELLED', 'REJECTED', 'EXPIRED'].includes(c.estado))
      : citas
    return aplicarFiltros(base, filtros)
  }, [citas, pestana, filtros])

  // El calendario pinta lo acordado y lo que espera respuesta; una solicitud pendiente NO aparta horario (D-2) y por eso se rotula como «Pendiente».
  const paraCalendario = useMemo(() => visibles.filter((c) => c.firme || c.estado === 'REQUESTED' || c.estado === 'PENDING_CONFIRMATION' || c.estado === 'RESCHEDULE_REQUESTED'), [visibles])
  const ind = useMemo(() => indicadores(citas), [citas])

  const abrir = (c: CitaVista) => setAbierta(c)
  const cerrar = () => {
    setAbierta(null)
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
          <Button type="button" variant="outline" className="h-11" onClick={() => { setRefrescando(true); void cargar().finally(() => setRefrescando(false)) }} aria-label="Actualizar citas"><RefreshCw className={cn((cargando || refrescando) && 'animate-spin')} aria-hidden />Actualizar</Button>
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
      ) : cargando ? (
        <div className="space-y-2" role="status" aria-label="Cargando citas">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        <ListaCitas citas={visibles} onSeleccionar={abrir} orden={pestana === 'historial' ? 'desc' : 'asc'} resaltarId={abierta?.id}
          vacio={error ? 'No se pudieron cargar las citas.' : pestana === 'historial' ? 'Aquí aparecerán las citas realizadas, canceladas, rechazadas o expiradas.' : vacioAgenda} />
      )}

      {abierta && <DetalleCita key={abierta.id} cita={abierta} onCerrar={cerrar} onCambio={() => void cargar()} />}
    </div>
  )
}
