'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import NuevaPropiedadEnLinea from './NuevaPropiedadEnLinea'
import { EVENTO_NUEVA_PROPIEDAD, consumirNuevaPendiente } from '@/lib/publicador/espacio'

/**
 * La ventana de «Nueva propiedad» (R8.5). Va montada UNA vez en el marco de cada rol (portal y administración) y se abre con
 * `abrirNuevaPropiedad()` desde la barra lateral o desde el encabezado de la lista: la ruta, la barra y el contexto no cambian.
 */
export default function DialogoNuevaPropiedad() {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    const abrir = () => { consumirNuevaPendiente(); setAbierto(true) }
    if (consumirNuevaPendiente()) queueMicrotask(() => setAbierto(true))
    window.addEventListener(EVENTO_NUEVA_PROPIEDAD, abrir)
    return () => window.removeEventListener(EVENTO_NUEVA_PROPIEDAD, abrir)
  }, [])
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent className="sm:max-w-lg data-[state=closed]:!animate-none">
        <DialogHeader>
          <DialogTitle>Nueva propiedad</DialogTitle>
          <DialogDescription className="sr-only">Escribe el título para crear el borrador.</DialogDescription>
        </DialogHeader>
        <NuevaPropiedadEnLinea sinMarco onCerrar={() => setAbierto(false)} />
      </DialogContent>
    </Dialog>
  )
}
