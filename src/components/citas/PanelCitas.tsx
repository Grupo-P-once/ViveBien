'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, History, List, Plus, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { llamarApi } from '@/lib/citas/cliente'
import type { CitaVista } from '@/lib/citas/vista'
import type { VistaCalendario } from '@/lib/citas/servicio'
import CalendarioCitas, { type RangoVisible } from './CalendarioCitas'
import ListaCitas from './ListaCitas'
import FiltrosCitas from './FiltrosCitas'
import DetalleCita from './DetalleCita'
import IndicadoresCitas from './IndicadoresCitas'
import ProximasCitas from './ProximasCitas'
import AccionesRapidas from './AccionesRapidas'
import { SIN_FILTROS, aplicarFiltros, type Filtros, type GrupoEstado } from './filtros'
import { indicadores, proximas } from './uiCitas'

/**
 * El panel de citas de TODOS los roles. Lo único que cambia entre roles es la `vista` que se le pide al servidor; el servidor decide
 * qué citas y qué campos ve cada persona. Aquí solo se muestran, se filtran y se abren.
 *
 *   · Indicadores que filtran · Calendario (mes/semana/día/agenda), Agenda (lista por día, la del celular) e Historial.
 *   · A la derecha (o debajo en pantallas chicas): «Próximas citas» con foto y «Acciones rápidas» (solo las que existen).
 *   · Se actualiza cada 45 s mientras la pestaña está visible y al volver a enfocarla (sin WebSockets, a propósito: el primer paso).
 *   · `?cita=<id>` abre el detalle (enlace de un correo o de un aviso).
 */

type Pestana = 'calendario' | 'agenda' | 'historial'
const PESTANAS: Array<{ id: Pestana; texto: string; Icono: LucideIcon }> = [
  { id: 'calendario', texto: 'Calendario', Icono: CalendarDays },
  { id: 'agenda', texto: 'Agenda', Icono: List },
  { id: 'historial', texto: 'Historial', Icono: History },
]
const DIA = 86_400_000
const REFRESCO_MS = 45_000

type Respuesta = Awaited<ReturnType<typeof llamarApi<{ citas: CitaVista[] }>>>
const consulta = (vista: VistaCalendario, desde: Date, hasta: Date, canceladas: boolean) =>
  new URLSearchParams({ vista, desde: desde.toISOString(), hasta: hasta.toISOString(), ...(canceladas ? { canceladas: '1' } : {}) })

