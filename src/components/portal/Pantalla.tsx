'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/components/admin/sesion'
import { cn } from '@/lib/utils'

/**
 * La forma que comparten todas las pantallas del portal (V-1.1.85, H-14).
 *
 * Una sola manera de esperar, de no tener nada y de fallar:
 *
 *   esqueleto  →  datos | vacío | error con «Reintentar»
 *
 * Así ninguna pantalla se inventa su propio «Cargando…», y ninguna se queda en
 * blanco cuando algo falla: siempre hay algo que leer y algo que hacer.
 */

type Peticion<T> = { datos: T | null; error: string; recargar: () => void; poner: (d: T) => void }

/**
 * Pide algo al portal una vez (y al pulsar «Reintentar»).
 *
 * `poner` sirve para guardar lo que **devuelve** el servidor tras una acción
 * —no lo que se pidió— y así la pantalla nunca enseña un estado que no está
 * guardado (D-32).
 */
export function usePeticionPortal<T>(url: string, fijo?: T): Peticion<T> {
  const { pedir } = useSesion()
  const [datos, setDatos] = useState<T | null>(fijo ?? null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const turno = useRef(0)

  const recargar = useCallback(() => setVuelta((n) => n + 1), [])

  useEffect(() => {
    if (fijo) return
    const mio = ++turno.current
    pedir<T>(url)
      .then((r) => { if (mio === turno.current) { setDatos(r); setError('') } })
      .catch((e) => { if (mio === turno.current) setError(e instanceof Error ? e.message : 'No se pudo cargar.') })
  }, [pedir, url, vuelta, fijo])

  return { datos, error, recargar, poner: setDatos }
}

export function Pantalla({ titulo, descripcion, icono: Icono, acciones, children }: {
  titulo: string
  descripcion?: string
  icono: LucideIcon
  acciones?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--marca-tinte)] text-[var(--marca)]">
          <Icono className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-[1.5rem] font-bold leading-tight">{titulo}</h1>
          {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones}
      </header>
      <div className="mt-6">{children}</div>
    </main>
  )
}

/** Esqueletos mientras llega la respuesta: el hueco tiene el tamaño de lo que viene. */
export function Esqueleto({ filas = 3, alto = 'h-28', className }: { filas?: number; alto?: string; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className={cn('animate-pulse rounded-xl bg-[var(--panel-fondo)]', alto)} />
      ))}
    </div>
  )
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
      <p className="font-heading text-lg font-semibold">{titulo}</p>
      {children && <p className="max-w-md text-sm text-muted-foreground">{children}</p>}
      {accion}
    </div>
  )
}

export function Fallo({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center">
      <p className="font-medium">No se pudo cargar esta pantalla.</p>
      <p className="text-sm text-muted-foreground">{mensaje}</p>
      <Button variant="outline" onClick={onReintentar}><RefreshCw aria-hidden /> Reintentar</Button>
    </div>
  )
}

/**
 * Los tres estados en un solo sitio. `vacio` decide qué es «no tener nada»
 * para cada pantalla (una lista de cero, por ejemplo).
 */
export function Estado<T>({ peticion, esqueleto, vacio, children }: {
  peticion: Peticion<T>
  esqueleto?: React.ReactNode
  vacio?: (datos: T) => React.ReactNode | null
  children: (datos: T) => React.ReactNode
}) {
  if (peticion.error) return <Fallo mensaje={peticion.error} onReintentar={peticion.recargar} />
  if (!peticion.datos) return <>{esqueleto ?? <Esqueleto />}</>
  const nada = vacio?.(peticion.datos)
  if (nada) return <>{nada}</>
  return <>{children(peticion.datos)}</>
}
