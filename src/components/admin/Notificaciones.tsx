'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, ClipboardCheck, Inbox, MailCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { haceCuanto } from '@/lib/admin/formato'
import type { Notificacion, TipoNotificacion } from '@/lib/admin/notificaciones'
import { useSesion } from './sesion'

/**
 * La campana del panel.
 *
 * Se consulta al entrar y cada minuto **sólo si la pestaña está a la vista**:
 * un panel olvidado en otra pestaña no debe consultar la base toda la noche.
 *
 * Abrirla marca todo como leído en el servidor, pero lo nuevo sigue resaltado
 * mientras está abierta: si se apagara al instante, no se vería qué era nuevo.
 */

const ICONO: Record<TipoNotificacion, typeof Bell> = {
  revision: ClipboardCheck,
  registro: Inbox,
  cuenta: UserPlus,
  invitacion: MailCheck,
}

const CADA_MS = 60_000

export default function Notificaciones() {
  const { pedir } = useSesion()
  const [items, setItems] = useState<Notificacion[]>([])
  const [sinLeer, setSinLeer] = useState(0)
  const [abierta, setAbierta] = useState(false)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let vivo = true
    const cargar = () => {
      pedir<{ items: Notificacion[]; sinLeer: number }>('/api/admin/notificaciones')
        .then((r) => { if (vivo) { setItems(r.items); setSinLeer(r.sinLeer); setFallo(false) } })
        .catch(() => { if (vivo) setFallo(true) })
    }
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, CADA_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [pedir])

  function alCambiar(abrir: boolean) {
    setAbierta(abrir)
    if (abrir && sinLeer > 0) {
      setSinLeer(0)
      pedir('/api/admin/notificaciones', { method: 'POST' }).catch(() => { /* se reintenta al próximo abrir */ })
    }
    if (!abrir) setItems((xs) => xs.map((x) => ({ ...x, nueva: false })))
  }

  const etiqueta = sinLeer > 0 ? `Notificaciones: ${sinLeer} sin leer` : 'Notificaciones'

  return (
    <Popover open={abierta} onOpenChange={alCambiar}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative rounded-full text-foreground" aria-label={etiqueta}>
          <Bell className="size-5" aria-hidden />
          {sinLeer > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--marca)] px-1 text-[0.65rem] font-bold text-white ring-2 ring-white">
              {sinLeer > 9 ? '9+' : sinLeer}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-heading text-sm font-semibold">Notificaciones</p>
          {fallo && <span className="text-xs text-[var(--estado-mal)]">No se pudieron actualizar</span>}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay avisos en los últimos 30 días.</p>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {items.map((n) => {
              const Icono = ICONO[n.tipo]
              return (
                <li key={n.id}>
                  <Link
                    href={n.enlace}
                    onClick={() => alCambiar(false)}
                    className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--marca-tinte)] text-[var(--marca)]">
                      <Icono className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className="line-clamp-2 text-sm font-medium">{n.titulo}</span>
                        {n.nueva && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--marca)]" aria-label="nueva" />}
                      </span>
                      {n.detalle && <span className="block truncate text-xs text-muted-foreground">{n.detalle}</span>}
                      <span className="block text-xs text-muted-foreground">{haceCuanto(n.fecha)}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        <div className="border-t px-4 py-2.5 text-right">
          <Link href="/admin/actividad" onClick={() => alCambiar(false)} className="text-sm font-medium text-[var(--marca)] hover:underline">
            Ver toda la actividad
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
