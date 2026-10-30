'use client'

import { useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import PanelInterno from '@/components/publicador/PanelInterno'
import VerificacionAcreditacion from '@/components/publicador/VerificacionAcreditacion'

/**
 * «Notas/Comisión» al lado de «Editar» en cada fila de las listas de propiedades (admin y publicador, 24-oct-2026).
 *
 * Abre el mismo panel «Interno» (de quién es, comisión pactada, notas) en una hoja lateral, sin entrar al editor. El panel solo se monta
 * al abrir, así que la lista no hace una petición por fila. Quién puede ver o escribir qué lo decide el servidor, no este botón.
 */
export default function BotonNotasComision({ propiedadId, nombre, tamano = 'sm', esEquipo = false }: { propiedadId: string; nombre: string; tamano?: 'sm' | 'lg'; esEquipo?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button
        type="button" variant="outline" size="sm" data-notas-comision={propiedadId}
        className={tamano === 'lg' ? 'h-9' : 'h-8'}
        aria-label={`Notas y comisión de ${nombre}`}
        onClick={() => setAbierto(true)}
      >
        <NotebookPen aria-hidden /> Notas/Comisión
      </Button>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-heading pr-8">Notas y comisión</SheetTitle>
            <SheetDescription>{nombre}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {abierto && <PanelInterno propiedadId={propiedadId} />}
            {/* Solo el equipo revisa acreditaciones: al publicador ni siquiera se le consulta. */}
            {abierto && esEquipo && <VerificacionAcreditacion propiedadId={propiedadId} />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
