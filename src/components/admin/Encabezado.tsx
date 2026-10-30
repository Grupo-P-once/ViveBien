import { cn } from '@/lib/utils'

/**
 * Cabecera de cada pantalla del panel: etiqueta en versales, título,
 * descripción, la frase de marca y los botones de la pantalla.
 */
export default function Encabezado({
  versal,
  titulo,
  descripcion,
  frase,
  acciones,
  className,
}: {
  versal: string
  titulo: React.ReactNode
  descripcion?: string
  frase?: string
  acciones?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between', className)}>
      <div className="min-w-0">
        <p className="versal text-muted-foreground">{versal}</p>
        <h1 className="mt-2 font-heading text-[1.7rem] leading-tight font-bold tracking-tight text-foreground sm:text-[2rem]">
          {titulo}
        </h1>
        {descripcion && <p className="mt-1.5 text-[0.95rem] text-muted-foreground">{descripcion}</p>}
      </div>
      {(frase || acciones) && (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4 lg:shrink-0">
          {frase && (
            <p className="frase-marca hidden max-w-[11rem] text-[1.2rem] leading-snug text-[var(--panel-tinta-2)] xl:block">
              {frase}
              <span aria-hidden className="mt-2 block h-0.5 w-9 bg-[var(--marca)]" />
            </p>
          )}
          {acciones && <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-stretch">{acciones}</div>}
        </div>
      )}
    </div>
  )
}
