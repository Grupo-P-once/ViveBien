'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CalendarDays, History, Loader2, Mail, MessageCircle, Phone } from 'lucide-react'
import { useSesion } from '@/components/admin/sesion'
import { ETIQUETA_CANAL_HISTORIAL, fechaYHora, type FilaHistorial } from '@/lib/contactos-cliente'

/**
 * «Tu historial de contactos» (28-oct-2026), en TABLA: fecha y hora, canal (WhatsApp, llamada, correo o cita), ID de la propiedad (el folio), nombre, estatus y enlace.
 * El nombre y el folio de un contacto son los de ESE momento. «Disponible» solo si la propiedad sigue publicada y sin estatus de baja; si no, «No disponible». El enlace siempre está:
 * si la propiedad ya no existe, la ficha responde con su propia página 404 (con humor). Las llamadas y los WhatsApp hechos desde tu teléfono sin pasar por aquí no pueden anotarse.
 * En pantallas angostas la tabla se desplaza dentro de su caja (nunca ensancha la página).
 */
const ICONO = { whatsapp: MessageCircle, telefono: Phone, correo: Mail, cita: CalendarDays } as const

export default function HistorialDeContactos() {
  const { pedir } = useSesion()
  const [lista, setLista] = useState<FilaHistorial[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    pedir<{ historial: FilaHistorial[] }>('/api/portal/contactos').then((r) => { if (vivo) setLista(r.historial ?? []) }).catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar tu historial.') })
    return () => { vivo = false }
  }, [pedir])

  return (
    <section aria-labelledby="hist-contactos" className="rounded-xl border bg-card p-5" data-historial-contactos>
      <h2 id="hist-contactos" className="flex items-center gap-2 font-heading text-[1.02rem] font-semibold"><History className="size-4" aria-hidden />Tu historial de contactos</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Los contactos que iniciaste desde el sitio (WhatsApp, llamada, correo) y tus citas. Es el registro de que lo intentaste: no significa que te hayan contestado.</p>
      {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
      {!lista && !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}
      {lista && lista.length === 0 && <p className="rounded-lg bg-[var(--panel-fondo)] px-4 py-6 text-center text-sm text-muted-foreground" data-contactos-vacio>Todavía no has contactado por ninguna propiedad. Cuando lo hagas, aparecerá aquí con su fecha y canal.</p>}
      {lista && lista.length > 0 && (
        <div className="max-w-full overflow-x-auto rounded-lg border" tabIndex={0} role="region" aria-label="Tabla del historial de contactos">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm" data-tabla-historial>
            <caption className="sr-only">Historial de contactos, del más reciente al más antiguo</caption>
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Fecha</th>
                <th scope="col" className="px-3 py-2 font-semibold">Canal</th>
                <th scope="col" className="px-3 py-2 font-semibold">ID</th>
                <th scope="col" className="px-3 py-2 font-semibold">Propiedad</th>
                <th scope="col" className="px-3 py-2 font-semibold">Estatus</th>
                <th scope="col" className="px-3 py-2 font-semibold">Enlace</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const Icono = ICONO[f.canal]
                return (
                  <tr key={f.clave} data-contacto={f.clave} data-disponible={f.disponible ? 'si' : 'no'} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2">{fechaYHora(f.creadoEn)}</td>
                    <td className="whitespace-nowrap px-3 py-2"><span className="inline-flex items-center gap-1.5"><Icono className="size-4 text-muted-foreground" aria-hidden />{ETIQUETA_CANAL_HISTORIAL[f.canal]}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{f.folio ?? '—'}</td>
                    <td className="min-w-[10rem] px-3 py-2 font-medium">{f.nombre}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {f.disponible
                        ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Disponible</span>
                        : <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-800">No disponible</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2"><Link href={f.ruta} className="font-semibold underline" aria-label={`Ver la propiedad ${f.nombre}`}>Ver propiedad</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
