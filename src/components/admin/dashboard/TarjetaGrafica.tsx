import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Contenedor de cada gráfica del tablero: icono, título, subtítulo y, debajo,
 * la tabla con los mismos números.
 *
 * La tabla no es un extra: es la forma de leer los valores sin depender del
 * color ni de pasar el ratón por encima.
 */
export default function TarjetaGrafica({
  icono: Icono,
  titulo,
  subtitulo,
  children,
  tabla,
  className,
  extra,
}: {
  icono: LucideIcon
  titulo: string
  subtitulo?: string
  children: React.ReactNode
  tabla?: React.ReactNode
  className?: string
  extra?: React.ReactNode
}) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)] sm:p-6', className)}>
      <header className="mb-5 flex items-start gap-3">
        <Icono className="mt-0.5 size-6 shrink-0 text-[var(--marca)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-[1.02rem] font-semibold text-foreground">{titulo}</h2>
          {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
        </div>
        {extra}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
      {tabla && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">Ver los datos en tabla</summary>
          <div className="mt-2 overflow-x-auto">{tabla}</div>
        </details>
      )}
    </section>
  )
}

export function TablaSimple({ columnas, filas }: { columnas: string[]; filas: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-sm tabular-nums">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          {columnas.map((c) => <th key={c} scope="col" className="py-1.5 pr-4 font-medium">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b last:border-0">
            {f.map((v, j) => <td key={j} className="py-1.5 pr-4">{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="flex min-h-40 items-center justify-center rounded-lg bg-muted/60 px-6 text-center text-sm text-muted-foreground">{children}</p>
}
