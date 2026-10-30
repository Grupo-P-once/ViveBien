'use client'

import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ResumenComisiones } from '@/lib/comision-resumen'

/**
 * Gráficas del tablero de comisiones (25-oct-2026). Todo el dinero llega en CENTAVOS ENTEROS y aquí se convierte a pesos solo para mostrarlo.
 * Cada gráfica trae su cifra en texto (leyenda, lista o etiqueta accesible): ninguna cantidad vive solo en el color. Colores: series validadas del
 * panel (`--serie-*`): venta = serie 1, renta = serie 2, y para el reparto, VIVE BIEN / agente liberable / agente retenida.
 */

export const pesos = (centavos: number) => (centavos / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const compacto = (centavos: number) => {
  const p = centavos / 100
  if (Math.abs(p) >= 1_000_000) return `$${(p / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M`
  if (Math.abs(p) >= 1_000) return `$${Math.round(p / 1_000).toLocaleString('es-MX')} mil`
  return `$${Math.round(p).toLocaleString('es-MX')}`
}
const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0)
const TICK = { fill: 'var(--panel-tenue, #6b7280)', fontSize: 11 }
export const C_VENTA = 'var(--serie-1)'
export const C_RENTA = 'var(--serie-2)'
const C_VB = 'var(--serie-1)'
const C_LIBERABLE = 'var(--serie-4, #1baf7a)'
const C_RETENIDA = 'var(--serie-3, #eda100)'

