'use client'

import Link from 'next/link'
import { CalendarDays, MessageSquare, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TarjetaPropiedad from '@/components/portal/TarjetaPropiedad'
import { Estado, Esqueleto, Pantalla, Vacio, usePeticionPortal } from '@/components/portal/Pantalla'
import { useGuardadas } from '@/components/portal/guardadas'
import { fechaCorta } from '@/lib/admin/formato'
import type { InteresVista } from '@/lib/portal/pantallas'

/**
 * «Me interesan» — sobre lo que la persona ya hizo algo (3b-2).
 *
 * Aquí no hay adivinanzas: sólo lo que pidió **con su cuenta** —informes, una
 * visita— o las visitas que tiene agendadas. Abrir una ficha no cuenta: nadie
 * guarda quién la vio, y fingir que sí sería inventar (D-27.2, D-28.1).
 */

export type DatosInteresan = { interesan: InteresVista[] }

const QUE_DICE: Record<string, { texto: string; icono: typeof MessageSquare }> = {
  informacion: { texto: 'Pediste información', icono: MessageSquare },
  visita: { texto: 'Pediste una visita', icono: CalendarDays },
  cita: { texto: 'Visita agendada', icono: CalendarDays },
}

export default function InteresanPortal({ fijo }: { fijo?: DatosInteresan }) {
  const peticion = usePeticionPortal<DatosInteresan>('/api/portal/me-interesan', fijo)
  const { esGuardada, alternar } = useGuardadas()

  return (
    <Pantalla
      titulo="Me interesan"
      descripcion="Las propiedades por las que preguntaste o para las que pediste una visita."
      icono={Sparkles}
      acciones={<Button asChild variant="outline" className="shrink-0"><Link href="/propiedades"><Search aria-hidden /> Buscar más</Link></Button>}
    >
      <Estado
        peticion={peticion}
        esqueleto={<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3"><Esqueleto filas={3} alto="h-72" className="contents" /></div>}
        vacio={(d) => d.interesan.length === 0 && (
          <Vacio
            titulo="Todavía no has preguntado por ninguna propiedad"
            accion={<Button asChild className="mt-2"><Link href="/propiedades">Ver propiedades</Link></Button>}
          >
            Cuando pidas información o una visita desde una ficha, esa propiedad aparecerá aquí con lo que pediste.
          </Vacio>
        )}
      >
        {(d) => (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {d.interesan.map((p) => (
              <li key={p.id} className="flex flex-col">
                <TarjetaPropiedad
                  p={p}
                  guardada={esGuardada(p.id)}
                  onAlternar={alternar}
                  className={p.disponible ? undefined : 'border-dashed'}
                />
                <ul className="mt-1.5 space-y-0.5 px-1">
                  {p.interacciones.slice(0, 3).map((i, n) => {
                    const q = QUE_DICE[i.que] ?? QUE_DICE.informacion
                    const Icono = q.icono
                    return (
                      <li key={n} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icono className="size-3 shrink-0" aria-hidden />
                        {q.texto} · {fechaCorta(i.cuando)}
                      </li>
                    )
                  })}
                  {!p.disponible && (
                    <li className="text-xs font-medium text-[var(--aviso-fuerte)]">Ya no está disponible</li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Estado>
    </Pantalla>
  )
}
