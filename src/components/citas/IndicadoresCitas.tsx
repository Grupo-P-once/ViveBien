'use client'

import { CalendarDays, CircleCheck, Clock, Repeat2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONO_ESTADO } from './AppointmentStatus'
import type { GrupoEstado } from './filtros'
import type { indicadores } from './uiCitas'

/**
 * Los cuatro indicadores de arriba. Son FILTROS: pulsar uno muestra solo esas citas (y volver a pulsarlo quita el filtro), con `aria-pressed` para el lector de pantalla.
 * Solo cuentan lo que el servidor ya recortó para esta persona. Nada inventado (sin «+25 % que el mes pasado»): cada cifra se puede comprobar en la lista.
 */
type Ind = ReturnType<typeof indicadores>
type Tarjeta = { clave: string; grupo: GrupoEstado; titulo: string; n: number; ayuda: string; Icono: LucideIcon; tono: { fondo: string; texto: string } }

export default function IndicadoresCitas({ ind, activo, onElegir }: { ind: Ind; activo: GrupoEstado; onElegir: (g: GrupoEstado) => void }) {
  const tarjetas: Tarjeta[] = [
    { clave: 'Programadas', grupo: 'todas', titulo: 'Citas programadas', n: ind.programadas, ayuda: 'Abiertas y por venir', Icono: CalendarDays, tono: { fondo: 'bg-[var(--marca-tinte)]', texto: 'text-[var(--marca)]' } },
    { clave: 'Confirmadas', grupo: 'confirmadas', titulo: 'Confirmadas', n: ind.confirmadas, ayuda: 'Con horario acordado', Icono: CircleCheck, tono: TONO_ESTADO.CONFIRMED },
    { clave: 'Pendientes', grupo: 'pendientes', titulo: 'Pendientes por confirmar', n: ind.pendientes, ayuda: 'Esperan una respuesta', Icono: Clock, tono: TONO_ESTADO.REQUESTED },
    { clave: 'Por responder', grupo: 'por_responder', titulo: 'Cambios por responder', n: ind.porResponder, ayuda: 'Proponen otro horario', Icono: Repeat2, tono: TONO_ESTADO.RESCHEDULE_REQUESTED },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Resumen de tus citas: pulsa uno para filtrar">
      {tarjetas.map(({ clave, grupo, titulo, n, ayuda, Icono, tono }) => {
        const marcado = activo === grupo && grupo !== 'todas'
        return (
          <button key={clave} type="button" aria-pressed={marcado} data-indicador={clave} onClick={() => onElegir(marcado ? 'todas' : grupo)}
            className={cn('flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--marca)] focus-visible:outline-none sm:p-4',
              marcado && 'border-[var(--marca)] ring-1 ring-[var(--marca)]')}>
            <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tono.fondo, tono.texto)} aria-hidden><Icono className="size-5" /></span>
            <span className="min-w-0">
              <span className="block font-heading text-[1.7rem] leading-none font-bold tabular-nums">{n}</span>
              <span className="mt-1 block text-[0.8rem] leading-tight font-semibold">{titulo}</span>
              <span className="block text-xs leading-tight text-muted-foreground">{ayuda}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