/** Comisión por mes, apilada: venta y renta. Los meses sin operaciones se dejan vacíos para que se vea el hueco. */
export function BarrasMensuales({ serie }: { serie: ResumenComisiones['serieMensual'] }) {
  const total = serie.reduce((s, p) => s + p.total, 0)
  if (total === 0) return <p className="text-sm text-muted-foreground">Cuando registres el cierre de una venta o de una renta, aquí verás cuánto dejó cada mes.</p>
  const datos = serie.map((p) => ({ mes: p.etiqueta, Venta: p.venta / 100, Renta: p.renta / 100 }))
  const resumen = serie.filter((p) => p.total > 0).map((p) => `${p.etiqueta}: ${pesos(p.total)}`).join('; ')
  return (
    <div>
      <div role="img" aria-label={`Comisión por mes, venta y renta. ${resumen}`} style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grafica-rejilla)" />
            <XAxis dataKey="mes" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => compacto(Number(v) * 100)} />
            <Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(v, n) => [pesos(Number(v) * 100), String(n)]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Venta" stackId="a" fill={C_VENTA} isAnimationActive={false} />
            <Bar dataKey="Renta" stackId="a" fill={C_RENTA} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Ver las cifras de cada mes</summary>
        <table className="mt-2 w-full max-w-md text-left">
          <caption className="sr-only">Comisión por mes</caption>
          <thead><tr><th scope="col" className="pr-3 font-semibold">Mes</th><th scope="col" className="pr-3 text-right font-semibold">Venta</th><th scope="col" className="pr-3 text-right font-semibold">Renta</th><th scope="col" className="text-right font-semibold">Total</th></tr></thead>
          <tbody>{serie.filter((p) => p.total > 0).map((p) => (
            <tr key={p.mes}><th scope="row" className="pr-3 font-normal">{p.etiqueta}</th><td className="pr-3 text-right tabular-nums">{pesos(p.venta)}</td><td className="pr-3 text-right tabular-nums">{pesos(p.renta)}</td><td className="text-right tabular-nums">{pesos(p.total)}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  )
}

/** Venta contra renta: anillo con las cifras al lado. */
export function DonaTipo({ porTipo }: { porTipo: ResumenComisiones['porTipo'] }) {
  const datos = porTipo.map((t) => ({ nombre: t.tipo === 'venta' ? 'Venta' : 'Renta', valor: t.total, n: t.n, color: t.tipo === 'venta' ? C_VENTA : C_RENTA }))
  const total = datos.reduce((s, d) => s + d.valor, 0)
  const con = datos.filter((d) => d.valor > 0)
  if (total === 0) return <p className="text-sm text-muted-foreground">Aún no hay comisiones para comparar ventas con rentas.</p>
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative size-[132px] shrink-0" role="img" aria-label={`Comisión por tipo: ${datos.map((d) => `${d.nombre} ${pesos(d.valor)} (${pct(d.valor, total)} %)`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={con} dataKey="valor" nameKey="nombre" innerRadius={42} outerRadius={62} paddingAngle={con.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {con.map((d) => <Cell key={d.nombre} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [pesos(Number(v)), String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-heading text-base leading-none font-bold tabular-nums">{compacto(total)}</span>
          <span className="text-[0.65rem] text-muted-foreground">comisión</span>
        </span>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {datos.map((d) => (
          <li key={d.nombre} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
            <span className="min-w-0 flex-1">{d.nombre} <span className="text-xs text-muted-foreground">({d.n} {d.n === 1 ? 'operación' : 'operaciones'})</span></span>
            <strong className="tabular-nums">{pesos(d.valor)}</strong>
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(d.valor, total)} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Cómo se reparte lo cerrado: lo de VIVE BIEN, lo del agente que ya se puede liberar y lo que sigue retenido. */
export function BarraReparto({ reparto }: { reparto: ResumenComisiones['reparto'] }) {
  const partes = [
    { clave: 'vb', texto: 'VIVE BIEN', valor: reparto.viveBien, color: C_VB, ayuda: 'Lo que se queda la empresa' },
    { clave: 'lib', texto: 'Agente: liberable', valor: reparto.agenteLiberable, color: C_LIBERABLE, ayuda: 'Ya cumple acreditación y atribución' },
    { clave: 'ret', texto: 'Agente: retenida', valor: reparto.agenteRetenido, color: C_RETENIDA, ayuda: 'Falta verificar su acreditación o la atribución' },
  ]
  const total = partes.reduce((s, p) => s + p.valor, 0)
  if (total === 0) return <p className="text-sm text-muted-foreground">Aquí verás cuánto se queda VIVE BIEN y cuánto corresponde a los agentes colaboradores.</p>
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Reparto: ${partes.map((p) => `${p.texto} ${pesos(p.valor)} (${pct(p.valor, total)} %)`).join(', ')}`}>
        {partes.filter((p) => p.valor > 0).map((p) => <div key={p.clave} style={{ width: `${(p.valor / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {partes.map((p) => (
          <li key={p.clave} data-reparto={p.clave} className="flex items-start gap-2">
            <span className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span className="min-w-0 flex-1"><span className="font-medium">{p.texto}</span><span className="block text-xs text-muted-foreground">{p.ayuda}</span></span>
            <strong className="tabular-nums">{pesos(p.valor)}</strong>
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(p.valor, total)} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ESTADO: Record<string, { texto: string; ayuda: string; color: string }> = {
  registrada: { texto: 'Por cobrar', ayuda: 'Cerrada, falta confirmar que se cobró', color: C_RETENIDA },
  confirmada: { texto: 'Cobrada', ayuda: 'Ya se cobró', color: C_LIBERABLE },
  anulada: { texto: 'Anulada', ayuda: 'No cuenta en los totales', color: 'var(--serie-otros, #a8a59e)' },
}

/** Seguimiento del cobro: cuánto está por cobrar, cobrado y anulado. */
export function EstadoDeCobro({ porEstado }: { porEstado: ResumenComisiones['porEstado'] }) {
  const max = Math.max(1, ...porEstado.map((e) => e.total))
  if (porEstado.every((e) => e.n === 0)) return <p className="text-sm text-muted-foreground">Cuando registres un cierre, aquí verás si ya se cobró o sigue pendiente.</p>
  return (
    <ol className="space-y-3" aria-label="Seguimiento del cobro de las comisiones">
      {porEstado.map((e) => {
        const m = ESTADO[e.estado]
        return (
          <li key={e.estado} data-cobro={e.estado}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-medium">{m.texto} <span className="text-xs font-normal text-muted-foreground">({e.n})</span></span>
              <strong className="tabular-nums">{pesos(e.total)}</strong>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-3 rounded-full" style={{ width: `${e.total > 0 ? Math.max(3, Math.round((e.total / max) * 100)) : 0}%`, background: m.color }} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{m.ayuda}</p>
          </li>
        )
      })}
    </ol>
  )
}

/** Las propiedades que más comisión han dejado, cada una con enlace a su historial. */
export function TopPropiedades({ filas }: { filas: ResumenComisiones['topPropiedades'] }) {
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Aquí aparecerán las propiedades que más comisión dejan, con su historial.</p>
  const max = Math.max(1, ...filas.map((f) => f.total))
  return (
    <ol className="space-y-3">
      {filas.map((f, i) => (
        <li key={f.propiedad_id} data-top-propiedad={f.propiedad_id}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="min-w-0 truncate font-medium"><span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>{f.titulo || 'Propiedad sin título'}{f.folio && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{f.folio}</span>}</span>
            <strong className="tabular-nums">{pesos(f.total)}</strong>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-2.5 rounded-full" style={{ width: `${Math.max(3, Math.round((f.total / max) * 100))}%`, background: C_VENTA }} /></div>
          <p className="mt-0.5 text-xs text-muted-foreground">{f.n} {f.n === 1 ? 'operación' : 'operaciones'} · última {f.ultima} · <Link className="underline" href={`/admin/comisiones?historial=${encodeURIComponent(f.propiedad_id)}`}>ver historial</Link></p>
        </li>
      ))}
    </ol>
  )
}

/** Colores de la cuenta de la operación y del flujo mensual: lo que se queda VIVE BIEN, lo del colaborador y los gastos. Los mismos en las dos pantallas. */
const C_NETO = 'var(--serie-1)'
const C_COLAB = 'var(--serie-3, #eda100)'
const C_GASTOS = 'var(--serie-2)'

/**
 * Flujo del dinero (26-oct-2026): lo que ENTRA cada mes (comisión total), repartido en lo que SALE (colaborador y gastos) y lo que QUEDA para VIVE BIEN.
 * Todavía no hay registro de pagos: «sale» es lo comprometido, no lo ya pagado, y la tarjeta lo dice.
 */
export function FlujoDelDinero({ resumen }: { resumen: ResumenComisiones }) {
  const k = resumen.kpis
  const sale = k.agenteLiberable + k.agenteRetenido + k.gastos
  const serie = resumen.serieMensual
  const hay = serie.some((p) => p.total > 0)
  const datos = serie.map((p) => ({ mes: p.etiqueta, Queda: p.neto / 100, Colaborador: p.colaborador / 100, Gastos: p.gastos / 100 }))
  const cifras = serie.filter((p) => p.total > 0)
  return (
    <div data-flujo-dinero>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Entra · comisión total</p><p className="font-heading text-xl font-bold tabular-nums" data-flujo-entra>{pesos(k.comisionTotal)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Sale · colaboradores y gastos</p><p className="font-heading text-xl font-bold tabular-nums" data-flujo-sale>{pesos(sale)}</p>
          <p className="text-xs text-muted-foreground">Colaboradores {pesos(k.agenteLiberable + k.agenteRetenido)} · gastos {pesos(k.gastos)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Queda para VIVE BIEN</p><p className="font-heading text-xl font-bold tabular-nums" data-flujo-queda>{pesos(k.netoViveBien)}</p>
          <p className="text-xs text-muted-foreground">{pct(k.netoViveBien, k.comisionTotal)} % de lo que entra</p></div>
      </div>
      {k.ajustadas > 0 && <p className="mt-2 text-xs text-muted-foreground">{k.ajustadas} {k.ajustadas === 1 ? 'operación se separó' : 'operaciones se separaron'} de la regla (porcentaje, meses o reparto pactados); cada una guarda su motivo.</p>}
      {hay ? (
        <div className="mt-3">
          <div role="img" aria-label={`Cada mes: lo que queda para VIVE BIEN, lo del colaborador y los gastos. ${cifras.map((p) => `${p.etiqueta}: queda ${pesos(p.neto)}, colaborador ${pesos(p.colaborador)}, gastos ${pesos(p.gastos)}`).join('; ')}`} style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grafica-rejilla)" />
                <XAxis dataKey="mes" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => compacto(Number(v) * 100)} />
                <Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(v, n) => [pesos(Number(v) * 100), String(n)]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Queda" stackId="f" fill={C_NETO} isAnimationActive={false} />
                <Bar dataKey="Colaborador" stackId="f" fill={C_COLAB} isAnimationActive={false} />
                <Bar dataKey="Gastos" stackId="f" fill={C_GASTOS} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Ver las cifras de cada mes</summary>
            <table className="mt-2 w-full max-w-xl text-left">
              <caption className="sr-only">Entra, sale y queda por mes</caption>
              <thead><tr><th scope="col" className="pr-3 font-semibold">Mes</th><th scope="col" className="pr-3 text-right font-semibold">Entra</th><th scope="col" className="pr-3 text-right font-semibold">Colaborador</th><th scope="col" className="pr-3 text-right font-semibold">Gastos</th><th scope="col" className="text-right font-semibold">Queda</th></tr></thead>
              <tbody>{cifras.map((p) => (
                <tr key={p.mes}><th scope="row" className="pr-3 font-normal">{p.etiqueta}</th><td className="pr-3 text-right tabular-nums">{pesos(p.total)}</td><td className="pr-3 text-right tabular-nums">{pesos(p.colaborador)}</td><td className="pr-3 text-right tabular-nums">{pesos(p.gastos)}</td><td className="text-right tabular-nums">{pesos(p.neto)}</td></tr>
              ))}</tbody>
            </table>
          </details>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">Antes de IVA y otros impuestos. «Sale» es lo que corresponde pagar según cada operación; este módulo todavía no registra pagos hechos.</p>
    </div>
  )
}
