import { cn } from '@/lib/utils'
import { ETIQUETA_ESTADO, type EstadoCita } from '@/lib/citas/estados'

/**
 * Insignia del estado de una visita. Siempre con texto: el color ayuda, pero
 * no es lo único que dice el estado (daltonismo, impresión en blanco y negro).
 *
 * Colores: Confirmada verde (también si su horario cambió: para quien la ve sigue siendo
 * «Confirmada»), Pendiente y Reprogramación solicitada ámbar, Rechazada y No asistió rojo,
 * Cancelada y Expirada gris (la cancelada, tachada), Realizada gris más oscuro.
 */

export const TONO_ESTADO: Record<EstadoCita, { fondo: string; texto: string; punto: string }> = {
  REQUESTED: { fondo: 'bg-[#fdf1e3]', texto: 'text-[#b54708]', punto: '#eda100' },
  PENDING_CONFIRMATION: { fondo: 'bg-[#fdf1e3]', texto: 'text-[#b54708]', punto: '#eda100' },
  CONFIRMED: { fondo: 'bg-[#e8f5ee]', texto: 'text-[#067647]', punto: '#1baf7a' },
  RESCHEDULE_REQUESTED: { fondo: 'bg-[#fdf1e3]', texto: 'text-[#b54708]', punto: '#eda100' },
  RESCHEDULED: { fondo: 'bg-[#e8f5ee]', texto: 'text-[#067647]', punto: '#1baf7a' },
  CANCELLED: { fondo: 'bg-[#f1efec]', texto: 'text-[#5c5b57] line-through', punto: '#a8a59e' },
  REJECTED: { fondo: 'bg-[#fdeceb]', texto: 'text-[#b42318]', punto: '#b42318' },
  EXPIRED: { fondo: 'bg-[#f1efec]', texto: 'text-[#5c5b57]', punto: '#a8a59e' },
  COMPLETED: { fondo: 'bg-[#eceae6]', texto: 'text-[#4a4945]', punto: '#8a8882' },
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

/**
 * Los mismos tonos de arriba como valores de color para el CALENDARIO (FullCalendar los pide como cadenas, no como clases de Tailwind): fondo suave, texto oscuro y un borde
 * del tono fuerte. Todos los pares de texto/fondo pasan 4,5:1. El estado NO va solo en el color: cada evento lleva su ícono y su texto («Confirmada»…).
 */
export const COLOR_EVENTO: Record<EstadoCita, { fondo: string; texto: string; borde: string }> = {
  REQUESTED: { fondo: '#fdf1e3', texto: '#8f3a05', borde: '#eda100' },
  PENDING_CONFIRMATION: { fondo: '#fdf1e3', texto: '#8f3a05', borde: '#eda100' },
  CONFIRMED: { fondo: '#e8f5ee', texto: '#05603b', borde: '#1baf7a' },
  RESCHEDULE_REQUESTED: { fondo: '#fdf1e3', texto: '#8f3a05', borde: '#eda100' },
  RESCHEDULED: { fondo: '#e8f5ee', texto: '#05603b', borde: '#1baf7a' },
  CANCELLED: { fondo: '#f1efec', texto: '#4f4e4a', borde: '#a8a59e' },
  REJECTED: { fondo: '#fdeceb', texto: '#912018', borde: '#b42318' },
  EXPIRED: { fondo: '#f1efec', texto: '#4f4e4a', borde: '#a8a59e' },
  COMPLETED: { fondo: '#eceae6', texto: '#3f3e3b', borde: '#8a8882' },
  NO_SHOW: { fondo: '#fdeceb', texto: '#912018', borde: '#b42318' },
}
