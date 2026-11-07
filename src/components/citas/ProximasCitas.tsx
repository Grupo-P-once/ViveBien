'use client'

import { CalendarClock, ChevronRight, House } from 'lucide-react'
import AppointmentStatus from '@/components/citas/AppointmentStatus'
import { horaCorta } from '@/lib/citas/zona'
import type { CitaVista } from '@/lib/citas/vista'
import { diaRelativo, requiereRespuesta } from './uiCitas'

/**
 * «Próximas citas»: las siguientes abiertas (acordadas o que esperan respuesta), con la foto de la propiedad, cuándo es y su estado EN TEXTO.
 * Cada fila es un botón que abre el detalle. La foto es la de la propiedad real (un hecho, no una ilustración); sin foto, un ícono neutro.
 */
export default function ProximasCitas({ citas, onAbrir, onVerTodas }: { citas: CitaVista[]; onAbrir: (c: CitaVista) => void; onVerTodas: () => void }) {
  return (
    <section aria-labelledby="proximas-t" className="rounded-xl border bg-card p-4" data-proximas-citas>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="proximas-t" className="flex items-center gap-2 font-heading text-base font-semibold"><CalendarClock className="size-4 text-[var(--marca)]" aria-hidden />Próximas citas</h2>
        <button type="button" onClick={onVerTodas} className="inline-flex items-center gap-0.5 rounded text-xs font-semibold text-[var(--marca)] underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-[var(--marca)] focus-visible:outline-none">
          Ver todas<ChevronRight className="size-3.5" aria-hidden />
        </button>
      </div>
      {citas.length === 0 ? (
        <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">No tienes citas por venir. Cuando haya una, aparecerá aquí.</p>
      ) : (
        <ul className="space-y-2">
          {citas.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onAbrir(c)} data-proxima-id={c.id}
                aria-label={`${c.propiedad?.titulo ?? 'Cita'}, ${diaRelativo(c.inicio)}, ${horaCorta(new Date(c.inicio))}, ${c.etiqueta}${requiereRespuesta(c) ? ', requiere tu respuesta' : ''}`}
                className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-[var(--marca)] focus-visible:outline-none">
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {c.propiedad?.foto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.propiedad.foto} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                    : <House className="size-6 text-muted-foreground" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.propiedad?.titulo ?? 'Propiedad'}</span>
                  <span className="block text-xs text-muted-foreground"><span className="first-letter:uppercase">{diaRelativo(c.inicio)}</span>, <span className="tabular-nums">{horaCorta(new Date(c.inicio))}</span></span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <AppointmentStatus estado={c.estado} />
                    {requiereRespuesta(c) && <span className="text-xs font-semibold text-[#b54708]">Responde</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
