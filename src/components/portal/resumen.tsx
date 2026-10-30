'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/admin/sesion'
import type { ResumenPortal } from '@/lib/portal/resumen'

/**
 * El resumen del portal, pedido una vez y compartido: lo usan el Inicio, la
 * campana de avisos y el contador de «Mis alertas» del menú. Se vuelve a pedir
 * al volver a la pestaña y cuando algo cambia (agendar, cancelar…).
 */

type Estado = {
  resumen: ResumenPortal | null
  error: string
  recargar: () => void
}

const Contexto = createContext<Estado | null>(null)

/**
 * `fijo` (V-1.1.82): el resumen ya armado —datos de prueba de la vista previa
 * de desarrollo—. Con él no se pide nada.
 */
export function ProveedorResumen({ children, fijo }: { children: React.ReactNode; fijo?: ResumenPortal }) {
  const { pedir } = useSesion()
  const [resumen, setResumen] = useState<ResumenPortal | null>(fijo ?? null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const turno = useRef(0)

  const recargar = useCallback(() => setVuelta((n) => n + 1), [])

  useEffect(() => {
    if (fijo) return
    const mio = ++turno.current
    pedir<ResumenPortal>('/api/portal/resumen')
      .then((r) => { if (mio === turno.current) { setResumen(r); setError('') } })
      .catch((e) => { if (mio === turno.current) setError(e instanceof Error ? e.message : 'No se pudo cargar tu portal.') })
  }, [pedir, vuelta, fijo])

  useEffect(() => {
    if (fijo) return
    const alVolver = () => { if (document.visibilityState === 'visible') recargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [recargar, fijo])

  const valor = useMemo(() => ({ resumen, error, recargar }), [resumen, error, recargar])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useResumen(): Estado {
  const c = useContext(Contexto)
  if (!c) throw new Error('useResumen fuera del portal')
  return c
}
