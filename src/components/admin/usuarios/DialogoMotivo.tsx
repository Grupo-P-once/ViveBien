'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** Intentos pendientes de devolver el foco (uno solo a la vez). */
let cancelarRestauro: (() => void) | null = null

/** Mismo mínimo que exige la API y la función de la base (migración 31). */
export const MINIMO_MOTIVO = 10

/**
 * Pide el «porqué» de un cambio sensible (dar o quitar el nivel de admin). Reemplaza
 * a `window.prompt`: se puede usar con teclado y lector de pantalla, dice cuánto
 * falta y no deja confirmar un motivo corto. Queda en la bitácora tal cual se escribe.
 */
export default function DialogoMotivo({ titulo, descripcion, confirmar = 'Confirmar', devolverFoco, alConfirmar, alCerrar }: {
  titulo: string
  descripcion: string
  confirmar?: string
  /** Control que abrió el diálogo: al cerrarse (Escape, Cancelar o guardar) el foco vuelve ahí. Si no se da, el elemento activo al abrir. */
  devolverFoco?: HTMLElement | null
  alConfirmar: (motivo: string) => Promise<void> | void
  alCerrar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  // Al abrirse desde un selector de rol, Radix Select le devuelve el foco a su selector justo después de cerrarse y, en
  // pantallas anchas, lo hace DESPUÉS de que el diálogo ya tomó el foco: la persona escribiría «en el vacío». Si el foco
  // quedó fuera del diálogo, se reclama para el motivo. Nunca se mueve si ya está dentro.
  useEffect(() => {
    const reclamar = () => {
      const campo = area.current
      const dialogo = campo?.closest('[role="dialog"]')
      if (campo && dialogo && !dialogo.contains(document.activeElement)) campo.focus()
    }
    const t1 = window.setTimeout(reclamar, 50)
    const t2 = window.setTimeout(reclamar, 250)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [])
  // El elemento con foco al abrirse (o el que indique quien lo abre). Se guarda también su etiqueta: si la pantalla se
  // vuelve a pintar y ese nodo se sustituye, se busca el equivalente visible.
  const origen = useRef<{ el: HTMLElement | null; etiqueta: string | null } | null>(null)
  if (origen.current === null) {
    const el = devolverFoco ?? (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null)
    origen.current = { el, etiqueta: el?.getAttribute?.('aria-label') ?? null }
  }
  function restaurarFoco() {
    const { el, etiqueta } = origen.current ?? { el: null, etiqueta: null }
    // Visible de verdad (no solo conectado): en pantallas anchas la tabla y las tarjetas conviven y una de las dos está oculta.
    const visible = (n: HTMLElement) => n.isConnected && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'
    const buscar = () => {
      if (el && visible(el)) return el
      if (!etiqueta) return null
      return Array.from(document.querySelectorAll<HTMLElement>('[aria-label]')).find((n) => n.getAttribute('aria-label') === etiqueta && visible(n)) ?? null
    }
    // Tras el cierre y la recarga de la lista el nodo puede sustituirse, así que se reintenta; pero NUNCA se le quita el foco a
    // algo que la persona enfocó después (solo se actúa si el foco quedó en <body>), y cualquier clic o tecla cancela lo pendiente.
    cancelarRestauro?.()
    const temporizadores: number[] = []
    let cuadro = 0
    const intentar = () => { if (document.activeElement === document.body || document.activeElement === null) buscar()?.focus() }
    const parar = () => {
      cancelAnimationFrame(cuadro)
      temporizadores.forEach((t) => window.clearTimeout(t))
      window.removeEventListener('pointerdown', parar, true)
      window.removeEventListener('keydown', parar, true)
      if (cancelarRestauro === parar) cancelarRestauro = null
    }
    cancelarRestauro = parar
    window.addEventListener('pointerdown', parar, true)
    window.addEventListener('keydown', parar, true)
    cuadro = requestAnimationFrame(() => { cuadro = requestAnimationFrame(intentar) })
    temporizadores.push(window.setTimeout(intentar, 250), window.setTimeout(() => { intentar(); parar() }, 800))
  }

  const limpio = texto.trim()
  const falta = MINIMO_MOTIVO - limpio.length

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (falta > 0 || enviando) return
    setEnviando(true)
    try { await alConfirmar(limpio) } finally { setEnviando(false) }
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enviando) alCerrar() }}>
      <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); restaurarFoco() }}>
        <form onSubmit={enviar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="motivo-cambio">Motivo (queda en la bitácora)</Label>
            <Textarea ref={area} id="motivo-cambio" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} autoFocus aria-describedby="motivo-ayuda" />
            <p id="motivo-ayuda" className="text-xs text-muted-foreground" aria-live="polite">
              {falta > 0 ? `Escribe al menos ${MINIMO_MOTIVO} caracteres (faltan ${falta}).` : 'Listo para confirmar.'}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={enviando}>Cancelar</Button>
            <Button type="submit" disabled={falta > 0 || enviando}>
              {enviando && <Loader2 className="size-4 animate-spin" aria-hidden />}{confirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
