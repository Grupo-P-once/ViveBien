'use client'

import { CalendarDays, Clock, House, MapPin, TriangleAlert, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import AppointmentStatus from '@/components/citas/AppointmentStatus'
import { horaCorta } from '@/lib/citas/zona'
import type { CitaVista } from '@/lib/citas/vista'
import { COLOR_DE_TIPO, TEXTO_DE_TIPO, agruparPorDia, quienVa, requiereRespuesta, tituloDeDia } from './uiCitas'

/**
 * La agenda en lista, agrupada por día. Es la vista que funciona bien en el celular (tarjetas táctiles de ancho completo) y la base del
 * historial. Cada cita es UN botón: se abre con teclado (Enter/Espacio) y el lector de pantalla oye propiedad, día, hora y estado.
 */
export default function ListaCitas({
  citas, onSeleccionar, vacio, orden = 'asc', resaltarId, conTipos = true,
}: {
  citas: CitaVista[]
  onSeleccionar: (c: CitaVista) => void
  vacio: React.ReactNode
  orden?: 'asc' | 'desc'
  /** La cita que se abrió desde un enlace (correo o aviso): se resalta. */
  resaltarId?: string | null
  /** Mostrar la etiqueta «Solicitud de cliente / Visita propia». El cliente no la ve: todas sus visitas son suyas. */
  conTipos?: boolean
}) {
  if (!citas.length) return <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground" data-lista-vacia>{vacio}</div>
  const grupos = agruparPorDia(citas, orden)
  return (
    <div className="space-y-6" data-lista-citas>
      {grupos.map((g) => (
        <section key={g.dia} aria-labelledby={`dia-${g.dia}`}>
          <h3 id={`dia-${g.dia}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground first-letter:uppercase">
            <CalendarDays className="size-4" aria-hidden />{tituloDeDia(g.dia)}
          </h3>
          <ul className="space-y-2">
            {g.citas.map((c) => {
              const inicio = new Date(c.inicio)
              const fin = new Date(c.fin)
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => onSeleccionar(c)} data-cita-id={c.id}
                    aria-label={`${c.propiedad?.titulo ?? 'Cita'}, ${tituloDeDia(g.dia)}, ${horaCorta(inicio)}, ${c.etiqueta}${requiereRespuesta(c) ? ', requiere tu respuesta' : ''}`}
                    className={cn('flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-[#8B1A1A] focus-visible:outline-none',
                      resaltarId === c.id && 'ring-2 ring-[#8B1A1A]')}
                    style={{ borderLeft: `5px solid ${COLOR_DE_TIPO[conTipos ? c.tipo : 'solicitada']}` }}>
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {c.propiedad?.foto
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={c.propiedad.foto} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                        : <House className="size-5 text-muted-foreground" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-heading font-semibold">{c.propiedad?.titulo ?? 'Propiedad'}</span>
                        <AppointmentStatus estado={c.estado} />
                        {c.conflicto && <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950"><TriangleAlert className="size-3" aria-hidden />Horario ocupado</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5 tabular-nums"><Clock className="size-3.5" aria-hidden />{horaCorta(inicio)} – {horaCorta(fin)}</span>
                        {c.lugar && <span className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />{c.lugar}</span>}
                        {c.papel !== 'cliente' && <span className="flex items-center gap-1.5"><User className="size-3.5" aria-hidden />{quienVa(c)}</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                        {conTipos && <span className="font-semibold" style={{ color: COLOR_DE_TIPO[c.tipo] }}>{TEXTO_DE_TIPO[c.tipo]}</span>}
                        {requiereRespuesta(c) && <span className="font-semibold text-[#b54708]">Requiere tu respuesta</span>}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
