import Link from 'next/link'
import {
  ArchiveX, CalendarCheck, CircleCheck, ClipboardCheck, FilePlus2, Inbox, MailCheck, MailPlus, MessageSquare, ShieldCheck, UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { ItemActividad, TipoActividad } from '@/lib/admin/actividad'
import { fechaCorta, haceCuanto, hora } from '@/lib/admin/formato'

const ICONO: Record<TipoActividad, LucideIcon> = {
  registro: Inbox,
  solicitud: CalendarCheck,
  contacto: MessageSquare,
  cuenta: UserPlus,
  publicada: CircleCheck,
  revision: ClipboardCheck,
  'propiedad-creada': FilePlus2,
  'propiedad-borrada': ArchiveX,
  'usuario-cambio': ShieldCheck,
  'modulo-cambio': ShieldCheck,
  invitacion: MailPlus,
  'invitacion-aceptada': MailCheck,
}

/** Lista de actividad: icono, qué pasó, detalle y cuándo. */
export default function ActividadReciente({ items, ahora }: { items: ItemActividad[]; ahora?: Date }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-muted/60 px-6 py-10 text-center text-sm text-muted-foreground">Todavía no hay actividad registrada.</p>
  }
  return (
    <ol className="divide-y">
      {items.map((it) => {
        const Icono = ICONO[it.tipo]
        const contenido = (
          <>
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--marca-tinte)] text-[var(--marca)]">
              <Icono className="size-[1.05rem]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug font-medium text-foreground">{it.titulo}</span>
              {it.detalle && <span className="block text-xs leading-snug text-muted-foreground">{it.detalle}</span>}
            </span>
            <time dateTime={it.fecha} title={`${fechaCorta(it.fecha)} ${hora(it.fecha)}`} className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted-foreground">
              {haceCuanto(it.fecha, ahora)}
            </time>
          </>
        )
        return (
          <li key={it.id}>
            {it.enlace ? (
              <Link href={it.enlace} className="-mx-2 flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none">
                {contenido}
              </Link>
            ) : (
              <div className="flex gap-3 py-3">{contenido}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
