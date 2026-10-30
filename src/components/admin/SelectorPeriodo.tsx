'use client'

import { CalendarDays } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PERIODOS, type Periodo } from '@/lib/admin/periodo'

/**
 * El filtro de fechas del tablero. Uno solo, arriba, para todo lo de abajo: si
 * cada gráfica tuviera el suyo (como en la referencia), dos tarjetas contiguas
 * podrían contar periodos distintos y sus números no cuadrarían.
 */
export default function SelectorPeriodo({ valor, onCambiar }: { valor: Periodo; onCambiar: (p: Periodo) => void }) {
  return (
    <Select value={valor} onValueChange={(v) => onCambiar(v as Periodo)}>
      <SelectTrigger className="h-10 w-full min-w-[13rem] bg-card" aria-label="Período del tablero">
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {PERIODOS.map((p) => (
          <SelectItem key={p.clave} value={p.clave}>{p.etiqueta}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
