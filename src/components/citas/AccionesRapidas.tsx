'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronRight, Download, FileSpreadsheet, Settings2, Zap, type LucideIcon } from 'lucide-react'
import { descargarArchivo } from '@/lib/citas/cliente'
import type { VistaCalendario } from '@/lib/citas/servicio'
import type { CitaVista } from '@/lib/citas/vista'
import { aCsv } from './uiCitas'

/** El ícono de cada acción, en su recuadro de marca (fuera del componente: no se vuelve a crear en cada render). */
function Icono({ I }: { I: LucideIcon }) {
  return <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--marca-tinte)] text-[var(--marca)]" aria-hidden><I className="size-4" /></span>
}

/**
 * «Acciones rápidas»: SOLO lo que existe de verdad.
 *   · Agendar una visita   → el catálogo (la cita se pide desde la ficha de la propiedad, con la tarjeta «Agenda una cita»).
 *   · Descargar mi calendario → un .ics con mis citas acordadas de los próximos 100 días (se importa en Google Calendar, Outlook, Apple…).
 *   · Exportar a CSV       → lo que se ve ahora (ya recortado para esta persona).
 *   · Mi disponibilidad    → solo para quien atiende citas.
 * No hay «enviar recordatorios» (salen solos, 24 h y 1 h antes) ni sincronización con Google Calendar (es una fase posterior): no se aparenta lo que no existe.
 */
export default function AccionesRapidas({
  vista, visibles, conTipos, rutaDisponibilidad,
}: {
  vista: VistaCalendario
  /** Las citas que se ven en pantalla (para el CSV). */
  visibles: CitaVista[]
  conTipos: boolean
  /** Dónde edita su disponibilidad quien atiende citas (ausente = no aplica). */
  rutaDisponibilidad?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [bajando, setBajando] = useState(false)

  async function calendario() {
    setError(null); setAviso(null); setBajando(true)
    const r = await descargarArchivo(`/api/citas/ics?vista=${vista}`, 'mis-citas-vive-bien.ics')
    setBajando(false)
    if (r.ok) setAviso('Listo: importa el archivo en tu calendario. Solo trae las citas acordadas de los próximos 100 días.'); else setError(r.error)
  }

  function csv() {
    setError(null)
    if (visibles.length === 0) { setAviso(null); setError('No hay citas en pantalla para exportar.'); return }
    const url = URL.createObjectURL(new Blob([aCsv(visibles, { conTipos })], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `citas-vive-bien-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setAviso(`Se exportaron ${visibles.length} ${visibles.length === 1 ? 'cita' : 'citas'}, tal como las ves.`)
  }

  const fila = 'flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left text-sm font-semibold transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-[var(--marca)] focus-visible:outline-none disabled:opacity-60'

  return (
    <section aria-labelledby="acciones-t" className="rounded-xl border bg-card p-4" data-acciones-rapidas>
      <h2 id="acciones-t" className="mb-3 flex items-center gap-2 font-heading text-base font-semibold"><Zap className="size-4 text-[var(--marca)]" aria-hidden />Acciones rápidas</h2>
      <div className="space-y-2">
        {vista !== 'propietario' && (
          <Link href="/propiedades" className={fila}><Icono I={CalendarPlus} />Agendar una visita<ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden /></Link>
        )}
        <button type="button" className={fila} onClick={() => void calendario()} disabled={bajando}><Icono I={Download} />{bajando ? 'Preparando…' : 'Descargar mi calendario'}<ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden /></button>
        <button type="button" className={fila} onClick={csv}><Icono I={FileSpreadsheet} />Exportar a CSV<ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden /></button>
        {rutaDisponibilidad && <Link href={rutaDisponibilidad} className={fila}><Icono I={Settings2} />Mi disponibilidad<ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden /></Link>}
      </div>
      {aviso && <p role="status" className="mt-3 rounded-lg bg-green-100 p-2.5 text-xs text-green-950">{aviso}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-2.5 text-xs text-red-950">{error}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Los recordatorios salen solos: 24 horas y 1 hora antes de cada cita confirmada.</p>
    </section>
  )
}
