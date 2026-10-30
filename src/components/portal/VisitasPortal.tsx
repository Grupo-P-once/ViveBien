'use client'

import Link from 'next/link'
import { CalendarCheck, CalendarDays, Clock, House, MapPin, MessageCircle, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AppointmentStatus from '@/components/citas/AppointmentStatus'
import { Estado, Esqueleto, Pantalla, Vacio, usePeticionPortal } from '@/components/portal/Pantalla'
import { fechaLarga, horaCorta } from '@/lib/citas/zona'
import { NEGOCIO } from '@/lib/config/negocio'
import type { CitaVista } from '@/lib/citas/vista'

/**
 * «Mis visitas» — en lista, y de sólo lectura (3b-2, D-28.3 = A).
 *
 * No hay calendario ni botones de confirmar, cancelar o reprogramar: eso llega
 * con el sistema de visitas (fase 8). Aquí se ve qué hay y cuándo, y del asesor
 * sólo su nombre.
 *
 * Con `citasEnLinea` apagado se explica que agendar en línea todavía no está
 * disponible y se ofrece el camino que sí funciona: escribirnos (D-32: nada de
 * botones que no llevan a ningún sitio).
 */

export type DatosVisitas = { proximas: CitaVista[]; pasadas: CitaVista[]; citasEnLinea: boolean }

function Visita({ c }: { c: CitaVista }) {
  const inicio = new Date(c.inicio)
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {c.propiedad?.foto
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.propiedad.foto} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          : <House className="size-6 text-muted-foreground" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading font-semibold">
          {c.propiedad?.ruta
            ? <Link href={c.propiedad.ruta} className="hover:underline">{c.propiedad.titulo ?? 'Propiedad'}</Link>
            : (c.propiedad?.titulo ?? 'Propiedad')}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden /><span className="first-letter:uppercase">{fechaLarga(inicio)}</span>
          </span>
          <span className="flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden />{horaCorta(inicio)}</span>
          {c.lugar && <span className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />{c.lugar}</span>}
        </p>
        {c.asesor?.nombre && <p className="text-sm text-muted-foreground">Te atiende {c.asesor.nombre}</p>}
        {c.motivoCancelacion && <p className="text-sm text-[var(--estado-mal)]">Motivo: {c.motivoCancelacion}</p>}
      </div>
      <AppointmentStatus estado={c.estado} />
    </li>
  )
}

/** «Estamos trabajando en esto»: la pantalla de visitas todavía no agenda en línea. Honesta: dice qué viene y qué sí funciona hoy. */
function EstamosTrabajando({ whatsapp }: { whatsapp: string }) {
  const pasos = [
    { icono: Search, titulo: 'Elige la propiedad', texto: 'Desde su ficha pedirás visitarla.' },
    { icono: CalendarCheck, titulo: 'Escoge día y hora', texto: 'Verás los horarios disponibles de quien te atiende.' },
    { icono: Sparkles, titulo: 'Recibe tu confirmación', texto: 'Aquí aparecerá tu visita, y te recordamos antes.' },
  ]
  return (
    <section aria-labelledby="visitas-trabajando" className="overflow-hidden rounded-2xl border bg-card" data-estamos-trabajando>
      <div className="bg-[#8B1A1A]/[0.04] px-6 py-8 text-center sm:px-10">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#8B1A1A]/10 text-[#8B1A1A]"><CalendarDays className="size-7" aria-hidden /></span>
        <p className="mb-2 inline-block rounded-full border border-[#8B1A1A]/30 bg-white px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#8B1A1A]">Muy pronto</p>
        <h2 id="visitas-trabajando" className="font-heading text-xl font-semibold">Estamos preparando tus visitas</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Pronto podrás agendar y seguir tus visitas desde aquí. Mientras terminamos, nuestro equipo las coordina contigo directamente: escríbenos y la visita quedará registrada en esta sección.</p>
        <Button asChild className="mt-5"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> Coordinar una visita por WhatsApp</a></Button>
      </div>
      <ol className="grid grid-cols-1 gap-px border-t bg-border sm:grid-cols-3" aria-label="Cómo funcionará">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="flex gap-3 bg-card p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><p.icono className="size-4" aria-hidden /></span>
            <span><span className="block text-sm font-semibold">{i + 1}. {p.titulo}</span><span className="mt-0.5 block text-sm text-muted-foreground">{p.texto}</span></span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function VisitasPortal({ fijo }: { fijo?: DatosVisitas }) {
  const peticion = usePeticionPortal<DatosVisitas>('/api/portal/visitas', fijo)
  const whatsapp = `https://wa.me/${NEGOCIO.whatsapp.replace(/\D/g, '')}`

  return (
    <Pantalla titulo="Mis visitas" descripcion="Las visitas que tienes con nuestro equipo." icono={CalendarDays}>
      <Estado
        peticion={peticion}
        esqueleto={<Esqueleto filas={2} alto="h-24" />}
        vacio={(d) => d.proximas.length === 0 && d.pasadas.length === 0 && (!d.citasEnLinea ? <EstamosTrabajando whatsapp={whatsapp} /> : (
          <Vacio
            titulo="Todavía no tienes visitas"
            accion={!d.citasEnLinea
              ? <Button asChild className="mt-2"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> Escríbenos por WhatsApp</a></Button>
              : <Button asChild className="mt-2"><Link href="/propiedades">Ver propiedades</Link></Button>}
          >
            {d.citasEnLinea
              ? 'Cuando agendes una visita, aquí verás la fecha, la hora y quién te atiende.'
              : 'Agendar en línea todavía no está disponible. Escríbenos y lo coordinamos contigo; la visita aparecerá aquí.'}
          </Vacio>
        ))}
      >
        {(d) => (
          <div className="space-y-6">
            {!d.citasEnLinea && (
              <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                Agendar visitas en línea todavía no está disponible: las coordina el equipo contigo. Aquí puedes
                consultarlas, pero no cambiarlas.
              </p>
            )}

            <section>
              <h2 className="font-heading text-[1.02rem] font-semibold">Próximas</h2>
              {d.proximas.length === 0
                ? <p className="mt-3 rounded-lg bg-[var(--panel-fondo)] px-4 py-5 text-center text-sm text-muted-foreground">No tienes visitas próximas.</p>
                : <ul className="mt-3 space-y-3">{d.proximas.map((c) => <Visita key={c.id} c={c} />)}</ul>}
            </section>

            {d.pasadas.length > 0 && (
              <section>
                <h2 className="font-heading text-[1.02rem] font-semibold">Anteriores</h2>
                <ul className="mt-3 space-y-3">{d.pasadas.map((c) => <Visita key={c.id} c={c} />)}</ul>
              </section>
            )}
          </div>
        )}
      </Estado>
    </Pantalla>
  )
}
