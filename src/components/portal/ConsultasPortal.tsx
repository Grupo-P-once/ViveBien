'use client'

import Link from 'next/link'
import { CalendarDays, House, MapPin, MessageSquare, Search, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Estado, Esqueleto, Pantalla, Vacio, usePeticionPortal } from '@/components/portal/Pantalla'
import { fechaCorta } from '@/lib/admin/formato'
import type { ConsultaVista, InteresVista } from '@/lib/portal/pantallas'
import { RUTAS_DE_VISITAS } from '@/lib/citas/enlaces'
import { agruparPorPropiedad } from '@/lib/portal/consultas-agrupadas'
import HistorialDeContactos from '@/components/portal/HistorialDeContactos'

/**
 * «Mis consultas» — lo que esta persona ha preguntado o pedido, JUNTO por propiedad (24-oct-2026).
 *
 * Antes eran dos pantallas casi iguales («Me interesan» y «Mis consultas»): las dos salían de las mismas solicitudes. Ahora hay una: una tarjeta por
 * propiedad con todo lo que se hizo ahí (informes, visita pedida, visita agendada), de lo más reciente a lo más antiguo.
 * El seguimiento (en revisión, atendida…) llega con la fase de leads: inventarlo sería prometer un proceso que nadie ejecuta.
 */

export type DatosConsultas = { consultas: ConsultaVista[] }
export type DatosCitas = { interesan: InteresVista[] }

const QUE_DICE = {
  informacion: { texto: 'Pediste información', icono: Send },
  visita: { texto: 'Pediste una visita', icono: CalendarDays },
  cita: { texto: 'Visita agendada', icono: CalendarDays },
} as const

export default function ConsultasPortal({ fijo, fijoCitas }: { fijo?: DatosConsultas; fijoCitas?: DatosCitas }) {
  const peticion = usePeticionPortal<DatosConsultas>('/api/portal/consultas', fijo)
  // Las citas son un complemento: si esa lectura falla, las consultas se ven igual.
  const citas = usePeticionPortal<DatosCitas>('/api/portal/me-interesan', fijoCitas ?? (fijo ? { interesan: [] } : undefined))

  return (
    <Pantalla
      titulo="Mis consultas"
      descripcion="Las propiedades por las que preguntaste o para las que pediste una visita. Te contestamos por correo o WhatsApp."
      icono={MessageSquare}
      acciones={
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/propiedades"><Search aria-hidden /> Buscar más</Link>
        </Button>
      }
    >
      <Estado
        peticion={peticion}
        esqueleto={<Esqueleto filas={3} alto="h-32" />}
        vacio={(d) => d.consultas.length === 0 && (citas.datos?.interesan.length ?? 0) === 0 && (
          <Vacio
            titulo="Todavía no has preguntado por ninguna propiedad"
            accion={<Button asChild className="mt-2"><Link href="/propiedades">Ver propiedades</Link></Button>}
          >
            Cuando pidas información o una visita desde una ficha, esa propiedad aparecerá aquí con lo que pediste y su fecha.
          </Vacio>
        )}
      >
        {(d) => (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {agruparPorPropiedad(d.consultas, citas.datos?.interesan ?? []).map((g) => {
              const p = g.propiedad
              return (
                <li key={g.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {p?.foto
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.foto} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                        : <House className="size-6 text-muted-foreground" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading font-semibold">
                        {p ? <Link href={p.ruta} className="hover:underline">{g.titulo}</Link> : g.titulo}
                      </p>
                      {p?.lugar && <p className="flex items-center gap-1 truncate text-sm text-muted-foreground"><MapPin className="size-3.5 shrink-0" aria-hidden />{p.lugar}</p>}
                      {p?.precio && <p className="text-sm font-medium">{p.precio}</p>}
                      {!p && <p className="text-sm text-[var(--aviso-fuerte)]">Ya no está publicada</p>}
                    </div>
                  </div>
                  <ol className="space-y-2 border-l-2 border-border pl-4">
                    {g.pasos.map((s) => {
                      const q = QUE_DICE[s.que]
                      const Icono = q.icono
                      return (
                        <li key={s.clave} className="relative text-sm">
                          <span aria-hidden className="absolute -left-[1.6rem] top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"><Icono className="size-2.5" /></span>
                          <p className="font-medium">{q.texto} <span className="font-normal text-muted-foreground">· {fechaCorta(s.cuando)}</span></p>
                          {s.mensaje && <p className="mt-0.5 line-clamp-2 text-muted-foreground">«{s.mensaje}»</p>}
                          {s.que === 'cita' && <Link href={RUTAS_DE_VISITAS.cliente} className="text-xs underline">Ver en Mis visitas</Link>}
                        </li>
                      )
                    })}
                  </ol>
                </li>
              )
            })}
          </ul>
        )}
      </Estado>
      {!fijo && <div className="mt-8"><HistorialDeContactos /></div>}
    </Pantalla>
  )
}
