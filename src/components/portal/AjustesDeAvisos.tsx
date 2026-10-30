'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import PreferenciasDeAvisos from '@/components/portal/PreferenciasDeAvisos'

/**
 * Engranaje pequeño en la esquina de las pantallas del portal (30-oct-2026): abre «Cómo quiero que me avisen». Los avisos por correo vienen ACTIVADOS por omisión
 * (decisión del dueño) y aquí se apagan; cada correo trae además su enlace de baja con un clic. El panel solo se monta al abrirlo (no pide nada hasta entonces).
 * Teclado: el botón es nativo (Enter y Espacio), Escape lo cierra y devuelve el foco al engranaje; `aria-expanded` dice su estado.
 */
export default function AjustesDeAvisos() {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  const raiz = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus() } }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  return (
    <div ref={raiz} className="absolute right-3 top-2 z-[9100] sm:right-5" data-ajustes-avisos>
      <button
        ref={boton}
        type="button"
        aria-label="Ajustes de avisos por correo"
        aria-expanded={abierto}
        aria-controls={`${id}-panel`}
        onClick={() => setAbierto((a) => !a)}
        className="flex size-7 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Settings className="size-3.5" aria-hidden />
      </button>
      {abierto && (
        <div id={`${id}-panel`} role="dialog" aria-label="Cómo quiero que me avisen" className="absolute right-0 mt-2 max-h-[80vh] w-[min(92vw,26rem)] overflow-y-auto rounded-xl border bg-card shadow-lg">
          <PreferenciasDeAvisos />
        </div>
      )}
    </div>
  )
}
