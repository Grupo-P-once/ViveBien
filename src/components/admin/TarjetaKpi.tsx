import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Variacion } from '@/lib/admin/periodo'
import { cn } from '@/lib/utils'

/**
 * Tarjeta de indicador: etiqueta, valor, variación contra el período anterior y
 * una línea pequeña.
 *
 * La línea tiene dos trazos en la misma escala: **rojo, este período; gris, el
 * anterior**, tramo a tramo. Así la subida o bajada que dice el porcentaje se
 * ve, en vez de adornar la tarjeta con una curva que no se puede leer. La
 * leyenda de los dos trazos va una sola vez sobre la fila de tarjetas.
 *
 * El color de la variación depende de si subir es bueno para ese indicador, y
 * nunca va solo: lleva flecha y signo.
 */

export type LineaKpi = { anterior: (number | null)[]; actual: (number | null)[] } | null

function Linea({ linea, etiqueta }: { linea: NonNullable<LineaKpi>; etiqueta: string }) {
  const valores = [...linea.anterior, ...linea.actual].filter((v): v is number => v !== null)
  if (valores.length === 0) return null
  const max = Math.max(...valores, 1)
  const ancho = 96
  const alto = 34
  const n = Math.max(linea.actual.length, linea.anterior.length)
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * (ancho - 4) + 2)
  const y = (v: number) => alto - 3 - (v / max) * (alto - 8)

  const trazo = (serie: (number | null)[]) => {
    let d = ''
    let abierto = false
    serie.forEach((v, i) => {
      if (v === null) { abierto = false; return }
      d += `${abierto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      abierto = true
    })
    return d.trim()
  }

  const actual = trazo(linea.actual)
  const indices = linea.actual.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0)
  const area = indices.length > 1
    ? `${actual} L${x(indices[indices.length - 1]).toFixed(1)},${alto} L${x(indices[0]).toFixed(1)},${alto} Z`
    : ''

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-[34px] w-[96px] shrink-0" role="img" aria-label={etiqueta}>
      <path d={trazo(linea.anterior)} fill="none" stroke="var(--grafica-anterior)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {area && <path d={area} fill="var(--marca)" opacity={0.1} />}
      <path d={actual} fill="none" stroke="var(--marca)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Cambio({ variacion, subirEsBueno = true, nota }: { variacion: Variacion | null; subirEsBueno?: boolean; nota: string }) {
  if (!variacion) return <p className="text-xs text-muted-foreground">{nota}</p>

  if (variacion.tipo === 'sin-comparacion') {
    return (
      <p className="text-xs text-muted-foreground">
        {variacion.motivo === 'sin-historial' ? 'Sin datos del período anterior' : 'Sin registros en el período anterior'}
      </p>
    )
  }

  const v = variacion.valor
  const sube = v > 0
  const plano = v === 0
  const bueno = plano ? null : sube === subirEsBueno
  const Icono = plano ? Minus : sube ? ArrowUp : ArrowDown
  const texto = variacion.tipo === 'puntos'
    ? `${sube ? '+' : ''}${v.toLocaleString('es-MX')} ${Math.abs(v) === 1 ? 'punto' : 'puntos'}`
    : `${sube ? '+' : ''}${v}%`

  return (
    <div>
      <p
        className={cn(
          'flex items-center gap-1 text-sm font-semibold',
          bueno === null && 'text-muted-foreground',
          bueno === true && 'text-[var(--estado-bien)]',
          bueno === false && 'text-[var(--estado-mal)]',
        )}
      >
        <Icono className="size-4" aria-hidden />
        {texto}
      </p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  )
}

export default function TarjetaKpi({
  icono: Icono,
  titulo,
  valor,
  variacion,
  nota,
  linea,
  subirEsBueno = true,
  className,
}: {
  icono: LucideIcon
  titulo: string
  valor: string
  variacion: Variacion | null
  nota: string
  linea?: LineaKpi
  subirEsBueno?: boolean
  className?: string
}) {
  return (
    // Tres renglones, como en la referencia: título; número con su línea al
    // lado; variación debajo. Así el título no se recorta y la línea no se
    // come el texto en una tarjeta estrecha.
    <div className={cn('@container min-w-0 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)]', className)}>
      <div className="flex gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--marca-tinte)] text-[var(--marca)]">
          <Icono className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-muted-foreground">{titulo}</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="font-heading text-[1.9rem] leading-none font-bold whitespace-nowrap text-foreground">{valor}</p>
            {linea && (
              <div className="hidden shrink-0 @[13rem]:block">
                <Linea linea={linea} etiqueta={`${titulo}: evolución en el período (rojo) frente al período anterior (gris)`} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Cambio variacion={variacion} subirEsBueno={subirEsBueno} nota={nota} />
      </div>
    </div>
  )
}
