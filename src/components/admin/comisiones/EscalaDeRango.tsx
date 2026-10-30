import { posicionEnEscala, type PosicionEnEscala } from '@/lib/comision-formulario'

/**
 * Regleta de lo pactado frente a lo habitual (26-oct-2026): una barra con la franja «habitual» sombreada, una marca para la regla de VIVE BIEN y un punto para lo
 * escrito. Es solo apoyo visual (aria-hidden): la misma información va en el texto de abajo, que es lo que lee un lector de pantalla.
 */
const TEXTO: Record<PosicionEnEscala, string> = { debajo: 'por debajo de lo habitual', habitual: 'dentro de lo habitual', encima: 'por encima de lo habitual' }

export default function EscalaDeRango({ valor, escala, formato }: {
  valor: number | null
  escala: { min: number; max: number; habitualDesde: number; habitualHasta: number; regla: number }
  formato: (n: number) => string
}) {
  const pos = (n: number) => `${Math.min(100, Math.max(0, ((n - escala.min) / (escala.max - escala.min)) * 100))}%`
  const posicion = valor === null ? null : posicionEnEscala(valor, escala)
  return (
    <div data-escala>
      <div aria-hidden className="relative mt-3 h-2 w-full max-w-sm rounded-full bg-muted">
        <span className="absolute inset-y-0 rounded-full bg-foreground/20" style={{ left: pos(escala.habitualDesde), width: `calc(${pos(escala.habitualHasta)} - ${pos(escala.habitualDesde)})` }} />
        <span className="absolute -top-1 h-4 w-px bg-foreground/50" style={{ left: pos(escala.regla) }} />
        {valor !== null && <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow" style={{ left: pos(valor) }} />}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite" data-escala-texto>
        {posicion === null ? 'Escribe un valor para compararlo.' : `${formato(valor as number)}: ${TEXTO[posicion]} (${formato(escala.habitualDesde)} a ${formato(escala.habitualHasta)}).`}
      </p>
    </div>
  )
}
