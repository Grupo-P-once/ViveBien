'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, Repeat2, type LucideIcon } from 'lucide-react'
import FullCalendar, { type CalendarRef } from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import listPlugin from '@fullcalendar/react/list'
import classicTheme from '@fullcalendar/react/themes/classic'
import esLocale from '@fullcalendar/react/locales/es'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import './calendario.css'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { horaCorta } from '@/lib/citas/zona'
import type { CitaVista } from '@/lib/citas/vista'
import type { EstadoCita } from '@/lib/citas/estados'
import { COLOR_EVENTO } from './AppointmentStatus'
import { COLOR_DE_TIPO, TEXTO_DE_TIPO } from './uiCitas'

/** El ícono de cada estado: el color ayuda, pero el estado también se dice con la forma y en texto. */
const ICONO_DE_ESTADO: Record<EstadoCita, LucideIcon> = {
  REQUESTED: Clock, PENDING_CONFIRMATION: Clock, CONFIRMED: CircleCheck, RESCHEDULE_REQUESTED: Repeat2, RESCHEDULED: CircleCheck,
  CANCELLED: CircleX, REJECTED: CircleX, EXPIRED: CircleX, COMPLETED: CircleCheck, NO_SHOW: CircleX,
}
/** Leyenda: solo los tres tonos que de verdad se ven en un calendario de citas abiertas. */
const LEYENDA: Array<{ estado: EstadoCita; texto: string }> = [
  { estado: 'CONFIRMED', texto: 'Confirmada' },
  { estado: 'REQUESTED', texto: 'Pendiente' },
  { estado: 'RESCHEDULE_REQUESTED', texto: 'Cambio por responder' },
]

/**
 * El calendario: mes, semana, día y agenda (lista), en hora de León.
 *
 * · Controles PROPIOS (anterior, hoy, siguiente y las cuatro vistas) en vez de la barra interna: son botones de verdad, con
 *   `aria-pressed`, tamaño táctil de 44 px y el nombre del periodo anunciado a los lectores de pantalla.
 * · Cada cita es un chip con el COLOR de su estado (verde confirmada, ámbar pendiente o con cambio por responder, gris/rojo las cerradas), su ícono, la hora y la propiedad; el estado
 *   además va en texto (en vista de semana/día y para el lector de pantalla). «Hoy» se resalta. Quien ve citas de distinto tipo (equipo, asociado) tiene un punto de color por tipo.
 * · En pantallas angostas arranca en «Agenda» (lista): una cuadrícula mensual de escritorio encogida se vuelve ilegible.
 * · El calendario solo PINTA lo que el servidor ya recortó para esta persona; nada se decide aquí.
 */

type Vista = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'
const VISTAS: Array<{ id: Vista; texto: string; nombre: string }> = [
  { id: 'dayGridMonth', texto: 'Mes', nombre: 'Vista de mes' },
  { id: 'timeGridWeek', texto: 'Semana', nombre: 'Vista de semana' },
  { id: 'timeGridDay', texto: 'Día', nombre: 'Vista de día' },
  { id: 'listWeek', texto: 'Agenda', nombre: 'Vista de agenda' },
]

export type RangoVisible = { desde: Date; hasta: Date }

