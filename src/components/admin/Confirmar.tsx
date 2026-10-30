'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

/**
 * Confirmación de una acción que cuesta deshacer (archivar, borrar).
 *
 * En vez del `confirm()` del navegador: ése no dice qué propiedad, no se puede
 * leer con calma y en el teléfono sale fuera de contexto.
 */
export default function Confirmar({
  abierto,
  titulo,
  descripcion,
  confirmar,
  peligrosa,
  trabajando,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean
  titulo: string
  descripcion: React.ReactNode
  confirmar: string
  peligrosa?: boolean
  trabajando?: boolean
  onConfirmar: () => void
  onCerrar: () => void
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => { if (!a) onCerrar() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{titulo}</DialogTitle>
          <DialogDescription asChild><div className="text-sm text-muted-foreground">{descripcion}</div></DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={trabajando}>Cancelar</Button>
          <Button
            onClick={onConfirmar}
            disabled={trabajando}
            className={peligrosa ? 'bg-[var(--estado-mal)] hover:bg-[var(--estado-mal)]/90' : undefined}
          >
            {trabajando && <Loader2 className="animate-spin" aria-hidden />}
            {confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
