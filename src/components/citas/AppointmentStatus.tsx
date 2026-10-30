import { cn } from '@/lib/utils'
import { ETIQUETA_ESTADO, type EstadoCita } from '@/lib/citas/estados'

/**
 * Insignia del estado de una visita. Siempre con texto: el color ayuda, pero
 * no es lo único que dice el estado (daltonismo, impresión en blanco y negro).
 *
 * Colores como en los mockups: Confirmada verde, Por confirmar ámbar,
 * Reprogramada azul, Visitada gris.
 */

export const TONO_ESTADO: Record<EstadoCita, { fondo: string; texto: string; punto: string }> = {
  REQUESTED: { fondo: 'bg-[#fdf1e3]', texto: 'text-[#b54708]', punto: '#eda100' },
  PENDING_CONFIRMATION: { fondo: 'bg-[#fdf1e3]', texto: 'text-[#b54708]', punto: '#eda100' },
  CONFIRMED: { fondo: 'bg-[#e8f5ee]', texto: 'text-[#067647]', punto: '#1baf7a' },
  RESCHEDULE_REQUESTED: { fondo: 'bg-[#fdf1e3]', texto: 'text-[#b54708]', punto: '#eda100' },
  RESCHEDULED: { fondo: 'bg-[#e9f1fb]', texto: 'text-[#1d5fae]', punto: '#2a78d6' },
  CANCELLED: { fondo: 'bg-[#f1efec]', texto: 'text-[#8a8882] line-through', punto: '#a8a59e' },
  COMPLETED: { fondo: 'bg-[#eceae6]', texto: 'text-[#5c5b57]', punto: '#8a8882' },
  NO_SHOW: { fondo: 'bg-[#fdeceb]', texto: 'text-[#b42318]', punto: '#b42318' },
}

export default function AppointmentStatus({ estado, className }: { estado: EstadoCita; className?: string }) {
  const t = TONO_ESTADO[estado]
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap', t.fondo, t.texto, className)}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}
