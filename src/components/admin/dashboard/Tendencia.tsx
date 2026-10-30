'use client'

import { TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PuntoTendencia } from '@/lib/admin/resumen'
import { entero } from '@/lib/admin/formato'
import TarjetaGrafica, { TablaSimple, Vacio } from './TarjetaGrafica'

/**
 * Tráfico y leads.
 *
 * La referencia pone las dos series en una sola gráfica con dos ejes. Con dos
 * escalas, dónde se cruzan las líneas depende de cómo se elijan los ejes, no de
 * los datos: parece que los leads «siguen» a las visitas aunque no sea así. Aquí
 * son dos gráficas alineadas sobre el mismo eje de fechas, cada una con su
 * escala, y el cursor recorre las dos a la vez.
 */

const TICK = { fill: 'var(--panel-tenue)', fontSize: 11 }

function Tip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string; payload: PuntoTendencia }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2"><span className="h-0.5 w-3 bg-[var(--serie-1)]" aria-hidden /><strong className="tabular-nums">{entero(p.vistas)}</strong> vistas</p>
      <p className="flex items-center gap-2"><span className="h-0.5 w-3 bg-[var(--serie-2)]" aria-hidden /><strong className="tabular-nums">{entero(p.leads)}</strong> leads</p>
    </div>
  )
}

function Mini({
  datos, clave, color, titulo, conEje,
}: { datos: PuntoTendencia[]; clave: 'vistas' | 'leads'; color: string; titulo: string; conEje: boolean }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="h-0.5 w-4 rounded" style={{ background: color }} aria-hidden />
        {titulo}
      </p>
      <div className={conEje ? 'h-[132px]' : 'h-[108px]'}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} syncId="tendencia-panel" margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--grafica-rejilla)" />
            <XAxis dataKey="etiqueta" hide={!conEje} tick={TICK} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={42} />
            <Tooltip content={<Tip />} cursor={{ stroke: 'var(--grafica-eje)', strokeWidth: 1 }} />
            <Area
              type="linear"
              dataKey={clave}
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function Tendencia({ datos, agrupacion }: { datos: PuntoTendencia[]; agrupacion: 'dia' | 'semana' | 'mes' }) {
  const hayDatos = datos.some((d) => d.vistas > 0 || d.leads > 0)
  const porQue = agrupacion === 'dia' ? 'por día' : agrupacion === 'semana' ? 'por semana' : 'por mes'

  return (
    <TarjetaGrafica
      icono={TrendingUp}
      titulo="Tráfico y leads"
      subtitulo={`Vistas de propiedades y leads, ${porQue}`}
      tabla={
        <TablaSimple
          columnas={[agrupacion === 'mes' ? 'Mes' : agrupacion === 'semana' ? 'Semana del' : 'Día', 'Vistas', 'Leads']}
          filas={datos.map((d) => [d.etiqueta, entero(d.vistas), entero(d.leads)])}
        />
      }
    >
      {!hayDatos ? (
        <Vacio>Todavía no hay vistas ni leads en este período.</Vacio>
      ) : (
        <div className="space-y-3">
          <Mini datos={datos} clave="vistas" color="var(--serie-1)" titulo="Vistas de propiedades" conEje={false} />
          <Mini datos={datos} clave="leads" color="var(--serie-2)" titulo="Leads" conEje />
        </div>
      )}
    </TarjetaGrafica>
  )
}