export default function PanelCitas({
  vista, vacioAgenda, conResponsable, citaInicial, rutaDisponibilidad,
}: {
  vista: VistaCalendario
  /** Qué decir cuando no hay nada, según el rol (qué aparecerá ahí y cómo llegar). */
  vacioAgenda: React.ReactNode
  conResponsable?: boolean
  /** `?cita=` de la dirección. */
  citaInicial?: string | null
  /** Dónde edita su disponibilidad quien atiende citas (ausente = no se ofrece el acceso rápido). */
  rutaDisponibilidad?: string
}) {
  const [pestana, setPestana] = useState<Pestana>('agenda')
  const [citas, setCitas] = useState<CitaVista[]>([])
  // Los indicadores y «Próximas citas» salen de la ventana de «lo que viene» (aunque el calendario esté mirando otro mes).
  const [citasProximas, setCitasProximas] = useState<CitaVista[]>([])
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

  type Llegada = { mio: number; miClave: string; r: Respuesta }
  /** Pide las citas de la pestaña. NO toca el estado: devuelve lo que llegó (y a qué pedido corresponde). */
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
    return { mio, miClave, r: await llamarApi<{ citas: CitaVista[] }>(`/api/citas?${consulta(vista, ventana.desde, ventana.hasta, ventana.canceladas)}`) }
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

  /** «Lo que viene» (ayer en adelante, ~100 días): alimenta los indicadores y «Próximas citas». Solo hace falta pedirla aparte si la pestaña no es «Agenda» (que ya pide lo mismo). */
  const pedirProximas = useCallback(async (): Promise<Respuesta | null> => {
    if (pestana === 'agenda') return null
    const ahora = Date.now()
    return llamarApi<{ citas: CitaVista[] }>(`/api/citas?${consulta(vista, new Date(ahora - DIA), new Date(ahora + 99 * DIA), false)}`)
  }, [pestana, vista])
  const aplicarProximas = useCallback((r: Respuesta | null) => { if (r?.ok) setCitasProximas(r.data.citas) }, [])

  // Primera carga y cada cambio de pestaña, vista o rango. El estado solo cambia cuando llega la respuesta.
  useEffect(() => { void pedir().then(aplicar) }, [pedir, aplicar])
  useEffect(() => { void pedirProximas().then(aplicarProximas) }, [pedirProximas, aplicarProximas])

  // Refresco: cada 45 s si la pestaña se ve, y al volver a ella.
  useEffect(() => {
    const todo = () => { if (document.visibilityState === 'visible') { void cargar(); void pedirProximas().then(aplicarProximas) } }
    const t = setInterval(todo, REFRESCO_MS)
    document.addEventListener('visibilitychange', todo)
    window.addEventListener('focus', todo)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', todo); window.removeEventListener('focus', todo) }
  }, [cargar, pedirProximas, aplicarProximas])

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
  const venidero = pestana === 'agenda' ? citas : citasProximas
  const ind = useMemo(() => indicadores(venidero), [venidero])
  const lasProximas = useMemo(() => proximas(venidero, 4), [venidero])
  // Qué ve cada rol: el CLIENTE solo tiene sus propias visitas (sin «tipo») y nunca ve conflictos de horario (eso es de quien atiende).
  // «Mis visitas» solo tiene sentido para quien ve también las de otros (equipo y asociado).
  const conTipos = vista !== 'cliente'
  const atiende = vista === 'admin' || vista === 'asesor'

  const elegirGrupo = (g: GrupoEstado) => setFiltros((f) => ({ ...f, estado: g }))
  const abrir = (c: CitaVista) => setAbierta(c)
  const cerrar = () => {
    setAbierta(null)
    // Quita ?cita= para que recargar la página no vuelva a abrirla.
    if (typeof window !== 'undefined' && window.location.search.includes('cita=')) {
      const u = new URL(window.location.href); u.searchParams.delete('cita'); window.history.replaceState(null, '', u.toString())
    }
  }

  return (
    <div className="space-y-5" data-panel-citas data-vista={vista}>
      <IndicadoresCitas ind={ind} activo={filtros.estado} onElegir={elegirGrupo} />

      {atiende && ind.conflictos > 0 && (
        <div role="status" data-aviso-conflictos className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <span className="flex items-center gap-2"><TriangleAlert className="size-4 shrink-0" aria-hidden />
            {ind.conflictos === 1 ? 'Hay 1 solicitud pendiente cuyo horario ya ocupa otra cita confirmada.' : `Hay ${ind.conflictos} solicitudes pendientes cuyo horario ya ocupa otra cita confirmada.`} Propón otro horario o recházala.
          </span>
          <Button type="button" variant="outline" className="h-10" onClick={() => elegirGrupo('pendientes')}>Ver pendientes</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Qué ver" className="flex overflow-hidden rounded-lg border bg-card">
          {PESTANAS.map(({ id, texto, Icono }) => (
            <button key={id} type="button" aria-pressed={pestana === id} onClick={() => setPestana(id)}
              className={cn('inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold transition-colors', pestana === id ? 'bg-[var(--marca)] text-white' : 'hover:bg-muted')}>
              <Icono className="size-4" aria-hidden />{texto}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {actualizada && <span>Actualizado {actualizada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}</span>}
          <Button type="button" variant="outline" className="h-11" onClick={() => { setRefrescando(true); void cargar().finally(() => setRefrescando(false)) }} aria-label="Actualizar citas"><RefreshCw className={cn((cargando || refrescando) && 'animate-spin')} aria-hidden />Actualizar</Button>
          {vista !== 'propietario' && (
            <Button asChild className="h-11 bg-[var(--marca)] px-5 text-white hover:bg-[var(--marca)]/90">
              <Link href="/propiedades" aria-label="Nueva cita: elige la propiedad que quieres visitar"><Plus aria-hidden />Nueva cita</Link>
            </Button>
          )}
        </div>
      </div>

      <FiltrosCitas citas={citas} filtros={filtros} onCambio={setFiltros} conResponsable={conResponsable} conTipos={conTipos} conMias={atiende} />

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-950">
          <span>{error}</span>
          {!sinPermiso && <Button type="button" variant="outline" onClick={() => void cargar()}>Reintentar</Button>}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          {pestana === 'calendario' ? (
            <CalendarioCitas citas={paraCalendario} cargando={cargando} onSeleccionar={abrir} onRango={setRango} conTipos={conTipos} />
          ) : cargando ? (
            <div className="space-y-2" role="status" aria-label="Cargando citas">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : (
            <ListaCitas citas={visibles} onSeleccionar={abrir} orden={pestana === 'historial' ? 'desc' : 'asc'} resaltarId={abierta?.id} conTipos={conTipos}
              vacio={error ? 'No se pudieron cargar las citas.' : pestana === 'historial' ? 'Aquí aparecerán las citas realizadas, canceladas, rechazadas o expiradas.' : vacioAgenda} />
          )}
        </div>
        <aside className="min-w-0 space-y-5" aria-label="Próximas citas y acciones rápidas">
          <ProximasCitas citas={lasProximas} onAbrir={abrir} onVerTodas={() => { setPestana('agenda'); setFiltros(SIN_FILTROS) }} />
          <AccionesRapidas vista={vista} visibles={visibles} conTipos={conTipos} rutaDisponibilidad={rutaDisponibilidad} />
        </aside>
      </div>

      {abierta && <DetalleCita key={abierta.id} cita={abierta} conTipos={conTipos} onCerrar={cerrar} onCambio={() => { void cargar(); void pedirProximas().then(aplicarProximas) }} />}
    </div>
  )
}
