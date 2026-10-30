'use client'

import { PieChart as IconoDona } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Porcion } from '@/lib/analitica'
import { colorTipo } from '@/lib/admin/panel-config'
import { entero } from '@/lib/admin/formato'
import TarjetaGrafica, { TablaSimple, Vacio } from './TarjetaGrafica'

/**
 * Qué hay publicado, por tipo.
 *
 * La referencia usa tonos de rojo para cada tipo: dos de ellos no se distinguen
 * ni con vista normal. Aquí el rojo de marca es el primer color y los demás
 * salen de la paleta validada; cada tipo conserva su color aunque cambie de
 * tamaño, y la leyenda con números acompaña siempre.
 */
export default function Distribucion({ porciones, total }: { porciones: Porcion[]; total: number }) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return (
    <TarjetaGrafica
      icono={IconoDona}
      titulo="Distribución de propiedades"
      subtitulo="Inventario publicado, por tipo de inmueble"
      tabla={<TablaSimple columnas={['Tipo', 'Propiedades', '%']} filas={porciones.map((p) => [p.etiqueta, entero(p.n), `${pct(p.n)} %`])} />}
    >
      {total === 0 ? (
        <Vacio>No hay propiedades publicadas.</Vacio>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
          <div className="relative size-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={porciones}
                  dataKey="n"
                  nameKey="etiqueta"
                  innerRadius="64%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {porciones.map((p) => <Cell key={p.clave} fill={colorTipo(p.clave)} />)}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload as Porcion
                    return (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                        <strong className="tabular-nums">{entero(p.n)}</strong> {p.etiqueta.toLowerCase()} · {pct(p.n)} %
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-heading text-3xl leading-none font-bold">{entero(total)}</span>
              <span className="mt-1 text-xs text-muted-foreground">{total === 1 ? 'publicada' : 'publicadas'}</span>
            </div>
          </div>
          <ul className="w-full space-y-3">
            {porciones.map((p) => (
              <li key={p.clave} className="grid grid-cols-[auto_minmax(0,1fr)_auto_2.75rem] items-center gap-2.5 text-sm">
                <span className="size-3 rounded-full" style={{ background: colorTipo(p.clave) }} aria-hidden />
                <span className="leading-snug">{p.etiqueta}</span>
                <span className="font-semibold tabular-nums">{entero(p.n)}</span>
                <span className="text-right text-muted-foreground tabular-nums">{pct(p.n)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TarjetaGrafica>
  )
}
