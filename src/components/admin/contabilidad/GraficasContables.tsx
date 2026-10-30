'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FilaCategoria, FilaCuenta, FilaPropiedad, GastoHormiga, PuntoDelMes, Recomendacion } from '@/lib/contabilidad'
import { pesos } from '@/components/admin/comisiones/GraficasComisiones'

/**
 * Gráficas y listas de la contabilidad (25-oct-2026). Sobrias, a propósito: verde = entra, rojo de marca = sale. Cada cifra va también en texto
 * (leyenda, lista o tabla): ninguna cantidad vive solo en el color. Todo el dinero llega en centavos y se convierte a pesos solo para mostrarlo.
 */

export const mxn = (centavos: number) => (centavos / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const compacto = (centavos: number) => {
  const p = centavos / 100
  if (Math.abs(p) >= 1_000_000) return `$${(p / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M`
  if (Math.abs(p) >= 1_000) return `$${Math.round(p / 1_000).toLocaleString('es-MX')} mil`
  return `$${Math.round(p).toLocaleString('es-MX')}`
}
const TICK = { fill: 'var(--panel-tenue, #6b7280)', fontSize: 11 }
export const C_ENTRA = 'var(--serie-4, #1baf7a)'
export const C_SALE = 'var(--serie-1)'

/** Lo que entra y lo que sale cada mes, lado a lado, con el neto en la tabla. */
export function FlujoMensual({ serie }: { serie: PuntoDelMes[] }) {
  const hay = serie.some((p) => p.entra > 0 || p.sale > 0)
  if (!hay) return <p className="text-sm text-muted-foreground">Cuando haya comisiones cobradas o gastos registrados, aquí verás mes a mes lo que entra y lo que sale.</p>
  const datos = serie.map((p) => ({ mes: p.etiqueta, Entra: p.entra / 100, Sale: p.sale / 100 }))
  const cifras = serie.filter((p) => p.entra > 0 || p.sale > 0)
  return (
    <div data-flujo-mensual>
      <div role="img" aria-label={`Lo que entra y lo que sale cada mes. ${cifras.map((p) => `${p.etiqueta}: entra ${pesos(p.entra)}, sale ${pesos(p.sale)}`).join('; ')}`} style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--grafica-rejilla)" />
            <XAxis dataKey="mes" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => compacto(Number(v) * 100)} />
            <Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(v, n) => [mxn(Number(v) * 100), String(n)]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Entra" fill={C_ENTRA} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Sale" fill={C_SALE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Ver las cifras de cada mes</summary>
        <table className="mt-2 w-full max-w-lg text-left">
          <caption className="sr-only">Entra, sale y queda por mes</caption>
          <thead><tr><th scope="col" className="pr-3 font-semibold">Mes</th><th scope="col" className="pr-3 text-right font-semibold">Entra</th><th scope="col" className="pr-3 text-right font-semibold">Sale</th><th scope="col" className="text-right font-semibold">Queda</th></tr></thead>
          <tbody>{cifras.map((p) => (
            <tr key={p.mes}><th scope="row" className="pr-3 font-normal">{p.etiqueta}</th><td className="pr-3 text-right tabular-nums">{mxn(p.entra)}</td><td className="pr-3 text-right tabular-nums">{mxn(p.sale)}</td><td className="text-right tabular-nums">{mxn(p.neto)}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  )
}

/** En qué se va el dinero: una barra por categoría, de mayor a menor, con su parte y el acumulado (Pareto). */
export function GastoPorCategoria({ filas }: { filas: FilaCategoria[] }) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">Todavía no hay gastos en este periodo.</p>
  const maximo = Math.max(...filas.map((f) => Math.max(f.neto, 0)), 1)
  const ochenta = filas.findIndex((f) => f.acumulada >= 80)
  return (
    <div data-gasto-categoria>
      <ul className="space-y-3">
        {filas.map((f) => (
          <li key={f.categoria} data-categoria={f.categoria}>
            <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate">{f.etiqueta}</span><span className="shrink-0 tabular-nums"><strong>{mxn(f.neto)}</strong> <span className="text-xs text-muted-foreground">{f.parte} %</span></span></div>
            <div aria-hidden className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(Math.max(f.neto, 0) / maximo) * 100}%`, background: C_SALE }} /></div>
            {f.devuelto > 0 && <p className="mt-0.5 text-xs text-muted-foreground">Ya descontados {mxn(f.devuelto)} de devoluciones.</p>}
          </li>
        ))}
      </ul>
      {ochenta >= 0 && filas.length > 2 && <p className="mt-3 text-xs text-muted-foreground">{ochenta + 1} {ochenta === 0 ? 'categoría explica' : 'categorías explican'} el {Math.round(filas[ochenta].acumulada)} % del gasto: ahí está el ahorro más fácil.</p>}
    </div>
  )
}

/** Recomendaciones con su cifra, y debajo los gastos hormiga y las propiedades, en listas cortas. */
export function ParaOptimizar({ recomendaciones, hormiga, propiedades }: { recomendaciones: Recomendacion[]; hormiga: GastoHormiga[]; propiedades: FilaPropiedad[] }) {
  const deja = propiedades.filter((p) => p.situacion !== 'sin_cierre').slice(0, 3)
  const sinCierre = propiedades.filter((p) => p.situacion === 'sin_cierre' && p.gastosLigados > 0).sort((a, b) => b.gastosLigados - a.gastosLigados).slice(0, 3)
  return (
    <div className="space-y-5" data-optimizar>
      {recomendaciones.length === 0
        ? <p className="text-sm text-muted-foreground">Sin alertas: con lo registrado, nada pide atención. Conforme haya más movimientos, aquí aparecerán los gastos que conviene revisar.</p>
        : (
          <ul className="space-y-2">
            {recomendaciones.map((r) => (
              <li key={r.id} data-recomendacion={r.id} className={`rounded-lg border p-3 text-sm ${r.nivel === 'atencion' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'bg-muted/40'}`}>
                <p className="font-semibold">{r.titulo}</p>
                <p className="mt-0.5 text-xs">{r.detalle}</p>
              </li>
            ))}
          </ul>
        )}
      <div className="grid gap-5 md:grid-cols-2">
        <section aria-labelledby="hormiga">
          <h3 id="hormiga" className="font-heading text-sm font-semibold">Gastos hormiga</h3>
          <p className="text-xs text-muted-foreground">Cargos pequeños que se repiten (3 o más en 90 días).</p>
          {hormiga.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No hay ninguno.</p> : (
            <ul className="mt-2 divide-y text-sm">
              {hormiga.slice(0, 5).map((h) => (
                <li key={h.clave} className="flex items-baseline justify-between gap-3 py-1.5" data-hormiga><span className="min-w-0 truncate">{h.nombre} <span className="text-xs text-muted-foreground">· {h.n} cargos{h.cadaDias ? `, cada ${h.cadaDias} d` : ''}</span></span><span className="shrink-0 tabular-nums"><strong>{mxn(h.anualProyectado)}</strong> <span className="text-xs text-muted-foreground">al año</span></span></li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="props">
          <h3 id="props" className="font-heading text-sm font-semibold">Propiedades</h3>
          <p className="text-xs text-muted-foreground">Lo que deja cada una, ya con colaborador y gastos.</p>
          {deja.length === 0 && sinCierre.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aún no hay cierres.</p> : (
            <ul className="mt-2 divide-y text-sm">
              {deja.map((p) => <li key={p.propiedadId} className="flex items-baseline justify-between gap-3 py-1.5" data-propiedad-deja><span className="min-w-0 truncate">{p.etiqueta}</span><span className={`shrink-0 tabular-nums ${p.neto < 0 ? 'text-destructive' : ''}`}><strong>{mxn(p.neto)}</strong></span></li>)}
              {sinCierre.map((p) => <li key={p.propiedadId} className="flex items-baseline justify-between gap-3 py-1.5" data-propiedad-sin-cierre><span className="min-w-0 truncate">{p.etiqueta} <span className="text-xs text-muted-foreground">· gasto sin cierre</span></span><span className="shrink-0 tabular-nums text-destructive"><strong>−{mxn(p.gastosLigados)}</strong></span></li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/** Cuánto se ha gastado en cada lugar (neto de devoluciones). */
export function GastoPorCuenta({ filas }: { filas: FilaCuenta[] }) {
  const con = filas.filter((f) => f.n > 0 || f.neto > 0)
  if (!con.length) return <p className="text-sm text-muted-foreground">Ninguna cuenta tiene gastos en este periodo.</p>
  const maximo = Math.max(...con.map((f) => f.neto), 1)
  return (
    <ul className="space-y-3" data-gasto-cuenta>
      {con.slice(0, 6).map((f) => (
        <li key={f.cuentaId}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate">{f.nombre}{f.identificador ? <span className="text-xs text-muted-foreground"> · {f.identificador}</span> : null}</span><strong className="shrink-0 tabular-nums">{mxn(f.neto)}</strong></div>
          <div aria-hidden className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(f.neto / maximo) * 100}%`, background: C_SALE }} /></div>
        </li>
      ))}
    </ul>
  )
}