export default function CalendarioCitas({
  citas, onSeleccionar, onRango, cargando, conTipos = true,
}: {
  citas: CitaVista[]
  onSeleccionar: (c: CitaVista) => void
  onRango: (r: RangoVisible) => void
  cargando?: boolean
  /** Distinguir «solicitud de cliente» de «visita propia» (leyenda y color). El CLIENTE solo ve sus propias visitas: para él esa distinción no existe. */
  conTipos?: boolean
}) {
  const ref = useRef<CalendarRef>(null)
  // Pantalla angosta: la agenda en lista es lo legible (una cuadrícula mensual de escritorio encogida no se lee). Se decide UNA vez,
  // al nacer el componente. Solo se monta tras elegir la pestaña «Calendario» en el navegador, nunca en el render del servidor.
  const [vista, setVista] = useState<Vista>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'listWeek' : 'dayGridMonth'))
  const [titulo, setTitulo] = useState('')

  const eventos = useMemo(() => citas.map((c) => ({
    id: c.id,
    title: c.propiedad?.titulo ?? 'Cita',
    start: c.inicio,
    end: c.fin,
    backgroundColor: COLOR_EVENTO[c.estado].fondo,
    borderColor: COLOR_EVENTO[c.estado].borde,
    textColor: COLOR_EVENTO[c.estado].texto,
    extendedProps: { cita: c },
  })), [citas])

  function cambiar(v: Vista) {
    setVista(v)
    ref.current?.getApi().changeView(v)
  }

  return (
    <div className="citas-cal rounded-xl border bg-card p-3 sm:p-4" data-calendario-citas aria-busy={cargando ? true : undefined}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="size-11" aria-label="Periodo anterior" onClick={() => ref.current?.getApi().prev()}><ChevronLeft aria-hidden /></Button>
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => ref.current?.getApi().today()}>Hoy</Button>
          <Button type="button" variant="outline" size="icon" className="size-11" aria-label="Periodo siguiente" onClick={() => ref.current?.getApi().next()}><ChevronRight aria-hidden /></Button>
        </div>
        {/* Se anuncia al cambiar de periodo. */}
        <h2 className="min-w-0 flex-1 text-center font-heading text-lg font-semibold first-letter:uppercase sm:flex-none" aria-live="polite" data-titulo-calendario>{titulo}</h2>
        <div role="group" aria-label="Vista del calendario" className="flex overflow-hidden rounded-lg border">
          {VISTAS.map((v) => (
            <button key={v.id} type="button" aria-pressed={vista === v.id} aria-label={v.nombre} onClick={() => cambiar(v.id)}
              className={cn('h-11 min-w-[3.4rem] px-3 text-sm font-semibold transition-colors', vista === v.id ? 'bg-[var(--marca)] text-white' : 'bg-card hover:bg-muted')}>
              {v.texto}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda de colores" data-leyenda-calendario>
        {LEYENDA.map(({ estado, texto }) => (
          <span key={estado} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border" style={{ background: COLOR_EVENTO[estado].fondo, borderColor: COLOR_EVENTO[estado].borde }} aria-hidden />{texto}</span>
        ))}
        {conTipos && (['solicitada', 'propia'] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: COLOR_DE_TIPO[t] }} aria-hidden />{TEXTO_DE_TIPO[t]}</span>
        ))}
      </div>

      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, classicTheme]}
        locale={esLocale}
        timeZone="America/Mexico_City"
        initialView={vista}
        headerToolbar={false}
        height="auto"
        firstDay={1}
        nowIndicator
        navLinks={false}
        dayMaxEvents={3}
        eventInteractive
        events={eventos}
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        noEventsContent="No hay citas en este periodo."
        datesSet={(a) => {
          setTitulo(a.view.title)
          onRango({ desde: a.view.activeStart, hasta: a.view.activeEnd })
        }}
        eventClick={(a) => { const c = (a.event.extendedProps as { cita?: CitaVista }).cita; if (c) onSeleccionar(c) }}
        eventContent={(a) => {
          const c = (a.event.extendedProps as { cita?: CitaVista }).cita
          if (!c) return undefined
          const Icono = ICONO_DE_ESTADO[c.estado]
          const ancha = a.view.type !== 'dayGridMonth'   // en el mes la celda es chica: ícono + hora + propiedad; en semana/día cabe el estado en texto
          return (
            <div className="flex min-w-0 items-center gap-1 overflow-hidden px-1 py-px text-[0.76rem] leading-tight" title={`${c.propiedad?.titulo ?? 'Cita'} · ${c.etiqueta}`}>
              <Icono className="size-3 shrink-0" aria-hidden />
              {conTipos && <span className="size-1.5 shrink-0 rounded-full" style={{ background: COLOR_DE_TIPO[c.tipo] }} aria-hidden />}
              <span className="shrink-0 font-semibold tabular-nums">{horaCorta(new Date(c.inicio))}</span>
              <span className="truncate">{c.propiedad?.titulo ?? 'Cita'}</span>
              <span className={ancha ? 'shrink-0 font-semibold' : 'sr-only'} data-estado-evento>{ancha ? `· ${c.etiqueta}` : c.etiqueta}</span>
              {c.conflicto && <span className="shrink-0 rounded bg-amber-200 px-1 font-semibold text-amber-950">Conflicto</span>}
            </div>
          )
        }}
      />
    </div>
  )
}
